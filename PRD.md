# AI Trading Intelligence System
# Product Requirements Document — V1 FINAL
**Author:** Dev + Consultant  
**Owner:** Scott Johnson  
**Date:** 2026-03-12  
**Status:** FINAL — approved for build

---

## 1. PRODUCT OVERVIEW

The AI Trading Intelligence System is a decision-support platform that scans markets and surfaces high-quality trading opportunities.

V1 focuses on:
- Equities
- Polymarket prediction markets
- Signal detection
- Opportunity ranking
- Paper trading
- Trade journaling

**The system suggests opportunities. The human trader decides whether to act.**

---

## 2. CORE OBJECTIVES

**Primary:** Identify and rank high-quality trading setups.

**Secondary:**
- Track signal performance over time
- Enable paper trading for strategy evaluation
- Build a structured dataset for later system improvement
- Provide a trader dashboard for rapid decision-making

---

## 3. MARKETS COVERED IN V1

**Equities** — technical signals and institutional activity  
**Polymarket** — probability mispricing and event-driven signals  
**Crypto** — added in a later phase

---

## 4. CORE TRADING PHILOSOPHY

The system detects structured setups. It does not predict prices.

**The Rule:** The system suggests. Scott decides.

### 4.1 Primary Equity Setup: Capitulation + Reclaim

A signal requires ALL FOUR ingredients:

**1. Extreme stretch**
- RSI(14) ≤ 20 (oversold) OR ≥ 80 (overbought)
- Stochastic %K ≤ 10 OR ≥ 90
- Williams %R ≤ -90 OR ≥ -10

**2. Volume confirmation**
- Volume ≥ 2× 20-day average
- Wide-range candle (≥ 1.5× ATR)

**3. Structural level**
Price within 2% of at least one:
- Daily or weekly support/resistance
- Anchored VWAP from prior significant event
- Prior consolidation zone
- 52-week high or low

**4. Reclaim / stabilization**
At least one of:
- Price reclaim of intraday VWAP
- Reclaim of prior day low/high
- Bullish/bearish engulfing candle
- Higher low / lower high forming after flush

**Context filters (applied to score as multiplier 0.5–1.2):**

Macro regime (from daily snapshot):
- `risk_on`: VIX < 18 AND SPY 20-day trend positive AND yield spread > 0 → multiplier 1.1
- `neutral`: VIX 18–25 AND SPY flat (±1%) → multiplier 1.0
- `cautious`: VIX 25–32 OR SPY in mild downtrend → multiplier 0.85
- `stress`: VIX > 32 OR SPY > 5% below 20-day MA → multiplier 0.7

Sector context (from sector ETF daily close):
- Stabilizing (sector ETF up 2 of last 3 days) → +0.05
- Declining (sector ETF down 3 of last 3 days) → -0.1
- Neutral → 0

Earnings proximity:
- Earnings within 2 days → multiplier 0.5 (high uncertainty, signal suppressed)
- Earnings within 5 days → multiplier 0.8

**Macro data sources:**
- VIX: Polygon.io daily bars (ticker: VIX)
- SPY trend: Polygon.io daily bars. "Trend positive" = today's close > 20-day SMA. "Flat (±1%)" = close within 1% of 20-day SMA. "Downtrend" = close > 1% below 20-day SMA.
- Yield spread (10Y-2Y): FRED API series `T10Y2Y` — fetched once daily, cached in Supabase `macro_regime_snapshots` table. If FRED API fails: use prior cached value (acceptable since yield spread changes slowly). FRED is free with no rate limits for daily polling.
- Sector ETFs: Polygon.io daily bars (XLK, SOXX, XLF, XLE, XBI, etc.)

### 4.2 Secondary Equity Setup: Blowoff Exhaustion
- RSI ≥ 80 + volume spike + price at resistance + stall/reversal candle

---

## 4B. AI PROBABILITY AND CONFIDENCE METHODOLOGY

### Polymarket AI Probability
The "AI estimated probability" is not a separate ML model. It is the output of the AI Analysis Service given structured inputs:

**Inputs:**
- Current Polymarket price (market consensus)
- Recent probability drift (last 24h, 7d)
- Relevant news headlines (NewsAPI free tier)
- Related polling data where applicable (politics markets)
- Event calendar (scheduled catalysts, resolution date)
- Macro regime state

