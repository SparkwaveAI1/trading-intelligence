import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data, error } = await supabase
    .from('equity_bars')
    .select('bar_date, close, volume, rsi_14, volume_ratio')
    .eq('symbol', symbol)
    .eq('timeframe', 'day')
    .order('bar_date', { ascending: true })
    .limit(30)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ symbol, bars: data })
}
