-- Trading Intelligence System — Initial Schema
-- Migration: 001_initial_schema
-- Date: 2026-03-12

-- Assets being tracked
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  name TEXT,
  asset_type TEXT NOT NULL DEFAULT 'equity', -- equity | etf | index
  sector TEXT,
  industry TEXT,
  market_cap_category TEXT, -- large | mid | small
  active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily + intraday OHLCV bars for equities
CREATE TABLE IF NOT EXISTS equity_bars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  bar_date DATE NOT NULL,
  timeframe TEXT NOT NULL DEFAULT 'day', -- day | 1h | 15m
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume BIGINT NOT NULL,
  vwap NUMERIC,
  -- Computed indicators (populated by indicator service)
  rsi_14 NUMERIC,
  stoch_k NUMERIC,
  williams_r NUMERIC,
  sma_20 NUMERIC,
  volume_ratio NUMERIC, -- current volume / 20-day avg volume
  atr_14 NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, bar_date, timeframe)
);

CREATE INDEX idx_equity_bars_symbol_date ON equity_bars(symbol, bar_date DESC);
CREATE INDEX idx_equity_bars_rsi ON equity_bars(rsi_14) WHERE bar_date > CURRENT_DATE - 30;

-- Polymarket prediction markets
CREATE TABLE IF NOT EXISTS polymarket_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poly_market_id TEXT NOT NULL UNIQUE,
  slug TEXT,
  title TEXT NOT NULL,
  category TEXT,
  yes_price NUMERIC,
  no_price NUMERIC,
  liquidity NUMERIC,
  spread NUMERIC,
  volume_24h NUMERIC,
  resolution_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active', -- active | resolved | paused
  outcome TEXT, -- null until resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_polymarket_status ON polymarket_markets(status);
CREATE INDEX idx_polymarket_liquidity ON polymarket_markets(liquidity DESC);

-- Live price ticks for Polymarket (WebSocket feed)
CREATE TABLE IF NOT EXISTS polymarket_ticks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES polymarket_markets(id) ON DELETE CASCADE,
  poly_market_id TEXT NOT NULL,
  yes_price NUMERIC NOT NULL,
  no_price NUMERIC NOT NULL,
  spread NUMERIC,
  liquidity NUMERIC,
  tick_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_polymarket_ticks_market ON polymarket_ticks(market_id, tick_time DESC);

-- Detected signal events (SEPARATE from trades)
CREATE TABLE IF NOT EXISTS signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  asset_id UUID REFERENCES assets(id),
  poly_market_id UUID REFERENCES polymarket_markets(id),
  market_type TEXT NOT NULL, -- equity | polymarket
  signal_type TEXT NOT NULL, -- capitulation_reversal | blowoff_exhaustion | probability_edge | momentum_event | liquidity_shift
  -- Raw indicators at time of signal
  rsi NUMERIC,
  stoch_k NUMERIC,
  williams_r NUMERIC,
  volume_ratio NUMERIC,
  vwap_relation TEXT, -- above | below | reclaimed
  nearest_level_type TEXT, -- support | resistance
  nearest_level_price NUMERIC,
  nearest_level_distance_pct NUMERIC,
  reclaim_event TEXT, -- vwap_reclaim | level_reclaim | engulfing | higher_low | null
  -- Polymarket-specific
  poly_current_price NUMERIC,
  poly_ai_fair_value NUMERIC,
  poly_edge NUMERIC,
  poly_direction TEXT, -- YES | NO
  -- Scoring
  raw_score NUMERIC NOT NULL,
  context_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  final_score NUMERIC NOT NULL,
  -- Context state at detection
  macro_regime TEXT, -- risk_on | neutral | cautious | stress
  sector_state TEXT, -- stabilizing | neutral | declining
  earnings_proximity_days INTEGER,
  -- Full signal packet as JSON
  signal_json JSONB,
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- active | stale | actioned | expired
  expires_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signal_events_detected ON signal_events(detected_at DESC);
CREATE INDEX idx_signal_events_score ON signal_events(final_score DESC) WHERE status = 'active';
CREATE INDEX idx_signal_events_type ON signal_events(signal_type, market_type);

