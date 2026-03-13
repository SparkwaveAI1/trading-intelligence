import { getPriorTradingDate } from '../lib/tradingDate'
/**
 * Macro Regime Snapshot Service
 * Fetches VIX, SPY trend, yield spread → classifies regime
 * Runs daily after market close
 */
import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'
import { withRetry } from '../lib/retry'

// Yahoo Finance (no key needed, free tier) for yield data
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)' }

// Regime thresholds (from PRD)
function classifyRegime(vix: number, spyTrend: string, yieldSpread: number): { regime: string, multiplier: number } {
  if (vix > 32 || spyTrend === 'negative') return { regime: 'stress', multiplier: 0.7 }
  if (vix > 25) return { regime: 'cautious', multiplier: 0.85 }
  if (vix < 18 && spyTrend === 'positive' && yieldSpread > 0) return { regime: 'risk_on', multiplier: 1.1 }
  return { regime: 'neutral', multiplier: 1.0 }
}

// SPY trend: close vs 20-day SMA
// positive = close > SMA20 by >1%, flat = within 1%, negative = below SMA20 by >1%
function classifySpyTrend(close: number, sma20: number): string {
  const pctDiff = ((close - sma20) / sma20) * 100
  if (pctDiff > 1) return 'positive'
  if (pctDiff < -1) return 'negative'
  return 'flat'
}

async function fetchYield(ticker: string): Promise<number | null> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=5d`
  const res = await axios.get(url, { headers: YAHOO_HEADERS, timeout: 10000 })
  const closes: number[] = res.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
  const last = closes.filter(v => v != null).pop()
  return last ?? null
}

async function fetchYieldSpread(): Promise<number | null> {
  return withRetry(async () => {
    // ^TNX = 10-year Treasury yield, ^IRX = 13-week T-bill (proxy for short end)
    const [y10, y2] = await Promise.all([fetchYield('^TNX'), fetchYield('^IRX')])
    if (y10 == null || y2 == null) return null
    // Yields from Yahoo are in percent (e.g. 4.27)
    // T10Y2Y convention: 10Y minus 2Y, in percent
    return Math.round((y10 - y2) * 100) / 100
  }, 'fetchYieldSpread')
}

export async function runMacroRegime(targetDate?: string) {
  const date = targetDate ?? getPriorTradingDate()
  console.log(`[macro] Computing regime for ${date}`)

  // Get VIX
  const { data: vixBar } = await supabase
    .from('equity_bars')
    .select('close')
    .eq('symbol', 'VIX')
    .eq('bar_date', date)
    .eq('timeframe', 'day')
    .single()

  const vix = vixBar ? Number(vixBar.close) : 20 // Default neutral if missing

  // Get SPY close and SMA20
  const { data: spyBar } = await supabase
    .from('equity_bars')
    .select('close, sma_20')
    .eq('symbol', 'SPY')
    .eq('bar_date', date)
    .eq('timeframe', 'day')
    .single()

  const spyClose = spyBar ? Number(spyBar.close) : null
  const spySma20 = spyBar ? Number(spyBar.sma_20) : null
  const spyTrend = (spyClose && spySma20) ? classifySpyTrend(spyClose, spySma20) : 'flat'

  // Get yield spread from FRED (cached — fetch every weekday)
  let yieldSpread = 0
  try {
    const spread = await fetchYieldSpread()
    if (spread !== null) yieldSpread = spread
  } catch (e) {
    console.warn('[macro] FRED fetch failed, using cached or default')
    // Try to get last cached value
    const { data: lastMacro } = await supabase
      .from('macro_regime_snapshots')
      .select('yield_spread_10y2y')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()
    if (lastMacro?.yield_spread_10y2y) yieldSpread = Number(lastMacro.yield_spread_10y2y)
  }

  const { regime, multiplier } = classifyRegime(vix, spyTrend, yieldSpread)

  // Get sector ETF closes for context
  const SECTOR_ETFS = ['XLK', 'SOXX', 'XLF', 'XLE', 'XBI', 'XLV', 'XLI']
  const { data: sectorBars } = await supabase
    .from('equity_bars')
    .select('symbol, close')
    .in('symbol', SECTOR_ETFS)
    .eq('bar_date', date)
    .eq('timeframe', 'day')

  const sectorJson = Object.fromEntries((sectorBars ?? []).map(b => [b.symbol, b.close]))

  const { error } = await supabase.from('macro_regime_snapshots').upsert({
    snapshot_date: date,
    vix,
    spy_close: spyClose,
    spy_sma_20: spySma20,
    spy_trend: spyTrend,
    yield_spread_10y2y: yieldSpread,
    regime,
    regime_multiplier: multiplier,
    sector_etf_json: sectorJson,
  }, { onConflict: 'snapshot_date' })

  if (error) {
    console.error('[macro] Failed to save regime:', error.message)
    return null
  }

  console.log(`[macro] Regime: ${regime} (${multiplier}x) | VIX: ${vix} | SPY: ${spyTrend} | Spread: ${yieldSpread}`)
  return { regime, multiplier, vix, spyTrend, yieldSpread }
}

if (require.main === module) {
  const date = process.argv[2]
  runMacroRegime(date)
    .then(r => { console.log('Macro regime done:', r); process.exit(0) })
    .catch(e => { console.error(e); process.exit(1) })
}
