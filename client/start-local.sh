#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null; then
  runtime="$PWD/../../work/runtime/node-v24.11.0-linux-x64/bin"
  if [ ! -x "$runtime/node" ]; then
    echo 'Нужен Node.js 24+. После установки: npm install && npm run dev'
    exit 1
  fi
  export PATH="$runtime:$PATH"
fi
npm run dev
