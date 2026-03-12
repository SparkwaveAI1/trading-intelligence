/**
 * Signal Engine Service — DETERMINISTIC, NO LLM
 * Detects: Capitulation Reversal + Blowoff Exhaustion
 * Scores signals, writes to signal_events table
 */
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'

// Context multipliers from PRD
const REGIME_MULTIPLIERS: Record<string, number> = {
  risk_on: 1.1, neutral: 1.0, cautious: 0.85, stress: 0.7
}

// Sector state modifier
function sectorModifier(state: string): number {
  if (state === 'stabilizing') return 0.05
  if (state === 'declining') return -0.1
  return 0
}

// Earnings proximity penalty
function earningsPenalty(daysToEarnings: number | null): number {
  if (!daysToEarnings) return 1.0
  if (daysToEarnings <= 2) return 0.5
  if (daysToEarnings <= 5) return 0.8
  return 1.0
}

interface EquityBar {
  symbol: string
  bar_date: string
  open: number; high: number; low: number; close: number; volume: number; vwap: number | null
  rsi_14: number | null; stoch_k: number | null; williams_r: number | null
  sma_20: number | null; volume_ratio: number | null; atr_14: number | null
}

interface SRLevel {
  level_type: string; price: number; strength: number
}

interface MacroSnapshot {
  regime: string; regime_multiplier: number
  spy_trend: string; sector_etf_json: Record<string, number> | null
}

function scoreStretch(rsi: number | null, stoch: number | null, wr: number | null, direction: 'oversold' | 'overbought'): number {
  let score = 0
  if (direction === 'oversold') {
    if (rsi !== null) score += rsi < 15 ? 40 : rsi < 20 ? 30 : 10
    if (stoch !== null) score += stoch < 5 ? 20 : stoch < 10 ? 15 : 5
    if (wr !== null) score += wr < -95 ? 20 : wr < -90 ? 15 : 5
  } else {
    if (rsi !== null) score += rsi > 85 ? 40 : rsi > 80 ? 30 : 10
    if (stoch !== null) score += stoch > 95 ? 20 : stoch > 90 ? 15 : 5
    if (wr !== null) score += wr > -5 ? 20 : wr > -10 ? 15 : 5
  }
  return Math.min(score, 100)
}

function scoreVolume(volumeRatio: number | null): number {
  if (!volumeRatio) return 0
  if (volumeRatio >= 4) return 100
  if (volumeRatio >= 3) return 80
  if (volumeRatio >= 2) return 60
  if (volumeRatio >= 1.5) return 30
  return 0
}

function findNearestLevel(close: number, levels: SRLevel[], type: 'support' | 'resistance'): { level: SRLevel | null, distancePct: number } {
  const relevant = levels.filter(l => l.level_type === type)
  if (relevant.length === 0) return { level: null, distancePct: 999 }

  const withDistance = relevant.map(l => ({
    level: l,
    distancePct: Math.abs(close - l.price) / close * 100
  }))
  withDistance.sort((a, b) => a.distancePct - b.distancePct)
  return withDistance[0]
}

function scoreLevelProximity(distancePct: number, strength: number): number {
  if (distancePct > 3) return 0
  const proximityScore = distancePct <= 0.5 ? 80 : distancePct <= 1 ? 60 : distancePct <= 2 ? 40 : 20
  const strengthBonus = Math.min(strength * 5, 20)
  return proximityScore + strengthBonus
}

function detectReclaimEvent(bar: EquityBar): string | null {
  if (!bar.vwap) return null
  const close = Number(bar.close)
  const open = Number(bar.open)
  const low = Number(bar.low)
  const vwap = Number(bar.vwap)

  // Bullish engulfing (close > open significantly, and close > prior high implied)
  if (close > open && (close - open) / open > 0.01) return 'bullish_engulfing'
  // VWAP reclaim (closed above VWAP)
  if (close > vwap && low < vwap) return 'vwap_reclaim'
  // Higher low pattern (close > open with range expansion)
  if (close > open) return 'stabilization'
  return null
}

function detectStallCandle(bar: EquityBar): boolean {
  const bodyPct = Math.abs(Number(bar.close) - Number(bar.open)) / Number(bar.open) * 100
  const rangePct = (Number(bar.high) - Number(bar.low)) / Number(bar.open) * 100
  // Stall = small body (< 0.3%) with decent range (> 0.5%)
  return bodyPct < 0.3 && rangePct > 0.5
}

