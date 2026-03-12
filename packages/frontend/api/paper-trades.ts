import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from './_supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabase = getSupabase()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('paper_trades')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ trades: data, count: data?.length ?? 0 })
  }

  if (req.method === 'POST') {
    const { signal_event_id, direction, entry_price, stop_level, target_level, size_pct, notes, symbol, market_type } = req.body
    if (!direction || !entry_price) return res.status(400).json({ error: 'direction and entry_price required' })
    const { data, error } = await supabase.from('paper_trades').insert({
      signal_event_id: signal_event_id ?? null,
      trade_type: 'paper', market_type: market_type ?? 'equity',
      symbol: symbol ?? null, direction, entry_price,
      stop_level: stop_level ?? null, target_level: target_level ?? null,
      size_pct: size_pct ?? null, notes: notes ?? null, outcome: 'open'
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
