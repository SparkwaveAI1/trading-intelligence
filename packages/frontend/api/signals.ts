import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from './_supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = getSupabase()
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('signal_events')
    .select('*, assets(symbol, name, sector)')
    .eq('status', 'active')
    .gte('created_at', since)
    .order('final_score', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ signals: data, count: data?.length ?? 0 })
}
