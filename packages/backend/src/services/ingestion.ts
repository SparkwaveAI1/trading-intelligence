/**
 * Market Data Ingestion Service
 * Uses Polygon.io grouped daily endpoint — ONE call returns ALL tickers for a date
 * Free tier: 5 req/min — grouped endpoint = 1 call per day, no rate limit issues
 */
import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'
import { withRetry } from '../lib/retry'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!
const POLYGON_BASE = 'https://api.polygon.io'

// S&P 500 + Nasdaq 100 + key ETFs + VIX — filter from grouped response
const EQUITY_UNIVERSE = new Set([
  // Mag 7 + large cap tech
  'AAPL','MSFT','NVDA','AMZN','GOOGL','GOOG','META','TSLA',
  'AVGO','ORCL','ADBE','CRM','AMD','INTC','QCOM','TXN','MU','AMAT',
  // Finance
  'JPM','BAC','WFC','GS','MS','BLK','V','MA','PYPL','AXP','C',
  // Healthcare
  'UNH','JNJ','LLY','ABBV','MRK','PFE','TMO','ABT','MDT','AMGN','GILD',
  // Energy
  'XOM','CVX','COP','EOG','SLB','OXY','PSX','VLO','MPC',
  // Consumer
  'COST','WMT','TGT','HD','LOW','NKE','SBUX','MCD','CMG',
  // Industrial
  'CAT','DE','BA','GE','HON','LMT','RTX','NOC',
  // ETFs (sector context + macro)
  'SPY','QQQ','IWM','DIA','XLK','SOXX','XLF','XLE','XBI','XLV','XLI','XLC','XLU','XLRE',
  'GLD','SLV','TLT','HYG','LQD',
  // More S&P
  'BRK.B','PG','KO','PEP','PM','MO','DIS','NFLX','CMCSA','T','VZ',
  'NEE','DUK','ACN','IBM','CSCO','DELL',
])

interface GroupedBar {
  T: string; o: number; h: number; l: number; c: number; v: number; vw?: number; t: number;
}

async function fetchGroupedDaily(date: string): Promise<GroupedBar[]> {
  return withRetry(async () => {
    const url = `${POLYGON_BASE}/v2/aggs/grouped/locale/us/market/stocks/${date}?apiKey=${POLYGON_API_KEY}`
    const res = await axios.get(url, { timeout: 30000 })
    if (res.data?.status !== 'OK') throw new Error(`Polygon status: ${res.data?.status}`)
    return res.data?.results ?? []
  }, `fetchGroupedDaily:${date}`)
}

// VIX needs a separate call (it's an index, not a stock)
async function fetchVIX(date: string): Promise<GroupedBar | null> {
  return withRetry(async () => {
    const url = `${POLYGON_BASE}/v2/aggs/ticker/I:VIX/range/1/day/${date}/${date}?apiKey=${POLYGON_API_KEY}`
    const res = await axios.get(url, { timeout: 10000 })
    const r = res.data?.results?.[0]
    if (!r) return null
    return { ...r, T: 'VIX' }
  }, `fetchVIX:${date}`).catch(() => null)
}

export async function runIngestion(targetDate?: string) {
  const date = targetDate ?? getTradingDate()
  console.log(`[ingestion] Starting grouped daily fetch for ${date}`)

  // One API call for all stocks
  const allBars = await fetchGroupedDaily(date)

  // Filter to our universe
  const relevant = allBars.filter(b => EQUITY_UNIVERSE.has(b.T))
  console.log(`[ingestion] Got ${allBars.length} total bars, ${relevant.length} in our universe`)

  // Also fetch VIX (separate index endpoint)
  const vixBar = await fetchVIX(date)
  if (vixBar) relevant.push(vixBar)

  let success = 0, failed = 0

  // Batch upsert assets first
  const symbols = relevant.map(b => b.T)
  await supabase.from('assets').upsert(
    symbols.map(s => ({ symbol: s, active: true })),
    { onConflict: 'symbol' }
  )

  // Fetch asset IDs
  const { data: assetRows } = await supabase.from('assets').select('id, symbol').in('symbol', symbols)
  const assetMap = Object.fromEntries((assetRows ?? []).map(a => [a.symbol, a.id]))

  // Batch upsert bars in chunks of 50
  const barRows = relevant.map(bar => ({
    asset_id: assetMap[bar.T] ?? null,
    symbol: bar.T,
    bar_date: date,
    timeframe: 'day',
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: Math.round(bar.v),
    vwap: bar.vw ?? null,
  }))

  for (let i = 0; i < barRows.length; i += 50) {
    const chunk = barRows.slice(i, i + 50)
    const { error } = await supabase.from('equity_bars').upsert(chunk, { onConflict: 'symbol,bar_date,timeframe' })
    if (error) {
      console.error(`[ingestion] Batch upsert error (chunk ${i}):`, error.message)
      failed += chunk.length
    } else {
      success += chunk.length
    }
  }

  await supabase.from('system_events').insert({
    event_type: 'ingestion_complete',
    severity: 'info',
    source: 'polygon',
    message: `Grouped daily ingestion ${date}: ${success} ok, ${failed} failed`,
    details: { date, success, failed, total: relevant.length }
  })

  console.log(`[ingestion] Done: ${success} ok, ${failed} failed`)
  return { success, failed }
}

function getTradingDate(): string {
  // Free tier only has PRIOR day data — always fetch the previous trading day
  const now = new Date()
  now.setDate(now.getDate() - 1)
  // Skip weekends: if Sunday roll back to Friday, if Saturday roll back to Friday
  const day = now.getUTCDay()
  if (day === 0) now.setDate(now.getDate() - 2) // Sunday → Friday
  if (day === 6) now.setDate(now.getDate() - 1) // Saturday → Friday
  return now.toISOString().split('T')[0]
}

if (require.main === module) {
  const date = process.argv[2]
  runIngestion(date)
    .then(r => { console.log('Ingestion complete:', r); process.exit(0) })
    .catch(e => { console.error('Ingestion failed:', e); process.exit(1) })
}
