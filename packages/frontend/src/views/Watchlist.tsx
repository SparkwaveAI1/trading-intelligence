import { useEffect, useState } from 'react'
import { getWatchlist } from '../api'

interface WatchItem {
  symbol: string; close: number; rsi_14: number; stoch_k: number
  williams_r: number; volume_ratio: number; sma_20: number
}

function rsiColor(rsi: number) {
  if (rsi < 20) return 'text-red-400 font-bold'
  if (rsi < 30) return 'text-orange-400 font-semibold'
  if (rsi < 40) return 'text-yellow-400'
  return 'text-slate-300'
}

function volColor(ratio: number) {
  if (ratio >= 2) return 'text-emerald-400 font-bold'
  if (ratio >= 1.5) return 'text-emerald-300'
  return 'text-slate-400'
}

type SortKey = 'symbol' | 'close' | 'rsi_14' | 'stoch_k' | 'volume_ratio'

export default function Watchlist() {
  const [items, setItems] = useState<WatchItem[]>([])
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('rsi_14')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    getWatchlist().then(d => {
      setItems(d.items ?? [])
      setDate(d.date)
    }).finally(() => setLoading(false))
  }, [])

  const sorted = [...items].sort((a, b) => {
    const va = a[sortKey] as number
    const vb = b[sortKey] as number
    if (sortKey === 'symbol') return sortAsc ? String(a.symbol).localeCompare(b.symbol) : String(b.symbol).localeCompare(a.symbol)
    return sortAsc ? va - vb : vb - va
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th onClick={() => toggleSort(k)} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 select-none">
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  if (loading) return <div className="text-slate-400 text-sm">Loading watchlist...</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold">Watchlist</h2>
        {date && <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">Data: {date}</span>}
        <span className="text-xs text-slate-500">{items.length} symbols</span>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-800">
            <tr>
              <Th label="Symbol" k="symbol" />
              <Th label="Close" k="close" />
              <Th label="RSI 14" k="rsi_14" />
              <Th label="Stoch %K" k="stoch_k" />
              <Th label="Vol Ratio" k="volume_ratio" />
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">SMA 20</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sorted.map(item => (
              <tr key={item.symbol} className="hover:bg-slate-800/50 transition">
                <td className="px-4 py-3 font-mono font-bold text-white">{item.symbol}</td>
                <td className="px-4 py-3 text-slate-300">${Number(item.close).toFixed(2)}</td>
                <td className={`px-4 py-3 ${rsiColor(item.rsi_14)}`}>{Number(item.rsi_14).toFixed(1)}</td>
                <td className="px-4 py-3 text-slate-400">{item.stoch_k != null ? Number(item.stoch_k).toFixed(1) : '—'}</td>
                <td className={`px-4 py-3 ${volColor(item.volume_ratio)}`}>{item.volume_ratio != null ? Number(item.volume_ratio).toFixed(2) + 'x' : '—'}</td>
                <td className="px-4 py-3 text-slate-400">{item.sma_20 != null ? '$' + Number(item.sma_20).toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
