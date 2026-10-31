# discovery

«1492» — многопользовательская браузерная игра на three.js. ТЗ — в [docs/README.md](docs/README.md).

## Запуск

Нужен Node.js 24+.

```bash
npm install
npm run dev        # сервер :3000 (DEV=1) + Vite :5173, открыть http://localhost:5173
```

| Команда | Что делает |
|---|---|
| `npm run dev` | Сервер с автоперезапуском и dev-командами в чате + Vite с прокси `/api`, `/ws`, `/audio/rt` |
| `npm run build` | Сборка клиента в `client/dist` |
| `npm start` | Сервер отдаёт собранный клиент на `http://<LAN-IP>:3000` |
| `npm run start:demo` | Сборка + сервер с короткими сценами (`DEMO=1`) |
| `npm run reset` | Сбросить сцену и прогресс (пользователи остаются). Сервер должен быть остановлен |
| `npm run smoke` | Проверка сервера тремя ботами (сервер запущен через `npm run dev`) |

Dev-команды в чате (только `DEV=1`): `/scene <id>`, `/reset`, `/give <item>`, `/done`.

## Папки

- `shared/` — протокол и настройки (меняем, договорившись в чате)
- `content/` — данные игры (JSON)
- `client/` — Фронт 1 и Фронт 2
- `server/` — Бэк 1, `server/ai/` — Бэк 2
- `data/` — база и сгенерированное аудио (не в git)
