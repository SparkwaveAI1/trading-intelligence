#!/bin/bash
# Trading Intelligence — Daily Pipeline
# Runs weekdays after market close: ingest → indicators → S/R → macro → signals
# Cron: 30 21 * * 1-5 (9:30 PM UTC = 5:30 PM ET)

set -e

REPO="/root/repos/trading-intelligence/packages/backend"
LOG_DIR="/var/log/trading-intelligence"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$DATE.log"

mkdir -p "$LOG_DIR"

echo "========================================" | tee -a "$LOG_FILE"
echo "Trading pipeline starting: $(date)" | tee -a "$LOG_FILE"
# Wait 15 min after market close for EOD data to settle on Polygon free tier
echo "Waiting 15 minutes for EOD data to settle..." | tee -a "$LOG_FILE"
sleep 900
echo "Date: $DATE" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

cd "$REPO"

echo "[1/5] Ingestion..." | tee -a "$LOG_FILE"
npx ts-node src/services/ingestion.ts "$DATE" 2>&1 | tee -a "$LOG_FILE"

echo "[2/5] Indicators..." | tee -a "$LOG_FILE"
npx ts-node src/services/indicators.ts "$DATE" 2>&1 | tee -a "$LOG_FILE"

echo "[3/5] Support/Resistance..." | tee -a "$LOG_FILE"
npx ts-node src/services/supportResistance.ts "$DATE" 2>&1 | tee -a "$LOG_FILE"

echo "[4/5] Macro Regime..." | tee -a "$LOG_FILE"
npx ts-node src/services/macroRegime.ts "$DATE" 2>&1 | tee -a "$LOG_FILE"

echo "[5/5] Signal Detection (equities)..." | tee -a "$LOG_FILE"
npx ts-node src/services/signalEngine.ts "$DATE" 2>&1 | tee -a "$LOG_FILE"

echo "[6/7] Polymarket..." | tee -a "$LOG_FILE"
npx ts-node src/services/polymarket.ts 2>&1 | tee -a "$LOG_FILE"

echo "[7/7] AI Analysis..." | tee -a "$LOG_FILE"
npx ts-node src/services/aiAnalysis.ts 2>&1 | tee -a "$LOG_FILE"

echo "========================================" | tee -a "$LOG_FILE"
echo "Pipeline complete: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
