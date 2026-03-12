/**
 * Market Data Ingestion Service
 * Fetches daily OHLCV bars for S&P 500 + Nasdaq 100 from Polygon.io (free tier)
 * Runs daily after market close (~4:30 PM ET)
 */
import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'
import { withRetry } from '../lib/retry'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!
const POLYGON_BASE = 'https://api.polygon.io'

// S&P 500 + Nasdaq 100 — top 150 most liquid symbols
const EQUITY_UNIVERSE = [
  // Mag 7 + large cap tech
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA',
  'AVGO','ORCL','ADBE','CRM','AMD','INTC','QCOM','TXN','MU','AMAT',
  // Finance
  'JPM','BAC','WFC','GS','MS','BLK','V','MA','PYPL','AXP','C',
  // Healthcare
  'UNH','JNJ','LLY','ABBV','MRK','PFE','TMO','ABT','MDT','AMGN','GILD',
  // Energy
  'XOM','CVX','COP','EOG','SLB','OXY','PSX','VLO','MPC',
  // Consumer
  'COST','WMT','TGT','HD','LOW','NKE','SBUX','MCD','DPZ','CMG',
  // Industrial
  'CAT','DE','BA','GE','HON','LMT','RTX','NOC',
  // ETFs (for sector context)
  'SPY','QQQ','IWM','XLK','SOXX','XLF','XLE','XBI','XLV','XLI','XLC',
  // More S&P components
  'BRK.B','PG','KO','PEP','PM','MO','MDLZ','GIS',
  'DIS','NFLX','CMCSA','T','VZ',
  'EQIX','AMT','PLD','CCI','WELL',
  'NEE','DUK','SO','D','AEP',
  'ACN','IBM','HPQ','DELL','CSCO',
  'GLD','SLV','TLT','HYG', // ETFs for macro
  'VIX' // Volatility index
]

interface PolygonBar {
  o: number; h: number; l: number; c: number; v: number;
  vw?: number; t: number;
}

async function fetchDailyBars(symbol: string, date: string): Promise<PolygonBar | null> {
  return withRetry(async () => {
    const url = `${POLYGON_BASE}/v2/aggs/ticker/${symbol}/range/1/day/${date}/${date}?apiKey=${POLYGON_API_KEY}`
    const res = await axios.get(url, { timeout: 10000 })
    const results = res.data?.results
    if (!results || results.length === 0) return null
    return results[0]
  }, `fetchDailyBars:${symbol}:${date}`)
}

async function ensureAsset(symbol: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('assets')
    .upsert({ symbol, active: true }, { onConflict: 'symbol' })
    .select('id')
    .single()
  if (error) { console.error(`ensureAsset ${symbol}:`, error.message); return null }
  return data.id
}

async function upsertBar(assetId: string, symbol: string, date: string, bar: PolygonBar) {
  const { error } = await supabase.from('equity_bars').upsert({
    asset_id: assetId,
    symbol,
    bar_date: date,
    timeframe: 'day',
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
    vwap: bar.vw ?? null,
  }, { onConflict: 'symbol,bar_date,timeframe' })
  if (error) console.error(`upsertBar ${symbol} ${date}:`, error.message)
}

export async function runIngestion(targetDate?: string) {
  const date = targetDate ?? getTradingDate()
  console.log(`[ingestion] Starting for ${date} — ${EQUITY_UNIVERSE.length} symbols`)

  let success = 0, skipped = 0, failed = 0

  for (const symbol of EQUITY_UNIVERSE) {
    try {
      const bar = await fetchDailyBars(symbol, date)
      if (!bar) { skipped++; continue }
      const assetId = await ensureAsset(symbol)
      if (!assetId) { failed++; continue }
      await upsertBar(assetId, symbol, date, bar)
      success++
      // Rate limit: Polygon free tier = 5 calls/min
      await new Promise(r => setTimeout(r, 13000))
    } catch (err) {
      console.error(`[ingestion] Failed ${symbol}:`, err)
      failed++
    }
  }

  // Log system event
  await supabase.from('system_events').insert({
    event_type: 'ingestion_complete',
    severity: 'info',
    source: 'polygon',
    message: `Daily ingestion ${date}: ${success} ok, ${skipped} skipped, ${failed} failed`,
    details: { date, success, skipped, failed }
  })

  console.log(`[ingestion] Done: ${success} ok, ${skipped} skipped, ${failed} failed`)
  return { success, skipped, failed }
}

function getTradingDate(): string {
  const now = new Date()
  // Use yesterday if before 5 PM ET (market not fully settled)
  const etHour = now.getUTCHours() - 5
  if (etHour < 17) {
    now.setDate(now.getDate() - 1)
  }
  return now.toISOString().split('T')[0]
}

// Run directly
if (require.main === module) {
  const date = process.argv[2]
  runIngestion(date)
    .then(r => { console.log('Ingestion complete:', r); process.exit(0) })
    .catch(e => { console.error('Ingestion failed:', e); process.exit(1) })
}
