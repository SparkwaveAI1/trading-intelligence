import { useState } from 'react'
import SignalFeed from './views/SignalFeed'
import SignalDetail from './views/SignalDetail'
import SignalHistory from './views/SignalHistory'
import Watchlist from './views/Watchlist'
import MacroView from './views/MacroView'
import PaperTrades from './views/PaperTrades'
import PolymarketView from './views/PolymarketView'

type Tab = 'signals' | 'history' | 'watchlist' | 'polymarket' | 'macro' | 'trades'

export default function App() {
  const [tab, setTab] = useState<Tab>('signals')
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null)
  const [prefilledTrade, setPrefilledTrade] = useState<Record<string, unknown> | null>(null)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'signals', label: '⚡ Signals' },
    { id: 'history', label: '📜 History' },
    { id: 'watchlist', label: '📊 Watchlist' },
    { id: 'polymarket', label: '🎯 Polymarket' },
    { id: 'macro', label: '🌐 Macro' },
    { id: 'trades', label: '📋 Paper Trades' },
  ]

  const handleSelectSignal = (id: string) => {
    setSelectedSignalId(id)
  }

  const handleLogTrade = (signal: Record<string, unknown>) => {
    setSelectedSignalId(null)
    setPrefilledTrade(signal)
    setTab('trades')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Trading Intelligence</h1>
          <p className="text-xs text-slate-400 mt-0.5">Signal Detection · Paper Trading · Decision Support</p>
        </div>
        <span className="text-xs text-slate-500">Daily close signals · free tier</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 px-6">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedSignalId(null) }}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {tab === 'signals' && !selectedSignalId && (
          <SignalFeed onSelectSignal={handleSelectSignal} />
        )}
        {tab === 'signals' && selectedSignalId && (
          <SignalDetail
            signalId={selectedSignalId}
            onBack={() => setSelectedSignalId(null)}
            onLogTrade={handleLogTrade}
          />
        )}
        {tab === 'history' && !selectedSignalId && (
          <SignalHistory onSelectSignal={handleSelectSignal} />
        )}
        {tab === 'history' && selectedSignalId && (
          <SignalDetail
            signalId={selectedSignalId}
            onBack={() => setSelectedSignalId(null)}
            onLogTrade={handleLogTrade}
          />
        )}
        {tab === 'watchlist' && <Watchlist />}
        {tab === 'polymarket' && <PolymarketView />}
        {tab === 'macro' && <MacroView />}
        {tab === 'trades' && <PaperTrades prefilled={prefilledTrade} onClearPrefilled={() => setPrefilledTrade(null)} />}
      </div>
    </div>
  )
}
