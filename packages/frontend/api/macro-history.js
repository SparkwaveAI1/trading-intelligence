import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { days = 60 } = req.query
  const since = new Date(Date.now() - Number(days) * 24 * 3600 * 1000).toISOString()

  const { data, error } = await supabase
    .from('macro_snapshots')
    .select('snapshot_date, regime, vix_level, spy_rsi, yield_spread, vix_regime, yield_regime, equity_regime')
    .gte('snapshot_date', since.slice(0, 10))
    .order('snapshot_date', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ snapshots: data, count: data?.length ?? 0 })
}
