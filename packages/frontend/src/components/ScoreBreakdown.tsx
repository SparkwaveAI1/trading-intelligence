interface ScoreRow {
  label: string
  value: number | null
  weight: number
  max?: number
}

interface Props {
  stretch_score?: number | null
  volume_score?: number | null
  level_score?: number | null
  reclaim_score?: number | null
  macro_context_score?: number | null
  context_multiplier?: number | null
  raw_score?: number | null
  final_score?: number | null
}

function Bar({ value, max = 100, color = 'bg-blue-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function ScoreBreakdown({ stretch_score, volume_score, level_score, reclaim_score, context_multiplier, final_score }: Props) {
  const rows: ScoreRow[] = [
    { label: 'Stretch (RSI/Stoch/WR)', value: stretch_score ?? null, weight: 30 },
    { label: 'Volume intensity', value: volume_score ?? null, weight: 25 },
    { label: 'Level proximity', value: level_score ?? null, weight: 25 },
    { label: 'Reclaim quality', value: reclaim_score ?? null, weight: 20 },
  ]

  const barColor = (v: number) => v >= 70 ? 'bg-emerald-500' : v >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="text-xs text-slate-400 w-40 shrink-0">{row.label}</div>
          {row.value != null ? (
            <>
              <Bar value={row.value} color={barColor(row.value)} />
              <div className="text-xs text-slate-300 w-8 text-right">{row.value.toFixed(0)}</div>
              <div className="text-xs text-slate-600 w-10 text-right">{row.weight}%</div>
            </>
          ) : (
            <div className="text-xs text-slate-600 italic">—</div>
          )}
        </div>
      ))}
      {context_multiplier != null && (
        <div className="pt-1 border-t border-slate-800 flex items-center gap-3">
          <div className="text-xs text-slate-400 w-40">Macro multiplier</div>
          <div className="text-xs text-slate-300">{context_multiplier}×</div>
        </div>
      )}
      {final_score != null && (
        <div className="flex items-center gap-3">
          <div className="text-xs font-semibold text-slate-300 w-40">Final score</div>
          <div className={`text-sm font-bold ${final_score >= 7 ? 'text-emerald-400' : final_score >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
            {final_score.toFixed(1)} / 10
          </div>
        </div>
      )}
    </div>
  )
}
