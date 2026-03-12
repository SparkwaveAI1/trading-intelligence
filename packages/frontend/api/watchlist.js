const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: latestRow } = await supabase
    .from('equity_bars').select('bar_date').not('rsi_14','is',null)
    .order('bar_date', { ascending: false }).limit(1).single()

  if (!latestRow) return res.json({ date: null, items: [] })

  const { data, error } = await supabase
    .from('equity_bars')
    .select('symbol, close, rsi_14, stoch_k, williams_r, volume_ratio, sma_20, vwap')
    .eq('bar_date', latestRow.bar_date).not('rsi_14','is',null)
    .order('rsi_14', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ date: latestRow.bar_date, items: data })
}
