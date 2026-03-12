import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from './_supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('macro_regime_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  if (error) return res.status(404).json({ error: 'No macro data yet' })
  res.json(data)
}
