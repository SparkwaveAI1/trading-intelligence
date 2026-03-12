import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { error } = await supabase.from('assets').select('id').limit(1)
    res.json({ status: 'ok', db: error ? 'error:'+error.message : 'connected', date: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message })
  }
}
