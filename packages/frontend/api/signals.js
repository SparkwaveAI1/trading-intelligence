import { createClient } from '@supabase/supabase-js'
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase.from('signal_events').select('*, assets(symbol, name, sector)').eq('status','active').gte('created_at',since).order('final_score', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ signals: data, count: data?.length ?? 0 })
}
