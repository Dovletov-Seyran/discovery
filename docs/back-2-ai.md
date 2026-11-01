# Бэк 2 — ИИ-агенты, голос, перевод, контент

**Зона ответственности:** `server/ai/`, `scripts/gen-voices.js`, `content/` (агенты, реплики, интро, ночная история; задания и предметы — вместе с Бэком 1).
**Общие документы:** [README.md](README.md), [content-part1.md](content-part1.md).

**Цель:** Колумб, Старый Хуан и Торговец отвечают в образе по-английски голосом, внизу русский перевод, помнят игрока и не повторяются. Всё офлайн на Mac M3 8 ГБ.

---

## B2.1 Установка и замеры (0–1,5 ч) — делать первым

```bash
ollama pull qwen3:4b-instruct
```

Переменные Ollama на сервере: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_KEEP_ALIVE=-1` (модель всегда в памяти).

**Замерить** на 5 одинаковых диалогах (вопрос по-русски, ответ по-английски, 2–3 предложения):
- скорость (токенов/с) и время до полного ответа;
- качество: понял ли русский вопрос, держит ли роль, не выдумывает ли;
- память (Монитор активности) вместе с запущенным Kokoro.

> **Важно:** в Ollama тег `qwen3:4b` — «думающая» версия (Qwen3-4B-Thinking-2507), рассуждения у неё не отключаются, и ответ занимает 10–20 с. Нужен именно `qwen3:4b-instruct` (Qwen3-4B-Instruct-2507).

Выбрать модель: **цель — ответ ≤ 3 с, перевод ≤ 2 с.** Основная — `qwen3:4b-instruct`, запасная — `qwen2.5:3b`. Модель `7b/8b` можно попробовать, только если после всех замеров остаётся ≥ 1,5 ГБ свободной памяти.

**Kokoro:**
```bash
npm i kokoro-js -w server
```
```js
import { KokoroTTS } from 'kokoro-js';
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' });
const audio = await tts.generate('West, always west.', { voice: 'bm_george' });
await audio.save('data/audio/test.wav');
```
- Вывести список голосов (`tts.list_voices()`) и выбрать по одному на NPC (предложения — в content-part1.md §3).
- **Офлайн-проверка:** выключить Wi-Fi, перезапустить, сгенерировать фразу. Если модель пытается качаться из сети — положить файлы модели в `data/models/` и указать локальный путь через `env` из `@huggingface/transformers` (`allowRemoteModels = false`, `localModelPath`).

**Готово, когда:** есть таблица замеров, выбрана модель и голоса, обе части работают без интернета.

## B2.2 Клиент LLM (`server/ai/llm.js`)

```js
POST http://127.0.0.1:11434/api/chat
{ model, messages, stream: false, think: false, keep_alive: -1,
  options: { temperature: 0.7, num_predict: 140, num_ctx: 2048 } }
