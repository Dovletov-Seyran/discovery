import { AI } from './config.js';

const ROLE_NAMES = { grumete: 'ship boy', piloto: 'pilot', lengua: 'interpreter' };

export function buildMessages({ agent, context = {}, newCards, toldCards, steerCard, tradeResult, history, text }) {
  const lines = [
    `You are ${agent.name}. ${agent.persona}`,
    `Style: ${agent.style.join('; ')}.`,
    `Rules: ${agent.rules.join(' ')}`,
    `Always answer in English only, ${AI.MAX_SENTENCES === 1 ? 'one sentence' : `1-${AI.MAX_SENTENCES} short sentences`}, in character. No stage directions, no emojis, no lists, no quotes around the answer.`,
    'The player may write in Russian. Understand it, but always answer in English.',
    '',
    `You are talking to ${context.name || 'a sailor'}, the ${ROLE_NAMES[context.role] || 'sailor'} on your ship.`,
  ];

  const reactions = (context.log || []).map((code) => agent.reactions?.[code]).filter(Boolean).slice(-2);
  if (reactions.length) lines.push(`What this player did today: ${reactions.join(' ')}`);

  if (newCards.length) {
    lines.push('', 'NEW facts - tell them naturally, in your own words:');
    for (const c of newCards) lines.push(`- ${c.fact}`);
  }
  if (toldCards.length) {
    lines.push('', 'Facts you ALREADY TOLD this player. Do not repeat them; say briefly "as I told you" and add something new or change the subject:');
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
  const sentences = t.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [t];
  return sentences.slice(0, AI.MAX_SENTENCES).join(' ').trim();
}

export const isEnglish = (text) => !!text && !/[Ѐ-ӿ一-鿿]/.test(text);
