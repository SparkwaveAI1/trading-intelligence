import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { market_type, signal_type, limit = 50, offset = 0 } = req.query

  let query = supabase
    .from('signal_events')
    .select('*, assets(symbol, sector), analysis_outputs(thesis, confidence), paper_trades(outcome, result_pct, exit_reason)')
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (market_type) query = query.eq('market_type', market_type)
  if (signal_type) query = query.eq('signal_type', signal_type)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ signals: data, total: count })
}
