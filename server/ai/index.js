import { readFileSync } from 'node:fs';
import { AI } from './config.js';
import { getAgent, loadAgents, currentTask, crewNames, knownPeople } from './agents.js';
import { understand } from './understand.js';
import { chat, warmup, ollamaUp, queueStats } from './llm.js';
import { loadMemory, saveMemory, setStore, turnsToCompress, resetMemory } from './memory.js';
import { decide, perform, setWorld, storyPlan, resetCooldowns, cancelAction } from './actions.js';
import { buildMessages, cleanAnswer, isEnglish, ensureRepeatOpening, latin, TEMPERATURE, GENERIC_HELP } from './prompt.js';
import { toRussian } from './translate.js';
import { speak, loadTTS, ttsReady } from './tts.js';

export { resetCooldowns, setStore, setWorld, storyPlan, loadAgents, getAgent, loadMemory, resetMemory };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Готовые реплики (content/lines.json), озвученные заранее (npm run voices → client/public/audio/vo)
let lines = null;
let voManifest = null;

/** @returns {{npc, en, ru, audio, duration} | null} */
export function playLine(lineId) {
  lines ??= new Map(JSON.parse(readFileSync(AI.LINES_FILE, 'utf8')).map((l) => [l.id, l]));
  if (!voManifest) {
    try {
      voManifest = JSON.parse(readFileSync(AI.VO_MANIFEST, 'utf8'));
    } catch {
      voManifest = {};
    }
  }
  const line = lines.get(lineId);
  if (!line) return null;
  const vo = voManifest[lineId];
  return { npc: line.npc, en: line.en, ru: line.ru, audio: vo ? `/audio/vo/${vo.file}` : null, duration: vo?.duration ?? 0 };
}

const GENERIC_HINTS = { more: 'Расскажи ещё что-нибудь.', bye: 'Прощай!', task: 'Что мне делать?', self: 'Расскажи о себе.' };
const PERSON_MORE = 'А что ещё о нём скажешь?';
const OPENER = '(The player comes up to you.)';

/**
 * Ответ NPC игроку. Три шага: понять реплику (understand) → выбрать, что сказать (код + prompt) → сказать (LLM).
 * Память об игроке хранится между встречами: последние реплики, резюме прошлых разговоров, когда виделись.
 * @param {{userId, npc, text?, hintId?, context?, tradeResult?}} req
 * @returns {Promise<{en, ru, audio, hints, topicsTold, timings}>}
 */
