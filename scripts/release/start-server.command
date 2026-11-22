#!/bin/bash
# «Открытие 1492» — сервер для игры по сети (macOS: двойной клик; Linux: ./start-server.command)
cd "$(dirname "$0")"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  echo "Нужен Node.js 24 или новее: https://nodejs.org  (Node.js 24+ is required)"
  read -n1 -p "Нажмите любую клавишу… "; exit 1
fi
if [ ! -d node_modules ]; then
  echo "Первый запуск: ставлю зависимости (нужен интернет, один раз)…"
  npm install --omit=dev --no-audit --no-fund || { read -n1 -p "Не получилось. Нажмите любую клавишу… "; exit 1; }
fi
HTTPS=1 node server/index.js
