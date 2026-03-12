import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { id } = req.query

  const { data, error } = await supabase
    .from('signal_events')
    .select(`
      *,
      assets(symbol, name, sector, industry, market_cap_category),
      analysis_outputs(*),
      setup_scores(*),
      polymarket_markets(title, resolution_date, liquidity, volume_24h)
    `)
    .eq('id', id)
    .single()

  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
}
