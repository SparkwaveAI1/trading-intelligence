import { useEffect, useState } from 'react'
import { getPaperTrades, createPaperTrade, closePaperTrade } from '../api'

interface Trade {
  id: string; symbol: string; direction: string; entry_price: number
  stop_level: number | null; target_level: number | null; exit_price: number | null
  result_pct: number | null; outcome: string; exit_reason: string | null
  created_at: string; notes: string | null; size_pct: number | null
}

function outcomeBadge(outcome: string) {
  if (outcome === 'win') return 'bg-emerald-500/20 text-emerald-400'
  if (outcome === 'loss') return 'bg-red-500/20 text-red-400'
  if (outcome === 'scratch') return 'bg-slate-500/20 text-slate-400'
  return 'bg-blue-500/20 text-blue-400' // open
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

  const load = () => {
    setLoading(true)
    getPaperTrades().then(d => setTrades(d.trades ?? [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Pre-fill form when navigating from a signal
  useEffect(() => {
    if (prefilled) {
      const asset = prefilled.assets as Record<string, string> | null
      const sym = asset?.symbol ?? (prefilled.signal_json as Record<string,unknown>)?.ticker as string ?? ''
      setForm(f => ({ ...f, symbol: sym, notes: `Signal score: ${Number(prefilled.final_score).toFixed(1)} | RSI: ${prefilled.rsi ?? '—'}` }))
      setShowForm(true)
      onClearPrefilled?.()
    }
  }, [prefilled])

  const open = trades.filter(t => t.outcome === 'open')
  const closed = trades.filter(t => t.outcome !== 'open')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await createPaperTrade({ ...form, entry_price: Number(form.entry_price), stop_level: form.stop_level ? Number(form.stop_level) : null, target_level: form.target_level ? Number(form.target_level) : null, size_pct: form.size_pct ? Number(form.size_pct) : null, market_type: 'equity' })
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
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Paper Trades</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition">+ New Trade</button>
      </div>

      {/* New trade form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6 grid grid-cols-2 gap-3">
          <div className="col-span-2 text-sm font-medium text-slate-300 mb-1">New Paper Trade</div>
          {[['Symbol','symbol','text',true],['Entry Price','entry_price','number',true],['Stop Level','stop_level','number',false],['Target Level','target_level','number',false],['Size %','size_pct','number',false]].map(([label,key,type,req]) => (
            <div key={key as string}>
              <label className="block text-xs text-slate-400 mb-1">{label as string}</label>
              <input type={type as string} required={req as boolean} value={(form as Record<string,string>)[key as string]} onChange={e => setForm(f => ({...f,[key as string]:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          ))}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Direction</label>
            <select value={form.direction} onChange={e => setForm(f => ({...f,direction:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
              <option value="long">Long</option><option value="short">Short</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({...f,notes:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800"><tr className="text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 text-left">Symbol</th><th className="px-4 py-3 text-left">Dir</th>
                <th className="px-4 py-3 text-right">Entry</th><th className="px-4 py-3 text-right">Stop</th>
                <th className="px-4 py-3 text-right">Target</th><th className="px-4 py-3 text-right">Size</th>
                <th className="px-4 py-3 text-left">Notes</th><th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/50">
                {open.map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-bold font-mono text-white">{t.symbol}</td>
                    <td className="px-4 py-3"><span className={t.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.direction.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-right">${Number(t.entry_price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{t.stop_level ? '$'+Number(t.stop_level).toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{t.target_level ? '$'+Number(t.target_level).toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{t.size_pct ? t.size_pct+'%' : '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{t.notes ?? '—'}</td>
                    <td className="px-4 py-3"><button onClick={() => setCloseModal(t)} className="text-xs text-blue-400 hover:text-blue-300">Close</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed trades */}
      {closed.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Closed ({closed.length})</div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800"><tr className="text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 text-left">Symbol</th><th className="px-4 py-3 text-left">Dir</th>
                <th className="px-4 py-3 text-right">Entry</th><th className="px-4 py-3 text-right">Exit</th>
                <th className="px-4 py-3 text-right">Result</th><th className="px-4 py-3 text-left">Outcome</th>
                <th className="px-4 py-3 text-left">Tag</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/50">
                {closed.map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-bold font-mono text-white">{t.symbol}</td>
                    <td className="px-4 py-3"><span className={t.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.direction.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-right">${Number(t.entry_price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{t.exit_price ? '$'+Number(t.exit_price).toFixed(2) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${t.result_pct != null && t.result_pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.result_pct != null ? (t.result_pct > 0 ? '+' : '')+t.result_pct.toFixed(2)+'%' : '—'}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${outcomeBadge(t.outcome)}`}>{t.outcome.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{t.exit_reason ?? '—'}</td>
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
          <div className="text-sm mt-1">Log your first trade when a signal fires</div>
        </div>
      )}

      {/* Close trade modal */}
      {closeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <form onSubmit={handleClose} className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-96 space-y-3">
            <div className="text-sm font-semibold text-white mb-2">Close {closeModal.symbol} trade</div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exit Price *</label>
              <input type="number" required value={closeForm.exit_price} onChange={e => setCloseForm(f => ({...f,exit_price:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exit Reason</label>
              <select value={closeForm.exit_reason} onChange={e => setCloseForm(f => ({...f,exit_reason:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="target_hit">Target Hit</option><option value="stop_hit">Stop Hit</option>
                <option value="stale_thesis">Stale Thesis</option><option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Post-Mortem Tag</label>
              <select value={closeForm.post_mortem_tag} onChange={e => setCloseForm(f => ({...f,post_mortem_tag:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="">—</option><option value="signal_correct">Signal Correct</option>
                <option value="timing_wrong">Timing Wrong</option><option value="thesis_wrong">Thesis Wrong</option>
                <option value="execution_error">Execution Error</option><option value="external_shock">External Shock</option>
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
