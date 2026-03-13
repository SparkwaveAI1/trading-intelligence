/**
 * Consolidated API handler — routes all /api/query?route=X requests
 * Keeps Vercel function count to 1 (avoids 12-function Hobby limit)
 */
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const POLYGON_KEY = process.env.POLYGON_API_KEY
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

async function routeHealth(req, res) {
  res.json({ ok: true, ts: new Date().toISOString() })
}

async function routeWatchlist(req, res) {
  const supabase = getSupabase()
  const { data: latestRow } = await supabase.from('equity_bars').select('bar_date').not('rsi_14','is',null).order('bar_date',{ascending:false}).limit(1).single()
  if (!latestRow) return res.json({ date: null, items: [] })
  const latestDate = latestRow.bar_date
  const { data: prevRow } = await supabase.from('equity_bars').select('bar_date').not('rsi_14','is',null).lt('bar_date',latestDate).order('bar_date',{ascending:false}).limit(1).single()
  const prevDate = prevRow?.bar_date ?? null
  const { data: todayBars, error } = await supabase.from('equity_bars').select('symbol,open,high,low,close,volume,rsi_14,stoch_k,williams_r,volume_ratio,sma_20,vwap').eq('bar_date',latestDate).not('rsi_14','is',null).order('volume_ratio',{ascending:false})
  if (error) return res.status(500).json({ error: error.message })
  let prevCloses = {}
  if (prevDate) {
    const { data: prevBars } = await supabase.from('equity_bars').select('symbol,close').eq('bar_date',prevDate).in('symbol',todayBars.map(b=>b.symbol))
    prevCloses = Object.fromEntries((prevBars??[]).map(b=>[b.symbol,b.close]))
  }
  const items = todayBars.map(bar => {
    const prevClose = prevCloses[bar.symbol] ?? null
    return { ...bar, prev_close: prevClose, day_change_pct: prevClose ? ((Number(bar.close)-Number(prevClose))/Number(prevClose))*100 : null, intraday_range_pct: bar.high&&bar.low&&bar.open ? ((Number(bar.high)-Number(bar.low))/Number(bar.open))*100 : null }
  })
  res.json({ date: latestDate, prev_date: prevDate, items })
}

async function routeSignals(req, res) {
  const supabase = getSupabase()
  const since = new Date(Date.now() - 7*24*3600*1000).toISOString()
  const { data, error } = await supabase.from('signal_events').select('*,assets(symbol,name,sector),analysis_outputs(thesis,counter_thesis,confirms,invalidates,confidence,expected_horizon)').eq('status','active').gte('created_at',since).order('final_score',{ascending:false})
  if (error) return res.status(500).json({ error: error.message })
  res.json({ signals: data, count: data?.length ?? 0 })
}

async function routeSignalById(req, res) {
  const supabase = getSupabase()
  const { id } = req.query
  const { data, error } = await supabase.from('signal_events').select('*,assets(symbol,name,sector,industry,market_cap_category),analysis_outputs(*),setup_scores(*),polymarket_markets(title,resolution_date,liquidity,volume_24h)').eq('id',id).single()
  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
}

async function routeSignalsHistory(req, res) {
  const supabase = getSupabase()
  const { market_type, signal_type, limit = 50, offset = 0 } = req.query
  let query = supabase.from('signal_events').select('*,assets(symbol,sector),analysis_outputs(thesis,confidence),paper_trades(outcome,result_pct,exit_reason)').order('created_at',{ascending:false}).range(Number(offset),Number(offset)+Number(limit)-1)
  if (market_type) query = query.eq('market_type',market_type)
  if (signal_type) query = query.eq('signal_type',signal_type)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ signals: data })
}

async function routeSparkline(req, res) {
  const supabase = getSupabase()
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  const { data, error } = await supabase.from('equity_bars').select('bar_date,close,volume,rsi_14,volume_ratio').eq('symbol',symbol).eq('timeframe','day').order('bar_date',{ascending:true}).limit(30)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ symbol, bars: data })
}

