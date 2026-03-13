import { useEffect, useState } from 'react'

interface PolyMarket {
  id: string; poly_market_id: string; title: string
  yes_price: number; no_price: number; liquidity: number
  volume_24h: number; spread: number; resolution_date: string
}

interface PolySignal {
  id: string; poly_direction: string; poly_current_price: number
  poly_ai_fair_value: number; poly_edge: number; final_score: number
  signal_json: { title?: string; reasoning?: string; confidence?: string }
}

export default function PolymarketView() {
  const [markets, setMarkets] = useState<PolyMarket[]>([])
  const [signals, setSignals] = useState<PolySignal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/query?route=polymarket')
      .then(r => r.json())
      .then(d => { setMarkets(d.markets ?? []); setSignals(d.signals ?? []) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = markets.filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="text-slate-400 text-sm">Loading Polymarket data...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Polymarket</h2>
        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">{markets.length} markets tracked</span>
      </div>

      {/* Edge signals */}
      {signals.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-medium text-yellow-400 uppercase tracking-wider mb-2">⚡ Edge Signals ({signals.length})</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {signals.map(s => (
              <div key={s.id} className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold px-2 py-0.5 rounded ${s.poly_direction === 'YES' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {s.poly_direction}
                  </span>
                  <span className="text-sm font-bold text-yellow-400">{s.final_score?.toFixed(1)}</span>
                </div>
                <div className="text-sm text-slate-200 mb-2">{s.signal_json?.title ?? '—'}</div>
                <div className="text-xs text-slate-400">{s.signal_json?.reasoning}</div>
                <div className="flex gap-4 mt-2 text-xs text-slate-400">
                  <span>Market: {((s.poly_current_price ?? 0) * 100).toFixed(0)}%</span>
                  <span>Est: {((s.poly_ai_fair_value ?? 0) * 100).toFixed(0)}%</span>
                  <span>Edge: {((s.poly_edge ?? 0) * 100).toFixed(0)}pp</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + market table */}
      <div className="mb-3">
        <input
          type="text" placeholder="Search markets..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-800">
            <tr className="text-xs text-slate-400 uppercase">
              <th className="px-4 py-3 text-left">Market</th>
              <th className="px-4 py-3 text-right">YES</th>
              <th className="px-4 py-3 text-right">NO</th>
              <th className="px-4 py-3 text-right">Vol 24h</th>
              <th className="px-4 py-3 text-right">Liquidity</th>
              <th className="px-4 py-3 text-left">Resolves</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.slice(0, 100).map(m => {
              const yes = Number(m.yes_price ?? 0)
              const yesColor = yes >= 0.7 ? 'text-emerald-400' : yes <= 0.3 ? 'text-red-400' : 'text-slate-300'
              return (
                <tr key={m.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3 text-slate-200 max-w-sm">
                    <div className="truncate">{m.title}</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${yesColor}`}>{(yes * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right text-slate-400">{(Number(m.no_price ?? 0) * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right text-slate-400">${Number(m.volume_24h ?? 0).toLocaleString('en', { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-right text-slate-400">${Number(m.liquidity ?? 0).toLocaleString('en', { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{m.resolution_date ? new Date(m.resolution_date).toLocaleDateString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-800">
            Showing 100 of {filtered.length} markets. Use search to filter.
          </div>
        )}
      </div>
    </div>
  )
}
