import { useEffect, useState } from 'react'

interface MacroSnapshot {
  snapshot_date: string
  regime: string
  vix_level: number | null
  spy_trend: string | null
  spy_close: number | null
  yield_spread: number | null
  regime_multiplier: number | null
  sector_etf_json: Record<string, number> | null
}

const REGIME_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  risk_on:   { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  neutral:   { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/30' },
  cautious:  { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/30' },
  stress:    { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30' },
}

function regimeStyle(regime: string | null) {
  return REGIME_COLORS[regime ?? 'neutral'] ?? REGIME_COLORS.neutral
}

// Minimal SVG line chart
function LineChart({ values, dates, color = '#60a5fa', min: extMin, max: extMax }:
  { values: (number | null)[]; dates: string[]; color?: string; min?: number; max?: number }) {
  const clean = values.map(v => v ?? null)
  const defined = clean.filter(v => v !== null) as number[]
  if (!defined.length) return <div className="h-20 flex items-center justify-center text-slate-600 text-xs">No data</div>

  const minV = extMin ?? Math.min(...defined)
  const maxV = extMax ?? Math.max(...defined)
  const range = maxV - minV || 1
  const W = 600, H = 80

  const pts = clean.map((v, i) => {
    if (v === null) return null
    const x = (i / (clean.length - 1)) * W
    const y = H - ((v - minV) / range) * H
    return `${x},${y}`
  }).filter(Boolean) as string[]

  const fillPath = `0,${H} ${pts.join(' ')} ${W},${H}`

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPath} fill={`url(#fill-${color.replace('#','')})`} />
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {/* Date labels */}
      <div className="flex justify-between text-xs text-slate-600 mt-1 px-0.5">
        <span>{dates[0]?.slice(5)}</span>
        <span>{dates[Math.floor(dates.length / 2)]?.slice(5)}</span>
        <span>{dates[dates.length - 1]?.slice(5)}</span>
      </div>
    </div>
  )
}

// Regime timeline (colored blocks)
function RegimeTimeline({ snapshots }: { snapshots: MacroSnapshot[] }) {
  if (!snapshots.length) return null
  return (
    <div className="flex h-6 rounded-lg overflow-hidden gap-px">
      {snapshots.map((s, i) => {
        const style = regimeStyle(s.regime)
        return (
          <div
            key={i}
            title={`${s.snapshot_date}: ${s.regime}`}
            className={`flex-1 ${style.bg} cursor-default transition hover:opacity-80`}
          />
        )
      })}
    </div>
  )
}

export default function MacroView() {
  const [snapshots, setSnapshots] = useState<MacroSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/query?route=macro-history&days=${days}`)
      .then(r => r.json())
      .then(d => setSnapshots(d.snapshots ?? []))
      .finally(() => setLoading(false))
  }, [days])

  const latest = snapshots[snapshots.length - 1] ?? null
  const latestStyle = regimeStyle(latest?.regime ?? null)

  const dates = snapshots.map(s => s.snapshot_date)
  const vixValues = snapshots.map(s => s.vix_level)
  const spreadValues = snapshots.map(s => s.yield_spread)

  const dayBtns = [14, 30, 60] as const

  if (loading) return <div className="text-slate-400 text-sm">Loading macro data...</div>

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Current regime card */}
      {latest && (
        <div className={`border rounded-xl p-5 ${latestStyle.bg} ${latestStyle.border}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Current Regime</div>
              <div className={`text-3xl font-black ${latestStyle.text}`}>
                {latest.regime.replace(/_/g, ' ').toUpperCase()}
              </div>
              <div className="text-xs text-slate-500 mt-1">as of {latest.snapshot_date}</div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className={`text-xl font-bold ${Number(latest.vix_level) > 25 ? 'text-red-400' : 'text-slate-200'}`}>
                  {latest.vix_level != null ? Number(latest.vix_level).toFixed(1) : '—'}
                </div>
                <div className="text-xs text-slate-500">VIX</div>
              </div>
              <div>
                <div className={`text-xl font-bold ${latest.spy_trend === 'positive' ? 'text-emerald-400' : latest.spy_trend === 'negative' ? 'text-red-400' : 'text-slate-200'}`}>
                  {latest.spy_trend ? latest.spy_trend.toUpperCase() : '—'}
                </div>
                <div className="text-xs text-slate-500">SPY Trend</div>
              </div>
              <div>
                <div className={`text-xl font-bold ${Number(latest.yield_spread) < 0 ? 'text-red-400' : 'text-slate-200'}`}>
                  {latest.yield_spread != null ? Number(latest.yield_spread).toFixed(2) : '—'}
                </div>
                <div className="text-xs text-slate-500">10Y-2Y</div>
              </div>
            </div>
          </div>

          {/* Sector ETFs + multiplier */}
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            {latest.regime_multiplier != null && (
              <span className="text-xs px-2 py-0.5 bg-black/20 rounded text-slate-400">
                Signal multiplier: {latest.regime_multiplier}×
              </span>
            )}
            {latest.sector_etf_json && Object.entries(latest.sector_etf_json).slice(0, 5).map(([sym, close]) => (
              <span key={sym} className="text-xs px-2 py-0.5 bg-black/20 rounded text-slate-500">
                {sym} ${Number(close).toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Time range toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Historical Data</h3>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {dayBtns.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-md transition ${days === d ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {!snapshots.length ? (
        <div className="text-center py-12 text-slate-500">
          <div className="text-3xl mb-2">🌐</div>
          <div>No macro history yet</div>
          <div className="text-sm mt-1">Populates after first pipeline run at 5:30 PM ET</div>
        </div>
      ) : (
        <>
          {/* Regime timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Regime Timeline</div>
            <RegimeTimeline snapshots={snapshots} />
            <div className="flex gap-3 mt-3 flex-wrap">
              {Object.entries(REGIME_COLORS).map(([regime, style]) => (
                <div key={regime} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-sm ${style.bg} border ${style.border}`} />
                  <span className="text-xs text-slate-500 capitalize">{regime.replace(/_/g,' ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">VIX Level</div>
              <LineChart values={vixValues} dates={dates} color="#f87171" />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Low: {Math.min(...vixValues.filter(v => v !== null) as number[]).toFixed(1)}</span>
                <span>High: {Math.max(...vixValues.filter(v => v !== null) as number[]).toFixed(1)}</span>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">SPY Trend</div>
              {(() => {
                const trendMap: Record<string, number> = { positive: 2, flat: 1, negative: 0 }
                const trendValues = snapshots.map(s => s.spy_trend ? (trendMap[s.spy_trend] ?? 1) : null)
                return <LineChart values={trendValues} dates={dates} color="#60a5fa" min={0} max={2} />
              })()}
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Negative</span>
                <span>Flat</span>
                <span>Positive</span>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Yield Spread (10Y-2Y)</div>
              <LineChart values={spreadValues} dates={dates} color="#a78bfa" />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Inverted &lt;0</span>
                <span>Steepened &gt;0</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800">
                <tr className="text-xs text-slate-400 uppercase">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Regime</th>
                  <th className="px-4 py-3 text-right">VIX</th>
                  <th className="px-4 py-3 text-right">SPY Trend</th>
                  <th className="px-4 py-3 text-right">10Y-2Y</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {[...snapshots].reverse().map(s => {
                  const style = regimeStyle(s.regime)
                  return (
                    <tr key={s.snapshot_date} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{s.snapshot_date}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                          {s.regime.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs ${Number(s.vix_level) > 25 ? 'text-red-400' : 'text-slate-400'}`}>
                        {s.vix_level != null ? Number(s.vix_level).toFixed(1) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs ${s.spy_trend === 'positive' ? 'text-emerald-400' : s.spy_trend === 'negative' ? 'text-red-400' : 'text-slate-400'}`}>
                        {s.spy_trend ?? '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs ${Number(s.yield_spread) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {s.yield_spread != null ? Number(s.yield_spread).toFixed(3) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
