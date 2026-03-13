import { useEffect, useState } from 'react'

interface Fundamentals {
  symbol: string
  name: string | null
  description: string | null
  sector: string | null
  employees: number | null
  marketCap: number | null
  sharesOutstanding: number | null
  peRatio: number | null
  eps: number | null
  latestQuarter: {
    period: string
    endDate: string
    filingDate: string
    revenue: number | null
    netIncome: number | null
    revenueGrowthYoY: number | null
  } | null
  priceRange: {
    high: number
    low: number
    current: number
    positionPct: number | null
    daysBack: number
    fromDate: string
    toDate: string
  } | null
}

function fmt(n: number | null, suffix = '', decimals = 1): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(decimals) + 'B' + suffix
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(decimals) + 'M' + suffix
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K' + suffix
  return n.toFixed(decimals) + suffix
}

interface Props { symbol: string }

export default function FundamentalsPanel({ symbol }: Props) {
  const [data, setData] = useState<Fundamentals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/fundamentals?symbol=${symbol}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4 animate-pulse">
      <div className="h-3 bg-slate-800 rounded w-32 mb-3" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-slate-800 rounded" />)}
      </div>
    </div>
  )

  if (!data) return null

  const { latestQuarter: lq, priceRange: pr } = data

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Fundamentals</div>

      {/* Company description */}
      {data.description && (
        <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-2">{data.description}</p>
      )}

      {/* Key stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <div className="text-base font-bold text-slate-200">{fmt(data.marketCap)}</div>
          <div className="text-xs text-slate-500 mt-0.5">Mkt Cap</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <div className={`text-base font-bold ${data.peRatio && data.peRatio < 15 ? 'text-emerald-400' : data.peRatio && data.peRatio > 35 ? 'text-orange-400' : 'text-slate-200'}`}>
            {data.peRatio != null ? data.peRatio.toFixed(1) + 'x' : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">P/E (TTM)</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <div className={`text-base font-bold ${data.eps != null && data.eps > 0 ? 'text-emerald-400' : data.eps != null && data.eps < 0 ? 'text-red-400' : 'text-slate-200'}`}>
            {data.eps != null ? '$' + data.eps.toFixed(2) : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">EPS (qtr)</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <div className="text-base font-bold text-slate-200">{fmt(data.employees, '', 0)}</div>
          <div className="text-xs text-slate-500 mt-0.5">Employees</div>
        </div>
      </div>

      {/* Latest quarter */}
      {lq && (
        <div className="border-t border-slate-800 pt-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-slate-400 font-medium">Latest Quarter ({lq.period})</div>
            {lq.filingDate && <div className="text-xs text-slate-600">Filed {lq.filingDate}</div>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-sm font-bold text-slate-200">{fmt(lq.revenue)}</div>
              <div className="text-xs text-slate-500">Revenue</div>
            </div>
            <div>
              <div className={`text-sm font-bold ${(lq.netIncome ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(lq.netIncome)}</div>
              <div className="text-xs text-slate-500">Net Income</div>
            </div>
            <div>
              {lq.revenueGrowthYoY != null ? (
                <>
                  <div className={`text-sm font-bold ${lq.revenueGrowthYoY > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {lq.revenueGrowthYoY > 0 ? '+' : ''}{lq.revenueGrowthYoY.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500">Rev Growth QoQ</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-bold text-slate-500">—</div>
                  <div className="text-xs text-slate-500">Rev Growth</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Price range bar */}
      {pr && (
        <div className="border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs text-slate-400 font-medium">
              {pr.daysBack}d Range
              <span className="text-slate-600 ml-1">({pr.fromDate} → {pr.toDate})</span>
            </div>
            {pr.positionPct != null && (
              <div className={`text-xs font-semibold ${pr.positionPct < 15 ? 'text-red-400' : pr.positionPct > 85 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {pr.positionPct}th percentile
              </div>
            )}
          </div>
          <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
            {pr.positionPct != null && (
              <div
                className="absolute top-0 bottom-0 bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 opacity-30 rounded-full"
                style={{ width: '100%' }}
              />
            )}
            {pr.positionPct != null && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-600 shadow"
                style={{ left: `calc(${pr.positionPct}% - 5px)` }}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>${Number(pr.low).toFixed(2)}</span>
            <span className="text-slate-400 font-medium">Current ${Number(pr.current).toFixed(2)}</span>
            <span>${Number(pr.high).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
