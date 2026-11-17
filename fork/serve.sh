#!/usr/bin/env bash
# Runs the Alloy server from this checkout, apart from the T3 app.
# Data lives in ~/.alloy (never ~/.t3). Port 3873; T3 uses 3773.
# --lan lets your phone reach it on Wi-Fi or Tailscale.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node apps/server/src/bin.ts serve \
  --base-dir "${ALLOY_HOME:-$HOME/.alloy}" \
  --port "${ALLOY_PORT:-3873}" \
  --lan --no-browser "$@"
