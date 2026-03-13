/**
 * AI Analysis Service
 * When a signal fires, GPT-4.1 writes:
 * - thesis (why this setup could work)
 * - counter_thesis (what could go wrong)
 * - confirms (what would confirm the trade)
 * - invalidates (what would invalidate it)
 * - confidence (low/medium/high)
 * - expected_horizon (how long to hold)
 *
 * RULE: LLM explains deterministic signals. It never creates signals,
 * never sets risk parameters, never controls execution.
 */
import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()
import { supabase } from '../lib/supabase'
import { withRetry } from '../lib/retry'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!
const MODEL = 'gpt-4.1-2025-04-14'

interface SignalEvent {
  id: string
  market_type: string
  signal_type: string
  rsi: number | null
  stoch_k: number | null
  volume_ratio: number | null
  nearest_level_type: string | null
  nearest_level_price: number | null
  nearest_level_distance_pct: number | null
  reclaim_event: string | null
  macro_regime: string | null
  final_score: number
  poly_current_price: number | null
  poly_ai_fair_value: number | null
  poly_edge: number | null
  poly_direction: string | null
  signal_json: Record<string, unknown>
  assets?: { symbol: string; name?: string; sector?: string }
  polymarket_markets?: { title: string; resolution_date?: string }
}

function buildEquityPrompt(signal: SignalEvent): string {
  const s = signal.assets?.symbol ?? 'Unknown'
  const sector = signal.assets?.sector ?? 'Unknown sector'
  const signalLabel = signal.signal_type === 'capitulation_reversal' ? 'CAPITULATION REVERSAL'
    : signal.signal_type === 'stress_oversold' ? 'STRESS-REGIME OVERSOLD (broad market selloff, lower vol threshold)'
    : 'BLOWOFF EXHAUSTION'
  return `You are a trading analyst writing a concise signal brief. Be direct, specific, and honest about uncertainty. No fluff.

SIGNAL: ${signalLabel} on ${s}

INDICATORS:
- RSI(14): ${signal.rsi?.toFixed(1) ?? 'N/A'}
- Stochastic %K: ${signal.stoch_k?.toFixed(1) ?? 'N/A'}
- Volume ratio: ${signal.volume_ratio?.toFixed(2) ?? 'N/A'}x (vs 20-day avg)
- Nearest ${signal.nearest_level_type ?? 'level'}: $${signal.nearest_level_price?.toFixed(2) ?? 'N/A'} (${signal.nearest_level_distance_pct?.toFixed(1) ?? '?'}% away)
- Reclaim event: ${signal.reclaim_event ?? 'none'}
- Macro regime: ${signal.macro_regime ?? 'unknown'}
- Signal score: ${signal.final_score?.toFixed(1)}/10

Write a structured brief with EXACTLY these 6 fields. Be specific to this ticker and setup. 2-3 sentences max per field.

THESIS: [Why this specific setup could work — cite the actual numbers]
COUNTER_THESIS: [Specific risks — what macro, sector, or technical factors could kill this]
CONFIRMS: [1-2 specific price actions or conditions that would confirm entry]
INVALIDATES: [1-2 specific conditions that would mean the thesis is wrong]
CONFIDENCE: [low/medium/high — be honest, most setups are low]
HORIZON: [expected hold time if thesis plays out, e.g. "2-5 days", "1-2 weeks"]`
}

function buildPolyPrompt(signal: SignalEvent): string {
  const title = signal.polymarket_markets?.title ?? signal.signal_json?.title ?? 'Unknown market'
  const yesPrice = ((signal.poly_current_price ?? 0) * 100).toFixed(0)
  const estPrice = ((signal.poly_ai_fair_value ?? 0) * 100).toFixed(0)
  const edge = ((signal.poly_edge ?? 0) * 100).toFixed(0)
  const dir = signal.poly_direction
  const resDate = signal.polymarket_markets?.resolution_date
    ? new Date(signal.polymarket_markets.resolution_date).toLocaleDateString()
    : 'unknown'

  return `You are a prediction market analyst writing a brief on a probability edge opportunity. Be direct and honest about uncertainty.

MARKET: "${title}"
RESOLUTION: ${resDate}

PRICING:
- Current market price: YES=${yesPrice}%
- Estimated fair value: ${estPrice}%
- Edge direction: ${dir} (${edge} percentage points)
- Macro context: ${signal.macro_regime ?? 'neutral'}

Write a structured brief with EXACTLY these 6 fields. 2-3 sentences max per field.

THESIS: [Why the market might be mispriced in the ${dir} direction — what information asymmetry exists]
COUNTER_THESIS: [Why the market price might actually be correct — what you could be missing]
CONFIRMS: [What new information or price action would confirm this edge is real]
INVALIDATES: [What would mean the edge has disappeared or the thesis was wrong]
CONFIDENCE: [low/medium/high — prediction markets are hard, be honest]
HORIZON: [When would you expect the edge to resolve, e.g. "before resolution date", "within 1 week"]`
}