export async function talk({ userId, npc, text = '', hintId, context = {}, tradeResult, isCurrent = () => true }) {
  const t0 = performance.now();
  const agent = getAgent(npc);
  const mem = loadMemory(userId, npc);
  const now = Date.now();
  const firstEver = !mem.turns.length && !mem.summary;
  const returning = mem.lastAt && now - mem.lastAt > AI.RETURN_AFTER_MS ? gap(now - mem.lastAt) : null;

  // Самое первое знакомство без текста — готовое приветствие (быстро), но тоже в память
  if (!text && !hintId && !tradeResult && firstEver && agent.greeting) {
    const { url } = await speak(agent.greeting.en, agent.voice, { name: npc });
    remember(mem, { now, context, user: OPENER, en: agent.greeting.en, newVisit: true });
    saveMemory(userId, npc, mem);
    return { ...agent.greeting, audio: url, hints: hintsFor(agent, mem, { task: currentTask(context, npc), key: `${userId}:${npc}` }), topicsTold: [], timings: { total: ms(t0), kind: 'greeting' } };
  }

  const untold = agent.cards.filter((c) => !mem.told.includes(c.id));
  const hintCard = hintId && agent.cards.find((c) => c.id === hintId);
  const hintAction = typeof hintId==='string'&&hintId.startsWith('action:')?agent.actions?.find(a=>!a.at&&a.id===hintId.slice(7)&&a.hint):null;
  // «А что ещё о нём скажешь?» — продолжение разговора о человеке экипажа (hintId person:<id>)
  const hintPerson = !hintCard && typeof hintId === 'string' && hintId.startsWith('person:') ? knownPeople(npc).find((p) => p.id === hintId.slice(7)) : null;
  const userText = text || hintAction?.hint || hintCard?.hint || (hintPerson && PERSON_MORE) || GENERIC_HINTS[hintId] || '';

  // Шаг 1: к какому варианту из базы относится реплика
  let intent;
  if (tradeResult || !userText) intent = { kind: 'none', agentId: npc, ms: 0 };
  else if(hintAction)intent={kind:'action',action:hintAction,agentId:npc,ms:0,via:'hint'};
  else if (hintCard) intent = { kind: 'topic', card: hintCard, agentId: npc, ms: 0, via: 'hint' };
  else if (hintId === 'more' && untold[0]) intent = { kind: 'topic', card: untold[0], agentId: npc, ms: 0, via: 'hint' };
  else if (hintId === 'bye') intent = { kind: 'farewell', agentId: npc, ms: 0, via: 'hint' };
  else if (hintPerson) intent = { kind: 'person', person: hintPerson, agentId: npc, ms: 0, via: 'hint' };
  else if (hintId === 'task') intent = { kind: 'task_help', agentId: npc, ms: 0, via: 'hint' };
  else if (hintId === 'self') intent = { kind: 'about_you', agentId: npc, ms: 0, via: 'hint' };
  else intent = await understand({ agent, text: userText, turns: mem.turns, scene: context.scene });

  // Просьба сделать что-то в мире: можно ли — решает код (сцена, кулдаун, «уже сделано»)
  if (intent.action) {
    intent = { ...intent, kind: 'action', verdict: decide(agent, intent.action, { scene: context.scene, now }) };
  }

  // Шаг 2: что именно сказать — решает код
  const repeat = intent.kind === 'topic' && mem.told.includes(intent.card.id);
  const extraCard = repeat ? untold[0] : null;
  const task = currentTask(context, npc);
  // Задание уже объяснял недавно — второй раз другими словами, без дословного повтора
  const taskTold = !!task && mem.turns.slice(-6).some((t) => t.role === 'assistant' && mentionsTask(t.content, task.step));
  const messages = buildMessages({
    agent, context, intent, mem, repeat, extraCard, steerCard: untold[0], task, taskTold, tradeResult, returning, text: userText,
  });

  // Шаг 3: сказать в образе
  let en = null;
  let llmMs = 0;
  for (let attempt = 0; attempt < 2 && !en; attempt++) {
    try {
      const res = await chat(messages, { priority: 1, temperature: replyTemperature(agent, intent.kind) });
      llmMs += res.ms;
      const answer = cleanAnswer(res.text);
      if (isEnglish(answer)) en = repeat ? ensureRepeatOpening(answer) : answer;
      // Подсказка по заданию должна быть про задание: нет ни одного ключевого слова — говорим само задание
      if (en && intent.kind === 'task_help' && task && !taskTold && GENERIC_HELP.test(userText) && !mentionsTask(en, task.step)) en = `${task.step.charAt(0).toUpperCase()}${task.step.slice(1)}.`;
    } catch (err) {
      console.warn(`[ai] ${npc}: ${err.message}`);
      break;
    }
  }

  let ru;
  let translateMs = 0;
  let audio = null;
  let ttsMs = 0;
  let topicsTold = [];
  let topicsDiscussed = [];

  if (en) {
    // Перевод (LLM) и озвучка (отдельный поток) идут параллельно
    const [tr, voice] = await Promise.all([
      // Чужаки на Гуанахани (foreign) говорят по-испански: таино их не понимают — субтитры без перевода
      agent.foreign ? Promise.resolve({ text: en, ms: 0 }) : toRussian(en, { names: nameGlossary(context, userText) }).catch(() => ({ text: '', ms: 0 })),
      speak(en, agent.voice, { name: npc }).catch((err) => (console.warn(`[tts] ${err.message}`), { url: null, ms: 0 })),
    ]);
    ru = tr.text;
    translateMs = tr.ms;
    audio = voice.url;
    ttsMs = voice.ms;
    // Новая тема засчитывается рассказанной; extraCard при повторе — нет (модель не всегда её вставляет)
    topicsTold = intent.kind === 'topic' && !repeat ? [intent.card.id] : [];
    topicsDiscussed=intent.kind==='topic'?[intent.card.id]:[];
    mem.told.push(...topicsTold);
    remember(mem, { now, context, user: userText || OPENER, en, newVisit: !!returning });
    saveMemory(userId, npc, mem);
    compactLater(userId, npc, agent, context);
  } else {
    // Модель не ответила: разрешённое действие всё равно выполняется — говорим заготовку агента
    if (intent.kind === 'action' && intent.verdict.ok && intent.action.reply) ({ reply: en, replyRu: ru = '' } = intent.action);
    else ({ en, ru } = pick(agent.fallbacks));
    audio = (await speak(en, agent.voice, { name: npc }).catch(() => ({ url: null }))).url;
  }

  // Разрешённое действие выполняется вместе с ответом: мир меняется, когда агент отдаёт приказ
  let action = null;
  if (intent.kind === 'action') {
    if (!isCurrent() && intent.verdict.ok) { cancelAction(agent, intent.action); intent.verdict = { ok: false, reason: 'cancelled' }; }
    const done = intent.verdict.ok ? perform(agent, intent.action) : null;
    action = { id: intent.action.id, ok: !!intent.verdict.ok && done?.ok !== false, reason: intent.verdict.reason ?? null };
  }

  const timings = {
    understand: intent.ms ?? 0, llm: llmMs, translate: translateMs, tts: ttsMs, total: ms(t0),
    kind: intent.kind, via: intent.via, cards: intent.card ? [intent.card.id] : [], person: intent.person?.id, returning,
    action: action?.id,
  };
  record(timings);
  return {
    en,
    ru,
    audio,
    action,
    hints: hintsFor(agent, mem, { intent, task, key: `${userId}:${npc}` }),
    topicsTold,
    topicsDiscussed, // credit a delivered repeat if the original answer was missed/closed
    timings,
  };
}

