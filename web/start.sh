#!/bin/bash
CTRLR_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a
source "$CTRLR_DIR/.env.local"
set +a
export CTRLR_ENV_PATH="$CTRLR_DIR/.env.local"
export PATH="/home/gh05t/.nvm/versions/node/v20.20.2/bin:$PATH"
exec node "$CTRLR_DIR/.next/standalone/server.js"