```
- `think: false` — для моделей с режимом рассуждений (Qwen3), иначе будет долго.
- **Очередь:** один запрос к Ollama за раз, остальные ждут. Приоритет — ответы NPC выше переводов.
- Таймаут 10 с → запасная фраза агента (`fallbacks`).
- Прогрев при старте сервера: один короткий запрос, чтобы модель загрузилась до прихода игроков.

## B2.3 Файл агента (`content/agents/columbus.json`)

```json
{
  "id": "columbus",
  "name": "Admiral Christopher Columbus",
  "voice": "am_michael",
  "persona": "A proud, stubborn Genoese navigator, 41 years old, convinced he will reach Asia by sailing west. Pious, ambitious, a little secretive. Speaks with authority, uses sea imagery.",
  "style": ["short sentences", "addresses the player by role: 'boy', 'pilot', 'interpreter'", "never admits doubt in public"],
  "rules": [
    "It is August 1492. You know nothing that happened later.",
    "You believe you are sailing to the Indies (Asia), not to a new continent.",
    "Never mention telescopes, potatoes or the word 'America'."
  ],
  "greeting": { "en": "Ah, my interpreter. Speak, but be quick, the wind waits for no one.", "ru": "А, мой переводчик. Говори, но быстро — ветер никого не ждёт." },
  "cards": [
    { "id": "why_west", "topic": "goal",
      "kw": ["зачем", "цель", "куда", "плывём", "индия", "азия", "хан", "запад", "why", "where"],
      "fact": "He sails west to reach the Indies, Cathay and Cipangu (Japan) by sea, to bring back gold and spices and to meet the Great Khan.",
      "hint": "Куда и зачем мы плывём?" },
    { "id": "reward", "topic": "deal",
      "kw": ["награда", "титул", "король", "королева", "изабелла", "договор", "получишь", "reward"],
      "fact": "By the Capitulations of Santa Fe (April 1492) he will become Admiral of the Ocean Sea, Viceroy and Governor of the lands he finds, and keep one tenth of their riches.",
      "hint": "Что тебе обещали короли?" },
    { "id": "distance", "topic": "distance",
      "kw": ["сколько", "далеко", "расстояние", "дней", "километр", "лиг", "долго", "far", "long"],
      "fact": "He calculated about 750 leagues (roughly 4,400 km) from the Canaries to Cipangu. Most scholars said the Earth was far larger; he thinks they are wrong.",
      "hint": "Сколько нам плыть?" },
    { "id": "years_waiting", "topic": "past",
      "kw": ["португалия", "ждал", "отказ", "годы", "генуя", "откуда"],
      "fact": "He is from Genoa, sailed with the Portuguese, and spent about seven years asking the Spanish monarchs for ships. They agreed after Granada fell in January 1492.",
      "hint": "Как тебе дали корабли?" }
  ],
  "reactions": {
    "latitude_correct": "Praise the pilot for measuring the latitude correctly with the astrolabe.",
    "rudder_fixed": "Thank the player for helping repair the Pinta's rudder.",
    "traded_hard": "Joke that the player bargains like a Genoese merchant."
  },
  "fallbacks": [
    { "en": "Not now. Watch the sails.", "ru": "Не сейчас. Следи за парусами." },
    { "en": "Ask me later, when the sea is calmer.", "ru": "Спроси позже, когда море успокоится." }
  ]
}
```

Те же поля у `storyteller.json` (байки, Море Мрака, Сан-Борондон, жизнь моряка, страхи) и `trader.json` (Ла-Гомера, товары, цены, местные легенды, его хитрость). **На агента — 5–8 карточек.**

## B2.4 Поиск фактов (`server/ai/retrieval.js`)

Без эмбеддингов, быстро и предсказуемо:
1. Текст игрока → нижний регистр, только буквы, слова длиннее 2 символов.
2. Грубая основа: первые 5 букв слова (`плывём` → `плывё`, `плыть` → `плыть` — достаточно для совпадения по `kw`, у которых тоже берём 5 букв).
3. Счёт карточки = число совпавших основ. Берём до 2 карточек со счётом > 0.
4. Нажата кнопка-подсказка → берём её карточку напрямую.
5. Ничего не нашлось → разговор в образе + мягко подвести к ещё **не рассказанной** теме.

## B2.5 Память агента (`server/ai/memory.js`)

Хранится в `agent_memory` (функции даёт Бэк 1):
- `told` — id карточек, которые этот агент уже рассказал **этому** игроку;
- `history` — последние 6 реплик (3 обмена);
- из `player_state.log` — что игрок сделал в игре (коды → `reactions` агента).

**«Не повторяться»:** карточки из `told` попадают в промпт с пометкой `ALREADY TOLD`: агент должен сослаться коротко («As I told you…») и добавить новую деталь или перевести разговор. Это и есть адаптация, которую покажем на защите.

**`topicsTold`** (для заданий): id карточек, которые впервые попали в промпт как новые на этом ходе.

## B2.6 Промпт

```
SYSTEM:
You are {name}. {persona}
Style: {style}.
Rules: {rules}
Always answer in English, 1–3 short sentences, in character. No stage directions, no emojis, no lists.
The player may write in Russian; understand it, but answer in English.

You are talking to {player.name}, the {role} on your ship.
What they did today: {log → reactions, 0–2 lines}

Facts you may use now (NEW — tell them naturally):
- {fact}
Facts you ALREADY TOLD this player (do not repeat; refer briefly if relevant):
- {fact}
{tradeResult → "You just agreed to sell cheese for 32 maravedis. React to the deal."}

[history: последние 6 реплик как messages user/assistant]
USER: {текст игрока}
```

**Постобработка:** убрать `*…*`, кавычки, эмодзи; обрезать до 3 предложений; если пусто — запасная фраза.

## B2.7 Перевод (`server/ai/translate.js`)

Отдельный короткий запрос к той же модели (`temperature: 0.2`, `num_predict: 200`):

```
SYSTEM: Translate the user's text into natural Russian. Keep names. Slightly old-fashioned tone. Output only the translation.
USER: {en}
```

Запускается **параллельно с TTS** (TTS на CPU, LLM на GPU — не мешают друг другу).

## B2.8 Голос в реальном времени (`server/ai/tts.js`)

- Kokoro загружается один раз при старте сервера и прогревается.
- `speak(text, voice) → '/audio/rt/<npc>_<ts>.wav'`; файлы в `data/audio/rt/`, Бэк 1 отдаёт папку как статику `/audio/rt/`.
- Удалять файлы старше 10 минут.
- Перед синтезом: те же чистки текста; «1492» оставить цифрами (Kokoro читает нормально — проверить).

**Итоговый конвейер одного ответа:**
```
npc_talk → retrieval → LLM (en) ─┬─ TTS (wav)  ─┐
                                 └─ LLM (ru)   ─┴→ npc_say {en, ru, audio, hints}