// Температура ответа: точные виды (память, задание, быт, действие) — свои низкие значения;
// свободная речь — temperature из JSON агента (правится во вкладке «Агенты»)
const PRECISE = new Set(['recall', 'task_help', 'need', 'about_you', 'action']);
const replyTemperature = (agent, kind) => (PRECISE.has(kind) ? TEMPERATURE[kind] : agent.temperature ?? TEMPERATURE[kind] ?? 0.7);

// --- Метрики ИИ для админки: средние за последние 50 ответов ---
const RECENT = 50;
const recent = [];
function record(t) {
  recent.push({ understand: t.understand, llm: t.llm, translate: t.translate, tts: t.tts, total: t.total, at: Date.now() });
  if (recent.length > RECENT) recent.shift();
}
export function metrics() {
  const avg = (k) => (recent.length ? Math.round(recent.reduce((s, t) => s + (t[k] || 0), 0) / recent.length) : 0);
  return {
    queue: queueStats(),
    answers: recent.length,
    avgMs: { understand: avg('understand'), reply: avg('llm'), translate: avg('translate'), tts: avg('tts'), total: avg('total') },
    lastAt: recent.at(-1)?.at ?? null,
  };
}

// Имена для перевода субтитров: экипаж + игроки (в ответе модели они латиницей)
// + латинские слова из вопроса игрока (One Piece, iPhone): в субтитрах оставляем как есть
function nameGlossary(context, userText = '') {
  const players = (context.party ?? [{ name: context.name }]).filter((p) => p.name && latin(p.name) !== p.name).map((p) => ({ en: latin(p.name), ru: p.name }));
  const foreign = (userText.match(/[A-Za-z][A-Za-z0-9'-]*(?:\s+[A-Z][A-Za-z0-9'-]*)*/g) ?? []).map((w) => ({ en: w, ru: w }));
  return [...players, ...foreign, ...crewNames()];
}

const STOP = new Set(['about', 'their', 'there', 'which', 'things', 'thing', 'with', 'from', 'each', 'time', 'back']);
function mentionsTask(answer, step) {
  const low = answer.toLowerCase();
  return step.toLowerCase().match(/[a-z]{5,}/g)?.filter((w) => !STOP.has(w)).some((w) => low.includes(w.slice(0, 5))) ?? true;
}

function remember(mem, { now, context, user, en, newVisit }) {
  mem.turns.push({ role: 'user', content: user, at: now }, { role: 'assistant', content: en, at: now });
  mem.lastAt = now;
  mem.lastScene = context.scene ?? mem.lastScene;
  if (newVisit) mem.visits++;
}

// Сжатие старых реплик в резюме — в фоне после ответа, с низким приоритетом в очереди к модели
const compacting = new Set();
function compactLater(userId, npc, agent, context) {
  const key = `${userId}:${npc}`;
  if (compacting.has(key) || !turnsToCompress(loadMemory(userId, npc)).length) return;
  compacting.add(key);
  compact(userId, npc, agent, context).catch((err) => console.warn(`[ai] память ${key}: ${err.message}`)).finally(() => compacting.delete(key));
}

