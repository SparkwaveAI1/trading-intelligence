/**
 * Trading Intelligence Backend — Main Entry
 * Schedules all services to run after market close (daily)
 */
import * as dotenv from 'dotenv'
dotenv.config()
import cron from 'node-cron'
import { runIngestion } from './services/ingestion'
import { runIndicators } from './services/indicators'
import { runSRComputation } from './services/supportResistance'
import { runMacroRegime } from './services/macroRegime'
import { detectSignals } from './services/signalEngine'

console.log('[trading-intelligence] Backend starting...')

// Full pipeline after market close: 5:30 PM ET = 21:30 UTC
// Run in sequence: ingest → indicators → S/R → macro → signals
cron.schedule('30 21 * * 1-5', async () => {
  const date = new Date().toISOString().split('T')[0]
  console.log(`\n[pipeline] Starting daily pipeline for ${date}`)

  try {
    console.log('[pipeline] Step 1: Ingestion...')
    await runIngestion(date)

    console.log('[pipeline] Step 2: Indicators...')
    await runIndicators(date)

    console.log('[pipeline] Step 3: Support/Resistance...')
    await runSRComputation(date)

    console.log('[pipeline] Step 4: Macro Regime...')
    await runMacroRegime(date)

    console.log('[pipeline] Step 5: Signal Detection...')
    const signals = await detectSignals(date)

    console.log(`[pipeline] Complete. ${signals.length} signals detected.`)
  } catch (err) {
    console.error('[pipeline] Error:', err)
  }
}, { timezone: 'UTC' })

console.log('[trading-intelligence] Scheduler active. Pipeline runs weekdays at 21:30 UTC (5:30 PM ET).')
console.log('[trading-intelligence] To run manually: npm run ingest | npm run signals | npm run macro')
