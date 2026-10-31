# server/ai — ИИ-агенты, голос, перевод

Владелец — Бэк 2. ТЗ: [docs/back-2-ai.md](../../docs/back-2-ai.md).

## Подключение к скелету сервера

В `server/package.json` (из скелета Бэка 1) добавить:

```json
"dependencies": { "kokoro-js": "^1.2.1" },
"scripts": {
  "agent-cli": "node ai/cli.js",
  "bench": "node ai/bench.js",
  "tts-test": "node ai/tts-test.js",
  "voices": "node ai/gen-voices.js"
}
```

Пакет должен быть ES-модулем (`"type": "module"`), Node ≥ 24.

## API для Бэка 1

```js
import * as ai from './ai/index.js';

await ai.init();                      // при старте сервера: загрузка агентов, прогрев Qwen и Kokoro

// npc_talk / npc_hint / после trade
const r = await ai.talk({
  userId, npc: 'columbus', text, hintId,
  context: { name, role, scene, inventory, questsDone, log },
  tradeResult,                        // только для торговца: { item, offer, outcome: 'sold'|'counter'|'angry', price }
});
// r = { en, ru, audio, hints: [{id, ru}], topicsTold: ['why_west'], timings }

await ai.status();                    // { ollama, tts, model } для /api/health

// Память агентов в SQLite вместо JSON-файла (таблица agent_memory)
ai.setStore({
  load: (userId, agentId) => /* { told: [...], history: [...] } | undefined */,
  save: (userId, agentId, mem) => { /* upsert, told и history — JSON */ },
});
```

- `audio` — URL вида `/audio/rt/<файл>.wav`: сервер раздаёт папку `data/audio/rt/` по этому пути.
- Пустой `text` без `hintId` при первом обращении — приветствие из файла агента.
- Если Ollama не ответила за 10 с, вернётся запасная фраза агента, ошибки наружу не летят.

## Команды

| Команда | Что делает |
|---|---|
| `npm run agent-cli -- columbus` | Разговор с агентом в терминале. `/log latitude_correct` — действие игрока, `/hint why_west`, `/reset`, `/quit`. `--no-tts` — без голоса |
| `npm run bench -- qwen3:4b qwen2.5:3b` | Замер скорости и качества моделей |
| `npm run tts-test` | Список голосов Kokoro и пробные фразы в `data/audio/test/` |
| `npm run voices` | Озвучить готовые реплики `content/lines.json` → `client/public/audio/vo/` + `manifest.json` |

Переменные: `AI_MODEL` (по умолчанию `qwen3:4b`), `OLLAMA_URL`, `TTS=0` — выключить голос.

## Файлы

| Файл | |
|---|---|
| `index.js` | `talk`, `init`, `status`, `setStore` |
| `llm.js` | Клиент Ollama, очередь запросов с приоритетами, таймауты |
| `retrieval.js` | Поиск карточек фактов по ключевым словам (русские окончания) |
| `memory.js` | Что агент уже рассказал игроку, последние реплики |
| `prompt.js` | Сборка промпта, чистка ответа |
| `translate.js` | Перевод ответа на русский |
| `tts.js` | Kokoro: синтез речи в WAV |
| `agents.js` | Загрузка `content/agents/*.json` |
