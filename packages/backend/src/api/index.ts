import express from 'express'
import cors from 'cors'
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'

const app = express()
app.use(cors())
app.use(express.json())

// GET /api/health
app.get('/api/health', async (_req, res) => {
  const { error } = await supabase.from('assets').select('id').limit(1)
  res.json({ status: 'ok', db: error ? 'error' : 'connected', date: new Date().toISOString() })
})

// GET /api/signals — active signals ordered by score
app.get('/api/signals', async (_req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('signal_events')
    .select('*, assets(symbol, name, sector)')
    .eq('status', 'active')
    .gte('created_at', since)
    .order('final_score', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ signals: data, count: data?.length ?? 0 })
})

// GET /api/signals/:id
app.get('/api/signals/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('signal_events')
    .select('*, assets(symbol, name, sector), analysis_outputs(*), setup_scores(*)')
    .eq('id', req.params.id)
    .single()
  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
})

// GET /api/watchlist — latest bars with indicators, sorted by RSI asc
app.get('/api/watchlist', async (_req, res) => {
  // Get latest date with indicator data
  const { data: latestRow } = await supabase
    .from('equity_bars')
    .select('bar_date')
    .not('rsi_14', 'is', null)
    .order('bar_date', { ascending: false })
    .limit(1)
    .single()

  if (!latestRow) return res.json({ date: null, items: [] })
  const date = latestRow.bar_date

  const { data, error } = await supabase
    .from('equity_bars')
    .select('symbol, close, rsi_14, stoch_k, williams_r, volume_ratio, sma_20, vwap')
    .eq('bar_date', date)
    .not('rsi_14', 'is', null)
    .order('rsi_14', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ date, items: data })
})

// GET /api/macro — latest macro regime snapshot
app.get('/api/macro', async (_req, res) => {
  const { data, error } = await supabase
    .from('macro_regime_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  if (error) return res.status(404).json({ error: 'No macro data yet' })
  res.json(data)
})

// GET /api/paper-trades
app.get('/api/paper-trades', async (_req, res) => {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ trades: data, count: data?.length ?? 0 })
})

// POST /api/paper-trades
app.post('/api/paper-trades', async (req, res) => {
  const { signal_event_id, direction, entry_price, stop_level, target_level, size_pct, notes, symbol, market_type } = req.body
  if (!direction || !entry_price) return res.status(400).json({ error: 'direction and entry_price required' })

  const { data, error } = await supabase.from('paper_trades').insert({
    signal_event_id: signal_event_id ?? null,
    trade_type: 'paper',
    market_type: market_type ?? 'equity',
    symbol: symbol ?? null,
    direction,
    entry_price,
    stop_level: stop_level ?? null,
    target_level: target_level ?? null,
    size_pct: size_pct ?? null,
    notes: notes ?? null,
    outcome: 'open'
  }).select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH /api/paper-trades/:id — close a trade
app.patch('/api/paper-trades/:id', async (req, res) => {
  const { exit_price, exit_reason, post_mortem_tag, notes } = req.body

  // Get current trade to compute result
  const { data: trade, error: fetchError } = await supabase
    .from('paper_trades')
    .select('entry_price, direction')
    .eq('id', req.params.id)
    .single()
  if (fetchError) return res.status(404).json({ error: 'Trade not found' })

  let result_pct: number | null = null
  let outcome: string = 'open'

  if (exit_price && trade) {
    const entry = Number(trade.entry_price)
    const exit = Number(exit_price)
    result_pct = trade.direction === 'long'
      ? Math.round(((exit - entry) / entry) * 10000) / 100
      : Math.round(((entry - exit) / entry) * 10000) / 100
    outcome = result_pct > 0.5 ? 'win' : result_pct < -0.5 ? 'loss' : 'scratch'
  }

  const { data, error } = await supabase
    .from('paper_trades')
    .update({
      exit_price: exit_price ?? null,
      exit_time: exit_price ? new Date().toISOString() : null,
      exit_reason: exit_reason ?? null,
      post_mortem_tag: post_mortem_tag ?? null,
      notes: notes ?? null,
      result_pct,
      outcome
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => console.log(`[api] Trading Intelligence API running on port ${PORT}`))

export default app
