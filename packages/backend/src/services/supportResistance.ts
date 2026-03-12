/**
 * Support/Resistance Level Identification
 * Simple algorithm: daily low/high tested 2+ times in last 20 bars
 * Runs after indicator computation
 */
import { supabase } from '../lib/supabase'

const TOLERANCE_PCT = 0.015 // 1.5% tolerance for "same level"

function groupLevels(prices: number[], tolerance: number): Array<{ price: number, count: number }> {
  const sorted = [...prices].sort((a, b) => a - b)
  const groups: Array<{ price: number, count: number }> = []

  for (const price of sorted) {
    const existing = groups.find(g => Math.abs(g.price - price) / g.price <= tolerance)
    if (existing) {
      existing.count++
      existing.price = (existing.price + price) / 2 // average
    } else {
      groups.push({ price, count: 1 })
    }
  }

  return groups.filter(g => g.count >= 2)
}

export async function computeSRLevels(symbol: string) {
  const { data: bars } = await supabase
    .from('equity_bars')
    .select('bar_date, high, low')
    .eq('symbol', symbol)
    .eq('timeframe', 'day')
    .order('bar_date', { ascending: false })
    .limit(20)

  if (!bars || bars.length < 5) return

  const lows = bars.map(b => Number(b.low))
  const highs = bars.map(b => Number(b.high))
  const dates = bars.map(b => b.bar_date)

  const supportGroups = groupLevels(lows, TOLERANCE_PCT)
  const resistanceGroups = groupLevels(highs, TOLERANCE_PCT)

  // Clear old levels for this symbol
  await supabase.from('support_resistance_levels').update({ active: false }).eq('symbol', symbol)

  // Insert new support levels
  for (const group of supportGroups) {
    await supabase.from('support_resistance_levels').upsert({
      symbol,
      level_type: 'support',
      price: Math.round(group.price * 100) / 100,
      strength: group.count,
      first_tested: dates[dates.length - 1],
      last_tested: dates[0],
      active: true,
    }, { onConflict: 'symbol,level_type,price' })
  }

  // Insert new resistance levels
  for (const group of resistanceGroups) {
    await supabase.from('support_resistance_levels').upsert({
      symbol,
      level_type: 'resistance',
      price: Math.round(group.price * 100) / 100,
      strength: group.count,
      first_tested: dates[dates.length - 1],
      last_tested: dates[0],
      active: true,
    }, { onConflict: 'symbol,level_type,price' })
  }
}

export async function runSRComputation(targetDate?: string) {
  const date = targetDate ?? new Date().toISOString().split('T')[0]
  console.log(`[sr] Computing S/R levels for ${date}`)

  const { data: todayBars } = await supabase
    .from('equity_bars')
    .select('symbol')
    .eq('bar_date', date)
    .eq('timeframe', 'day')

  if (!todayBars || todayBars.length === 0) {
    console.log('[sr] No bars for', date)
    return
  }

  for (const { symbol } of todayBars) {
    await computeSRLevels(symbol)
  }

  console.log(`[sr] Done — ${todayBars.length} symbols processed`)
}

if (require.main === module) {
  const date = process.argv[2]
  runSRComputation(date)
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1) })
}
