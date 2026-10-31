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

**Проверка сервера без клиента:** при `npm run dev` откройте `http://localhost:3000/dev/` — вход, роли, сцены, чат и карта сверху (WASD), подгрузка чанков и счётчик «% мира». Каждая вкладка — отдельный игрок.

## Мир и чанки

Мир генерирует `npm run seed` (`npm run seed -- --map` — ещё и карта острова в консоли); при пустой БД сервер делает это сам при старте. Расстановка — `content/canary_layout.json` и `content/ship_layout.json` (оба — черновики, координаты правим по моделям).

Ответ на `chunk_req` — `{ t: 'chunk', zone, key: 'cx,cz', data }`:

```js
{ zone: 'canary', cx: 7, cz: 8, size: 32, res: 33,
  h: [/* res×res высот: h[iz * res + ix] — точка (cx*size + ix, cz*size + iz) */],
  objects:  [{ id, m, p: [x, y, z], r, s? }],               // статичные: пальмы, дома, камни
  interact: [{ id, m, p, kind, label, item?, state? }],     // kind: well | boat | item | hourglass | ...
  npcs:     [{ id, p, r, label }] }
```

Корабль — один чанк `ship 0,0` с `h: null`. Сервер отдаёт чанки только своей зоны и не дальше 3 чанков от позиции игрока, иначе `chunk_denied { reason: 'too_far' | 'wrong_zone' | 'not_found' | ... }`. В `auth_ok.world`: `totalChunks`, `totalBytes`, `cacheLimit`, `zones`.

## Дополнения к протоколу (сверх docs/README.md §6)

| Сообщение | Поля | Зачем |
|---|---|---|
| `pos_correct` | `p, r` | Сервер отклонил `move` (слишком быстро) — клиент обязан поставить игрока в `p` |
| `trade_state` | `npc, money, goods: [{item, price, sold}]` | При E у торговца и после каждого `trade` — цены и остаток денег |
| `inventory` | `items, money` | У инвентаря есть деньги (мараведи) |
| `quest` | `id, title, status, progress, total, text, shared, optional, count?, need?, options?` | `text` — текущий шаг; `count/need` — счётчик шага («1/2»); `shared` — общее задание роли, которой нет |
| `party` | `+ done: {id: bool}` | Игрок закончил свои обязательные задания сцены (HUD «Юнга ✓») |
| `npc_say` | `+ line?` | id готовой реплики из `content/lines.json` (по нему можно запускать звук события) |
| `scared` | `by, target` | Рассылается всем: напуганный — тот, у кого `target` = он сам, остальные смеются |
| закрытие WS | `4001` / `4002` | Неверный токен / вошли с другой вкладки (не переподключаться) |

Задания — `content/quests.json`, предметы — `content/items.json` (карточки знаний), NPC и цены торговца — `content/npcs.json`. E у объекта: `interact {id}` (для предмета сервер сам сделает `pickup`, у NPC и шлюпки сам отдаст то, что ждёт задание).

## Папки

- `shared/` — протокол и настройки (меняем, договорившись в чате)
- `content/` — данные игры (JSON)
- `client/` — Фронт 1 и Фронт 2
- `server/` — Бэк 1, `server/ai/` — Бэк 2
- `data/` — база и сгенерированное аудио (не в git)
