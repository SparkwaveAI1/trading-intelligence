/**
 * Technical Indicator Computation Service
 * Computes RSI(14), Stochastic %K, Williams %R, SMA20, volume ratio
 * Runs after ingestion, reads from equity_bars, writes back computed values
 */
import { supabase } from '../lib/supabase'

// RSI(14)
function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change
    else losses += Math.abs(change)
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100
}

// Stochastic %K (14 period)
function computeStochK(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period) return null
  const sliceH = highs.slice(-period)
  const sliceL = lows.slice(-period)
  const currentClose = closes[closes.length - 1]
  const highestHigh = Math.max(...sliceH)
  const lowestLow = Math.min(...sliceL)
  if (highestHigh === lowestLow) return 50
  return Math.round(((currentClose - lowestLow) / (highestHigh - lowestLow)) * 10000) / 100
}

// Williams %R (14 period)
function computeWilliamsR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period) return null
  const sliceH = highs.slice(-period)
  const sliceL = lows.slice(-period)
  const currentClose = closes[closes.length - 1]
  const highestHigh = Math.max(...sliceH)
  const lowestLow = Math.min(...sliceL)
  if (highestHigh === lowestLow) return -50
  return Math.round(((highestHigh - currentClose) / (highestHigh - lowestLow)) * -10000) / 100
}

// SMA(n)
function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return Math.round(slice.reduce((a, b) => a + b, 0) / period * 100) / 100
}

// Volume ratio (current / 20-day avg)
function computeVolumeRatio(volumes: number[]): number | null {
  if (volumes.length < 21) return null
  const avg20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20
  if (avg20 === 0) return null
  return Math.round((volumes[volumes.length - 1] / avg20) * 100) / 100
}

export async function computeIndicatorsForSymbol(symbol: string, targetDate: string) {
  // Fetch last 60 days of bars for this symbol
  const { data: bars, error } = await supabase
    .from('equity_bars')
    .select('bar_date, open, high, low, close, volume')
    .eq('symbol', symbol)
    .eq('timeframe', 'day')
    .order('bar_date', { ascending: true })
    .limit(60)

  if (error || !bars || bars.length < 15) return

  const closes = bars.map(b => Number(b.close))
  const highs = bars.map(b => Number(b.high))
  const lows = bars.map(b => Number(b.low))
  const volumes = bars.map(b => Number(b.volume))

  const rsi_14 = computeRSI(closes)
  const stoch_k = computeStochK(highs, lows, closes)
  const williams_r = computeWilliamsR(highs, lows, closes)
  const sma_20 = computeSMA(closes, 20)
  const volume_ratio = computeVolumeRatio(volumes)

  const { error: updateError } = await supabase
    .from('equity_bars')
    .update({ rsi_14, stoch_k, williams_r, sma_20, volume_ratio })
    .eq('symbol', symbol)
    .eq('bar_date', targetDate)
    .eq('timeframe', 'day')

  if (updateError) {
    console.error(`[indicators] Update failed ${symbol}:`, updateError.message)
  }
}

export async function runIndicators(targetDate?: string) {
  const date = targetDate ?? new Date().toISOString().split('T')[0]
  console.log(`[indicators] Computing for ${date}`)

  // Get all symbols with bars for this date
  const { data: todayBars } = await supabase
    .from('equity_bars')
    .select('symbol')
    .eq('bar_date', date)
    .eq('timeframe', 'day')

  if (!todayBars || todayBars.length === 0) {
    console.log('[indicators] No bars found for', date)
    return
  }

  const symbols = todayBars.map(b => b.symbol)
  console.log(`[indicators] Computing for ${symbols.length} symbols`)

  for (const symbol of symbols) {
    await computeIndicatorsForSymbol(symbol, date)
  }

  console.log('[indicators] Done')
}

if (require.main === module) {
  const date = process.argv[2]
  runIndicators(date)
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1) })
}