**Output:** LLM returns a probability estimate (0.0–1.0) with reasoning. Labeled "AI estimate" in the UI — a structured analytical judgment, not a model prediction or certainty.

### Confidence Derivation
Confidence is a qualitative assessment by the LLM, distinct from the numeric `final_score`:
- `high`: Multiple independent signals agree, strong evidence, clear catalyst, low uncertainty
- `medium`: Mixed signals or limited evidence, some uncertainty in inputs
- `low`: Sparse data, contradictory signals, rapidly evolving situation

---

## 5. HIGH-LEVEL SYSTEM ARCHITECTURE

```
External Data Sources
        ↓
1. Ingestion Service     ← fetch, stream, normalize, validate
        ↓
2. Market Store          ← Supabase / Postgres (bars, ticks, markets)
        ↓
3. Signal Engine         ← deterministic rules only (RSI, volume, support, VWAP, odds)
        ↓
4. Scoring Service       ← rank and tag setups (strength, freshness, liquidity, context)
        ↓
5. AI Analysis Service   ← thesis, bear case, invalidation (explanation only, no signals)
        ↓
6. API Layer             ← REST + realtime subscriptions
        ↓
7. Frontend Dashboard    ← Scott sees strongest signals first
        ↓
8. Paper Trading         ← simulated entries, exits, P/L (no live execution in V1)
        ↓
9. Journal + Review      ← signal log, notes, metrics, dataset for later phases
```

**Critical:** LLM never creates signals. LLM explains signals. Pricing, sizing, risk, and execution are deterministic rule-based layers — not AI.

---

## 6. MAJOR SERVICES

| Service | Role |
|---------|------|
| Market Ingestion | Pulls equities OHLCV and Polymarket data; streams live via WebSocket |
| Signal Engine | Detects structured signals; outputs signal packets |
| Scoring Service | Ranks detected setups; applies context modifiers |
| AI Analysis | Generates thesis, counter-thesis, confidence, invalidation conditions |
| Risk Evaluation | Hard rules only; blocks trades that exceed risk parameters |
| Journal Service | Logs all signals, decisions, and outcomes |
| Review Service | Calculates win rates, signal quality metrics, performance per signal type |
| API Service | Serves dashboard; Supabase Realtime for live updates |

---

## 7. EXTERNAL DATA SOURCES

| Source | Data |
|--------|------|
| Equities data provider (Polygon.io) | OHLCV, intraday bars, daily bars, sector data |
| Polymarket REST API | Market discovery, initial snapshots (prices, spread, liquidity, metadata). Polled every 5 minutes as fallback when WebSocket is disconnected. |
| Polymarket WebSocket | Primary source for live price/probability updates, order book changes, trade events. On disconnection: auto-reconnect with exponential backoff; fall back to REST polling at 60s intervals until reconnected. Health-check ping every 30s. |
| Macro inputs | Risk-on/off regime, VIX, yield curve, notes |
| Manual trader input | Scott's watchlists, trade decisions, notes, overrides |

---

## 8. SIGNAL DEFINITIONS

### 8.1 Equities Signals

**Capitulation Reversal (core)**
```
RSI < 20
AND volume > 2× average
AND price within 2% of major support
AND reclaim event (VWAP, level, or reversal candle)
```

**Blowoff Exhaustion**
```
RSI > 80
AND volume > 2× average
AND price at resistance
AND stall or reversal candle
```

**Signal output packet (example):**
```json
{
  "ticker": "AMD",
  "signal_type": "capitulation_reversal",
  "rsi": 17.3,
  "volume_ratio": 2.8,
  "nearest_level": "daily_support",
  "level_distance_pct": 0.4,
  "reclaim_event": "vwap_reclaim",
  "sector_state": "stabilizing",
  "macro_state": "cautious_risk_on",
  "raw_score": 8.7,
  "final_score": 8.3,
  "detected_at": "2026-03-12T14:23:00Z"
}
```

### 8.2 Polymarket Signals

**Probability Edge**
```
|AI estimated probability - market price| > 0.08
AND liquidity > $50,000
AND spread < 0.04
AND time to resolution > 48 hours
```

**Momentum Event**
```
Probability change > threshold within short window
```

**Liquidity Shift**
```
Spread tightening or widening significantly
```

