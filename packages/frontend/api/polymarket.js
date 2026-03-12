import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data, error } = await supabase
    .from('polymarket_markets')
    .select('*')
    .eq('status', 'active')
    .order('volume_24h', { ascending: false })
    .limit(100)

  if (error) return res.status(500).json({ error: error.message })

  // Also get active polymarket signals
  const { data: signals } = await supabase
    .from('signal_events')
    .select('*')
    .eq('market_type', 'polymarket')
    .eq('status', 'active')
    .order('final_score', { ascending: false })

  res.json({
    markets: data,
    count: data?.length ?? 0,
    signals: signals ?? [],
    signal_count: signals?.length ?? 0
  })
}
