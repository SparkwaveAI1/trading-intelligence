import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from './_supabase'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('assets').select('id').limit(1)
    res.json({ status: 'ok', db: error ? 'error' : 'connected', date: new Date().toISOString() })
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message })
  }
}
