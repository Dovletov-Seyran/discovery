import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AI } from './config.js';
import { tokenize, wordsMatch } from './retrieval.js';

const agents = new Map();
// агент → его запись в crew.json (Старый Хуан там old_juan, торговец — gonzalo)
const AGENT_PERSON = { columbus: 'columbus', storyteller: 'old_juan', trader: 'gonzalo', boatswain:'boatswain',cook:'cook',sailor_1:'sailor_diego',sailor_2:'sailor_pedro',sailor_3:'sailor_sancho',beatriz:'beatriz',carpenter:'carpenter' };
let crew = null;
let quests = null;
let facts = null;

export function loadAgents() {
  agents.clear();
  for (const file of readdirSync(AI.AGENTS_DIR).filter((f) => f.endsWith('.json'))) {
    const agent = JSON.parse(readFileSync(join(AI.AGENTS_DIR, file), 'utf8'));
    agents.set(agent.id, agent);
  }
  crew = JSON.parse(readFileSync(AI.CREW_FILE, 'utf8')).people;
  quests = JSON.parse(readFileSync(AI.QUESTS_FILE, 'utf8'));
  facts = JSON.parse(readFileSync(AI.FACTS_FILE, 'utf8'));
  return agents;
}

// Быт и места там, где сейчас идёт сцена: корабль или Канары
export function worldFacts(context = {}, agentId) {
  if (!agents.size) loadAgents();
  const scene=String(context.scene ?? '');
  const zone=scene.startsWith('p2')?'guanahani':scene.startsWith('canary')?'canary':'ship';
  const overrides=agents.get(agentId)?.personalFacts??{};
  return (facts[zone]??[]).map(f=>Object.entries(overrides).find(([prefix])=>f.startsWith(prefix))?.[1]??f);
}

export function getAgent(id) {
  if (!agents.size) loadAgents();
  const agent = agents.get(id);
  if (!agent) throw new Error(`unknown agent: ${id}`);
  return agent;
}

// Люди, которых знает агент: у кого есть его мнение (себя самого агент не «знает» как постороннего)
export function knownPeople(agentId) {
  if (!crew) loadAgents();
  return crew.filter((p) => (p.opinions?.[agentId] || agents.get(agentId)?.knownCrew?.includes(p.id)) && p.id !== (AGENT_PERSON[agentId] ?? agentId));
}

// Человек из экипажа по имени в реплике игрока: самое точное совпадение («Хуан де ла Коса» важнее «Хуан»).
// Ищем среди всех людей мира: агент может и не знать человека лично — тогда он так и скажет.
export function findPerson(agentId, text) {
  if (!crew) loadAgents();
  const words = tokenize(text || '');
  if (!words.length) return null;
  let best = null;
  let bestScore = 0;
  for (const p of crew) {
    if (p.id === AGENT_PERSON[agentId]) continue;
    for (const alias of p.aliases) {
      const parts = tokenize(alias);
      if (parts.length && parts.length > bestScore && parts.every((part) => words.some((w) => wordsMatch(w, part)))) {
        best = p;
        bestScore = parts.length;
      }
    }
  }
  return best;
}

export const knowsPerson = (agentId, person) => !!person?.opinions?.[agentId] || !!agents.get(agentId)?.knownCrew?.includes(person?.id);

// Текущее задание игрока в этой сцене: { title, step, aboutYou } (шаг — по-английски, из content/quests.json)
// Что игрок уже сделал в игре (выполненные задания) — агент «видел сам или слышал от других»
export function deedsOf(context = {}) {
  if (!agents.size) loadAgents();
  const done = new Set(context.questsDone ?? []);
  return quests.filter((q) => done.has(q.id) && q.doneEn).map((q) => q.doneEn);
}

export function currentTask(context = {}, agentId = null) {
  if (!quests) loadAgents();
  const state = context.quests ?? {};
  const mine = quests.filter((q) => q.scene === context.scene && (!q.role || q.role === 'all' || q.role === context.role || state[q.id]?.shared) && !q.optional);
  for (const q of mine) {
    const st = state[q.id];
    if (st?.status === 'done') continue;
    const current = q.steps[Math.min(st?.step ?? 0, q.steps.length - 1)];
    const text = current?.en ?? current?.text ?? '';
    // Задание про самого собеседника («спроси Адмирала» у Колумба) — маленькая модель иначе не узнаёт себя:
    // «Ask the Admiral … promised him» → «Ask me … promised me»
    const me = agentId && crew.find((p) => p.id === AGENT_PERSON[agentId]);
    const alias = me?.aliases.find((a) => /^[a-z]/i.test(a) && new RegExp(`\\b${a}\\b`, 'i').test(text));
    const step = alias ? text.replace(new RegExp(`(the )?\\b${alias}\\b`, 'i'), 'me').replace(/\bhim\b/g, 'me') : text;
    return { title: q.title, step, aboutYou: !!alias };
  }
  return null;
}

// Имена людей экипажа по-русски — словарь для перевода субтитров
export function crewNames() {
  if (!crew) loadAgents();
  const full = crew.filter((p) => p.ru && /^[A-Z]/.test(p.name.replace(/^(Admiral|Dona|Old) /, ''))).map((p) => ({ en: p.name, ru: p.ru }));
  // и отдельно фамилии: модель часто пишет «Pinzon» без имени
  const last = full.filter((n) => n.en.includes(' ') && n.ru.includes(' ')).map((n) => ({ en: n.en.split(' ').at(-1), ru: n.ru.split(' ').at(-1) }));
  return [...full, ...last];
}
