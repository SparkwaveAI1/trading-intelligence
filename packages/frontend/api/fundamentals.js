import axios from 'axios'

const POLYGON_KEY = process.env.POLYGON_API_KEY
const EDGAR_BASE = 'https://data.sec.gov'
const EDGAR_HEADERS = { 'User-Agent': 'TradingApp/1.0 admin@sparkwaveai.com' }

// CIK lookup cache (hardcoded for our 101-symbol universe)
// Fetch dynamically from EDGAR company search
async function getCIK(symbol) {
  try {
    const r = await axios.get(
      `${EDGAR_BASE}/submissions/CIK${String().padStart(10, '0')}.json`,
      { headers: EDGAR_HEADERS, timeout: 5000 }
    )
    return null
  } catch { return null }
}

async function getTickerDetails(symbol) {
  const r = await axios.get(
    `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_KEY}`,
    { timeout: 10000 }
  )
  return r.data?.results ?? null
}

async function getFinancials(symbol) {
  const r = await axios.get(
    `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&timeframe=quarterly&limit=4&apiKey=${POLYGON_KEY}`,
    { timeout: 10000 }
  )
  return r.data?.results ?? []
}

async function get52WeekRange(symbol, supabaseUrl, supabaseKey) {
  // Use our own equity_bars data (up to 46 days, not a full year — label accordingly)
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data } = await supabase
    .from('equity_bars')
    .select('bar_date, high, low, close')
    .eq('symbol', symbol)
    .eq('timeframe', 'day')
    .order('bar_date', { ascending: false })
    .limit(60)
  if (!data?.length) return null
  const highs = data.map(b => Number(b.high)).filter(v => v > 0)
  const lows = data.map(b => Number(b.low)).filter(v => v > 0)
  const latestClose = Number(data[0].close)
  return {
    rangeHigh: Math.max(...highs),
    rangeLow: Math.min(...lows),
    latestClose,
    daysBack: data.length,
    fromDate: data[data.length - 1]?.bar_date,
    toDate: data[0]?.bar_date,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const results = await Promise.allSettled([
    getTickerDetails(symbol),
    getFinancials(symbol),
    get52WeekRange(symbol, process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY),
  ])

  const details = results[0].status === 'fulfilled' ? results[0].value : null
  const financials = results[1].status === 'fulfilled' ? results[1].value : []
  const range = results[2].status === 'fulfilled' ? results[2].value : null

  // Parse latest quarterly financials
  const quarterly = financials.filter(f => f.fiscal_period?.startsWith('Q'))
  const latestQ = quarterly[0] ?? null
  const prevQ = quarterly[1] ?? null

  const incomeLatest = latestQ?.financials?.income_statement
  const incomePrev = prevQ?.financials?.income_statement
  const balanceLatest = latestQ?.financials?.balance_sheet

  const latestRev = incomeLatest?.revenues?.value ?? null
  const prevRev = incomePrev?.revenues?.value ?? null
  const revenueGrowthYoY = (latestRev && prevRev && prevRev !== 0)
    ? ((latestRev - prevRev) / Math.abs(prevRev)) * 100
    : null

  const eps = incomeLatest?.basic_earnings_per_share?.value ?? null
  const netIncome = incomeLatest?.net_income_loss?.value ?? null

  // Compute PE from market cap / net income (TTM)
  const ttmRecord = financials.find(f => f.fiscal_period === 'TTM')
  const ttmIncome = ttmRecord?.financials?.income_statement?.net_income_loss?.value ?? null
  const marketCap = details?.market_cap ?? null
  const peRatio = (marketCap && ttmIncome && ttmIncome > 0)
    ? Math.round(marketCap / ttmIncome * 10) / 10
    : null

  // Price vs range
  const rangePosition = (range && range.rangeLow !== range.rangeHigh)
    ? Math.round(((range.latestClose - range.rangeLow) / (range.rangeHigh - range.rangeLow)) * 100)
    : null

  res.json({
    symbol,
    // Company
    name: details?.name ?? null,
    description: details?.description ?? null,
    sector: details?.sic_description ?? null,
    employees: details?.total_employees ?? null,
    marketCap: marketCap,
    sharesOutstanding: details?.weighted_shares_outstanding ?? null,

    // Valuation
    peRatio,
    eps,

    // Financials (latest quarter)
    latestQuarter: latestQ ? {
      period: `${latestQ.fiscal_period} ${latestQ.fiscal_year}`,
      endDate: latestQ.end_date,
      filingDate: latestQ.filing_date,
      revenue: latestRev,
      netIncome,
      revenueGrowthYoY: revenueGrowthYoY ? Math.round(revenueGrowthYoY * 10) / 10 : null,
    } : null,

    // Price range (from our DB, not full 52w)
    priceRange: range ? {
      high: range.rangeHigh,
      low: range.rangeLow,
      current: range.latestClose,
      positionPct: rangePosition,
      daysBack: range.daysBack,
      fromDate: range.fromDate,
      toDate: range.toDate,
    } : null,
  })
}
