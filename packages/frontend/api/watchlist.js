import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // Get latest date with indicators
  const { data: latestRow } = await supabase
    .from('equity_bars')
    .select('bar_date')
    .not('rsi_14', 'is', null)
    .order('bar_date', { ascending: false })
    .limit(1)
    .single()

  if (!latestRow) return res.json({ date: null, items: [] })
  const latestDate = latestRow.bar_date

  // Get previous trading day close for % change calculation
  const { data: prevRow } = await supabase
    .from('equity_bars')
    .select('bar_date')
    .not('rsi_14', 'is', null)
    .lt('bar_date', latestDate)
    .order('bar_date', { ascending: false })
    .limit(1)
    .single()

  const prevDate = prevRow?.bar_date ?? null

  // Fetch today's bars
  const { data: todayBars, error } = await supabase
    .from('equity_bars')
    .select('symbol, open, high, low, close, volume, rsi_14, stoch_k, williams_r, volume_ratio, sma_20, vwap')
    .eq('bar_date', latestDate)
    .not('rsi_14', 'is', null)
    .order('volume_ratio', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Fetch previous day closes for % change
  let prevCloses = {}
  if (prevDate) {
    const symbols = todayBars.map(b => b.symbol)
    const { data: prevBars } = await supabase
      .from('equity_bars')
      .select('symbol, close')
      .eq('bar_date', prevDate)
      .in('symbol', symbols)

    prevCloses = Object.fromEntries((prevBars ?? []).map(b => [b.symbol, b.close]))
  }

  // Annotate with day change and intraday range
  const items = todayBars.map(bar => {
    const prevClose = prevCloses[bar.symbol] ?? null
    const day_change_pct = prevClose
      ? ((Number(bar.close) - Number(prevClose)) / Number(prevClose)) * 100
      : null
    const intraday_range_pct = bar.high && bar.low && bar.open
      ? ((Number(bar.high) - Number(bar.low)) / Number(bar.open)) * 100
      : null
    return {
      ...bar,
      prev_close: prevClose,
      day_change_pct,
      intraday_range_pct,
    }
  })

  res.json({ date: latestDate, prev_date: prevDate, items })
}
