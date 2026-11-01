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
| `npm run start:demo` | Сборка + сервер с короткими сценами (`DEMO=1`) по **HTTPS** |
| `npm run start:https` | Сервер по HTTPS без демо-режима |
| `npm run dev:https` | Как `npm run dev`, но сервер по HTTPS/WSS (Vite проксирует туда) |
| `npm run cert` | Создать/проверить сертификаты для HTTPS (делается и само при первом запуске с HTTPS) |
| `npm run reset` | Сбросить сцену и прогресс (пользователи остаются). Сервер должен быть остановлен |
| `npm run smoke` | Проверка сервера тремя ботами (сервер запущен через `npm run dev`) |

Dev-команды в чате (только `DEV=1`): `/scene <id>`, `/reset`, `/give <item>`, `/done`.

**Проверка сервера без клиента:** при `npm run dev` откройте `http://localhost:3000/dev/` — вход, роли, сцены, чат и карта сверху (WASD), подгрузка чанков и счётчик «% мира». Каждая вкладка — отдельный игрок.

## Запуск на защите (LAN, без интернета)

1. **Заранее, пока есть интернет:** `npm install`, `npm run build` — проверить, что собирается.
2. **Mac-сервер:** в роутере закрепить за ним IP (DHCP reservation). macOS: Системные настройки → Сеть → Брандмауэр → разрешить входящие для `node` (или выключить брандмауэр на время защиты).
3. `npm run reset` (сервер остановлен) — чистый прогон, пользователи остаются.
4. `npm run start:demo` — сборка клиента и сервер с короткими сценами по HTTPS. В консоли адрес `https://…` с пометкой «← открыть на других ноутбуках».
5. На трёх ноутбуках в Chrome открыть этот адрес (сертификат установлен заранее — раздел HTTPS ниже). Проверка: `https://<IP>:3000/api/health` → `players`, `ollama`, `tts`.
6. Между прогонами: остановить сервер, `npm run reset`, снова `npm run start:demo`.

Если вкладку закрыли посреди сцены — просто открыть заново: игрок вернётся туда же с тем же инвентарём и заданиями (если сцена успела смениться — в точку появления новой сцены).

## HTTPS

Без HTTPS пароль при входе идёт по Wi-Fi открытым текстом. Интернета и домена на защите нет, поэтому сертификат выпускает свой маленький центр сертификации (`server/tls.js`):

- `data/certs/ca.crt` (+ `ca.key`) — «1492 LAN CA», создаётся один раз на 10 лет. **Его ставят на ноутбуки.** `ca.key` никуда не копировать.
- `data/certs/cert.pem` (+ `key.pem`) — сертификат сервера на `localhost`, имя компьютера и все его IP. Если IP сменился, сервер перевыпустит его сам при старте; CA остаётся прежним, на ноутбуках ничего менять не нужно.
- Всё это лежит в `data/` и в git не попадает. Удалите `data/certs` — появится новый CA, и его придётся ставить заново.

Сервер с `HTTPS=1` (`npm run start:demo`, `start:https`, `dev:https`) слушает тот же порт 3000: `https://` и `wss://`, а `http://` перенаправляет на `https://`. Клиент сам выбирает `wss://` на странице `https://`.

**Один раз на каждом компьютере** (на Mac-сервере тоже, если играете с него) установить `ca.crt` как доверенный корневой сертификат. Файл: `data/certs/ca.crt` на сервере или скачать `https://<IP сервера>:3000/ca.crt` (Chrome сначала предупредит — «Дополнительные» → «Перейти»). Сверьте отпечаток с тем, что печатает `npm run cert`.

| ОС | Как установить |
|---|---|
| macOS | Двойной клик по `ca.crt` → Связка ключей «вход» → двойной клик по «1492 LAN CA» → «Доверие» → «Всегда доверять». Или `security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db data/certs/ca.crt` |
| Windows | Двойной клик по `1492-lan-ca.crt` → «Установить сертификат» → «Текущий пользователь» → «Поместить все сертификаты в следующее хранилище» → «Доверенные корневые центры сертификации» → «Готово» → «Да» |
| Linux (Chrome) | `chrome://certificate-manager` → «Локальные сертификаты» → «Установленные вами» → «Импортировать» (в старых версиях: `chrome://settings/certificates` → «Центры сертификации» → «Импорт» → «Доверять при идентификации сайтов») |

После установки перезапустить Chrome: у адреса `https://<IP>:3000` — замок, без предупреждений. Если поставить не успели, Chrome покажет предупреждение — «Дополнительные» → «Перейти на сайт»: игра и WebSocket работают, просто без замка.

