import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAgent, findPerson, knowsPerson, currentTask, knownPeople } from '../agents.js';
import { buildMessages, latin } from '../prompt.js';
import { loadMemory, saveMemory, setStore, turnsToCompress } from '../memory.js';
import { AI } from '../config.js';

// Память в тестах — в объекте, а не в файле
const db = {};
setStore({ load: (u, a) => db[`${u}:${a}`], save: (u, a, m) => { db[`${u}:${a}`] = structuredClone(m); }, reset: (u, a) => delete db[`${u}:${a}`] });

test('память старого формата (history — массив) читается', () => {
  db['old:columbus'] = { told: ['why_west'], history: [{ role: 'user', content: 'Куда плывём?' }, { role: 'assistant', content: 'West.' }] };
  const mem = loadMemory('old', 'columbus');
  assert.deepEqual(mem.told, ['why_west']);
  assert.equal(mem.turns.length, 2);
  assert.equal(mem.summary, '');
});

test('память сохраняет резюме и время встречи', () => {
  const mem = loadMemory('new', 'columbus');
  mem.turns.push({ role: 'user', content: 'Привет', at: 1 }, { role: 'assistant', content: 'Hello.', at: 1 });
  Object.assign(mem, { summary: 'They are from Seville.', lastAt: 123, lastScene: 'ship_day' });
  saveMemory('new', 'columbus', mem);
  const back = loadMemory('new', 'columbus');
  assert.equal(back.summary, 'They are from Seville.');
  assert.equal(back.lastAt, 123);
  assert.equal(back.turns.length, 2);
});

test('сжатие: старые реплики уходят в резюме, последние остаются дословно', () => {
  const turns = Array.from({ length: AI.MEMORY_COMPRESS_AT + 2 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i), at: i }));
  assert.equal(turnsToCompress({ turns }).length, turns.length - AI.MEMORY_RECENT_TURNS);
  assert.equal(turnsToCompress({ turns: turns.slice(0, 4) }).length, 0);
});

test('человек по имени: самое точное совпадение', () => {
  assert.equal(findPerson('columbus', 'А что думаешь про Хуана де ла Косу?').id, 'juan_de_la_cosa');
  assert.equal(findPerson('columbus', 'Что думаешь про старого Хуана?').id, 'old_juan');
  assert.equal(findPerson('columbus', 'Кто такой Мартин Пинсон?').id, 'martin_pinzon');
  assert.equal(findPerson('columbus', 'Кто у нас штурман?').id, 'pero_nino');
  assert.equal(findPerson('columbus', 'Как дела?'), null);
});

test('торговец лично не знает экипаж Колумба, но знает правительницу', () => {
  assert.equal(knowsPerson('trader', findPerson('trader', 'Кто такой Пинсон?')), false);
  assert.equal(knowsPerson('trader', findPerson('trader', 'Кто такая Беатрис?')), true);
  assert.ok(knownPeople('columbus').length >= 10);
});

test('задание «про меня»: от первого лица; общее задание (role: all) находится', () => {
  const t = currentTask({ scene: 'ship_day', role: 'lengua', quests: {} }, 'columbus');
  assert.equal(t.aboutYou, true);
  assert.match(t.step, /^Ask me about/);
  assert.match(t.step, /promised me/);
  assert.equal(currentTask({ scene: 'ship_day', role: 'piloto', quests: {} }, 'columbus').aboutYou, false);
  assert.match(currentTask({ scene: 'ship_evening', role: 'lengua', quests: {} }, 'storyteller').step, /feast/);
  assert.equal(currentTask({ scene: 'ship_day', role: 'lengua', quests: { q_ask_columbus: { status: 'done' } } }), null);
});

test('имена игроков в промпте — латиницей', () => {
  assert.equal(latin('Сейран'), 'Seyran');
  assert.equal(latin('Кирилл'), 'Kirill');
  assert.equal(latin('Luis'), 'Luis');
});

