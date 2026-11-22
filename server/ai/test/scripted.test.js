import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { setStore } from '../memory.js';

delete process.env.AI; // без AI=1 — заготовленные фразы, без Ollama
const { talk, getAgent, loadAgents, scriptedLine } = await import('../index.js');
const db = {};
setStore({ load: (u, a) => db[`${u}:${a}`], save: (u, a, m) => { db[`${u}:${a}`] = structuredClone(m); }, reset: (u, a) => delete db[`${u}:${a}`] });
loadAgents();

const AGENTS = ['columbus', 'storyteller', 'trader', 'musician', 'cacique', 'elder', 'admiral'];
const ctx = (over = {}) => ({ name: 'Тест', role: 'piloto', scene: 'ship_day', quests: {}, inventory: [], log: [], ...over });

test('every NPC that talked through the model has a prepared answer for every topic, about itself, farewell and the task', () => {
  for (const id of AGENTS) {
    const a = getAgent(id), s = a.script;
    assert.ok(s, `${id} has script`);
    for (const c of a.cards) {
      assert.ok(s.cards[c.id]?.ru && s.cards[c.id]?.en, `${id}.${c.id}`);
      assert.ok(s.cards[c.id].ru.length < 260, `${id}.${c.id} short enough for a subtitle`);
    }
    for (const k of ['about', 'farewell', 'task', 'stranger']) assert.ok(s[k]?.ru && s[k]?.en, `${id}.${k}`);
    if (!a.foreign) assert.match(s.task.ru, /\{task\}/); // чужак не понимает вопроса — только жесты
    if (!a.foreign) assert.match(s.cards[a.cards[0].id].ru, /[а-яё]/i, `${id} answers in Russian`);
  }
  assert.ok(getAgent('trader').script.trade.sold && getAgent('trader').script.trade.angry);
});

test('no model: a question from the hints gets its prepared answer at once, counts as told and offers the next questions', async () => {
  const r = await talk({ userId: 's1', npc: 'columbus', hintId: 'why_west', context: ctx() });
  assert.match(r.ru, /Сипанго/);
  assert.deepEqual(r.topicsTold, ['why_west']);
  assert.equal(r.timings.via, 'script');
  assert.ok(r.timings.total < 500, 'no waiting for a model');
  assert.ok(r.hints.length >= 2 && r.hints.some((h) => h.id === 'bye'));
  assert.ok(!r.hints.some((h) => h.id === 'why_west'), 'the told topic is not offered again');
});

test('no model: a typed question is matched by its words; nonsense gets an in-character fallback; farewell and «about you» work', async () => {
  const ships = await talk({ userId: 's2', npc: 'columbus', text: 'расскажи про наши корабли', context: ctx() });
  assert.match(ships.ru, /Санта-Мария/);
  const odd = await talk({ userId: 's2', npc: 'columbus', text: 'какой сегодня курс биткоина', context: ctx() });
  assert.ok(getAgent('columbus').fallbacks.some((f) => f.ru === odd.ru));
  assert.match((await talk({ userId: 's2', npc: 'columbus', hintId: 'self', context: ctx() })).ru, /Генуе/);
  assert.match((await talk({ userId: 's2', npc: 'columbus', hintId: 'bye', context: ctx() })).ru, /Ступай/);
});

test('no model: «what should I do» names the current quest step; trading answers by outcome; the strangers speak Spanish', async () => {
  const quests = JSON.parse(readFileSync(new URL('../../../content/quests.json', import.meta.url), 'utf8'));
  const q = quests.find((x) => x.scene === 'ship_day' && !x.optional && (x.role === 'all' || x.role === 'piloto'));
  const r = await talk({ userId: 's3', npc: 'columbus', hintId: 'task', context: ctx() });
  assert.ok(r.ru.includes(q.steps[0].text.charAt(0).toLowerCase() + q.steps[0].text.slice(1, 20)), r.ru);
  const sold = await talk({ userId: 's3', npc: 'trader', tradeResult: { item: 'cheese', offer: 40, outcome: 'sold', price: 40 }, context: ctx({ scene: 'canary' }) });
  assert.match(sold.ru, /Продано/);
  const gold = await talk({ userId: 's3', npc: 'admiral', hintId: 'gold', context: ctx({ scene: 'p2_landing' }) });
  assert.match(gold.ru, /oro/);
});

test('no model: asked about a crew member by name, an NPC tells who it is in Russian', async () => {
  const r = await talk({ userId: 's4', npc: 'storyteller', text: 'а кто такой Мартин Алонсо Пинсон?', context: ctx({ scene: 'ship_evening' }) });
  assert.match(r.ru, /Пинсон — капитан «Пинты»/);
});

test('no model: typed «what do I do», «who are you», «bye» and «tell me something» are understood by their words', async () => {
  const c = ctx();
  assert.match((await talk({ userId: 's5', npc: 'columbus', text: 'а что мне теперь делать?', context: c })).ru, /Твоё дело сейчас/);
  assert.match((await talk({ userId: 's5', npc: 'columbus', text: 'кто ты такой?', context: c })).ru, /Генуе/);
  const tale = await talk({ userId: 's5', npc: 'cacique', text: 'расскажи что-нибудь', context: ctx({ scene: 'p2_day' }) });
  assert.equal(tale.topicsTold.length, 1, 'an untold topic is told');
  assert.match((await talk({ userId: 's5', npc: 'columbus', text: 'ну всё, пока', context: c })).ru, /Ступай/);
});

test('scriptedLine picks the voiced key for prepared answers only', () => {
  const a = getAgent('elder');
  assert.equal(scriptedLine(a, { kind: 'topic', card: a.cards[0] }).key, `card_${a.cards[0].id}`);
  assert.equal(scriptedLine(a, { kind: 'farewell' }).key, 'farewell');
  assert.equal(scriptedLine(a, { kind: 'task_help' }, { task: { step: 'Go', ru: 'Иди' } }).key, undefined, 'a task answer changes — not voiced');
});