**Signal output packet (example):**
```json
{
  "market_id": "fed-cut-june",
  "market_title": "Fed cuts rates before June 30?",
  "current_price": 0.41,
  "ai_fair_value": 0.54,
  "edge": 0.13,
  "direction": "YES",
  "liquidity": 185000,
  "spread": 0.02,
  "time_to_resolution_hours": 312,
  "confidence": "medium",
  "catalysts": ["FOMC meeting Mar 19", "CPI data Mar 14"],
  "linked_equities": ["TLT", "XLF", "IWM"],
  "detected_at": "2026-03-12T14:23:00Z"
}
```

---

## 9. OPPORTUNITY SCORING

Each signal receives a numeric score (0–10).

**Equity scoring factors:**
- Signal strength (how extreme the reading)
- Volume intensity
- Location quality (how significant the level)
- Reclaim quality
- Context (sector, index, macro)

**Polymarket scoring factors:**
- Probability gap (edge)
- Liquidity
- Confidence
- Time to resolution

**Example output:**
```
Ticker: AMD
Setup: Capitulation Reversal
RSI: 17 | Volume: 2.4x | Support: daily level
Score: 8.4 | Confidence: High | Status: Watch
```

---

## 10. AI ANALYSIS LAYER

### What it does
Takes a structured signal packet and returns explanation and context.

