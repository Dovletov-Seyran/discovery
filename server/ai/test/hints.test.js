import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.TTS = '0';
const { setTransport } = await import('../llm.js');
const { talk, setStore } = await import('../index.js');
const { getAgent } = await import('../agents.js');

// Память — в объекте, модель — заглушка: классификатор получает JSON, ответ и перевод — готовый текст
const db = {};
setStore({ load: (u, a) => db[`${u}:${a}`], save: (u, a, m) => { db[`${u}:${a}`] = structuredClone(m); }, reset: (u, a) => delete db[`${u}:${a}`] });
setTransport(async (messages, opts) => ({
  text: opts.format ? JSON.stringify({ kind: 'person', topic: 'none', person: 'martin_pinzon' }) : messages[0].content.startsWith('You are ') ? 'The wind is fair, sailor.' : 'Ветер попутный, моряк.',
  ms: 1,
}));

const ids = (hints) => hints.map((h) => h.id).join();
const context = { name: 'Сейран', role: 'piloto', scene: 'ship_day', quests: {} };

test('пять ответов подряд — каждый раз свежий набор, подходящий к последней теме', async () => {
  const cards = getAgent('columbus').cards.map((c) => c.id);
  const asks = [{ hintId: 'why_west' }, { hintId: 'reward' }, { text: 'Что думаешь о Пинсоне?' }, { hintId: 'person:martin_pinzon' }, { hintId: 'distance' }];
  let prev = null;
  for (const ask of asks) {
    const res = await talk({ userId: 'h1', npc: 'columbus', context, ...ask });
    const { hints } = res;
    assert.ok(hints.length >= 4 && hints.length <= 5, ids(hints));
    assert.equal(hints.at(-1).id, 'bye');
    assert.notEqual(ids(hints), prev);
    prev = ids(hints);
    assert.ok(hints.some((h) => h.id === 'task'), 'у игрока есть задание');
    if (ask.hintId && cards.includes(ask.hintId)) {
      // первая подсказка — следующий вопрос после рассказанной темы, сама тема уже не предлагается
      assert.equal(hints[0].id, cards[cards.indexOf(ask.hintId) + 1]);
      assert.ok(!hints.some((h) => h.id === ask.hintId));
    } else {
      assert.equal(hints[0].id, 'person:martin_pinzon');
      assert.equal(hints[0].ru, 'А что ещё о нём скажешь?');
    }
  }
});

test('«Расскажи о себе» пропадает, когда о себе уже спросили', async () => {
  const res = await talk({ userId: 'h2', npc: 'columbus', context, hintId: 'self' });
  assert.equal(res.timings.kind, 'about_you');
  assert.ok(!res.hints.some((h) => h.id === 'self'));
  const t = await talk({ userId: 'h2', npc: 'columbus', context, hintId: 'task' });
  assert.equal(t.timings.kind, 'task_help');
});
