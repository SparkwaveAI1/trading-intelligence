import { useEffect, useState } from 'react'

interface Bar { bar_date: string; close: number; rsi_14: number | null }

interface Props {
  symbol: string
  width?: number
  height?: number
  showRSI?: boolean
}

export default function Sparkline({ symbol, width = 120, height = 40, showRSI = false }: Props) {
  const [bars, setBars] = useState<Bar[]>([])

  useEffect(() => {
    fetch(`/api/query?route=sparkline&symbol=${symbol}`)
      .then(r => r.json())
      .then(d => setBars(d.bars ?? []))
      .catch(() => {})
  }, [symbol])

  if (!bars.length) return <div style={{ width, height }} className="bg-slate-800 rounded animate-pulse" />

  const closes = bars.map(b => Number(b.close))
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1

  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * width
    const y = height - ((c - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  const lastClose = closes[closes.length - 1]
  const firstClose = closes[0]
  const isUp = lastClose >= firstClose
  const color = isUp ? '#10b981' : '#ef4444'

  // Fill path
  const fillPts = `0,${height} ${pts} ${width},${height}`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#grad-${symbol})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Last price dot */}
      {closes.length > 0 && (() => {
        const lx = width
        const ly = height - ((lastClose - min) / range) * height
        return <circle cx={lx} cy={ly} r="2.5" fill={color} />
      })()}
    </svg>
  )
}