async function routeCurrentPrice(req, res) {
  const supabase = getSupabase()
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  const { data, error } = await supabase.from('equity_bars').select('bar_date,close').eq('symbol',symbol).eq('timeframe','day').order('bar_date',{ascending:false}).limit(1).single()
  if (error) return res.status(404).json({ error: error.message })
  res.json({ symbol, close: data.close, bar_date: data.bar_date })
}

async function routeMacro(req, res) {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('macro_regime_snapshots').select('*').order('snapshot_date',{ascending:false}).limit(1).single()
  if (error) return res.status(404).json({ error: 'No macro data yet' })
  res.json(data)
}

async function routeMacroHistory(req, res) {
  const supabase = getSupabase()
  const { days = 60 } = req.query
  const since = new Date(Date.now()-Number(days)*24*3600*1000).toISOString().slice(0,10)
  const { data, error } = await supabase.from('macro_regime_snapshots').select('snapshot_date,regime,vix,spy_close,spy_sma_20,spy_trend,yield_spread_10y2y,regime_multiplier,sector_etf_json').gte('snapshot_date',since).order('snapshot_date',{ascending:true})
  if (error) return res.status(500).json({ error: error.message })
  const snapshots = (data??[]).map(s=>({ snapshot_date:s.snapshot_date, regime:s.regime, vix_level:s.vix, spy_trend:s.spy_trend, spy_close:s.spy_close, yield_spread:s.yield_spread_10y2y, regime_multiplier:s.regime_multiplier, sector_etf_json:s.sector_etf_json }))
  res.json({ snapshots, count: snapshots.length })
}

async function routePaperTrades(req, res) {
  const supabase = getSupabase()
  if (req.method === 'POST') {
    const { data, error } = await supabase.from('paper_trades').insert(req.body).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }
  const { data, error } = await supabase.from('paper_trades').select('*').order('created_at',{ascending:false})
  if (error) return res.status(500).json({ error: error.message })
  res.json({ trades: data })
}