function parseAnalysisResponse(text: string): {
  thesis: string; counter_thesis: string; confirms: string
  invalidates: string; confidence: string; horizon: string
} {
  const extract = (label: string) => {
    const regex = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, 'si')
    return (text.match(regex)?.[1] ?? '').trim().replace(/^\[|\]$/g, '').trim()
  }

  return {
    thesis: extract('THESIS'),
    counter_thesis: extract('COUNTER_THESIS'),
    confirms: extract('CONFIRMS'),
    invalidates: extract('INVALIDATES'),
    confidence: extract('CONFIDENCE').toLowerCase().includes('high') ? 'high'
      : extract('CONFIDENCE').toLowerCase().includes('medium') ? 'medium' : 'low',
    horizon: extract('HORIZON'),
  }
}

async function analyzeSignal(signal: SignalEvent): Promise<void> {
  // Check if already analyzed
  const { data: existing } = await supabase
    .from('analysis_outputs')
    .select('id')
    .eq('signal_event_id', signal.id)
    .limit(1)
    .single()

  if (existing) {
    console.log(`[ai] Signal ${signal.id} already analyzed, skipping`)
    return
  }

  const prompt = signal.market_type === 'polymarket'
    ? buildPolyPrompt(signal)
    : buildEquityPrompt(signal)

  const response = await withRetry(async () => {
    const r = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.3,
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    )
    return r.data.choices[0].message.content as string
  }, `analyzeSignal:${signal.id}`)

  const parsed = parseAnalysisResponse(response)

  await supabase.from('analysis_outputs').insert({
    signal_event_id: signal.id,
    thesis: parsed.thesis,
    counter_thesis: parsed.counter_thesis,
    confirms: parsed.confirms,
    invalidates: parsed.invalidates,
    confidence: parsed.confidence,
    expected_horizon: parsed.horizon,
    model_used: MODEL,
    ai_output_json: { raw: response, parsed },
    source_timestamps: { generated: new Date().toISOString() },
  })

  console.log(`[ai] Analyzed ${signal.market_type} signal ${signal.id} — confidence: ${parsed.confidence}`)
}

export async function runAIAnalysis() {
  if (!OPENAI_API_KEY) {
    console.log('[ai] No OPENAI_API_KEY — skipping analysis')
    return { analyzed: 0 }
  }

  // Get signals without analysis, from last 48h
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const { data: signals, error } = await supabase
    .from('signal_events')
    .select('*, assets(symbol, name, sector), polymarket_markets(title, resolution_date)')
    .eq('status', 'active')
    .gte('created_at', since)
    .order('final_score', { ascending: false })

  if (error || !signals?.length) {
    console.log('[ai] No signals to analyze')
    return { analyzed: 0 }
  }

  // Filter to unanalyzed
  const { data: analyzed } = await supabase
    .from('analysis_outputs')
    .select('signal_event_id')
    .in('signal_event_id', signals.map(s => s.id))

  const analyzedIds = new Set((analyzed ?? []).map(a => a.signal_event_id))
  const unanalyzed = signals.filter(s => !analyzedIds.has(s.id))

  console.log(`[ai] ${unanalyzed.length} signals to analyze (${signals.length - unanalyzed.length} already done)`)

  let count = 0
  for (const signal of unanalyzed) {
    try {
      await analyzeSignal(signal as unknown as SignalEvent)
      count++
      // Brief pause between API calls
      await new Promise(r => setTimeout(r, 1000))
    } catch (err: any) {
      console.error(`[ai] Failed signal ${signal.id}:`, err.message)
    }
  }

  console.log(`[ai] Done — ${count} signals analyzed`)
  return { analyzed: count }
}

if (require.main === module) {
  runAIAnalysis()
    .then(r => { console.log('Done:', r); process.exit(0) })
    .catch(e => { console.error(e); process.exit(1) })
}