async function compact(userId, npc, agent, context) {
  const mem = loadMemory(userId, npc);
  const old = turnsToCompress(mem);
  if (!old.length) return;
  const who = context.name || 'the player';
  const transcript = old.map((t) => `${t.role === 'user' ? who : 'Me'}: ${t.content}`).join('\n');
  const res = await chat([
    { role: 'system', content: `You are ${agent.name}. Update your private memory notes about ${who}. Keep what matters: what they asked you, what you told them, what they told you about themselves (name, home, family, feelings, plans), promises, and how they behaved. Write in English, in the first person ("I told them...", "they said..."), plain sentences, at most 90 words. Output only the notes.` },
    { role: 'user', content: `My previous notes: ${mem.summary || '(none yet)'}\n\nNew conversation to add:\n${transcript}\n\nMy updated notes:` },
  ], { priority: -1, temperature: 0.2, maxTokens: 180, timeoutMs: 30_000 });
  const notes = res.text.trim();
  if (!notes) return;
  // За время сжатия игрок мог сказать ещё что-то — убираем ровно сжатые реплики
  const fresh = loadMemory(userId, npc);
  const sameStart = old.every((t, i) => fresh.turns[i]?.at === t.at && fresh.turns[i]?.content === t.content);
  if (!sameStart) return;
  fresh.turns = fresh.turns.slice(old.length);
  fresh.summary = notes;
  saveMemory(userId, npc, fresh);
}

function gap(msAway) {
  const min = Math.round(msAway / 60_000);
  if (min < 60) return `${min} minutes`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'an hour' : `${h} hours`;
  return 'a long while';
}

// Подсказки после каждого ответа: продолжение темы, 1–2 нерассказанные темы, «Что мне делать?»,
// «Расскажи о себе», «Прощай» — последней. Тот же набор два ответа подряд не повторяем.
const lastHints = new Map(); // userId:npc → id подсказок прошлого ответа
export function hintsFor(agent, mem, { intent, task, key } = {}) {
  const told = mem.told;
  const head = [];
  if (intent?.kind === 'topic' && intent.card) {
    // следующий вопрос после этой темы (по порядку в базе)
    const i = agent.cards.findIndex((c) => c.id === intent.card.id);
    const next = [...agent.cards.slice(i + 1), ...agent.cards.slice(0, i)].find((c) => !told.includes(c.id));
    if (next) head.push({ id: next.id, ru: next.hint });
  } else if (intent?.kind === 'person' && intent.person) head.push({ id: `person:${intent.person.id}`, ru: PERSON_MORE });
  const tail = [];
  if (task) tail.push({ id: 'task', ru: GENERIC_HINTS.task });
  if (!mem.turns.some((t) => t.role === 'user' && t.content === GENERIC_HINTS.self)) tail.push({ id: 'self', ru: GENERIC_HINTS.self });
  const rest = [...(agent.actions??[]).filter(a=>a.hint&&!a.at).map(a=>({id:`action:${a.id}`,ru:a.hint})),...agent.cards.filter((c) => !told.includes(c.id) && !head.some((h) => h.id === c.id)).map((c) => ({ id: c.id, ru: c.hint }))];
  const topicsN = Math.max(1, Math.min(2, 4 - head.length - tail.length));
  const prev = lastHints.get(key);
  let hints = [];
  // темы — со сдвигом по ходу разговора; совпал с прошлым набором — сдвигаем ещё
  for (let extra = 0; extra <= rest.length; extra++) {
    const shift = rest.length ? (Math.floor(mem.turns.length / 2) + extra) % rest.length : 0;
    const topics = [...rest.slice(shift), ...rest.slice(0, shift)].slice(0, topicsN);
    hints = [...head, ...topics, ...tail].slice(0, 4);
    if (hints.length < 2) hints.push({ id: 'more', ru: 'Расскажи ещё что-нибудь' });
    if (!prev || hints.map((h) => h.id).join() !== prev) break;
  }
  hints.push({ id: 'bye', ru: 'Прощай' });
  if (key) lastHints.set(key, hints.slice(0, -1).map((h) => h.id).join());
  return hints;
}

const ms = (t0) => Math.round(performance.now() - t0);

export async function init() {
  loadAgents();
  await Promise.all([warmup().catch((e) => console.warn(`[ai] warmup: ${e.message}`)), loadTTS().catch((e) => console.warn(`[tts] ${e.message}`))]);
}

export async function status() {
  return { ollama: await ollamaUp(), tts: ttsReady(), model: AI.MODEL };
}
