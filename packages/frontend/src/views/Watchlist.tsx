import { useEffect, useState } from 'react'
import { getWatchlist } from '../api'
import Sparkline from '../components/Sparkline'

interface WatchItem {
  symbol: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
  rsi_14: number
  stoch_k: number | null
  williams_r: number | null
  volume_ratio: number
  sma_20: number | null
  vwap: number | null
  prev_close: number | null
  day_change_pct: number | null
  intraday_range_pct: number | null
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
  if (ratio >= 4) return 'text-purple-400 font-black'
  if (ratio >= 3) return 'text-emerald-300 font-black'
  if (ratio >= 2) return 'text-emerald-400 font-bold'
  if (ratio >= 1.5) return 'text-emerald-300'
  if (ratio < 0.5) return 'text-slate-600'
  return 'text-slate-400'
}

function changeColor(pct: number | null) {
  if (pct == null) return 'text-slate-400'
  if (pct >= 5) return 'text-emerald-300 font-bold'
  if (pct >= 2) return 'text-emerald-400'
  if (pct >= 0.5) return 'text-emerald-300'
  if (pct <= -5) return 'text-red-400 font-bold'
  if (pct <= -2) return 'text-red-400'
  if (pct <= -0.5) return 'text-red-300'
  return 'text-slate-400'
}

function alertLevel(item: WatchItem): 'signal' | 'watch' | 'approaching' | null {
  const rsi = item.rsi_14
  const vol = item.volume_ratio
  if ((rsi < 20 && vol >= 2) || (rsi > 80 && vol >= 2)) return 'signal'
  if (rsi < 20 || rsi > 80 || (rsi < 25 && vol >= 1.5) || (rsi > 75 && vol >= 1.5)) return 'watch'
  if (rsi < 30 || rsi > 70) return 'approaching'
  return null
}

function isVolumeSpike(item: WatchItem): boolean {
  return item.volume_ratio >= 2
}

type Filter = 'all' | 'alerts' | 'volume' | 'movers' | 'oversold' | 'overbought'
type SortKey = 'symbol' | 'close' | 'day_change_pct' | 'rsi_14' | 'stoch_k' | 'volume_ratio' | 'intraday_range_pct'