-- AI analysis outputs per signal
CREATE TABLE IF NOT EXISTS analysis_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,
  thesis TEXT,
  counter_thesis TEXT,
  confirms TEXT,
  invalidates TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
  uncertainty_reason TEXT,
  missing_data TEXT,
  what_would_change TEXT,
  expected_horizon TEXT,
  -- Source timestamps as JSON: { polygon: "...", fred: "...", news: "..." }
  source_timestamps JSONB,
  -- Full AI output
  ai_output_json JSONB,
  model_used TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scoring breakdown per signal
CREATE TABLE IF NOT EXISTS setup_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,
  stretch_score NUMERIC,
  volume_score NUMERIC,
  level_score NUMERIC,
  reclaim_score NUMERIC,
  sector_context_score NUMERIC,
  macro_context_score NUMERIC,
  earnings_penalty NUMERIC,
  raw_score NUMERIC NOT NULL,
  context_multiplier NUMERIC NOT NULL,
  final_score NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paper trades (simulated, no real money)
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_event_id UUID REFERENCES signal_events(id),
  trade_type TEXT NOT NULL DEFAULT 'paper', -- paper | real
  market_type TEXT NOT NULL, -- equity | polymarket
  symbol TEXT,
  poly_market_id TEXT,
  direction TEXT NOT NULL, -- long | short | yes | no
  entry_price NUMERIC NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  stop_level NUMERIC,
  target_level NUMERIC,
  size_pct NUMERIC, -- % of portfolio
  exit_price NUMERIC,
  exit_time TIMESTAMPTZ,
  exit_reason TEXT, -- target_hit | stop_hit | stale_thesis | manual | expired
  result_pct NUMERIC,
  outcome TEXT, -- win | loss | scratch | open
  post_mortem_tag TEXT, -- signal_correct | timing_wrong | thesis_wrong | execution_error | external_shock
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_paper_trades_outcome ON paper_trades(outcome) WHERE outcome IS NOT NULL;

-- Scott's manual trade decisions (whether he acted on a signal or not)
CREATE TABLE IF NOT EXISTS manual_trade_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_event_id UUID NOT NULL REFERENCES signal_events(id),
  decision TEXT NOT NULL, -- entered | passed | watching
  entry_price NUMERIC,
  entry_time TIMESTAMPTZ,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full journal entries (signal + decision + outcome in one record)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_event_id UUID NOT NULL REFERENCES signal_events(id),
  paper_trade_id UUID REFERENCES paper_trades(id),
  manual_decision_id UUID REFERENCES manual_trade_decisions(id),
  -- Snapshot of signal at time of entry
  signal_snapshot JSONB NOT NULL,
  analysis_snapshot JSONB,
  -- Outcome
  outcome TEXT, -- win | loss | scratch | open | passed
  result_pct NUMERIC,
  hold_days INTEGER,
  post_mortem_tag TEXT,
  notes TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily macro regime snapshots
CREATE TABLE IF NOT EXISTS macro_regime_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  -- Raw values
  vix NUMERIC,
  spy_close NUMERIC,
  spy_sma_20 NUMERIC,
  spy_trend TEXT, -- positive | flat | negative
  yield_spread_10y2y NUMERIC,
  -- Computed regime
  regime TEXT NOT NULL, -- risk_on | neutral | cautious | stress
  regime_multiplier NUMERIC NOT NULL,
  -- Sector ETF closes
  sector_etf_json JSONB,
  -- Notes
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System events (errors, alerts, feed issues)
CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- data_stale | feed_error | signal_engine_error | high_correlation | drawdown_warning | macro_shift
  severity TEXT NOT NULL DEFAULT 'info', -- info | warning | critical
  source TEXT, -- polygon | polymarket | fred | signal_engine | etc
  message TEXT NOT NULL,
  details JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_events_unresolved ON system_events(created_at DESC) WHERE resolved = false;

-- Support/resistance levels (pre-computed)
CREATE TABLE IF NOT EXISTS support_resistance_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  level_type TEXT NOT NULL, -- support | resistance
  price NUMERIC NOT NULL,
  strength INTEGER NOT NULL DEFAULT 1, -- number of times tested
  first_tested DATE,
  last_tested DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, level_type, price)
);

CREATE INDEX idx_sr_levels_symbol ON support_resistance_levels(symbol, level_type) WHERE active = true;
