@echo off
rem «Открытие 1492» — сервер для игры по сети (Windows: двойной клик)
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Нужен Node.js 24 или новее: https://nodejs.org & pause & exit /b 1)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 24 (echo Нужен Node.js 24 или новее, сейчас %NODE_MAJOR%: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Первый запуск: ставлю зависимости, нужен интернет, один раз...
  call npm install --omit=dev --no-audit --no-fund || (pause & exit /b 1)
)
set HTTPS=1
node server\index.js
pause
