#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export BACKEND_URL="${BACKEND_URL:-http://localhost:8001/api}"
export PRINTER_NAME="${PRINTER_NAME:-}"
export PRINT_AGENT_PORT="${PRINT_AGENT_PORT:-9100}"

echo "=========================================================="
echo " Agente de Impressao Zebra - NVS macOS"
echo "----------------------------------------------------------"
echo " Backend: $BACKEND_URL"
echo " Porta  : $PRINT_AGENT_PORT"
echo " Printer: ${PRINTER_NAME:-auto/CUPS}"
echo "=========================================================="
echo

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[ERRO] Ambiente virtual nao encontrado. Rode ./setup_print_agent.sh"
  exit 1
fi

exec ".venv/bin/python" agent.py
