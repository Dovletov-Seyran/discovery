import { AI } from './config.js';
import { worldFacts } from './agents.js';

const ROLE_NAMES = { grumete: 'ship boy', piloto: 'pilot', lengua: 'interpreter' };
const ROLE_ADDRESS = { grumete: 'boy', piloto: 'pilot', lengua: 'interpreter' };

export const REPEAT_OPENING = 'As I told you';

// Общий вопрос «что мне делать?» — без названия конкретной вещи: на него отвечаем самим заданием
export const GENERIC_HELP = /^\s*(а\s+)?(что|чем)\s+(же\s+)?(мне\s+|нам\s+)?(теперь\s+|сейчас\s+|дальше\s+)?(делать|заняться|сделать)|помоги|помощь|задани|что дальше|what (should|do|can) (i|we) do|help me|my task/i;

// Имена игроков в промпте — латиницей: иначе модель вставляет кириллицу в английский ответ
const TR = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'yo', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
export function latin(name = '') {
  return [...name].map((ch) => {
    const low = ch.toLowerCase();
    if (!(low in TR)) return ch;
    const t = TR[low];
    return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
  }).join('');
}

const OPENER = '(The player comes up to you.)';

/**
 * Промпт ответа (шаг 2). intent — результат understand(): { kind, card, person }.
 * Персонаж получает: кто он, когда и где он, что знает о себе, память об этом игроке
 * и ОДНУ инструкцию под вид реплики — так маленькая модель отвечает по делу, а не «вообще».
 */
export function buildMessages({ agent, context = {}, intent, mem, repeat = false, extraCard, steerCard, task, taskTold = false, tradeResult, returning, text }) {
  const role = ROLE_NAMES[context.role] || 'sailor';
  const name = latin(context.name || '') || 'a sailor';
  const playerIs = (agent.playerIs ?? 'the {role} on your ship').replace('{role}', role);
  const k = agent.knowledge ?? {};
  const lines = [
    `You are ${agent.name}. ${agent.persona}`,
    `Style: ${agent.style.join('; ')}.`,
    '',
    `TIME AND PLACE: It is ${k.when ?? '1492'}. You are ${k.where ?? 'on your ship'}. You know only what a person of your time and place could know. ${k.unknown ?? ''}`,
    `RULES: ${agent.rules.join(' ')}`,
  ];
  if (agent.self?.length) lines.push('', 'ABOUT YOURSELF (use only what fits the question):', ...agent.self.map((s) => `- ${s}`));
  if (context.activity) lines.push('', `YOUR CURRENT WORK: ${context.activity}. You have paused this to speak with the player. Describe it naturally if asked; never claim to have completed another task or changed any supplies.`);

  lines.push(
    '',
    `YOU ARE TALKING TO: ${name}, ${playerIs}. If you address them, call them "${ROLE_ADDRESS[context.role] || 'sailor'}" or by name, never by another title.`,
  );
  const others = (context.party ?? []).filter((p) => p.name !== context.name && p.role);
  if (others.length) lines.push(`Their shipmates in this game: ${others.map((p) => `${latin(p.name)} (the ${ROLE_NAMES[p.role]})`).join(', ')}.`);
  const reactions = (context.log || []).map((code) => agent.reactions?.[code]).filter(Boolean).slice(-2);
  if (reactions.length) lines.push(`What this player did today: ${reactions.join(' ')}`);

  // Память об этом игроке
  lines.push('', `YOUR MEMORY OF ${name.toUpperCase()}:`);
  if (mem.summary) lines.push(mem.summary);
  if (!mem.summary && !mem.turns.length) lines.push('You have never spoken with them before.');
  const told = agent.cards.filter((c) => mem.told.includes(c.id)).map((c) => c.topic);
  if (told.length) lines.push(`You have already told them about: ${told.join('; ')}.`);
  if (returning) lines.push(`They left and now come back to you (about ${returning} later). Your last words with them are below.`);

  lines.push(
    '',
    `FORMAT: English only, ${AI.MAX_SENTENCES === 1 ? 'one sentence' : `1-${AI.MAX_SENTENCES} short sentences`}, at most ${AI.MAX_WORDS} words, spoken in character. No stage directions, no emojis, no lists, no quotes around the answer.`,
    'The player may write in Russian. Understand it, but always answer in English.',
  );

  // Инструкцию — последней, прямо перед репликой игрока: маленькая модель лучше всего слушает то, что ближе к концу
  const todo = directive({ agent, intent, repeat, extraCard, steerCard, task, taskTold, tradeResult, returning, mem, text, facts: worldFacts(context) });
  return [
    { role: 'system', content: lines.join('\n') },
    ...mem.turns.slice(-AI.HISTORY).map(({ role: r, content }) => ({ role: r, content })),
    { role: 'system', content: `WHAT TO DO NOW: ${todo}` },
    { role: 'user', content: text || OPENER },
  ];
}