async function routePaperTradeById(req, res) {
  const supabase = getSupabase()
  const { id } = req.query
  if (req.method === 'PATCH') {
    const body = req.body
    const exitPrice = Number(body.exit_price)
    const { data: trade } = await supabase.from('paper_trades').select('entry_price,direction').eq('id',id).single()
    let result_pct = null, outcome = 'scratch'
    if (trade) {
      result_pct = trade.direction==='long' ? ((exitPrice-Number(trade.entry_price))/Number(trade.entry_price))*100 : ((Number(trade.entry_price)-exitPrice)/Number(trade.entry_price))*100
      outcome = result_pct>1?'win':result_pct<-1?'loss':'scratch'
    }
    const { data, error } = await supabase.from('paper_trades').update({ exit_price:exitPrice, exit_reason:body.exit_reason, post_mortem_tag:body.post_mortem_tag||null, notes:body.notes||null, outcome, result_pct: result_pct?Math.round(result_pct*100)/100:null, closed_at:new Date().toISOString() }).eq('id',id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }
  const { data, error } = await supabase.from('paper_trades').select('*').eq('id',id).single()
  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
}

async function routePolymarket(req, res) {
  const supabase = getSupabase()
  const { search, min_edge = 0.05 } = req.query
  let query = supabase.from('polymarket_markets').select('*').eq('active',true).order('volume_total',{ascending:false}).limit(200)
  if (search) query = query.ilike('title','%'+search+'%')
  const { data, error } = await supabase.from('polymarket_markets').select('*').eq('active',true).order('volume_total',{ascending:false}).limit(200)
  if (error) return res.status(500).json({ error: error.message })
  const signals = (data??[]).filter(m => m.edge_pct && Math.abs(m.edge_pct) >= Number(min_edge))
  res.json({ markets: data, signals, count: data?.length??0 })
}

async function routeFundamentals(req, res) {
  const supabase = getSupabase()
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const [detailsRes, financialsRes, rangeRes] = await Promise.allSettled([
    axios.get(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_KEY}`, { timeout: 10000 }),
    axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&timeframe=quarterly&limit=4&apiKey=${POLYGON_KEY}`, { timeout: 10000 }),
    supabase.from('equity_bars').select('bar_date,high,low,close').eq('symbol',symbol).eq('timeframe','day').order('bar_date',{ascending:false}).limit(60).then(r => r.data),
  ])

  const details = detailsRes.status === 'fulfilled' ? detailsRes.value.data?.results : null
  const financials = financialsRes.status === 'fulfilled' ? (financialsRes.value.data?.results ?? []) : []
  const bars = rangeRes.status === 'fulfilled' ? (rangeRes.value ?? []) : []

  const quarterly = financials.filter(f => f.fiscal_period?.startsWith('Q'))
  const latestQ = quarterly[0] ?? null
  const prevQ = quarterly[1] ?? null
  const ttmRecord = financials.find(f => f.fiscal_period === 'TTM')

  const incomeLatest = latestQ?.financials?.income_statement
  const incomePrev = prevQ?.financials?.income_statement
  const latestRev = incomeLatest?.revenues?.value ?? null
  const prevRev = incomePrev?.revenues?.value ?? null
  const eps = incomeLatest?.basic_earnings_per_share?.value ?? null
  const netIncome = incomeLatest?.net_income_loss?.value ?? null
  const ttmNetIncome = ttmRecord?.financials?.income_statement?.net_income_loss?.value ?? null
  const marketCap = details?.market_cap ?? null
  const peRatio = (marketCap && ttmNetIncome && ttmNetIncome > 0) ? Math.round(marketCap / ttmNetIncome * 10) / 10 : null
  const revenueGrowthYoY = (latestRev && prevRev && prevRev !== 0) ? ((latestRev - prevRev) / Math.abs(prevRev)) * 100 : null

  let priceRange = null
  if (bars.length) {
    const highs = bars.map(b => Number(b.high)).filter(v => v > 0)
    const lows = bars.map(b => Number(b.low)).filter(v => v > 0)
    const latestClose = Number(bars[0].close)
    const rangeHigh = Math.max(...highs), rangeLow = Math.min(...lows)
    priceRange = { high: rangeHigh, low: rangeLow, current: latestClose, positionPct: rangeHigh !== rangeLow ? Math.round(((latestClose - rangeLow) / (rangeHigh - rangeLow)) * 100) : null, daysBack: bars.length, fromDate: bars[bars.length-1]?.bar_date, toDate: bars[0]?.bar_date }
  }

  res.json({
    symbol, name: details?.name ?? null, description: details?.description ?? null,
    sector: details?.sic_description ?? null, employees: details?.total_employees ?? null,
    marketCap, sharesOutstanding: details?.weighted_shares_outstanding ?? null, peRatio, eps,
    latestQuarter: latestQ ? { period: `${latestQ.fiscal_period} ${latestQ.fiscal_year}`, endDate: latestQ.end_date, filingDate: latestQ.filing_date, revenue: latestRev, netIncome, revenueGrowthYoY: revenueGrowthYoY ? Math.round(revenueGrowthYoY * 10) / 10 : null } : null,
    priceRange,
  })
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const route = req.query.route
  delete req.query.route

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars' })
  }

  try {
    switch (route) {
      case 'health':           return await routeHealth(req, res)
      case 'watchlist':        return await routeWatchlist(req, res)
      case 'signals':          return await routeSignals(req, res)
      case 'signal':           return await routeSignalById(req, res)
      case 'signals-history':  return await routeSignalsHistory(req, res)
      case 'sparkline':        return await routeSparkline(req, res)
      case 'current-price':    return await routeCurrentPrice(req, res)
      case 'macro':            return await routeMacro(req, res)
      case 'macro-history':    return await routeMacroHistory(req, res)
      case 'paper-trades':     return await routePaperTrades(req, res)
      case 'paper-trade':      return await routePaperTradeById(req, res)
      case 'polymarket':       return await routePolymarket(req, res)
      case 'fundamentals':     return await routeFundamentals(req, res)
      default:
        return res.status(404).json({ error: `Unknown route: ${route}` })
    }
  } catch (err) {
    console.error(`[api] route=${route} error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