export async function detectSignals(targetDate?: string) {
  const date = targetDate ?? new Date().toISOString().split('T')[0]
  console.log(`[signal-engine] Scanning ${date}`)

  // Get today's bars with indicators
  const { data: bars, error: barsError } = await supabase
    .from('equity_bars')
    .select('*')
    .eq('bar_date', date)
    .eq('timeframe', 'day')
    .not('rsi_14', 'is', null)

  if (barsError || !bars || bars.length === 0) {
    console.log('[signal-engine] No bars with indicators for', date)
    return []
  }

  // Get macro regime
  const { data: macro } = await supabase
    .from('macro_regime_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .single() as { data: MacroSnapshot | null }

  const regime = macro?.regime ?? 'neutral'
  const regimeMult = macro?.regime_multiplier ?? 1.0

  const signals: string[] = []

  for (const bar of bars as EquityBar[]) {
    const symbol = bar.symbol
    if (!bar.rsi_14 || !bar.volume_ratio) continue

    // Get S/R levels
    const { data: srLevels } = await supabase
      .from('support_resistance_levels')
      .select('*')
      .eq('symbol', symbol)
      .eq('active', true)

    const levels = (srLevels ?? []) as SRLevel[]
    const close = Number(bar.close)

    // CAPITULATION REVERSAL CHECK
    if (
      bar.rsi_14 < 20 &&
      bar.volume_ratio > 2
    ) {
      const { level: supportLevel, distancePct } = findNearestLevel(close, levels, 'support')
      const reclaimEvent = detectReclaimEvent(bar)

      if (supportLevel && distancePct <= 2 && reclaimEvent) {
        const stretchScore = scoreStretch(bar.rsi_14, bar.stoch_k, bar.williams_r, 'oversold')
        const volumeScore = scoreVolume(bar.volume_ratio)
        const levelScore = scoreLevelProximity(distancePct, supportLevel.strength)
        const reclaimScore = reclaimEvent === 'vwap_reclaim' ? 80 : reclaimEvent === 'bullish_engulfing' ? 70 : 50

        const rawScore = (stretchScore * 0.30 + volumeScore * 0.25 + levelScore * 0.25 + reclaimScore * 0.20) / 10
        const contextMult = regimeMult * (1 + sectorModifier('neutral')) * earningsPenalty(null)
        const finalScore = Math.round(rawScore * contextMult * 10) / 10

        // Get asset_id
        const { data: asset } = await supabase.from('assets').select('id').eq('symbol', symbol).single()

        const signalJson = {
          ticker: symbol, signal_type: 'capitulation_reversal',
          rsi: bar.rsi_14, stoch_k: bar.stoch_k, williams_r: bar.williams_r,
          volume_ratio: bar.volume_ratio, vwap: bar.vwap,
          nearest_level: supportLevel.price, level_distance_pct: distancePct,
          reclaim_event: reclaimEvent, macro_regime: regime,
          raw_score: rawScore, context_multiplier: contextMult, final_score: finalScore,
          detected_at: new Date().toISOString()
        }

        const { data: signalData } = await supabase.from('signal_events').insert({
          asset_id: asset?.id ?? null,
          market_type: 'equity',
          signal_type: 'capitulation_reversal',
          rsi: bar.rsi_14, stoch_k: bar.stoch_k, williams_r: bar.williams_r,
          volume_ratio: bar.volume_ratio,
          vwap_relation: bar.vwap ? (close > Number(bar.vwap) ? 'above' : 'below') : null,
          nearest_level_type: 'support', nearest_level_price: supportLevel.price,
          nearest_level_distance_pct: distancePct, reclaim_event: reclaimEvent,
          raw_score: rawScore, context_multiplier: contextMult, final_score: finalScore,
          macro_regime: regime, signal_json: signalJson,
          expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
        }).select('id').single()

        if (signalData) {
          await supabase.from('setup_scores').insert({
            signal_event_id: signalData.id,
            stretch_score: stretchScore, volume_score: volumeScore,
            level_score: levelScore, reclaim_score: reclaimScore,
            macro_context_score: regimeMult,
            raw_score: rawScore, context_multiplier: contextMult, final_score: finalScore
          })
        }

        console.log(`[signal] CAPITULATION ${symbol} | RSI:${bar.rsi_14} Vol:${bar.volume_ratio}x | Score:${finalScore}`)
        signals.push(`CAP:${symbol}:${finalScore}`)
      }
    }

    // BLOWOFF EXHAUSTION CHECK
    if (bar.rsi_14 > 80 && bar.volume_ratio > 2) {
      const { level: resistanceLevel, distancePct } = findNearestLevel(close, levels, 'resistance')
      const isStall = detectStallCandle(bar)

      if (resistanceLevel && distancePct <= 2 && isStall) {
        const stretchScore = scoreStretch(bar.rsi_14, bar.stoch_k, bar.williams_r, 'overbought')
        const volumeScore = scoreVolume(bar.volume_ratio)
        const levelScore = scoreLevelProximity(distancePct, resistanceLevel.strength)
        const stallScore = isStall ? 70 : 30

        const rawScore = (stretchScore * 0.30 + volumeScore * 0.25 + levelScore * 0.25 + stallScore * 0.20) / 10
        const contextMult = regimeMult * earningsPenalty(null)
        const finalScore = Math.round(rawScore * contextMult * 10) / 10

        const { data: asset } = await supabase.from('assets').select('id').eq('symbol', symbol).single()

        const signalJson = {
          ticker: symbol, signal_type: 'blowoff_exhaustion',
          rsi: bar.rsi_14, stoch_k: bar.stoch_k, williams_r: bar.williams_r,
          volume_ratio: bar.volume_ratio, nearest_level: resistanceLevel.price,
          level_distance_pct: distancePct, stall_candle: isStall,
          macro_regime: regime, raw_score: rawScore, context_multiplier: contextMult,
          final_score: finalScore, detected_at: new Date().toISOString()
        }

        await supabase.from('signal_events').insert({
          asset_id: asset?.id ?? null,
          market_type: 'equity', signal_type: 'blowoff_exhaustion',
          rsi: bar.rsi_14, stoch_k: bar.stoch_k, williams_r: bar.williams_r,
          volume_ratio: bar.volume_ratio,
          nearest_level_type: 'resistance', nearest_level_price: resistanceLevel.price,
          nearest_level_distance_pct: distancePct,
          raw_score: rawScore, context_multiplier: contextMult, final_score: finalScore,
          macro_regime: regime, signal_json: signalJson,
          expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
        })

        console.log(`[signal] BLOWOFF ${symbol} | RSI:${bar.rsi_14} Vol:${bar.volume_ratio}x | Score:${finalScore}`)
        signals.push(`BLOW:${symbol}:${finalScore}`)
      }
    }
  }

  console.log(`[signal-engine] Done — ${signals.length} signals detected`)
  return signals
}

if (require.main === module) {
  const date = process.argv[2]
  detectSignals(date)
    .then(signals => {
      console.log('Signals:', signals)
      process.exit(0)
    })
    .catch(e => { console.error(e); process.exit(1) })
}
