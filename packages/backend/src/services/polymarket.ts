/**
 * Polymarket Integration Service
 * Fetches active markets, stores them, detects probability edge opportunities
 * Edge = difference between AI fair value estimate and market price
 *
 * Signal types:
 * - probability_edge: market price significantly differs from estimated fair value
 * - liquidity_shift: sudden large price move (momentum event)
 */
import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'
import { withRetry } from '../lib/retry'

const GAMMA_API = 'https://gamma-api.polymarket.com'

// Minimum liquidity to consider (filter out thin markets)
const MIN_LIQUIDITY = 10000
// Minimum volume (24h) to consider
const MIN_VOLUME_24H = 500
// Edge threshold: AI estimate must differ from market by at least this much
const EDGE_THRESHOLD = 0.12 // 12 percentage points

interface PolyMarket {
  id: string
  question: string
  slug: string
  outcomePrices: string[]
  outcomes: string[]
  volume: number
  volume24hr: number
  liquidity: number
  liquidityNum: number
  spread: number
  endDateIso: string
  lastTradePrice: number
  bestBid: number
  bestAsk: number
  oneDayPriceChange: number
  active: boolean
  closed: boolean
  events?: Array<{ title?: string; category?: string }>
}

// Fetch all active markets with enough liquidity
async function fetchActiveMarkets(): Promise<PolyMarket[]> {
  return withRetry(async () => {
    // Fetch in batches (API returns max 500 per call)
    const [page1, page2] = await Promise.all([
      axios.get(`${GAMMA_API}/markets?limit=500&active=true&closed=false&offset=0`, { timeout: 15000 }),
      axios.get(`${GAMMA_API}/markets?limit=500&active=true&closed=false&offset=500`, { timeout: 15000 }),
    ])
    const all = [...(page1.data ?? []), ...(page2.data ?? [])]
    return all.filter(m => {
      const liq = m.liquidityNum ?? m.liquidity ?? 0
      const vol24 = m.volume24hr ?? 0
      // outcomePrices comes as a JSON string from the API
      let prices: string[] = []
      try { prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices } catch { prices = [] }
      return (
        m.active &&
        !m.closed &&
        liq > MIN_LIQUIDITY &&
        vol24 > MIN_VOLUME_24H &&
        prices.length === 2
      )
    })
  }, 'fetchPolymarketMarkets')
}

/**
 * AI fair value estimation (deterministic, no LLM)
 * Uses base rate reasoning + market structure signals
 *
 * This is a simplified signal-detection heuristic:
 * - Prices near extremes (< 5% or > 95%) are often mispriced
 * - Markets with high spread have uncertainty discount
 * - Recent price momentum signals direction
 *
 * Phase 2 will replace this with actual LLM analysis
 */
function parsePrices(raw: string[] | string): string[] {
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
  return raw ?? []
}

function estimateFairValue(market: PolyMarket): { estimate: number; confidence: string; reasoning: string } | null {
  const prices = parsePrices(market.outcomePrices as unknown as string)
  const yesPrice = parseFloat(prices[0])
  const noPrice = parseFloat(prices[1])

  if (isNaN(yesPrice) || isNaN(noPrice)) return null

  // Skip if spread is too wide (market is uncertain/illiquid)
  const spread = market.spread ?? Math.abs(1 - yesPrice - noPrice)
  if (spread > 0.08) return null // > 8% spread = too uncertain

  let estimate = yesPrice
  let confidence = 'low'
  let reasoning = ''

  // Pattern 1: Extreme prices with recent reversal momentum
  // If YES is < 15% but price rose > 5% today → possible undervaluation
  if (yesPrice < 0.15 && (market.oneDayPriceChange ?? 0) > 0.05) {
    estimate = yesPrice * 1.3 // adjust up 30%
    confidence = 'low'
    reasoning = `Oversold: YES at ${(yesPrice*100).toFixed(0)}% with +${((market.oneDayPriceChange??0)*100).toFixed(1)}% today`
  }
  // Pattern 2: High YES price with recent drop → possible overvaluation
  else if (yesPrice > 0.85 && (market.oneDayPriceChange ?? 0) < -0.05) {
    estimate = yesPrice * 0.85
    confidence = 'low'
    reasoning = `Overbought: YES at ${(yesPrice*100).toFixed(0)}% with ${((market.oneDayPriceChange??0)*100).toFixed(1)}% today`
  }
  // Pattern 3: Price near 50% with strong volume momentum → follow momentum
  else if (yesPrice > 0.45 && yesPrice < 0.55 && Math.abs(market.oneDayPriceChange ?? 0) > 0.03) {
    const dir = (market.oneDayPriceChange ?? 0) > 0 ? 1 : -1
    estimate = yesPrice + (dir * 0.08)
    confidence = 'low'
    reasoning = `Near-50 momentum: ${dir > 0 ? '+' : ''}${((market.oneDayPriceChange??0)*100).toFixed(1)}% price move today`
  }
  else {
    // No strong pattern — market price is our best estimate
    return null
  }

  estimate = Math.max(0.02, Math.min(0.98, estimate))
  return { estimate, confidence, reasoning }
}