**Inputs:** signal packet + market data + macro state  
**Outputs:**
- Thesis (one paragraph)
- Counter-thesis (one paragraph)
- Confidence (low / medium / high)
- Invalidation condition
- Expected time horizon
- Uncertainty reason (what we don't know)
- Missing data (what would improve the analysis)
- What would change the AI's mind
- Source timestamps (explicit datetime for each data source used)

**Every AI output card must show all of the above. No exceptions.**  
This prevents false confidence from good-looking explanations.

**Example:**
```
Thesis: Selling pressure likely exhausted after high-volume flush near daily support.
Semiconductor sector ETF has stabilized over 2 sessions. Price reclaimed intraday VWAP.

Counter-thesis: Broader market selling could resume. Semis remain in medium-term downtrend.
No positive catalyst to drive sustained reversal.

Confirms: Hold above $132 on next session open, sector continues to stabilize
Invalidates: Close below $130, SOXX resumes decline, VIX spikes above 28

Confidence: High
Uncertainty: No visibility on next earnings date
Missing data: Options flow not yet analyzed

Source timestamps:
  - Price data (Polygon.io): 2026-03-12T21:00:00Z (market close)
  - Sector ETF data (Polygon.io): 2026-03-12T21:00:00Z
  - VIX: 2026-03-12T21:00:00Z
  - Earnings calendar: 2026-03-12T06:00:00Z
```

### What it does NOT do
- Create raw signals (signal engine does that)
- Control risk or position sizing (risk service does that)
- Place or suggest trades (Scott does that)

---

## 11. RISK PARAMETERS

Hard rules. No LLM. All trades evaluated before logging as "allowed" or "blocked."

```json
{
  "max_single_position_pct": 2.0,
  "max_portfolio_equity_exposure_pct": 40.0,
  "max_portfolio_polymarket_exposure_pct": 15.0,
  "max_correlated_positions": 3,
  "daily_drawdown_stop_pct": 5.0,
  "no_trade_within_days_of_earnings": 2,
  "min_polymarket_liquidity": 50000,
  "max_polymarket_spread": 0.04,
  "stale_thesis_hours": 48
}
```

All parameters are Scott-configurable via dashboard settings. No code changes required.

**Thesis decay:** Any signal older than `stale_thesis_hours` without a data refresh is automatically marked stale and suppressed from the opportunity board.

---

## 12. DASHBOARD SPECIFICATION

### Top Bar (always visible)

| Macro Regime | Paper P&L | Drawdown | Active Signals | Blocked | Mode |
|---|---|---|---|---|---|
| Cautious risk-on | +1.4% | -0.8% | 27 | 11 | Equities + Poly |

### Left Column — Opportunity Board

Ranked list of current signals across all markets.

**Equities row:**
`AMD | Capitulation reversal | RSI 17 | Vol 2.8x | Daily support | Score 8.3 | ✅ Watch`

**Polymarket row:**
`Fed cut June? | Market 41% | AI 54% | Edge +13% | $185k liq | Medium | ⚠️ Watch`

Filters: Market type | Score threshold | Status (Watch/Ready/Blocked/Stale) | Time horizon  
Sort: Score | Edge | Freshness | Liquidity

### Center Column — Setup Detail

Six cards displayed when a row is selected:

**Card 1: Thesis**
- Setup label
- Thesis (one paragraph)
- Counter-thesis (one paragraph)
- What confirms | What invalidates

**Card 2: Signal Stack**
All raw indicators with values and thresholds. Color-coded: green (favorable) / red (unfavorable) / gray (neutral).

For equities: RSI, Stochastic, Williams %R, MACD, volume ratio, VWAP relation, S/R distance, sector trend, index state  
For Polymarket: price move, spread, depth, news freshness, source count, catalyst window

**Card 3: Chart**
- Equities: TradingView Lightweight Charts, S/R overlays, VWAP, volume bars, signal event markers
- Polymarket: probability over time, spread, event/news markers

**Card 4: Cross-Market Watch** *(simplified V1)*
- Equities: what sector ETF is doing, index state
- Polymarket: linked equities/instruments to watch, whether linked assets already moving

**Card 5: Risk Summary**
- Suggested position size
- Stop level
- Target level
- Expected hold period
- Portfolio correlation impact
- Status: ✅ ALLOWED or 🚫 BLOCKED [reason]

**Card 6: Decision Log**
- When signal was detected
- Score at detection
- Whether Scott entered (yes / no / paper)
- Entry price (if entered)
- Current status
- Outcome (if resolved)
- Post-mortem tag

### Right Column — Portfolio + Monitoring

**Panel 1: Paper Trades** — active simulated trades with entry, stop, target, current P&L  
**Panel 2: Watchlist Extremes** — live feed of instruments hitting extreme readings (situational awareness)  
**Panel 3: Signal Log** — recent detected setups, whether acted on  
**Panel 4: System Alerts** — data staleness, feed errors, drawdown warnings, correlation warnings

### Tab Structure

1. **Dashboard** — top setups + macro + open risk (default view)
2. **Equities Scanner** — full equities opportunity board
3. **Polymarket Board** — probability edges + linked market watch
4. **Portfolio** — paper positions, exits, thesis drift
5. **Review** — resolved signals, post-mortems, performance by signal type

*(Cross-Market and Crypto Radar: Phase 2)*

---

## 13. PAPER TRADING SYSTEM

Every signal automatically generates a simulated trade record.

**Stored fields:**
- Asset / market
- Signal type
- Entry price
- Stop level
- Target level
- Exit price
- P&L
- Timestamp
- Result

**Metrics tracked:**
- Win rate
- Average return
- Drawdown
- Sharpe ratio
- Expected value per signal type

---

## 14. TRADE JOURNAL

Each signal generates a structured record regardless of whether Scott acts on it.

**Stored fields:**
- Signal ID
- Asset / market
- All signal parameters
- AI analysis snapshot
- Whether Scott entered (yes / no / paper)
- Entry / exit
- Result
- Post-mortem tag: `signal_correct` | `timing_wrong` | `thesis_wrong` | `execution_error` | `external_shock`
- Notes

This dataset powers later phases: agent scoring, prompt evolution, signal quality improvement.

---

## 15. DATABASE SCHEMA

```sql
assets              -- instruments being tracked
equity_bars         -- OHLCV price data (daily + intraday)
polymarket_markets  -- Polymarket market metadata
polymarket_ticks    -- live price/probability updates
signal_events       -- detected signals (separate from trades)
setup_scores        -- scoring breakdown per signal
analysis_outputs    -- AI analysis per signal
paper_trades        -- simulated trade records
manual_trade_decisions -- Scott's actual trade log
journal_entries     -- full signal+decision+outcome record
macro_regime_snapshots -- daily macro state snapshots
system_events       -- errors, alerts, feed issues
```

**Signal threshold validation:** Initial thresholds (RSI < 20, volume > 2×, etc.) are based on well-established technical analysis standards used across the industry. These are validated through the paper trading system in Phase 3 before any real capital is deployed. Paper trading IS the backtesting pipeline for V1 — every signal is logged with full parameters, outcomes are measured, and thresholds will be tuned based on real data after 50+ signals. No separate historical backtesting module is required for V1; threshold calibration is a Phase 3+ activity once paper trade data is available.

**Design rule:** Signal events and trade records are always separate tables. This enables analysis of: how often extremes occur → become valid setups → become trades → succeed.

---

## 15B. DATA INGESTION RESILIENCE

**Retry logic (all external feeds):**
- On failure: retry 3× with exponential backoff (2s, 4s, 8s)
- After 3 failures: mark feed as stale, log system event, surface alert in dashboard top bar
- System continues operating on last-known-good data with staleness timestamp shown

**Staleness thresholds:**
- Equities price data stale after 26 hours (catches missed daily close)
- Polymarket data stale after 15 minutes (WebSocket auto-reconnects)
- Macro data (FRED) stale after 48 hours (updates infrequently by nature)

**Dashboard behavior when data is stale:**
- Top bar shows: ⚠️ DATA STALE: [source] since [timestamp]
- Affected signals flagged with staleness warning
- Signals older than `stale_thesis_hours` (48h default) suppressed from opportunity board automatically

---

## 16. API ENDPOINTS

```
GET  /dashboard/summary
GET  /opportunities
GET  /opportunities/{id}
GET  /paper-trades
POST /paper-trades
POST /manual-decisions
GET  /review/metrics
GET  /system/health
```

---

## 17. TECHNOLOGY STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind + Shadcn |
| Charts | TradingView Lightweight Charts (free) |
| Backend | Node.js + TypeScript (modular services) |
| Database | Supabase Postgres + Supabase Realtime |
| AI Layer | OpenClaw orchestration + Claude API (explanation only) |
| Equities data | Polygon.io |
| Polymarket data | REST + WebSocket (official API) |
| Deployment | Vercel (frontend) + VPS (backend services, 5.161.186.106) |
| Repo | SparkwaveAI1/trading-intelligence |

---

## 18. DEVELOPMENT ROADMAP

### Phase 1 — Core Infrastructure (Weeks 1–2)
- [ ] Repo + Supabase project created
- [ ] Database schema deployed
- [ ] Equities data ingestion (Polygon.io daily OHLCV)
- [ ] Technical indicator computation (RSI, Stochastic, Williams %R, VWAP, volume ratio)
- [ ] Capitulation + Reclaim signal detector
- [ ] Blowoff exhaustion signal detector
- [ ] Basic opportunity board UI
- [ ] Signal logging

### Phase 2 — Polymarket + Dashboard (Weeks 3–4)
- [ ] Polymarket REST integration (market discovery, prices, liquidity)
- [ ] Polymarket WebSocket integration (live order book)
- [ ] Probability gap signal detector
- [ ] AI analysis service (thesis + counter-thesis per signal)
- [ ] Full dashboard (all 5 tabs, all columns)
- [ ] Risk evaluation service

### Phase 3 — Paper Trading + Review (Weeks 5–6)
- [ ] Paper trading simulation
- [ ] Trade journal
- [ ] Post-mortem tagging UI
- [ ] Performance metrics (win rate, EV per signal type, Sharpe)
- [ ] Signal replay (scroll back to any date)

### Phase 4+ (Future)
- Cross-market intelligence engine
- Crypto signals
- Multi-agent debate layer
- Darwinian agent weighting
- Evolutionary prompt improvement
- Automated execution with risk limits

---

## 19. NON-GOALS FOR V1

- No automated trading or execution
- No crypto signals
- No agent evolution or prompt mutation
- No complex ML models
- No multi-user support

---

## 20. SUCCESS CRITERIA

**After 6 weeks:**
- ≥ 50 signals logged
- ≥ 20 paper trades logged
- Win rate measurable per signal type
- Scott's assessment: "I'm seeing setups I would have missed"

**After 3 months:**
- Signal EV data sufficient to tune score thresholds
- Foundation ready for Phase 4 (cross-market + crypto + agent evolution)

---

## 21. DECISIONS MADE (2026-03-12)

1. **Equities universe** — S&P 500 + Nasdaq 100 components
2. **Polymarket categories** — All categories (no filter)
3. **Data tier** — Polygon.io free tier (daily close signals). No intraday for V1. Signals fire after market close. Zero cost.
4. **Supabase** — New project (separate from PersonaAI)

---

*End of PRD — V1 FINAL*  
*Merged from: Consultant PRD + Dev PRD + Technical Architecture Spec + System Diagram*  
*Next step: Scott answers open questions → Dev runs plan-review gate → build begins*
