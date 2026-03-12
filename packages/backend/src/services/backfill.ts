/**
 * Historical Backfill Service
 * Fetches 60 days of OHLCV per ticker (one call per ticker)
 * Run ONCE during initial setup — after this, use grouped daily ingestion
 * Rate: 5 req/min free tier = 12s between calls minimum
 */
import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'
import { withRetry } from '../lib/retry'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!
const POLYGON_BASE = 'https://api.polygon.io'

const EQUITY_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA',
  'AVGO','ORCL','ADBE','CRM','AMD','INTC','QCOM','TXN','MU','AMAT',
  'JPM','BAC','WFC','GS','MS','BLK','V','MA','PYPL','AXP','C',
  'UNH','JNJ','LLY','ABBV','MRK','PFE','TMO','ABT','MDT','AMGN','GILD',
  'XOM','CVX','COP','EOG','SLB','OXY','PSX','VLO','MPC',
  'COST','WMT','TGT','HD','LOW','NKE','SBUX','MCD','CMG',
  'CAT','DE','BA','GE','HON','LMT','RTX','NOC',
  'SPY','QQQ','IWM','DIA','XLK','SOXX','XLF','XLE','XBI','XLV','XLI','XLC','XLU','XLRE',
  'GLD','SLV','TLT','HYG','LQD',
  'BRK.B','PG','KO','PEP','PM','MO','DIS','NFLX','CMCSA','T','VZ',
  'NEE','DUK','ACN','IBM','CSCO','DELL',
]

async function fetchTickerHistory(symbol: string, from: string, to: string) {
  return withRetry(async () => {
    const url = `${POLYGON_BASE}/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${POLYGON_API_KEY}`
    const res = await axios.get(url, { timeout: 15000 })
    if (res.data?.status === 'ERROR') throw new Error(res.data?.error)
    return res.data?.results ?? []
  }, `backfill:${symbol}`)
}

export async function runBackfill(fromDate = '2026-01-05', toDate = '2026-03-11') {
  console.log(`[backfill] Fetching ${fromDate} → ${toDate} for ${EQUITY_UNIVERSE.length} symbols`)
  console.log(`[backfill] Estimated time: ~${Math.ceil(EQUITY_UNIVERSE.length * 12 / 60)} min (free tier rate limit)`)

  // Ensure all assets exist
  await supabase.from('assets').upsert(
    EQUITY_UNIVERSE.map(s => ({ symbol: s, active: true })),
    { onConflict: 'symbol' }
  )
  const { data: assetRows } = await supabase.from('assets').select('id, symbol')
  const assetMap = Object.fromEntries((assetRows ?? []).map(a => [a.symbol, a.id]))

  let totalBars = 0
  let failed = 0

  for (let i = 0; i < EQUITY_UNIVERSE.length; i++) {
    const symbol = EQUITY_UNIVERSE[i]
    try {
      const bars = await fetchTickerHistory(symbol, fromDate, toDate)
      if (!bars.length) {
        console.log(`[backfill] ${symbol}: no data`)
        // Still need to wait for rate limit
        await new Promise(r => setTimeout(r, 12000))
        continue
      }

      // Build rows
      const rows = bars.map((bar: any) => {
        const date = new Date(bar.t).toISOString().split('T')[0]
        return {
          asset_id: assetMap[symbol] ?? null,
          symbol,
          bar_date: date,
          timeframe: 'day',
          open: bar.o, high: bar.h, low: bar.l, close: bar.c,
          volume: Math.round(bar.v),
          vwap: bar.vw ?? null,
        }
      })

      // Upsert in chunks
      for (let j = 0; j < rows.length; j += 50) {
        const { error } = await supabase.from('equity_bars').upsert(
          rows.slice(j, j + 50),
          { onConflict: 'symbol,bar_date,timeframe' }
        )
        if (error) console.error(`[backfill] ${symbol} chunk error:`, error.message)
      }

      totalBars += bars.length
      console.log(`[backfill] [${i+1}/${EQUITY_UNIVERSE.length}] ${symbol}: ${bars.length} bars`)
    } catch (err: any) {
      console.error(`[backfill] ${symbol} failed:`, err.message)
      failed++
    }

    // 12s between calls = 5/min (free tier limit)
    if (i < EQUITY_UNIVERSE.length - 1) {
      await new Promise(r => setTimeout(r, 12000))
    }
  }

  console.log(`[backfill] Complete: ${totalBars} total bars, ${failed} symbols failed`)
  return { totalBars, failed }
}

if (require.main === module) {
  const from = process.argv[2] ?? '2026-01-05'
  const to = process.argv[3] ?? '2026-03-11'
  runBackfill(from, to)
    .then(r => { console.log('Done:', r); process.exit(0) })
    .catch(e => { console.error(e); process.exit(1) })
}
