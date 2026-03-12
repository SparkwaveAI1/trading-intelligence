import { useEffect, useState } from 'react'
import { getSignals } from '../api'

interface Analysis {
  thesis: string; counter_thesis: string; confirms: string
  invalidates: string; confidence: string; expected_horizon: string
}

interface Signal {
  id: string
  signal_type: string
  rsi: number
  volume_ratio: number
  final_score: number
  macro_regime: string
  reclaim_event: string
  nearest_level_price: number
  nearest_level_distance_pct: number
  created_at: string
  assets?: { symbol: string; sector?: string }
  signal_json?: Record<string, unknown>
  analysis_outputs?: Analysis[]
}

function scoreBadge(score: number) {
  if (score >= 7) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
  if (score >= 5) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}

function regimeChip(regime: string) {
  const map: Record<string, string> = {
    risk_on: 'bg-emerald-500/20 text-emerald-300',
    neutral: 'bg-slate-500/20 text-slate-300',
    cautious: 'bg-yellow-500/20 text-yellow-300',
    stress: 'bg-red-500/20 text-red-300',
  }
  return map[regime] ?? 'bg-slate-500/20 text-slate-300'
}

export default function SignalFeed() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    getSignals()
      .then(d => setSignals(d.signals ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="text-slate-400 text-sm">Loading signals...</div>

  if (!signals.length) return (
    <div className="flex flex-col items-center justify-center py-24 text-slate-500">
      <div className="text-4xl mb-4">📭</div>
      <div className="text-lg font-medium text-slate-400">No active signals</div>
      <div className="text-sm mt-1">Check back after market close (5:30 PM ET)</div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{signals.length} Active Signal{signals.length !== 1 ? 's' : ''}</h2>
        <button onClick={load} className="text-xs text-slate-400 hover:text-slate-200 transition">↻ Refresh</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {signals.map(s => (
          <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xl font-bold text-white">{s.assets?.symbol ?? '—'}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {s.signal_type === 'capitulation_reversal' ? '📉 CAPITULATION REVERSAL' : '📈 BLOWOFF EXHAUSTION'}
                </div>
              </div>
              <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${scoreBadge(s.final_score)}`}>
                {s.final_score?.toFixed(1)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-slate-800 rounded-lg p-2">
                <div className={`text-lg font-bold ${s.rsi < 20 ? 'text-red-400' : 'text-slate-200'}`}>{s.rsi?.toFixed(1)}</div>
                <div className="text-xs text-slate-500">RSI</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2">
                <div className="text-lg font-bold text-slate-200">{s.volume_ratio?.toFixed(2)}x</div>
                <div className="text-xs text-slate-500">Volume</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2">
                <div className="text-lg font-bold text-slate-200">{s.nearest_level_distance_pct?.toFixed(1)}%</div>
                <div className="text-xs text-slate-500">From Level</div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              {s.macro_regime && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${regimeChip(s.macro_regime)}`}>
                  {s.macro_regime.replace('_', ' ').toUpperCase()}
                </span>
              )}
              {s.reclaim_event && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                  {s.reclaim_event.replace(/_/g, ' ')}
                </span>
              )}
              {s.assets?.sector && (
                <span className="text-xs text-slate-500">{s.assets.sector}</span>
              )}
            </div>

            {/* AI Analysis */}
            {s.analysis_outputs?.[0] ? (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-slate-400">AI Analysis</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    s.analysis_outputs[0].confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400'
                    : s.analysis_outputs[0].confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-slate-500/20 text-slate-400'
                  }`}>{s.analysis_outputs[0].confidence} confidence</span>
                  {s.analysis_outputs[0].expected_horizon && (
                    <span className="text-xs text-slate-500">{s.analysis_outputs[0].expected_horizon}</span>
                  )}
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  <span className="text-emerald-400 font-medium">↑ </span>{s.analysis_outputs[0].thesis}
                </div>
                <div className="text-xs text-slate-400 leading-relaxed">
                  <span className="text-red-400 font-medium">↓ </span>{s.analysis_outputs[0].counter_thesis}
                </div>
                {s.analysis_outputs[0].confirms && (
                  <div className="text-xs text-slate-500">
                    <span className="text-slate-400">Confirms: </span>{s.analysis_outputs[0].confirms}
                  </div>
                )}
              </div>
            ) : (
              <div className="border-t border-slate-800 pt-3 text-xs text-slate-600 italic">
                AI analysis pending — runs after market close
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