test('промпт: время и место, память, инструкция последней перед репликой', () => {
  const agent = getAgent('columbus');
  const mem = { told: ['why_west'], turns: [{ role: 'user', content: 'Куда?', at: 1 }, { role: 'assistant', content: 'West.', at: 1 }], summary: 'They are from Seville.' };
  const msgs = buildMessages({ agent, context: { name: 'Сейран', role: 'lengua' }, intent: { kind: 'unknown', agentId: 'columbus' }, mem, text: 'One Piece?' });
  const system = msgs[0].content;
  assert.match(system, /TIME AND PLACE: It is early August 1492/);
  assert.match(system, /They are from Seville\./);
  assert.match(system, /already told them about: the purpose of the voyage/);
  assert.match(system, /Seyran/);
  assert.doesNotMatch(system, /Сейран/);
  assert.equal(msgs.at(-1).content, 'One Piece?');
  assert.match(msgs.at(-2).content, /^WHAT TO DO NOW: .*never heard/);
});
test('NPC can explain a shared task left by a missing role',()=>{
 const task=currentTask({scene:'ship_day',role:'piloto',quests:{q_latitude:{status:'done'},q_hourglass:{status:'active',step:0,shared:true}}},'columbus');
 assert.match(task.step,/sand glass/i);
});

test('быт и места: факты по зоне сцены, общий вопрос «что делать» отличается от вопроса о вещи', async () => {
  const { worldFacts } = await import('../agents.js');
  const { GENERIC_HELP } = await import('../prompt.js');
  assert.match(worldFacts({ scene: 'ship_day' }).join(' '), /cook/);
  assert.match(worldFacts({ scene: 'canary' }).join(' '), /well/);
  assert.ok(GENERIC_HELP.test('что мне делать?'));
  assert.ok(GENERIC_HELP.test('помоги мне'));
  assert.ok(!GENERIC_HELP.test('где мне найти астролябию?'));
  const msgs = buildMessages({ agent: getAgent('columbus'), context: { name: 'A', role: 'grumete', scene: 'ship_day' }, intent: { kind: 'need', agentId: 'columbus' }, mem: { told: [], turns: [], summary: '' }, text: 'я хочу кушать' });
  assert.match(msgs.at(-2).content, /cook/);
});

// ИИ — только у ключевых агентов (одна модель на маке); остальные — неагентные NPC с готовыми репликами
const AGENTS=['columbus','storyteller','trader','musician','cacique','elder','admiral'];
test('only the key characters are AI agents; every other NPC has its own scripted lines',async()=>{
 const {readFileSync}=await import('node:fs');
 const npcs=JSON.parse(readFileSync(new URL('../../../content/npcs.json',import.meta.url)));
 const lines=JSON.parse(readFileSync(new URL('../../../content/lines.json',import.meta.url)));
 assert.deepEqual(npcs.filter(n=>n.type==='llm').map(n=>n.id).sort(),[...AGENTS].sort());
 for(const n of npcs.filter(n=>n.type!=='llm'))assert.ok(lines.some(l=>l.npc===n.id),`${n.id}: нет готовых реплик`);
});
test('each AI agent has a usable bounded profile and knows its current work',async()=>{
 for(const id of AGENTS){
  const n={id};const agent=getAgent(n.id);assert.ok(agent.cards.length&&agent.greeting.en&&agent.greeting.ru);
  const messages=buildMessages({agent,context:{activity:'Inspect the rigging',scene:'ship_day'},intent:{kind:'about_you',agentId:n.id},mem:{told:[],turns:[]},text:'What are you doing?'});
  assert.match(messages[0].content,/YOUR CURRENT WORK: Inspect the rigging/);
  assert.ok(agent.rules.length>0);
 }
});

test('a hungry player talking to the cook gets first-person facts, not directions to another cook',async()=>{
 const {worldFacts}=await import('../agents.js');const facts=worldFacts({scene:'ship_day'},'cook');
 assert.match(facts[0],/I am the cook/);assert.doesNotMatch(facts[0],/go to the cook|the cook .*hands out/i);
 const msgs=buildMessages({agent:getAgent('cook'),context:{scene:'ship_day'},intent:{kind:'need'},mem:{told:[],turns:[]},text:'че пожрать есть?'});
 assert.match(msgs.at(-2).content,/I am the cook/);assert.match(msgs[0].content,/first person/);
});
