import { useEffect, useState } from 'react'
import { getWatchlist } from '../api'
import Sparkline from '../components/Sparkline'

interface WatchItem {
  symbol: string; close: number; rsi_14: number; stoch_k: number
  williams_r: number; volume_ratio: number; sma_20: number; vwap: number | null
}

function rsiColor(rsi: number) {
  if (rsi < 15) return 'text-red-400 font-black'
  if (rsi < 20) return 'text-red-400 font-bold'
  if (rsi < 25) return 'text-orange-400 font-semibold'
  if (rsi < 30) return 'text-orange-400'
  if (rsi < 40) return 'text-yellow-400'
  if (rsi > 85) return 'text-red-400 font-black'
  if (rsi > 80) return 'text-red-400 font-bold'
  if (rsi > 75) return 'text-orange-400'
  return 'text-slate-300'
}

function volColor(ratio: number) {
  if (ratio >= 3) return 'text-emerald-300 font-black'
  if (ratio >= 2) return 'text-emerald-400 font-bold'
  if (ratio >= 1.5) return 'text-emerald-300'
  return 'text-slate-400'
}

function alertLevel(item: WatchItem): 'signal' | 'watch' | 'approaching' | null {
  const rsi = item.rsi_14
  const vol = item.volume_ratio
  if (rsi < 20 && vol >= 2) return 'signal'
  if (rsi < 20 || (rsi < 25 && vol >= 1.5)) return 'watch'
  if (rsi < 30) return 'approaching'
  if (rsi > 80 && vol >= 2) return 'signal'
  if (rsi > 80 || (rsi > 75 && vol >= 1.5)) return 'watch'
  return null
}

type SortKey = 'symbol' | 'close' | 'rsi_14' | 'stoch_k' | 'volume_ratio'
type Filter = 'all' | 'alerts' | 'oversold' | 'overbought'

export default function Watchlist() {
  const [items, setItems] = useState<WatchItem[]>([])
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('rsi_14')
  const [sortAsc, setSortAsc] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [showSparklines, setShowSparklines] = useState(false)

  useEffect(() => {
    getWatchlist().then(d => {
      setItems(d.items ?? [])
      setDate(d.date)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = items.filter(item => {
    if (filter === 'alerts') return alertLevel(item) !== null
    if (filter === 'oversold') return item.rsi_14 < 35
    if (filter === 'overbought') return item.rsi_14 > 65
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'symbol') return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol)
    const va = a[sortKey] as number
    const vb = b[sortKey] as number
    return sortAsc ? va - vb : vb - va
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th onClick={() => toggleSort(k)}
      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 select-none whitespace-nowrap">
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  const filterTabs: { id: Filter; label: string }[] = [
    { id: 'all', label: `All (${items.length})` },
    { id: 'alerts', label: `⚡ Alerts (${items.filter(i => alertLevel(i) !== null).length})` },
    { id: 'oversold', label: `↓ Oversold (${items.filter(i => i.rsi_14 < 35).length})` },
    { id: 'overbought', label: `↑ Overbought (${items.filter(i => i.rsi_14 > 65).length})` },
  ]

  if (loading) return <div className="text-slate-400 text-sm">Loading watchlist...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Watchlist</h2>
          {date && <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">Data: {date}</span>}
        </div>
        <button
          onClick={() => setShowSparklines(!showSparklines)}
          className={`text-xs px-3 py-1 rounded-lg border transition ${showSparklines ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
          {showSparklines ? '📉 Hide charts' : '📉 Show charts'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 mb-4 w-fit">
        {filterTabs.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 text-xs rounded-md transition ${filter === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase w-4"></th>
              <Th label="Symbol" k="symbol" />
              {showSparklines && <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">30d</th>}
              <Th label="Close" k="close" />
              <Th label="RSI 14" k="rsi_14" />
              <Th label="Stoch %K" k="stoch_k" />
              <Th label="Vol Ratio" k="volume_ratio" />
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">SMA 20</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Alert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sorted.map(item => {
              const alert = alertLevel(item)
              const rowBg = alert === 'signal' ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                : alert === 'watch' ? 'bg-yellow-500/5 hover:bg-yellow-500/10'
                : 'hover:bg-slate-800/50'
              return (
                <tr key={item.symbol} className={`transition ${rowBg}`}>
                  <td className="pl-3 py-3">
                    {alert === 'signal' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    {alert === 'watch' && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                    {alert === 'approaching' && <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-white">{item.symbol}</td>
                  {showSparklines && (
                    <td className="px-4 py-2">
                      <Sparkline symbol={item.symbol} width={80} height={28} />
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-300">${Number(item.close).toFixed(2)}</td>
                  <td className={`px-4 py-3 ${rsiColor(item.rsi_14)}`}>{Number(item.rsi_14).toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-400">{item.stoch_k != null ? Number(item.stoch_k).toFixed(1) : '—'}</td>
                  <td className={`px-4 py-3 ${volColor(item.volume_ratio)}`}>{item.volume_ratio != null ? Number(item.volume_ratio).toFixed(2)+'x' : '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{item.sma_20 != null ? '$'+Number(item.sma_20).toFixed(2) : '—'}</td>
                  <td className="px-4 py-3">
                    {alert === 'signal' && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">⚡ Signal</span>}
                    {alert === 'watch' && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">👀 Watch</span>}
                    {alert === 'approaching' && <span className="text-xs text-slate-500">Approaching</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
