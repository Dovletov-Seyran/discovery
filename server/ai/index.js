import { AI } from './config.js';
import { getAgent, loadAgents } from './agents.js';
import { chat, warmup, ollamaUp } from './llm.js';
import { findCards } from './retrieval.js';
import { loadMemory, saveMemory, setStore } from './memory.js';
import { buildMessages, cleanAnswer, isEnglish, ensureRepeatOpening } from './prompt.js';
import { toRussian } from './translate.js';
import { speak, loadTTS, ttsReady } from './tts.js';

export { setStore };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const GENERIC_HINTS = { more: 'Расскажи ещё что-нибудь.', bye: 'Прощай!' };

/**
 * Ответ NPC игроку.
 * @param {{userId, npc, text?, hintId?, context?, tradeResult?}} req
 * @returns {Promise<{en, ru, audio, hints, topicsTold, timings}>}
 */
export async function talk({ userId, npc, text = '', hintId, context = {}, tradeResult }) {
  const t0 = performance.now();
  const agent = getAgent(npc);
  const mem = loadMemory(userId, npc);

  // Первое обращение без текста — приветствие из файла агента
  if (!text && !hintId && !tradeResult && !mem.history.length && agent.greeting) {
    const { url } = await speak(agent.greeting.en, agent.voice, { name: npc });
    return { ...agent.greeting, audio: url, hints: hintsFor(agent, mem.told), topicsTold: [], timings: { total: ms(t0) } };
  }

  const hintCard = hintId && agent.cards.find((c) => c.id === hintId);
  const userText = text || hintCard?.hint || GENERIC_HINTS[hintId] || '';
  const cards = findCards(agent, userText, { hintId });
  const newCards = cards.filter((c) => !mem.told.includes(c.id));
  const toldCards = cards.filter((c) => mem.told.includes(c.id));
  const untold = agent.cards.filter((c) => !mem.told.includes(c.id));
  // Повторный вопрос: всё найденное уже рассказано — добавим новую деталь из нерассказанного
  const isRepeat = toldCards.length > 0 && newCards.length === 0;
  const extraCard = isRepeat ? untold[0] : null;
  const steerCard = cards.length ? null : untold[0];

  const messages = buildMessages({ agent, context, newCards, toldCards, extraCard, steerCard, tradeResult, history: mem.history, text: userText });

  let en = null;
  let llmMs = 0;
  for (let attempt = 0; attempt < 2 && !en; attempt++) {
    try {
      const res = await chat(messages, { priority: 1 });
      llmMs += res.ms;
      const answer = cleanAnswer(res.text);
      if (isEnglish(answer)) en = isRepeat ? ensureRepeatOpening(answer) : answer;
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

  if (en) {
    // Перевод (LLM) и озвучка (CPU) идут параллельно
    const [tr, voice] = await Promise.all([
      toRussian(en).catch(() => ({ text: '', ms: 0 })),
      speak(en, agent.voice, { name: npc }).catch((err) => (console.warn(`[tts] ${err.message}`), { url: null, ms: 0 })),
    ]);
    ru = tr.text;
    translateMs = tr.ms;
    audio = voice.url;
    ttsMs = voice.ms;
    // extraCard не помечаем: модель не всегда вставляет новую деталь, а помеченное агент потом пропустит
    topicsTold = newCards.map((c) => c.id);
    mem.told.push(...topicsTold);
    mem.history.push({ role: 'user', content: userText || '(greets you)' }, { role: 'assistant', content: en });
    saveMemory(userId, npc, mem);
  } else {
    ({ en, ru } = pick(agent.fallbacks));
    audio = (await speak(en, agent.voice, { name: npc }).catch(() => ({ url: null }))).url;
  }

  return {
    en,
    ru,
    audio,
    hints: hintsFor(agent, mem.told),
    topicsTold,
    timings: { llm: llmMs, translate: translateMs, tts: ttsMs, total: ms(t0), cards: cards.map((c) => c.id) },
  };
}

function hintsFor(agent, told) {
  const hints = agent.cards.filter((c) => !told.includes(c.id)).slice(0, 3).map((c) => ({ id: c.id, ru: c.hint }));
  return hints.length ? hints : [{ id: 'more', ru: 'Расскажи ещё что-нибудь' }, { id: 'bye', ru: 'Прощай' }];
}

const ms = (t0) => Math.round(performance.now() - t0);

export async function init() {
  loadAgents();
  await Promise.all([warmup().catch((e) => console.warn(`[ai] warmup: ${e.message}`)), loadTTS().catch((e) => console.warn(`[tts] ${e.message}`))]);
}

export async function status() {
  return { ollama: await ollamaUp(), tts: ttsReady(), model: AI.MODEL };
}