function directive({ intent, repeat, extraCard, steerCard, task, taskTold, tradeResult, returning, mem, text, facts = [] }) {
  if (tradeResult) return describeTrade(tradeResult);
  if (!text) {
    if (!mem.turns.length && !mem.summary) return 'The player comes up to you for the first time. Greet them in character in one or two sentences.';
    if (returning) {
      const last = lastExchange(mem);
      return `Greet them by name as someone you already know, in one or two sentences, and say what you talked about last time${last ? ` (last time they asked or said: "${last.user}")` : ''} — name the topic only, for example "last time you asked me why we sail west". Do NOT repeat your old answer.`;
    }
    return 'They turn to you again. Greet them briefly and continue where you left off.';
  }
  const steer = steerCard ? steerCard.topic : 'the voyage';
  switch (intent.kind) {
    case 'action':
      return actionDirective(intent.action, intent.verdict);
    case 'topic':
      if (repeat && extraCard) {
        return `They ask AGAIN about ${intent.card.topic}, which you already told them. Begin your answer with "${REPEAT_OPENING}," remind them in a few words, then add this NEW detail: ${extraCard.fact}`;
      }
      if (repeat) return `They ask AGAIN about ${intent.card.topic}, which you already told them. Begin with "${REPEAT_OPENING}," remind them very briefly and ask what else they want to know.`;
      return `They ask about ${intent.card.topic}. Tell them this in your own words: ${intent.card.fact}`;
    case 'person': {
      const p = intent.person;
      return `They ask about ${p.name}. What is known of this person: ${p.about} What YOU think of this person: ${p.opinions[intentAgent(intent)] ?? ''} Speak of them as you would to a crewmate, with your own opinion.`;
    }
    case 'stranger':
      return `They ask about ${intent.person.name}. You do not know this person yourself; you only heard: ${intent.person.about} Say honestly that you do not really know them, share only that rumour in a few words.`;
    case 'about_you':
      return 'They ask about you yourself. Answer honestly and personally from ABOUT YOURSELF, choosing only what fits the question. Never contradict ABOUT YOURSELF and never invent relatives or events.';
    case 'player_shares':
      return 'They tell you something about themselves. React to exactly what they said, briefly and in character, as someone who will remember it.';
    case 'recall':
      return 'They ask what you remember. Answer ONLY from YOUR MEMORY and the conversation above: name the specific things they told you, exactly as they were said. Never add any detail that is not written there (no new relatives, places or facts). If you do not remember something, say so honestly.';
    case 'task_help':
      if (task && taskTold) {
        return `They ask about their task again; you already told them: "${task.step}". Do not repeat it word for word: remind them in other, shorter words, explain the part they seem to ask about using these facts if they help (${facts.join(' ')}), and ask what is unclear.${task.aboutYou ? ' This task is about YOU: speak in the first person.' : ''}`;
      }
      if (task && !GENERIC_HELP.test(text)) {
        return `They ask about something specific. Answer exactly that from these facts if they cover it: ${facts.join(' ')} Then remind them of their own task in a few words: "${task.step}".${task.aboutYou ? ' Their task is about YOU: speak in the first person.' : ''}`;
      }
      return task
        ? `They ask what they should do. Give them EXACTLY this advice in your own words, in one or two sentences, and add nothing else (no other tasks, no other people): "${task.step}".${task.aboutYou ? ' This task is about YOU, so say it in the first person ("ask me...").' : ''}`
        : 'They ask what to do, but they have no task left here. Tell them their work is done for now: rest, help the others or wait for orders.';
    case 'need':
      return `They have an everyday need or ask where something is. Answer ONLY from these facts about this place, choosing the one that fits: ${facts.map((f) => `• ${f}`).join(' ')} Tell them plainly where to get it or whom to ask, in one or two sentences, in character. If the facts do not cover it, say you do not know and send them to the boatswain. Do not talk about their task.`;
    case 'unknown':
      return `They mention something you have never heard of: it does not exist in your time and place. You have no idea what it is or what it is about, so never describe it or guess its contents. Repeat the strange word as a question, say plainly you have never heard of such a thing, and turn the talk back to ${steer}.`;
    case 'farewell':
      return 'They are leaving. Say a short goodbye in character.';
    case 'rude':
      return 'They are rude to you. Answer with dignity and a short rebuke in character, addressing them as said in YOU ARE TALKING TO. Do not insult them back.';
    default:
      return 'Reply naturally and briefly in character to what they said. Keep the conversation alive: you may ask them something about themselves or their work.';
  }
}

// Просьба что-то сделать: решение уже принял код, модель лишь говорит его в образе
const REFUSAL = {
  scene: 'It cannot be done here and now. Refuse politely in character and say briefly why.',
  cooldown: 'You gave this very order only a moment ago. Refuse politely in character: not again so soon.',
  done: 'It is already done: look around. Say so politely in character, in a few words.',
  once: 'You have already done this today and will not do it again. Refuse politely in character.',
};
function actionDirective(action, verdict = {}) {
  if (verdict.ok) return `They ask you to ${action.en}. You agree and give the order at once, in one or two sentences, in character, for example: "${action.reply}"`;
  return `They ask you to ${action.en}. ${REFUSAL[verdict.reason] ?? REFUSAL.scene}`;
}

function lastExchange(mem) {
  const t = mem.turns;
  for (let i = t.length - 1; i > 0; i--) {
    if (t[i].role === 'assistant' && t[i - 1].role === 'user' && !t[i - 1].content.startsWith('(')) return { user: t[i - 1].content, you: t[i].content };
  }
  return null;
}

// Мнение о человеке берём от лица текущего агента (understand кладёт его id в intent)
const intentAgent = (intent) => intent.agentId;

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

// Насколько свободно модель формулирует: где важна точность — меньше фантазии
export const TEMPERATURE = { action: 0.4, recall: 0.2, task_help: 0.3, need: 0.3, about_you: 0.4, person: 0.5, topic: 0.6, unknown: 0.5 };
