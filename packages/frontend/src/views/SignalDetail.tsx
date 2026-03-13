import { useEffect, useState } from 'react'
import Sparkline from '../components/Sparkline'
import ScoreBreakdown from '../components/ScoreBreakdown'
import FundamentalsPanel from '../components/FundamentalsPanel'

interface Props {
  signalId: string
  onBack: () => void
  onLogTrade: (signal: Record<string, unknown>) => void
}

function NearestLevel({ signal }: { signal: Record<string, unknown> }) {
  const lvlType = String(signal.nearest_level_type ?? '')
  const lvlPrice = Number(signal.nearest_level_price).toFixed(2)
  const lvlDist = Number(signal.nearest_level_distance_pct).toFixed(1)
  return (
    <div className="mt-2 text-xs text-slate-400">
      {lvlType === 'support' ? '🟢' : '🔴'} {lvlType} @ ${lvlPrice}
      <span className="text-slate-500 ml-1">({lvlDist}% away)</span>
    </div>
  )
}

export default function SignalDetail({ signalId, onBack, onLogTrade }: Props) {
  const [signal, setSignal] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/query?route=signal&id=${signalId}`)
      .then(r => r.json())
      .then(setSignal)
      .finally(() => setLoading(false))
  }, [signalId])

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-800 rounded w-48" />
      <div className="h-32 bg-slate-800 rounded" />
    </div>
  )
  if (!signal) return <div className="text-slate-400">Signal not found</div>

  const asset = signal.assets as Record<string, string> | null
  const analysis = (signal.analysis_outputs as unknown[])?.at(0) as Record<string, string> | undefined
  const scores = (signal.setup_scores as unknown[])?.at(0) as Record<string, number> | undefined
  const symbol = asset?.symbol ?? (signal.signal_json as Record<string, unknown>)?.ticker as string ?? '—'
  const isEquity = signal.market_type === 'equity'
  const isCapitulation = signal.signal_type === 'capitulation_reversal'

  const confColor = analysis?.confidence === 'high' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : analysis?.confidence === 'medium' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    : 'text-slate-400 bg-slate-500/10 border-slate-500/30'

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 mb-4 transition">
        ← Back to signals
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white">{symbol}</h2>
            {asset?.sector && <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">{asset.sector}</span>}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            {isEquity
              ? (isCapitulation ? '📉 Capitulation Reversal'
                : (signal.signal_type as string) === 'stress_oversold' ? '⚠️ Stress Oversold'
                : '📈 Blowoff Exhaustion')
              : '🎯 Probability Edge'}
            {' · '}
            {new Date(signal.created_at as string).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-black px-4 py-2 rounded-xl border ${
            Number(signal.final_score) >= 7 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
            : Number(signal.final_score) >= 5 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
            : 'text-red-400 bg-red-500/10 border-red-500/30'
          }`}>
            {Number(signal.final_score).toFixed(1)}
          </div>
          <button
            onClick={() => onLogTrade(signal)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Log Paper Trade
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Sparkline */}
        {isEquity && (
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-3 uppercase tracking-wider">Price (30 days)</div>
            <Sparkline symbol={symbol} width={200} height={60} />
            {signal.nearest_level_price ? <NearestLevel signal={signal} /> : null}
          </div>
        )}

        {/* Key indicators */}
        <div className={`${isEquity ? 'lg:col-span-2' : 'lg:col-span-3'} bg-slate-900 border border-slate-800 rounded-xl p-4`}>
          <div className="text-xs text-slate-400 mb-3 uppercase tracking-wider">Indicators</div>
          {isEquity ? (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'RSI(14)', value: signal.rsi != null ? Number(signal.rsi).toFixed(1) : '—', alert: Number(signal.rsi) < 20 || Number(signal.rsi) > 80 },
                { label: 'Stoch %K', value: signal.stoch_k != null ? Number(signal.stoch_k).toFixed(1) : '—', alert: false },
                { label: 'Williams %R', value: signal.williams_r != null ? Number(signal.williams_r).toFixed(1) : '—', alert: false },
                { label: 'Volume Ratio', value: signal.volume_ratio != null ? Number(signal.volume_ratio).toFixed(2)+'x' : '—', alert: Number(signal.volume_ratio) >= 2 },
                { label: 'Macro Regime', value: String(signal.macro_regime ?? '—').replace('_',' ').toUpperCase(), alert: false },
                { label: 'Reclaim', value: signal.reclaim_event ? String(signal.reclaim_event).replace(/_/g,' ') : 'none', alert: !!signal.reclaim_event },
              ].map(ind => (
                <div key={ind.label} className="bg-slate-800 rounded-lg p-3 text-center">
                  <div className={`text-lg font-bold ${ind.alert ? 'text-emerald-400' : 'text-slate-200'}`}>{ind.value as string}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{ind.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Market Price (YES)', value: `${(Number(signal.poly_current_price) * 100).toFixed(0)}%` },
                { label: 'AI Fair Value', value: `${(Number(signal.poly_ai_fair_value) * 100).toFixed(0)}%` },
                { label: 'Edge', value: `${(Number(signal.poly_edge) * 100).toFixed(0)}pp` },
                { label: 'Direction', value: String(signal.poly_direction ?? '—') },
              ].map(ind => (
                <div key={ind.label} className="bg-slate-800 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-slate-200">{ind.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{ind.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      {scores && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
          <div className="text-xs text-slate-400 mb-3 uppercase tracking-wider">Score Breakdown</div>
          <ScoreBreakdown
            stretch_score={scores.stretch_score}
            volume_score={scores.volume_score}
            level_score={scores.level_score}
            reclaim_score={scores.reclaim_score}
            context_multiplier={scores.context_multiplier}
            final_score={scores.final_score}
          />
        </div>
      )}

      {/* Fundamentals */}
      {isEquity && <FundamentalsPanel symbol={symbol} />}

      {/* AI Analysis */}
      {analysis ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider">AI Analysis</div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${confColor}`}>
              {analysis.confidence} confidence
            </span>
            {analysis.expected_horizon && (
              <span className="text-xs text-slate-500">⏱ {analysis.expected_horizon}</span>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-emerald-400 mb-1">↑ Thesis</div>
              <p className="text-sm text-slate-300 leading-relaxed">{analysis.thesis}</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-red-400 mb-1">↓ Counter-thesis</div>
              <p className="text-sm text-slate-400 leading-relaxed">{analysis.counter_thesis}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-blue-400 mb-1">✓ Confirms</div>
                <p className="text-sm text-slate-400 leading-relaxed">{analysis.confirms}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-orange-400 mb-1">✗ Invalidates</div>
                <p className="text-sm text-slate-400 leading-relaxed">{analysis.invalidates}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4 text-sm text-slate-500 italic">
          AI analysis pending — runs after market close
        </div>
      )}
    </div>
  )
}
