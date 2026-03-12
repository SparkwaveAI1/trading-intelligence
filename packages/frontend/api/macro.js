import { createClient } from '@supabase/supabase-js'
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { data, error } = await supabase.from('macro_regime_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(1).single()
  if (error) return res.status(404).json({ error: 'No macro data yet' })
  res.json(data)
}
