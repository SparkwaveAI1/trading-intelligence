import { useEffect, useState, useCallback } from 'react'
import { getPaperTrades, createPaperTrade, closePaperTrade } from '../api'

interface Trade {
  id: string; symbol: string; direction: string; entry_price: number
  stop_level: number | null; target_level: number | null; exit_price: number | null
  result_pct: number | null; outcome: string; exit_reason: string | null
  created_at: string; notes: string | null; size_pct: number | null
  // live price (fetched client-side)
  _current_price?: number | null
  _current_date?: string | null
  _unrealized_pct?: number | null
}

function outcomeBadge(outcome: string) {
  if (outcome === 'win') return 'bg-emerald-500/20 text-emerald-400'
  if (outcome === 'loss') return 'bg-red-500/20 text-red-400'
  if (outcome === 'scratch') return 'bg-slate-500/20 text-slate-400'
  return 'bg-blue-500/20 text-blue-400'
}

function pnlColor(pct: number | null | undefined) {
  if (pct == null) return 'text-slate-400'
  return pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-red-400' : 'text-slate-400'
}

function calcUnrealized(trade: Trade, currentPrice: number): number {
  const entry = Number(trade.entry_price)
  if (trade.direction === 'long') return ((currentPrice - entry) / entry) * 100
  return ((entry - currentPrice) / entry) * 100
}

function RiskRewardBar({ entry, stop, target }: { entry: number; stop: number | null; target: number | null }) {
  if (!stop || !target) return null
  const risk = Math.abs(entry - stop)
  const reward = Math.abs(target - entry)
  const rr = reward / risk
  const stopPct = ((entry - stop) / entry * 100).toFixed(1)
  const targetPct = ((target - entry) / entry * 100).toFixed(1)
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-xs text-red-400">−{Math.abs(Number(stopPct))}%</span>
      <div className="flex h-1.5 rounded-full overflow-hidden flex-1">
        <div className="bg-red-500/40" style={{ flex: risk }} />
        <div className="w-px bg-slate-600" />
        <div className="bg-emerald-500/40" style={{ flex: reward }} />
      </div>
      <span className="text-xs text-emerald-400">+{targetPct}%</span>
      <span className="text-xs text-slate-500">R/R {rr.toFixed(1)}x</span>
    </div>
  )
}

interface Props {
  prefilled?: Record<string, unknown> | null
  onClearPrefilled?: () => void
}

