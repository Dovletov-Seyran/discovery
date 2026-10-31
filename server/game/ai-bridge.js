// Связка с ИИ Бэка 2 (server/ai/index.js). Пока модуля нет — заглушки.
import { existsSync } from 'node:fs';
import { loadContent } from '../content.js';

const AI_MODULE = new URL('../ai/index.js', import.meta.url);

let impl = null;
if (!existsSync(AI_MODULE)) {
  console.log('[ai] server/ai/index.js не найден — работают заглушки');
} else {
  try {
    impl = await import(AI_MODULE.href);
  } catch (e) {
    console.error('[ai] не удалось загрузить модуль ИИ, работают заглушки:', e);
  }
}

const lines = new Map((loadContent('lines.json', []) ?? []).map((l) => [l.id, l]));

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
  if (impl?.talk) return impl.talk(req);
  return stubTalk(req);
}

// → { npc, en, ru, audio } — готовая реплика из content/lines.json
export function playLine(lineId) {
  if (impl?.playLine) return impl.playLine(lineId);
  const l = lines.get(lineId);
  if (!l) return { npc: 'narrator', en: `[${lineId}]`, ru: `[${lineId}]`, audio: null };
  return { npc: l.npc, en: l.en, ru: l.ru, audio: `/audio/vo/${lineId}.wav` };
}

// → { ollama, tts, model? }
export function status() {
  return impl?.status ? impl.status() : { ollama: false, tts: false };
}
