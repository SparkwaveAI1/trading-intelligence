import { useEffect, useState } from 'react'

interface HistoricalSignal {
  id: string; signal_type: string; market_type: string; final_score: number
  created_at: string; macro_regime: string; rsi: number | null
  volume_ratio: number | null; status: string
  assets?: { symbol: string; sector?: string }
  analysis_outputs?: Array<{ thesis: string; confidence: string }>
  paper_trades?: Array<{ outcome: string; result_pct: number | null; exit_reason: string }>
}

function outcomeBadge(outcome: string) {
  if (outcome === 'win') return 'bg-emerald-500/20 text-emerald-400'
  if (outcome === 'loss') return 'bg-red-500/20 text-red-400'
  if (outcome === 'scratch') return 'bg-slate-500/20 text-slate-400'
  return 'bg-blue-500/20 text-blue-400'
}

interface Props {
  onSelectSignal: (id: string) => void
}

export default function SignalHistory({ onSelectSignal }: Props) {
  const [signals, setSignals] = useState<HistoricalSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'equity' | 'polymarket'>('all')

  useEffect(() => {
    const q = filter === 'all' ? '' : `&market_type=${filter}`
    fetch(`/api/signals-history?limit=100${q}`)
      .then(r => r.json())
      .then(d => setSignals(d.signals ?? []))
      .finally(() => setLoading(false))
  }, [filter])

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'equity', label: 'Equities' },
    { id: 'polymarket', label: 'Polymarket' },
  ] as const

  if (loading) return <div className="text-slate-400 text-sm">Loading history...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Signal History</h2>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={`px-3 py-1 text-xs rounded-md transition ${filter === t.id ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!signals.length ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-3xl mb-3">📭</div>
          <div>No historical signals yet</div>
          <div className="text-sm mt-1">Signals will appear here after the first pipeline run</div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800">
              <tr className="text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 text-left">Symbol / Market</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">RSI</th>
                <th className="px-4 py-3 text-right">Vol</th>
                <th className="px-4 py-3 text-left">AI Conf</th>
                <th className="px-4 py-3 text-left">Trade</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {signals.map(s => {
                const trade = s.paper_trades?.[0]
                const analysis = s.analysis_outputs?.[0]
                return (
                  <tr key={s.id}
                    onClick={() => onSelectSignal(s.id)}
                    className="hover:bg-slate-800/50 cursor-pointer transition">
                    <td className="px-4 py-3">
                      <div className="font-bold font-mono text-white">{s.assets?.symbol ?? '—'}</div>
                      {s.assets?.sector && <div className="text-xs text-slate-500">{s.assets.sector}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">
                        {s.signal_type === 'capitulation_reversal' ? '📉 Cap' : s.signal_type === 'blowoff_exhaustion' ? '📈 Blow' : '🎯 Edge'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${Number(s.final_score) >= 7 ? 'text-emerald-400' : Number(s.final_score) >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {Number(s.final_score).toFixed(1)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right ${s.rsi != null && s.rsi < 20 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                      {s.rsi != null ? Number(s.rsi).toFixed(1) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right ${s.volume_ratio != null && s.volume_ratio >= 2 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {s.volume_ratio != null ? Number(s.volume_ratio).toFixed(1)+'x' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {analysis ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${analysis.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' : analysis.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-400'}`}>
                          {analysis.confidence}
                        </span>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {trade ? (
                        <div className="flex items-center gap-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${outcomeBadge(trade.outcome)}`}>{trade.outcome.toUpperCase()}</span>
                          {trade.result_pct != null && (
                            <span className={`text-xs ${trade.result_pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {trade.result_pct > 0 ? '+' : ''}{trade.result_pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      ) : <span className="text-slate-600 text-xs">not traded</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(s.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
