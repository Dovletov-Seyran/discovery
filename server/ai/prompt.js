import { AI } from './config.js';

const ROLE_NAMES = { grumete: 'ship boy', piloto: 'pilot', lengua: 'interpreter' };
const ROLE_ADDRESS = { grumete: 'boy', piloto: 'pilot', lengua: 'interpreter' };

export const REPEAT_OPENING = 'As I told you';

export function buildMessages({ agent, context = {}, newCards, toldCards, extraCard, steerCard, tradeResult, history, text }) {
  const role = ROLE_NAMES[context.role] || 'sailor';
  const lines = [
    `You are ${agent.name}. ${agent.persona}`,
    `Style: ${agent.style.join('; ')}.`,
    `Rules: ${agent.rules.join(' ')}`,
    `Always answer in English only, ${AI.MAX_SENTENCES === 1 ? 'one sentence' : `1-${AI.MAX_SENTENCES} short sentences`}, at most ${AI.MAX_WORDS} words, in character. No stage directions, no emojis, no lists, no quotes around the answer.`,
    'The player may write in Russian. Understand it, but always answer in English.',
    '',
    `You are talking to ${context.name || 'a sailor'}, the ${role} on your ship. If you address them, call them "${ROLE_ADDRESS[context.role] || 'sailor'}", never by another title.`,
  ];

  const reactions = (context.log || []).map((code) => agent.reactions?.[code]).filter(Boolean).slice(-2);
  if (reactions.length) lines.push(`What this player did today: ${reactions.join(' ')}`);

  if (newCards.length) {
    lines.push('', 'NEW facts - tell them naturally, in your own words:');
    for (const c of newCards) lines.push(`- ${c.fact}`);
  }
  if (toldCards.length && extraCard) {
    // Повторный вопрос: память должна быть видна, поэтому требуем отсылку и даём новую деталь
    lines.push('', `The player asks AGAIN about something you already told them. Begin your answer with "${REPEAT_OPENING}," remind it in a few words, then add this NEW detail:`);
    lines.push(`- ${extraCard.fact}`);
    lines.push('What you told before (do not retell it in full):');
    for (const c of toldCards) lines.push(`- ${c.fact}`);
  } else if (toldCards.length) {
    lines.push('', `Facts you ALREADY TOLD this player. Do not retell them; begin with "${REPEAT_OPENING}," and keep it short:`);
    for (const c of toldCards) lines.push(`- ${c.fact}`);
  }
  if (steerCard) {
    lines.push('', `If the conversation drifts, you may hint that you could tell about: ${steerCard.topic}.`);
  }
  if (tradeResult) lines.push('', describeTrade(tradeResult));

  return [
    { role: 'system', content: lines.join('\n') },
    ...history,
    { role: 'user', content: text || '(The player approaches and greets you.)' },
  ];
}

function describeTrade({ item, offer, outcome, price }) {
  if (outcome === 'sold') return `You just agreed to sell ${item} for ${price} maravedis. React to the deal.`;
  if (outcome === 'no_money') return `The player wants ${item} for ${price} maravedis but does not have enough money. Tease them kindly about their light purse.`;
  if (outcome === 'angry') return `The player offered only ${offer} maravedis for ${item} again. You are offended and raise the price to ${price}.`;
  return `The player offered ${offer} maravedis for ${item}. Refuse and ask for ${price} instead.`;
}

// Чистим ответ: без ремарок, эмодзи, кавычек; не длиннее MAX_SENTENCES предложений
export function cleanAnswer(text) {
  let t = text
    .replace(/\*[^*]*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = (t.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [t]).map((s) => s.trim());
  // Не больше MAX_SENTENCES предложений и, по возможности, MAX_WORDS слов (первое предложение оставляем всегда)
  const out = [];
  let words = 0;
  for (const s of sentences.slice(0, AI.MAX_SENTENCES)) {
    const n = s.split(/\s+/).length;
    if (out.length && words + n > AI.MAX_WORDS) break;
    out.push(s);
    words += n;
  }
  return out.join(' ');
}

// Если модель забыла сослаться на сказанное раньше — добавляем отсылку сами
export function ensureRepeatOpening(en) {
  if (/as i (told|said)|i('ve| have) (already )?told|already told/i.test(en)) return en;
  const rest = /^(I|I'm|I've|God|Cipangu|Cathay|Indies|Admiral|Queen|King)\b/.test(en) ? en : en[0].toLowerCase() + en.slice(1);
  return `${REPEAT_OPENING}, ${rest}`;
}

export const isEnglish = (text) => !!text && !/[Ѐ-ӿ一-鿿]/.test(text);
