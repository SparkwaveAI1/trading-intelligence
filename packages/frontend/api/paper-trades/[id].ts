import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../_supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabase()
  const { id } = req.query
  const { exit_price, exit_reason, post_mortem_tag, notes } = req.body

  const { data: trade } = await supabase.from('paper_trades').select('entry_price, direction').eq('id', id).single()
  if (!trade) return res.status(404).json({ error: 'Trade not found' })

  let result_pct = null, outcome = 'open'
  if (exit_price && trade) {
    const pct = trade.direction === 'long'
      ? ((Number(exit_price) - Number(trade.entry_price)) / Number(trade.entry_price)) * 100
      : ((Number(trade.entry_price) - Number(exit_price)) / Number(trade.entry_price)) * 100
    result_pct = Math.round(pct * 100) / 100
    outcome = result_pct > 0.5 ? 'win' : result_pct < -0.5 ? 'loss' : 'scratch'
  }

  const { data, error } = await supabase.from('paper_trades')
    .update({ exit_price: exit_price ?? null, exit_time: exit_price ? new Date().toISOString() : null, exit_reason: exit_reason ?? null, post_mortem_tag: post_mortem_tag ?? null, notes: notes ?? null, result_pct, outcome })
    .eq('id', id).select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}
