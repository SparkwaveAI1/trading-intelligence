import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { days = 60 } = req.query
  const since = new Date(Date.now() - Number(days) * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('macro_regime_snapshots')
    .select('snapshot_date, regime, vix, spy_close, spy_sma_20, spy_trend, yield_spread_10y2y, regime_multiplier, sector_etf_json')
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  // Normalize field names to what the frontend expects
  const snapshots = (data ?? []).map(s => ({
    snapshot_date: s.snapshot_date,
    regime: s.regime,
    vix_level: s.vix,
    spy_rsi: null, // not stored — use spy_trend instead
    spy_trend: s.spy_trend,
    spy_close: s.spy_close,
    yield_spread: s.yield_spread_10y2y,
    regime_multiplier: s.regime_multiplier,
    sector_etf_json: s.sector_etf_json,
  }))

  res.json({ snapshots, count: snapshots.length })
}
