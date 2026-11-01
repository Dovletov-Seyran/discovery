// Шаг 1 ответа NPC: свести реплику игрока к одному варианту из базы персонажа.
// Модель отвечает строгим JSON по схеме (Ollama structured outputs): вид реплики, тема, человек —
// только из закрытых списков. Решение «что ответить» дальше принимает код (prompt.js), а модель лишь озвучивает.
import { chat } from './llm.js';
import { findCards } from './retrieval.js';
import { knownPeople, findPerson, knowsPerson } from './agents.js';
import { available, pickAction } from './actions.js';

export const KINDS = {
  topic: 'asks about one of YOUR TOPICS below, or continues talking about it',
  person: 'asks about a person from PEOPLE below',
  about_you: 'asks about you yourself: who you are, your life, age, family, home, feelings, past, faith or opinions',
  player_shares: 'tells you something about themselves (their name, home, family, plans) or answers a question you asked',
  recall: 'asks what you remember: about them, what they told you, or what you talked about before',
  task_help: 'asks what they should do now, what their task is, asks you to help them, or how to do their work or use a ship tool (the sand glass, astrolabe, compass, chart)',
  need: 'is hungry, thirsty, tired, cold or sick, or asks where to get food, water, wine, money or a place to sleep, or where some thing or place is',
  unknown: 'asks about something you cannot know: America, anything modern or from later centuries (phones, films, cartoons, anime, games, sports clubs, later countries), or things that do not exist in your world. The weather, the wind, the sea, ship tools, food and the work on board are NOT unknown',
  small_talk: 'greetings, thanks, jokes, compliments, the weather, short replies like "ok", "yes", "I see", or any other chat that is none of the above',
  farewell: 'says goodbye or clearly ends the conversation ("bye", "I have to go"); a short "ok" is NOT a farewell',
  rude: 'insults or mocks you',
};

const shortName = (agent) => agent.name.split(',')[0];

// scene — для действий агента: в классификатор попадают только доступные в этой сцене
export async function understand({ agent, text, turns = [], scene }) {
  const cards = agent.cards;
  const people = knownPeople(agent.id);
  const keywordCards = findCards(agent, text);
  const keywordPerson = findPerson(agent.id, text);
  const actions = available(agent, scene);

  const schema = {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: Object.keys(KINDS) },
      topic: { type: 'string', enum: [...cards.map((c) => c.id), 'none'] },
      person: { type: 'string', enum: [...people.map((p) => p.id), 'none'] },
      ...(actions.length ? { action: { type: 'string', enum: [...actions.map((a) => a.id), 'none'] } } : {}),
    },
    required: ['kind', 'topic', 'person', ...(actions.length ? ['action'] : [])],
  };

  const system = [
    `A player in a game set in 1492 is talking to ${shortName(agent)}. Classify the player's LAST message. The player usually writes in Russian.`,
    '',
    'KINDS:',
    ...Object.entries(KINDS).map(([k, d]) => `- ${k}: ${d}`),
    '',
    `YOUR TOPICS (for kind "topic"; otherwise topic = "none"):`,
    ...cards.map((c) => `- ${c.id}: ${c.topic} (e.g. "${c.hint}")`),
    '',
    'PEOPLE (for kind "person"; otherwise person = "none"):',
    ...people.map((p) => `- ${p.id}: ${p.name}`),
    '',
    ...(actions.length ? [
      '',
      'ACTIONS (field "action"): ONLY if the player clearly asks or orders you to do this right now. A question about these things, small talk or "what should I do" is "none":',
      ...actions.map((a) => `- ${a.id}: ${a.en}`),
    ] : []),
    '',
    'If the message is a short follow-up ("and him?", "why?", "а он?"), use the recent conversation to decide.',
    keywordCards.length || keywordPerson ? `Keyword hints: ${[...keywordCards.map((c) => `topic ${c.id}`), keywordPerson && `person ${keywordPerson.id}`].filter(Boolean).join(', ')}` : '',
  ].join('\n');

  const recent = turns.slice(-4).map((t) => `${t.role === 'user' ? 'Player' : shortName(agent)}: ${t.content}`).join('\n');
  const user = `${recent ? `Recent conversation:\n${recent}\n\n` : ''}Player's last message: ${text}`;

  // Спросили о человеке экипажа, которого агент лично не знает (торговец о Пинсоне) — честно «не знаю его»
  if (keywordPerson && !knowsPerson(agent.id, keywordPerson)) {
    return { kind: 'stranger', card: null, person: keywordPerson, action: null, agentId: agent.id, ms: 0, via: 'keywords' };
  }

  try {
    const res = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { format: schema, temperature: 0, maxTokens: 60, priority: 2 });
    const out = JSON.parse(res.text);
    return { ...normalize(out, { cards, people, keywordCards, keywordPerson, text }), action: pickAction(agent, { modelAction: out.action, text, scene }), agentId: agent.id, ms: res.ms, via: 'llm' };
  } catch {
    return { ...fallback({ keywordCards, keywordPerson }), action: pickAction(agent, { text, scene }), agentId: agent.id, ms: 0, via: 'keywords' };
  }
}

// Модель могла выбрать вид без темы/человека — достраиваем по ключевым словам или понижаем до болтовни
const SEA_WORDS = /погод|ветер|ветр|шторм|бур[яюи]|дожд|туман|волн|небо|солнц|weather|wind|storm|rain|fog|waves/i;
const FAREWELL_WORDS = /пока|до свидан|прощай|бывай|увидимся|до встречи|мне пора|пойду|ухожу|bye|good ?bye|farewell|see you/i;

export function normalize(out, { cards, people, keywordCards, keywordPerson, text = '' }) {
  let { kind, topic, person } = out;
  // «ок», «ладно», «понятно» модель принимает за прощание и закрывает разговор
  if (kind === 'farewell' && !FAREWELL_WORDS.test(text)) kind = 'small_talk';
  // Тема из базы, найденная по словам, — не «неизвестное» (песочные часы, астролябия, Канары)
  if (kind === 'unknown' && keywordCards.length) { kind = 'topic'; topic = keywordCards[0].id; }
  // Погоду и море модель иногда считает «неизвестным» («какая погода завтра?») — моряк о них знает всё
  if (kind === 'unknown' && SEA_WORDS.test(text)) kind = 'small_talk';
  // Имя человека из экипажа в вопросе надёжнее догадки модели (если тема не подтверждена ключевыми словами)
  if (keywordPerson && kind !== 'person' && !keywordCards.some((c) => c.id === topic)) { kind = 'person'; person = keywordPerson.id; }
  if (keywordPerson && kind === 'person' && person !== keywordPerson.id) person = keywordPerson.id;
  const card = cards.find((c) => c.id === topic) ?? (kind === 'topic' ? keywordCards[0] : null);
  const who = people.find((p) => p.id === person) ?? (kind === 'person' ? keywordPerson : null);
  if (kind === 'topic' && !card) kind = who ? 'person' : 'small_talk';
  if (kind === 'person' && !who) kind = card ? 'topic' : 'small_talk';
  return { kind, card: kind === 'topic' ? card : null, person: kind === 'person' ? who : null };
}

function fallback({ keywordCards, keywordPerson }) {
  if (keywordPerson) return { kind: 'person', card: null, person: keywordPerson };
  if (keywordCards.length) return { kind: 'topic', card: keywordCards[0], person: null };
  return { kind: 'small_talk', card: null, person: null };
}
