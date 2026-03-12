import { useEffect, useState } from 'react'
import { getMacro } from '../api'

interface MacroData {
  snapshot_date: string; regime: string; regime_multiplier: number
  vix: number; spy_close: number; spy_trend: string; yield_spread_10y2y: number
  sector_etf_json: Record<string, number> | null
}

const REGIME_CONFIG: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  risk_on:  { label: 'RISK ON',  color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30', desc: 'Favorable conditions for setups — full context multiplier' },
  neutral:  { label: 'NEUTRAL',  color: 'text-slate-300',   bg: 'bg-slate-500/10 border-slate-500/30',    desc: 'Normal market — standard scoring applies' },
  cautious: { label: 'CAUTIOUS', color: 'text-yellow-300',  bg: 'bg-yellow-500/10 border-yellow-500/30',  desc: 'Elevated volatility — signals discounted 15%' },
  stress:   { label: 'STRESS',   color: 'text-red-300',     bg: 'bg-red-500/10 border-red-500/30',        desc: 'High risk environment — signals discounted 30%' },
}

const TREND_ICON: Record<string, string> = { positive: '↑ Uptrend', flat: '→ Flat', negative: '↓ Downtrend' }

export default function MacroView() {
  const [macro, setMacro] = useState<MacroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMacro()
      .then(d => { if (d.error) setError(d.error); else setMacro(d) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-slate-400 text-sm">Loading macro data...</div>
  if (error || !macro) return (
    <div className="text-slate-500 text-center py-16">
      <div className="text-3xl mb-3">📊</div>
      <div className="text-slate-400">No macro data yet</div>
      <div className="text-sm mt-1">Run the macro regime service after market close</div>
    </div>
  )

  const regime = REGIME_CONFIG[macro.regime] ?? REGIME_CONFIG.neutral

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Macro Regime — {macro.snapshot_date}</h2>

      {/* Regime badge */}
      <div className={`border rounded-2xl p-6 mb-6 ${regime.bg}`}>
        <div className={`text-4xl font-black tracking-tight ${regime.color}`}>{regime.label}</div>
        <div className="text-slate-400 text-sm mt-2">{regime.desc}</div>
        <div className="mt-3 text-lg font-semibold text-slate-300">
          Context multiplier: <span className={regime.color}>{macro.regime_multiplier}×</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${macro.vix > 30 ? 'text-red-400' : macro.vix > 20 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {macro.vix?.toFixed(1) ?? '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">VIX</div>
          <div className="text-xs text-slate-400">{macro.vix > 30 ? 'Stress' : macro.vix > 20 ? 'Elevated' : 'Low'}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${macro.spy_trend === 'positive' ? 'text-emerald-400' : macro.spy_trend === 'negative' ? 'text-red-400' : 'text-slate-300'}`}>
            {macro.spy_trend === 'positive' ? '↑' : macro.spy_trend === 'negative' ? '↓' : '→'}
          </div>
          <div className="text-xs text-slate-500 mt-1">SPY Trend</div>
          <div className="text-xs text-slate-400">{TREND_ICON[macro.spy_trend] ?? macro.spy_trend}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${macro.yield_spread_10y2y < 0 ? 'text-red-400' : 'text-slate-300'}`}>
            {macro.yield_spread_10y2y != null ? macro.yield_spread_10y2y.toFixed(2) : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">10Y-2Y Spread</div>
          <div className="text-xs text-slate-400">{macro.yield_spread_10y2y < 0 ? 'Inverted' : 'Normal'}</div>
        </div>
      </div>

      {/* Sector ETFs */}
      {macro.sector_etf_json && Object.keys(macro.sector_etf_json).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Sector ETFs</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(macro.sector_etf_json).map(([sym, price]) => (
              <div key={sym} className="flex justify-between text-sm">
                <span className="font-mono text-slate-300">{sym}</span>
                <span className="text-slate-400">${Number(price).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
