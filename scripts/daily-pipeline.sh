#!/bin/bash
# Trading Intelligence — Daily Pipeline
# Runs weekdays at 6 AM UTC (1 AM ET)
# Free tier: always fetches PRIOR trading day data

set -e

REPO="/root/repos/trading-intelligence/packages/backend"
LOG_DIR="/var/log/trading-intelligence"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$TODAY.log"

mkdir -p "$LOG_DIR"

echo "========================================" | tee -a "$LOG_FILE"
echo "Trading pipeline starting: $(date)" | tee -a "$LOG_FILE"
echo "Note: services will fetch PRIOR trading day (Polygon free tier)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

cd "$REPO"

echo "[1/7] Ingestion..." | tee -a "$LOG_FILE"
npx ts-node --transpile-only src/services/ingestion.ts 2>&1 | tee -a "$LOG_FILE"

echo "[2/7] Indicators..." | tee -a "$LOG_FILE"
npx ts-node --transpile-only src/services/indicators.ts 2>&1 | tee -a "$LOG_FILE"

echo "[3/7] Support/Resistance..." | tee -a "$LOG_FILE"
npx ts-node --transpile-only src/services/supportResistance.ts 2>&1 | tee -a "$LOG_FILE"

echo "[4/7] Macro Regime..." | tee -a "$LOG_FILE"
npx ts-node --transpile-only src/services/macroRegime.ts 2>&1 | tee -a "$LOG_FILE"

echo "[5/7] Signal Detection (equities)..." | tee -a "$LOG_FILE"
npx ts-node --transpile-only src/services/signalEngine.ts 2>&1 | tee -a "$LOG_FILE"

echo "[6/7] Polymarket..." | tee -a "$LOG_FILE"
npx ts-node --transpile-only src/services/polymarket.ts 2>&1 | tee -a "$LOG_FILE"

echo "[7/7] AI Analysis..." | tee -a "$LOG_FILE"
npx ts-node --transpile-only src/services/aiAnalysis.ts 2>&1 | tee -a "$LOG_FILE"

echo "========================================" | tee -a "$LOG_FILE"
echo "Pipeline complete: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