```
Цель — ≤ 4 с от вопроса до ответа. Логировать время каждого этапа.

## B2.9 Подсказки

`hints` = до 3 поля `hint` из карточек, которые **ещё не рассказаны**. Без LLM. Когда всё рассказано — подсказки «Расскажи ещё что-нибудь» и «Прощай».

## B2.10 Торговец

Цену решает код Бэка 1, ты получаешь `tradeResult`: `{item, offer, outcome: "sold"|"counter"|"angry", price}`. Задача LLM — одна реплика в образе (торгуется, ворчит, хвалит). Подсказки торговца: «Предложить 25», «Предложить 30», «Сколько стоит сыр?».

## B2.11 Готовые реплики (`content/lines.json` + `scripts/gen-voices.js`)

```json
{ "id": "boatswain_hint_hourglass", "npc": "boatswain", "en": "Boy! The sand's run out, turn the glass!", "ru": "Юнга! Песок кончился, переверни часы!" }
```

- Скрипт генерирует `client/public/audio/vo/<id>.wav` для всех строк (голос — из `npcs.json`). Если есть `ffmpeg`, конвертировать в `.ogg` — файлы в ~10 раз меньше.
- Список (≈ 70 строк):
  - интро: 6 фрагментов (`narrator`);
  - боцман: подсказки по заданиям, ~8;
  - кок, матросы: по 2–3 фразы, ~12;
  - событие руля «Пинты»: боцман + Колумб, 3;
  - плотник, Беатрис, жители (легенды о земле на западе и Сан-Борондоне): ~12;
  - праздник: тосты, крики, ~6;
  - ночная история: 8–10 фрагментов (`storyteller`, медленнее и тише — попробовать `speed: 0.9`);
  - сон и титры: 2.
- `ru` из этого файла — субтитры. Тайминги субтитров = длительность аудиофайла (фронт читает её сам).

## B2.12 Ограничения и защита от «поломки» агента

- Вопросы о будущем («Что будет в Америке?») → агент не знает, отвечает из 1492 года.
- Попытки вывести из роли, грубость → короткий уход в образе («Mind your tongue, sailor»).
- Только английский в ответе; если модель ответила по-русски или по-китайски — один повтор запроса, затем запасная фраза.
- Ответ длиннее 3 предложений обрезается.

## B2.13 Инструменты

- `npm run agent-cli columbus` — диалог из терминала (без игры): показывает выбранные карточки, промпт, время этапов.
- `status()` для `/api/health`: `{ ollama: true, tts: true, model: "qwen3:4b-instruct" }`.

## План по часам

| Часы | Задача |
|---|---|
| 0–1,5 | B2.1 установка, замеры, выбор модели и голосов, офлайн-проверка |
| 1,5–3 | B2.2–B2.6: клиент LLM, файлы агентов (черновик Колумба), поиск, память, промпт, `agent-cli` |
| 3–4,5 | B2.7–B2.9: перевод, TTS, конвейер, подсказки; подключить к Бэку 1 (`talk`) |
| 4,5–6,5 | Контент: 3 агента полностью, `lines.json`, интро, ночная история; `gen-voices` |
| 6,5–8 | Торговец, запасные фразы, ограничения, тюнинг скорости |
| 8–10 | Прогон диалогов на защите: проверить, что повторный вопрос даёт другой ответ; баги |

> Тексты карточек, реплик, интро и истории может набросать Claude по content-part1.md — останется вычитать.

## Чек-лист готовности
- [ ] Модель выбрана по замерам, всё работает без интернета
- [ ] 3 агента LLM: ответ голосом + русские субтитры ≤ 4 с
- [ ] Агент помнит рассказанное и действия игрока, не повторяется
- [ ] Подсказки из нерассказанных тем, `topicsTold` для заданий
- [ ] Торговец реагирует на решения кода
- [ ] Все готовые реплики озвучены файлами
- [ ] Запасные фразы при таймауте, ответ всегда по-английски
