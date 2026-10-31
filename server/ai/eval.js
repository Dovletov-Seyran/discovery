// Проверка разговора с агентом на настоящей модели: каверзные вопросы, экипаж, память, уход и возвращение.
// npm run eval:ai -w server -- [columbus|storyteller|trader]    (голос выключен для скорости)
import { AI } from './config.js';
import { talk, init } from './index.js';
import { loadMemory, saveMemory } from './memory.js';

AI.TTS_ENABLED = false;
const npc = process.argv[2] || 'columbus';
const userId = `eval_${Date.now()}`;
const context = {
  name: 'Сейран', role: 'lengua', scene: npc === 'trader' ? 'canary' : npc === 'storyteller' ? 'ship_evening' : 'ship_day',
  log: [], quests: {}, party: [{ name: 'Сейран', role: 'lengua' }, { name: 'Кирилл', role: 'piloto' }, { name: 'Санжар', role: 'grumete' }],
};

const SCRIPT = [
  '',
  'Ты смотрел One Piece? Какой там сюжет?',
  'А у тебя есть телефон?',
  'Кто такой Мартин Пинсон?',
  'А что думаешь про Хуана де ла Косу?',
  'Кто у нас на корабле штурман?',
  'Как ты? Скучаешь по семье?',
  'Меня зовут Сейран, я из Севильи, у меня есть младшая сестра.',
  'Что мне сейчас делать?',
  'Зачем мы плывём на запад?',
  '«уходит на 10 минут»',
  '',
  'Помнишь, что я тебе о себе рассказывал?',
  'Ты знаешь про Америку?',
  'Ты дурак',
  'Ладно, пока!',
];

await init();
console.log(`\n=== ${npc}, игрок «${context.name}» (${context.role}) ===`);
for (const line of SCRIPT) {
  if (line.startsWith('«')) {
    const mem = loadMemory(userId, npc);
    mem.lastAt -= 10 * 60_000;
    saveMemory(userId, npc, mem);
    console.log(`\n—— ${line} ——`);
    continue;
  }
  const r = await talk({ userId, npc, text: line, context });
  const t = r.timings;
  console.log(`\n> ${line || '(подходит)'}`);
  console.log(`  [${t.kind ?? '?'}${t.cards?.length ? ':' + t.cards[0] : ''}${t.person ? ':' + t.person : ''}${t.returning ? ' · вернулся через ' + t.returning : ''}] ${t.understand ?? 0}+${t.llm ?? 0}+${t.translate ?? 0} мс`);
  console.log(`  EN: ${r.en}`);
  console.log(`  RU: ${r.ru}`);
}
// Сжатие памяти идёт в фоне с низким приоритетом — в игре между репликами есть паузы, здесь подождём
for (let i = 0; i < 60 && !loadMemory(userId, npc).summary; i++) await new Promise((r) => setTimeout(r, 1000));
const mem = loadMemory(userId, npc);
console.log(`\n=== Память: ${mem.turns.length} реплик дословно, рассказано тем: ${mem.told.length} ===\nРезюме: ${mem.summary || '(ещё не сжималось)'}`);
process.exit(0);