Проверка из терминала: `npm run smoke` с `SERVER=https://localhost:3000` (тест доверяет `data/certs/ca.crt` и проверяет сертификат по-настоящему). `curl` на Windows: добавить `--ssl-no-revoke` (Schannel требует CRL, которого у локального CA нет).

## Мир и чанки

Мир генерирует `npm run seed` (`npm run seed -- --map` — ещё и карта острова в консоли); сервер делает это сам при старте, если БД пуста или изменился `content/canary_layout.json` / `content/ship_layout.json`.

**Корабль (`ship_layout.json`, ведёт Фронт 1)** отдаётся в чанке `ship 0,0` целиком, со всеми полями. Из него сервер берёт:
- `spawns` — точки появления: `{ grumete: P, piloto: P, lengua: P }` для всех игровых сцен на корабле или `{ ship_day: {…}, ship_evening: {…} }` по сценам;
- `seats` — места у фонаря в `night_story`: `[P, P, P]`.

Точка `P` — `[x, y, z]` или `{ p: [x, y, z], r }`, `r` — поворот как у камеры (0 — лицом к носу). Если полей нет — точки из `content/scenes.json`. id в `interact`/`npcs` должны совпадать с `content/quests.json`: `hourglass`, `astrolabe`, `compass`, `map`, `sword`, `espingarda`, `wine`, `wine_barrel`, `cards`, `dance`, `lantern`, `columbus`, `storyteller`, …

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
| `scene` | `+ type, duration, r?` | `r` — куда смотреть после появления в `spawn`/`seat` |
| `npc_say` | `+ line?, duration?` | id готовой реплики из `content/lines.json` (по нему можно запускать звук события), длительность из манифеста озвучки |
| `scared` | `by, target` | Рассылается всем: напуганный — тот, у кого `target` = он сам, остальные смеются |
| `entity` | `+ paused: {at, offset, face}` | NPC с маршрутом (Колумб) стоит, пока с ним говорят: время маршрута замерло на `at`, `offset` — сколько он простоял всего, `face` — [x, z] собеседника (`shared/npc-activity.js`) |
| `ping` → `pong` | `ts` → `ts, serverNow` | Раз в 2 с; задержка = сейчас − `ts` (`client/src/net/telemetry.js`) |
| `client_stats` | `fps, ping, calls, chunks, pct, mem` | Раз в 2 с, для админки; сервер хранит 60 последних на игрока |
| `world_event` | `type, who, p` | Сервер рассылает игрокам зоны: `talk` (чат, вопрос NPC), `eat`, `drink`, `swing` (предмет), `run` (раз в 3 с), `scare`, `dance` — для реагирующих NPC (`server/game/world-events.js`) |
| `minigame astrolabe` | `result: {variant, angle, answer}` | Вариант — день пути из `shared/astrolabe.js`, широту считает сервер |
| закрытие WS | `4001` / `4002` / `4004` | Неверный токен / вошли с другой вкладки / отключил администратор (не переподключаться) |

Задания — `content/quests.json`, предметы — `content/items.json` (карточки знаний), NPC и цены торговца — `content/npcs.json`. E у объекта: `interact {id}` (для предмета сервер сам сделает `pickup`, у NPC и шлюпки сам отдаст то, что ждёт задание).

## Админ-панель

`/admin` — метрики клиентов (fps, ping, draw calls, чанки, память) и сервера (процессор, память, такт, сообщения, чанки), «Вселенная» (сцена, время суток, длительности, правка `scenes.json` и раскладок с проверкой и применением без перезапуска) и управление (сцена, сброс, выгнать, объявление). Код — `server/admin/`, `client/admin.html`, `client/src/admin/`.

- Включается переменной `ADMIN_TOKEN` (от 12 символов). Без неё API выключен.
- Только HTTPS (`npm run start:https`). Под `DEV=1` разрешён ещё http с этого же компьютера.

```powershell
$env:ADMIN_TOKEN = "длинный-случайный-токен"; npm run start:https     # Windows (PowerShell)
```
```bash
ADMIN_TOKEN=длинный-случайный-токен npm run start:https               # macOS
```

Открыть `https://<IP>:3000/admin` и ввести токен. Прежние версии правленых файлов — в `data/admin/backup/`. Под `npm run dev` сервер после «Применить» ещё и перезапустится (следит за `content/`). `npm run smoke` с `ADMIN_TOKEN` проверяет и API админки.

## Папки

- `shared/` — протокол и настройки (меняем, договорившись в чате)
- `content/` — данные игры (JSON)
- `client/` — Фронт 1 и Фронт 2
- `server/` — Бэк 1, `server/ai/` — Бэк 2
- `data/` — база и сгенерированное аудио (не в git)