// Upsert markets to DB
async function upsertMarkets(markets: PolyMarket[]) {
  const rows = markets.map(m => {
    const prices = parsePrices(m.outcomePrices as unknown as string)
    return {
    poly_market_id: m.id,
    slug: m.slug,
    title: m.question,
    yes_price: parseFloat(prices[0]) || null,
    no_price: parseFloat(prices[1]) || null,
    liquidity: m.liquidityNum ?? m.liquidity ?? 0,
    spread: m.spread ?? 0,
    volume_24h: m.volume24hr ?? 0,
    resolution_date: m.endDateIso ?? null,
    status: 'active',
    last_updated: new Date().toISOString(),
  }})

  // Upsert in chunks
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('polymarket_markets')
      .upsert(rows.slice(i, i + 100), { onConflict: 'poly_market_id' })
    if (error) console.error('[polymarket] Upsert error:', error.message)
  }
}

// Detect signals from market data
async function detectPolySignals(markets: PolyMarket[], macroMultiplier: number) {
  const signals: string[] = []

  for (const market of markets) {
    const fairValue = estimateFairValue(market)
    if (!fairValue) continue

    const prices = parsePrices(market.outcomePrices as unknown as string)
    const yesPrice = parseFloat(prices[0])
    const edge = fairValue.estimate - yesPrice
    const absEdge = Math.abs(edge)

    if (absEdge < EDGE_THRESHOLD) continue

    const direction = edge > 0 ? 'YES' : 'NO'
    const rawScore = Math.min(absEdge * 100, 10) // scale to 0-10
    const finalScore = Math.round(rawScore * macroMultiplier * 10) / 10

    // Get market DB id
    const { data: dbMarket } = await supabase
      .from('polymarket_markets')
      .select('id')
      .eq('poly_market_id', market.id)
      .single()

    const signalJson = {
      title: market.question,
      slug: market.slug,
      yes_price: yesPrice,
      ai_fair_value: fairValue.estimate,
      edge: edge,
      direction,
      reasoning: fairValue.reasoning,
      confidence: fairValue.confidence,
      liquidity: market.liquidityNum,
      volume_24h: market.volume24hr,
      spread: market.spread,
      one_day_change: market.oneDayPriceChange,
      macro_multiplier: macroMultiplier,
      detected_at: new Date().toISOString()
    }

    await supabase.from('signal_events').insert({
      poly_market_id: dbMarket?.id ?? null,
      market_type: 'polymarket',
      signal_type: 'probability_edge',
      poly_current_price: yesPrice,
      poly_ai_fair_value: fairValue.estimate,
      poly_edge: edge,
      poly_direction: direction,
      raw_score: rawScore,
      context_multiplier: macroMultiplier,
      final_score: finalScore,
      signal_json: signalJson,
      status: 'active',
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    })

    console.log(`[polymarket] EDGE ${direction} "${market.question.slice(0, 50)}" | Market: ${(yesPrice*100).toFixed(0)}% | Est: ${(fairValue.estimate*100).toFixed(0)}% | Edge: ${(edge*100).toFixed(0)}pp | Score: ${finalScore}`)
    signals.push(`POLY:${direction}:${market.slug}:${finalScore}`)
  }

  return signals
}

export async function runPolymarket() {
  console.log('[polymarket] Starting...')

  // Get current macro multiplier
  const { data: macro } = await supabase
    .from('macro_regime_snapshots')
    .select('regime_multiplier')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  const macroMult = macro?.regime_multiplier ?? 1.0

  // Fetch markets
  const markets = await fetchActiveMarkets()
  console.log(`[polymarket] Fetched ${markets.length} liquid active markets`)

  // Store in DB
  await upsertMarkets(markets)

  // Detect signals
  const signals = await detectPolySignals(markets, macroMult)

  // Log system event
  await supabase.from('system_events').insert({
    event_type: 'polymarket_complete',
    severity: 'info',
    source: 'polymarket',
    message: `Polymarket sync: ${markets.length} markets, ${signals.length} signals`,
    details: { markets: markets.length, signals: signals.length }
  })

  console.log(`[polymarket] Done — ${markets.length} markets, ${signals.length} signals`)
  return { markets: markets.length, signals }
}

if (require.main === module) {
  runPolymarket()
    .then(r => { console.log('Done:', r); process.exit(0) })
    .catch(e => { console.error(e); process.exit(1) })
}