export default function Watchlist() {
  const [items, setItems] = useState<WatchItem[]>([])
  const [date, setDate] = useState<string | null>(null)
  const [prevDate, setPrevDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('volume_ratio')
  const [sortAsc, setSortAsc] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [showSparklines, setShowSparklines] = useState(false)

  useEffect(() => {
    getWatchlist().then((d: { date?: string; prev_date?: string; items?: WatchItem[] }) => {
      setItems(d.items ?? [])
      setDate(d.date ?? null)
      setPrevDate(d.prev_date ?? null)
    }).finally(() => setLoading(false))
  }, [])

  const alertCount = items.filter(i => alertLevel(i) !== null).length
  const volumeCount = items.filter(isVolumeSpike).length
  const moversCount = items.filter(i => Math.abs(i.day_change_pct ?? 0) >= 3).length
  const oversoldCount = items.filter(i => i.rsi_14 < 35).length
  const overboughtCount = items.filter(i => i.rsi_14 > 65).length

  const filterTabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'alerts', label: '⚡ Alerts', count: alertCount },
    { id: 'volume', label: '📊 Volume Spikes', count: volumeCount },
    { id: 'movers', label: '🚀 Movers ±3%', count: moversCount },
    { id: 'oversold', label: '↓ Oversold', count: oversoldCount },
    { id: 'overbought', label: '↑ Overbought', count: overboughtCount },
  ]

  const filtered = items.filter(item => {
    if (filter === 'alerts') return alertLevel(item) !== null
    if (filter === 'volume') return isVolumeSpike(item)
    if (filter === 'movers') return Math.abs(item.day_change_pct ?? 0) >= 3
    if (filter === 'oversold') return item.rsi_14 < 35
    if (filter === 'overbought') return item.rsi_14 > 65
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let va: number | string, vb: number | string
    if (sortKey === 'symbol') { va = a.symbol; vb = b.symbol }
    else {
      va = (a[sortKey] as number | null) ?? (sortAsc ? Infinity : -Infinity)
      vb = (b[sortKey] as number | null) ?? (sortAsc ? Infinity : -Infinity)
    }
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
    return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number)
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'symbol') }
  }

  const Th = ({ label, k, right = false }: { label: string; k: SortKey; right?: boolean }) => (
    <th onClick={() => toggleSort(k)}
      className={`px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  if (loading) return <div className="text-slate-400 text-sm animate-pulse">Loading watchlist...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Watchlist</h2>
          {date && (
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
              {date}{prevDate && <span className="text-slate-600 ml-1">vs {prevDate}</span>}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSparklines(!showSparklines)}
          className={`text-xs px-3 py-1 rounded-lg border transition ${showSparklines ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
          {showSparklines ? '📉 Hide charts' : '📉 Show charts'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap mb-4">
        {filterTabs.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition ${
              filter === t.id
                ? 'bg-slate-700 border-slate-600 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}>
            {t.label}
            <span className={`ml-1.5 ${filter === t.id ? 'text-slate-300' : 'text-slate-600'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Volume spike banner */}
      {filter === 'volume' && sorted.length > 0 && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-purple-300">
          <strong>{sorted.length} symbols</strong> trading at 2× or more their 20-day average volume today
          {sorted.filter(i => i.volume_ratio >= 3).length > 0 && (
            <span className="ml-2 text-purple-200">· {sorted.filter(i => i.volume_ratio >= 3).length} at 3×+</span>
          )}
        </div>
      )}

      {/* Movers banner */}
      {filter === 'movers' && sorted.length > 0 && (
        <div className="flex gap-4 mb-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-300 flex-1">
            <strong>{sorted.filter(i => (i.day_change_pct ?? 0) >= 3).length} up</strong> ≥3%
            {sorted.filter(i => (i.day_change_pct ?? 0) >= 5).length > 0 &&
              <span className="ml-2 text-emerald-200">· {sorted.filter(i => (i.day_change_pct ?? 0) >= 5).length} up 5%+</span>}
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300 flex-1">
            <strong>{sorted.filter(i => (i.day_change_pct ?? 0) <= -3).length} down</strong> ≥3%
            {sorted.filter(i => (i.day_change_pct ?? 0) <= -5).length > 0 &&
              <span className="ml-2 text-red-200">· {sorted.filter(i => (i.day_change_pct ?? 0) <= -5).length} down 5%+</span>}
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-800">
            <tr>
              <th className="px-3 py-3 w-4"></th>
              <Th label="Symbol" k="symbol" />
              {showSparklines && <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">30d</th>}
              <Th label="Close" k="close" right />
              <Th label="Day %" k="day_change_pct" right />
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase text-right whitespace-nowrap">H / L</th>
              <Th label="RSI 14" k="rsi_14" right />
              <Th label="Vol Ratio" k="volume_ratio" right />
              <Th label="Range %" k="intraday_range_pct" right />
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">Alert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {sorted.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500 text-sm">No symbols match this filter</td></tr>
            ) : sorted.map(item => {
              const alert = alertLevel(item)
              const volSpike = item.volume_ratio >= 2
              const rowBg = alert === 'signal'
                ? 'bg-emerald-500/5 hover:bg-emerald-500/8'
                : alert === 'watch'
                ? 'bg-yellow-500/5 hover:bg-yellow-500/8'
                : volSpike
                ? 'bg-purple-500/5 hover:bg-purple-500/8'
                : 'hover:bg-slate-800/40'

              return (
                <tr key={item.symbol} className={`transition ${rowBg}`}>
                  <td className="pl-3 py-3">
                    {alert === 'signal' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    {alert === 'watch' && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                    {!alert && volSpike && <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                    {alert === 'approaching' && <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-white">{item.symbol}</td>
                  {showSparklines && (
                    <td className="px-4 py-2">
                      <Sparkline symbol={item.symbol} width={80} height={28} />
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-slate-300">${Number(item.close).toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right text-sm ${changeColor(item.day_change_pct)}`}>
                    {item.day_change_pct != null
                      ? `${item.day_change_pct >= 0 ? '+' : ''}${item.day_change_pct.toFixed(2)}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">
                    {item.high && item.low
                      ? <><span className="text-emerald-300/60">{Number(item.high).toFixed(2)}</span> / <span className="text-red-300/60">{Number(item.low).toFixed(2)}</span></>
                      : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right ${rsiColor(item.rsi_14)}`}>{Number(item.rsi_14).toFixed(1)}</td>
                  <td className={`px-4 py-3 text-right ${volColor(item.volume_ratio)}`}>
                    {item.volume_ratio != null ? Number(item.volume_ratio).toFixed(2) + 'x' : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">
                    {item.intraday_range_pct != null ? Number(item.intraday_range_pct).toFixed(1) + '%' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {alert === 'signal' && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">⚡ Signal</span>}
                    {alert === 'watch' && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">👀 Watch</span>}
                    {alert === 'approaching' && !volSpike && <span className="text-xs text-slate-500">Approaching</span>}
                    {!alert && volSpike && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">📊 Vol spike</span>}
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