export default function PaperTrades({ prefilled, onClearPrefilled }: Props) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [closeModal, setCloseModal] = useState<Trade | null>(null)
  const [form, setForm] = useState({ symbol: '', direction: 'long', entry_price: '', stop_level: '', target_level: '', size_pct: '', notes: '' })
  const [closeForm, setCloseForm] = useState({ exit_price: '', exit_reason: 'manual', post_mortem_tag: '', notes: '' })

  const load = useCallback(() => {
    setLoading(true)
    getPaperTrades().then(d => setTrades(d.trades ?? [])).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Fetch live prices for open trades
  useEffect(() => {
    const openTrades = trades.filter(t => t.outcome === 'open' && t.symbol && !t._current_price)
    if (!openTrades.length) return

    openTrades.forEach(async (trade) => {
      try {
        const r = await fetch(`/api/current-price?symbol=${trade.symbol}`)
        if (!r.ok) return
        const { close, bar_date } = await r.json()
        if (close) {
          const unrealized = calcUnrealized(trade, Number(close))
          setTrades(prev => prev.map(t =>
            t.id === trade.id
              ? { ...t, _current_price: Number(close), _current_date: bar_date, _unrealized_pct: unrealized }
              : t
          ))
        }
      } catch {}
    })
  }, [trades.length])

  // Pre-fill form when navigating from a signal
  useEffect(() => {
    if (prefilled) {
      const asset = prefilled.assets as Record<string, string> | null
      const sym = asset?.symbol ?? (prefilled.signal_json as Record<string, unknown>)?.ticker as string ?? ''
      setForm(f => ({ ...f, symbol: sym, notes: `Signal score: ${Number(prefilled.final_score).toFixed(1)} | RSI: ${prefilled.rsi ?? '—'}` }))
      setShowForm(true)
      onClearPrefilled?.()
    }
  }, [prefilled])

  const open = trades.filter(t => t.outcome === 'open')
  const closed = trades.filter(t => t.outcome !== 'open')

  // Summary stats
  const wins = closed.filter(t => t.outcome === 'win').length
  const losses = closed.filter(t => t.outcome === 'loss').length
  const winRate = closed.length ? ((wins / closed.length) * 100).toFixed(0) : null
  const avgWin = wins ? (closed.filter(t => t.outcome === 'win').reduce((s, t) => s + (t.result_pct ?? 0), 0) / wins).toFixed(1) : null
  const avgLoss = losses ? (closed.filter(t => t.outcome === 'loss').reduce((s, t) => s + (t.result_pct ?? 0), 0) / losses).toFixed(1) : null
  const totalPnl = closed.reduce((s, t) => s + (t.result_pct ?? 0), 0)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await createPaperTrade({
      ...form,
      entry_price: Number(form.entry_price),
      stop_level: form.stop_level ? Number(form.stop_level) : null,
      target_level: form.target_level ? Number(form.target_level) : null,
      size_pct: form.size_pct ? Number(form.size_pct) : null,
      market_type: 'equity'
    })
    setShowForm(false)
    setForm({ symbol: '', direction: 'long', entry_price: '', stop_level: '', target_level: '', size_pct: '', notes: '' })
    load()
  }

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!closeModal) return
    await closePaperTrade(closeModal.id, { ...closeForm, exit_price: Number(closeForm.exit_price) })
    setCloseModal(null)
    setCloseForm({ exit_price: '', exit_reason: 'manual', post_mortem_tag: '', notes: '' })
    load()
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading trades...</div>

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Paper Trades</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition">+ New Trade</button>
      </div>

      {/* Summary stats bar */}
      {closed.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Win Rate', value: winRate ? `${winRate}%` : '—', color: Number(winRate) >= 50 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`, color: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Avg Win', value: avgWin ? `+${avgWin}%` : '—', color: 'text-emerald-400' },
            { label: 'Avg Loss', value: avgLoss ? `${avgLoss}%` : '—', color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* New trade form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6 grid grid-cols-2 gap-3">
          <div className="col-span-2 text-sm font-medium text-slate-300 mb-1">New Paper Trade</div>
          {([['Symbol', 'symbol', 'text', true], ['Entry Price', 'entry_price', 'number', true], ['Stop Level', 'stop_level', 'number', false], ['Target Level', 'target_level', 'number', false], ['Size %', 'size_pct', 'number', false]] as [string, string, string, boolean][]).map(([label, key, type, req]) => (
            <div key={key}>
              <label className="block text-xs text-slate-400 mb-1">{label}</label>
              <input type={type} required={req} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          ))}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Direction</label>
            <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
              <option value="long">Long</option><option value="short">Short</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
          <div className="col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition">Log Trade</button>
          </div>
        </form>
      )}

      {/* Open trades */}
      {open.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Open ({open.length})</div>
          <div className="space-y-3">
            {open.map(t => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-white font-mono">{t.symbol}</span>
                      <span className={`text-sm font-semibold ${t.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.direction.toUpperCase()}
                      </span>
                      {t.size_pct && <span className="text-xs text-slate-500">{t.size_pct}% position</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                      <span>Entry <strong className="text-slate-200">${Number(t.entry_price).toFixed(2)}</strong></span>
                      {t.stop_level && <span>Stop <strong className="text-red-400">${Number(t.stop_level).toFixed(2)}</strong></span>}
                      {t.target_level && <span>Target <strong className="text-emerald-400">${Number(t.target_level).toFixed(2)}</strong></span>}
                    </div>
                    <RiskRewardBar entry={t.entry_price} stop={t.stop_level} target={t.target_level} />
                    {t.notes && <div className="text-xs text-slate-500 mt-2">{t.notes}</div>}
                    <div className="text-xs text-slate-600 mt-1">
                      Opened {new Date(t.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {/* Live P&L */}
                    {t._current_price ? (
                      <div className="text-right">
                        <div className={`text-2xl font-black ${pnlColor(t._unrealized_pct)}`}>
                          {t._unrealized_pct != null ? (t._unrealized_pct >= 0 ? '+' : '') + t._unrealized_pct.toFixed(2) + '%' : '—'}
                        </div>
                        <div className="text-xs text-slate-500">
                          Current ${Number(t._current_price).toFixed(2)}
                          {t._current_date && <span className="ml-1">({t._current_date})</span>}
                        </div>
                        {/* Progress toward target/stop */}
                        {t.stop_level && t.target_level && t._unrealized_pct != null && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {t._unrealized_pct > 0
                              ? `${Math.min(100, (t._unrealized_pct / Math.abs(((t.target_level - t.entry_price) / t.entry_price) * 100)) * 100).toFixed(0)}% to target`
                              : `${Math.min(100, (Math.abs(t._unrealized_pct) / Math.abs(((t.entry_price - t.stop_level) / t.entry_price) * 100)) * 100).toFixed(0)}% to stop`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600 animate-pulse">Loading price...</div>
                    )}
                    <button onClick={() => { setCloseModal(t); if (t._current_price) setCloseForm(f => ({ ...f, exit_price: String(t._current_price) })) }}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition">
                      Close Trade
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closed trades */}
      {closed.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Closed ({closed.length})</div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800">
                <tr className="text-xs text-slate-400 uppercase">
                  <th className="px-4 py-3 text-left">Symbol</th>
                  <th className="px-4 py-3 text-left">Dir</th>
                  <th className="px-4 py-3 text-right">Entry</th>
                  <th className="px-4 py-3 text-right">Exit</th>
                  <th className="px-4 py-3 text-right">Result</th>
                  <th className="px-4 py-3 text-left">Outcome</th>
                  <th className="px-4 py-3 text-left">Tag</th>
                  <th className="px-4 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {closed.map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-2.5 font-bold font-mono text-white">{t.symbol}</td>
                    <td className="px-4 py-2.5"><span className={t.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.direction.toUpperCase()}</span></td>
                    <td className="px-4 py-2.5 text-right">${Number(t.entry_price).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">{t.exit_price ? '$' + Number(t.exit_price).toFixed(2) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${pnlColor(t.result_pct)}`}>
                      {t.result_pct != null ? (t.result_pct > 0 ? '+' : '') + t.result_pct.toFixed(2) + '%' : '—'}
                    </td>
                    <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${outcomeBadge(t.outcome)}`}>{t.outcome.toUpperCase()}</span></td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{t.exit_reason ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{new Date(t.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!open.length && !closed.length && (
        <div className="text-center py-16 text-slate-500">
          <div className="text-3xl mb-3">📋</div>
          <div className="text-slate-400">No paper trades yet</div>
          <div className="text-sm mt-1">Log your first trade when a signal fires tonight</div>
        </div>
      )}

      {/* Close trade modal */}
      {closeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <form onSubmit={handleClose} className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-96 space-y-3">
            <div className="text-sm font-semibold text-white mb-2">Close {closeModal.symbol}</div>
            {closeModal._current_price && (
              <div className="text-xs text-slate-400 bg-slate-800 rounded px-3 py-2">
                Last close: <strong className="text-slate-200">${Number(closeModal._current_price).toFixed(2)}</strong>
                <span className="ml-2 text-slate-500">({closeModal._current_date})</span>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exit Price *</label>
              <input type="number" step="0.01" required value={closeForm.exit_price} onChange={e => setCloseForm(f => ({ ...f, exit_price: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exit Reason</label>
              <select value={closeForm.exit_reason} onChange={e => setCloseForm(f => ({ ...f, exit_reason: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="target_hit">Target Hit</option>
                <option value="stop_hit">Stop Hit</option>
                <option value="stale_thesis">Stale Thesis</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Post-Mortem Tag</label>
              <select value={closeForm.post_mortem_tag} onChange={e => setCloseForm(f => ({ ...f, post_mortem_tag: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="">—</option>
                <option value="signal_correct">Signal Correct</option>
                <option value="timing_wrong">Timing Wrong</option>
                <option value="thesis_wrong">Thesis Wrong</option>
                <option value="execution_error">Execution Error</option>
                <option value="external_shock">External Shock</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setCloseModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg">Close Trade</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
