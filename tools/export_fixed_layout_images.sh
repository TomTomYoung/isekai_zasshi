#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "node command not found. Install Node.js first." >&2
  exit 1
fi

if [ ! -d node_modules/playwright ]; then
  npm install
fi

npx playwright install chromium
node tools/export_fixed_layout_images.mjs
