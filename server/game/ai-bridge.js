// Связка с ИИ Бэка 2 (server/ai/index.js). Пока модуля нет — заглушки.
import { existsSync, readFileSync } from 'node:fs';
import { loadContent } from '../content.js';
import { loadAgentMemory, saveAgentMemory, deleteAgentMemory } from '../db.js';
import * as world from './world-state.js';

const AI_MODULE = new URL('../ai/index.js', import.meta.url);

let impl = null;
if (process.env.AI === '0') {
  console.log('[ai] AI=0 — работают заглушки (без Ollama и голоса)');
} else if (!existsSync(AI_MODULE)) {
  console.log('[ai] server/ai/index.js не найден — работают заглушки');
} else {
  try {
    impl = await import(AI_MODULE.href);
  } catch (e) {
    console.error('[ai] не удалось загрузить модуль ИИ, работают заглушки:', e);
  }
}

// Память агентов — в SQLite (agent_memory), а не в JSON-файле модуля ИИ
impl?.setStore?.({ load: loadAgentMemory, save: saveAgentMemory, reset: deleteAgentMemory });
// Действия агентов меняют мир игры: проверка «уже сделано», патч и рассылка — в world-state
impl?.setWorld?.({ isApplied: world.isApplied, apply: world.apply, hasFlag: world.hasFlag, setFlag: world.setFlag });

// Прогрев модели и Kokoro при старте сервера (в фоне)
export async function initAi() {
  if (!impl?.init) return;
  try {
    await impl.init();
    console.log('[ai] модуль ИИ готов');
  } catch (e) {
    console.error('[ai] init:', e.message);
  }
}

const lines = new Map((loadContent('lines.json', []) ?? []).map((l) => [l.id, l]));

// Озвучка готовых реплик: client/public/audio/vo/manifest.json (делает gen-voices Бэка 2)
const MANIFEST = new URL('../../client/public/audio/vo/manifest.json', import.meta.url);
let manifest = null;
function voiceFile(lineId) {
  if (!manifest && existsSync(MANIFEST)) {
    try { manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { manifest = null; }
  }
  return manifest?.[lineId] ?? null;
}

// Заглушка: темы Колумба по ключевым словам, чтобы задание «Слово адмирала» проходилось без ИИ
const STUB_TOPICS = {
  columbus: [
    { id: 'why_west', kw: ['зачем', 'куда', 'цель', 'запад', 'азия', 'инди'], hint: 'Куда и зачем мы плывём?',
      en: 'West, always west, to the Indies and the Great Khan.', ru: 'На запад, только на запад — к Индиям и Великому хану.' },
    { id: 'reward', kw: ['наград', 'обещ', 'титул', 'корол', 'договор'], hint: 'Что тебе обещали короли?',
      en: 'Admiral of the Ocean Sea, Viceroy, and a tenth of all riches.', ru: 'Адмирал Моря-Океана, вице-король и десятая часть всех богатств.' },
    { id: 'distance', kw: ['сколько', 'далеко', 'долго', 'расстоян'], hint: 'Сколько нам плыть?',
      en: 'Some seven hundred and fifty leagues to Cipangu. No more.', ru: 'Около семисот пятидесяти лиг до Сипанго. Не больше.' },
  ],
};
const STUB_TRADE = {
  sold: { en: 'Sold! You drive a hard bargain, señor.', ru: 'Продано! Ты умеешь торговаться, сеньор.' },
  counter: { en: 'That is too little. Perhaps a bit more?', ru: 'Маловато. Может, чуть больше?' },
  angry: { en: 'You insult me! Now the price goes up.', ru: 'Ты меня оскорбляешь! Теперь цена выше.' },
  no_money: { en: 'Your purse is too light for that, friend.', ru: 'Для этого твой кошель слишком лёгок, друг.' },
};

function stubTalk({ npc, text = '', hintId, tradeResult }) {
  const base = { audio: null, hints: [], topicsTold: [] };
  if (tradeResult) return { ...base, ...STUB_TRADE[tradeResult.outcome] };
  const topics = STUB_TOPICS[npc] ?? [];
  const lower = text.toLowerCase();
  const card = topics.find((c) => c.id === hintId) ?? topics.find((c) => c.kw.some((k) => lower.includes(k)));
  const hints = topics.filter((c) => c !== card).map((c) => ({ id: c.id, ru: c.hint }));
  if (card) return { ...base, en: card.en, ru: card.ru, hints, topicsTold: [card.id] };
  return { ...base, en: 'Not now. Watch the sails.', ru: 'Не сейчас. Следи за парусами.', hints };
}

// → Promise<{ en, ru, audio, hints: [{id, ru}], topicsTold: [] }>
export async function talk(req) {
  // Купили товар — с прилавка он исчезает у всех (если торговец его выкладывал)
  if (req.tradeResult?.outcome === 'sold') {
    const id = `goods_${req.tradeResult.item}`;
    if (world.has(id)) world.apply([{ op: 'remove', id }], { source: `${req.npc}:trade` });
  }
  if (impl?.talk) return impl.talk(req);
  return stubTalk(req);
}

// --- Действия агентов по расписанию: ночная история Старого Хуана (туман густеет, фонарь тускнеет) ---
let storyTimers = [];
export function onSceneStart(scene, startAt = Date.now()) {
  storyTimers.forEach(clearTimeout);
  storyTimers = [];
  if (!impl?.storyPlan || !impl.loadAgents) return;
  const story = scene.id === 'night_story' ? loadContent('night_story.json', null) : null;
  const segments = story?.segments ?? [];
  const agents = [...impl.loadAgents().values()].filter((a) => a.actions?.some((x) => x.at));
  const plan = impl.storyPlan(agents, {
    scene: scene.id, segments, durations: segments.map((seg) => playLine(seg.line)?.duration || 0),
    maxDuration: scene.duration,
  });
  for (const { ms, agent, action } of plan) {
    storyTimers.push(setTimeout(() => world.apply(action.patch ?? [], { source: `${agent.id}:${action.id}` }), Math.max(0, startAt + ms - Date.now())));
  }
}

// --- Для админки (вкладка «Агенты») ---
export const aiModule = () => impl;
export function metrics() {
  return impl?.metrics ? impl.metrics() : { queue: { waiting: 0, busy: false }, answers: 0, avgMs: {}, lastAt: null, stub: true };
}

// → { npc, en, ru, audio, duration? } — готовая реплика из content/lines.json
export function playLine(lineId) {
  if (impl?.playLine) return impl.playLine(lineId);
  const l = lines.get(lineId);
  if (!l) return { npc: 'narrator', en: `[${lineId}]`, ru: `[${lineId}]`, audio: null };
  const v = voiceFile(lineId);
  return { npc: l.npc, en: l.en, ru: l.ru, audio: v ? `/audio/vo/${v.file}` : null, duration: v?.duration ?? null };
}

// → Promise<{ ollama, tts, model? }> (у модуля ИИ status() асинхронный)
export async function status() {
  try {
    return impl?.status ? await impl.status() : { ollama: false, tts: false };
  } catch {
    return { ollama: false, tts: false };
  }
}
