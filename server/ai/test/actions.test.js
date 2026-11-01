import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.TTS = '0';
const { setTransport } = await import('../llm.js');
const { talk, setStore } = await import('../index.js');
const { getAgent } = await import('../agents.js');
const { pickAction, decide, setWorld, resetCooldowns, storyPlan, available } = await import('../actions.js');
const world = await import('../../game/world-state.js');

// Память — в объекте; мир — настоящий world-state, рассылка — в массив
const db = {};
setStore({ load: (u, a) => db[`${u}:${a}`], save: (u, a, m) => { db[`${u}:${a}`] = structuredClone(m); }, reset: (u, a) => delete db[`${u}:${a}`] });
const sent = [];
world.setHooks({ broadcast: (m) => sent.push(m), anchor: (id) => (id === 'trader' ? [270, 3, 292] : null), zone: () => 'ship' });
setWorld({ isApplied: world.isApplied, apply: world.apply, hasFlag: world.hasFlag, setFlag: world.setFlag });

// Заглушка модели: классификатор возвращает то, что задал тест; ответ и перевод — готовый текст
let classified = {};
const calls = [];
setTransport(async (messages, opts) => {
  calls.push({ messages, opts });
  if (opts.format) return { text: JSON.stringify({ kind: 'small_talk', topic: 'none', person: 'none', action: 'none', ...classified }), ms: 1 };
  return { text: messages[0].content.startsWith('You are ') ? 'Aye, it is done.' : 'Есть, сделано.', ms: 1 };
});

const columbus = getAgent('columbus');
const trader = getAgent('trader');
const ctx = (scene) => ({ name: 'Сейран', role: 'piloto', scene, quests: {} });
const act = (id) => columbus.actions.find((a) => a.id === id);

beforeEach(() => {
  classified = {};
  calls.length = 0;
  sent.length = 0;
  resetCooldowns();
  world.load(null);
});

test('просьбы узнаются, вопросы и болтовня — нет (ложные срабатывания недопустимы)', () => {
  const scene = 'ship_evening';
  const asks = {
    'Адмирал, зажгите фонари': 'light_lanterns',
    'Поднимите флаг Кастилии!': 'raise_flag',
    'Уберите паруса, адмирал': 'furl_sails',
    'Адмирал, выдайте паёк': 'give_rations',
    'Раздай сухари команде': 'give_rations',
  };
  for (const [text, id] of Object.entries(asks)) {
    assert.equal(pickAction(columbus, { modelAction: id, text, scene })?.id, id, text);
    assert.equal(pickAction(columbus, { modelAction: 'none', text, scene })?.id, id, `${text} — без модели`);
  }
  const not = ['Как дела?', 'Что мне делать?', 'Расскажи про фонари', 'Хочу кушать', 'Зачем нам флаг?', 'Почему паруса такие большие?', 'Где взять еду?', 'Поднимите якорь'];
  for (const text of not) {
    // даже если модель ошиблась и выбрала действие
    for (const a of columbus.actions) assert.equal(pickAction(columbus, { modelAction: a.id, text, scene }), null, `${text} → ${a.id}`);
  }
  assert.equal(pickAction(trader, { modelAction: 'show_goods', text: 'Покажи товар', scene: 'canary' })?.id, 'show_goods');
  assert.equal(pickAction(trader, { modelAction: 'show_goods', text: 'Что у тебя есть?', scene: 'canary' }), null);
});

test('в классификатор попадают только действия этой сцены; ночные по расписанию — никогда', () => {
  assert.deepEqual(available(columbus, 'ship_day').map((a) => a.id), ['light_lanterns', 'raise_flag', 'furl_sails', 'give_rations']);
  assert.deepEqual(available(columbus, 'canary'), []);
  assert.deepEqual(available(getAgent('storyteller'), 'night_story'), []);
});

test('разрешение: сцена, кулдаун, «уже сделано», разовость', () => {
  const t0 = 1_000_000;
  assert.deepEqual(decide(columbus, act('light_lanterns'), { scene: 'canary', now: t0 }), { ok: false, reason: 'scene' });
  assert.deepEqual(decide(columbus, act('light_lanterns'), { scene: 'ship_day', now: t0 }), { ok: true });
  const cd = decide(columbus, act('light_lanterns'), { scene: 'ship_day', now: t0 + 1000 });
  assert.equal(cd.reason, 'cooldown');
  assert.equal(cd.waitSec, 59);
  // кулдаун прошёл, но фонари уже горят
  world.apply(act('light_lanterns').patch);
  assert.equal(decide(columbus, act('light_lanterns'), { scene: 'ship_day', now: t0 + 61_000 }).reason, 'done');
  // паёк — один раз за прохождение
  world.setFlag('action:columbus:give_rations');
  assert.equal(decide(columbus, act('give_rations'), { scene: 'ship_day', now: t0 }).reason, 'once');
});

test('talk: одобренное действие — patch уходит в world-state, агент отдаёт приказ; без отдельного вызова модели', async () => {
  classified = { action: 'light_lanterns' };
  const res = await talk({ userId: 'a1', npc: 'columbus', context: ctx('ship_day'), text: 'Адмирал, зажгите фонари' });
  assert.deepEqual(res.action, { id: 'light_lanterns', ok: true, reason: null });
  assert.equal(res.timings.kind, 'action');
  assert.equal(calls.filter((c) => c.opts.format).length, 1, 'один вызов классификатора');
  assert.equal(calls.length, 3, 'классификатор + ответ + перевод');
  const schema = calls[0].opts.format;
  assert.deepEqual(schema.properties.action.enum, ['light_lanterns', 'raise_flag', 'furl_sails', 'give_rations', 'none']);
  assert.match(calls[1].messages.at(-2).content, /You agree and give the order/);
  assert.equal(world.get('lantern').state.lit, true);
  assert.ok(sent.some((m) => m.t === 'world_patch' && m.ops.some((o) => o.id === 'stern_lamp')));
});

test('talk: повтор — вежливый отказ в образе, мир не меняется', async () => {
  classified = { action: 'raise_flag' };
  await talk({ userId: 'a2', npc: 'columbus', context: ctx('ship_day'), text: 'Поднимите флаг!' });
  sent.length = 0;
  calls.length = 0;
  const again = await talk({ userId: 'a3', npc: 'columbus', context: ctx('ship_day'), text: 'Поднимите флаг!' });
  assert.deepEqual(again.action, { id: 'raise_flag', ok: false, reason: 'cooldown' });
  assert.match(calls[1].messages.at(-2).content, /Refuse politely/);
  assert.equal(sent.length, 0);
});

test('talk: «расскажи про фонари» — обычный разговор, даже если модель выбрала действие', async () => {
  classified = { kind: 'small_talk', action: 'light_lanterns' };
  const res = await talk({ userId: 'a4', npc: 'columbus', context: ctx('ship_day'), text: 'Расскажи про фонари' });
  assert.equal(res.action, null);
  assert.notEqual(res.timings.kind, 'action');
  assert.equal(world.has('lantern'), false);
});

test('talk: паёк — сухари на столе, их можно взять; второй раз не выдаётся', async () => {
  classified = { action: 'give_rations' };
  const res = await talk({ userId: 'a5', npc: 'columbus', context: ctx('ship_evening'), text: 'Адмирал, выдайте паёк' });
  assert.equal(res.action.ok, true);
  assert.equal(world.get('ration_1').kind, 'item');
  assert.equal(world.get('ration_1').item, 'biscuit');
  resetCooldowns();
  const again = await talk({ userId: 'a5', npc: 'columbus', context: ctx('ship_evening'), text: 'Выдай паёк ещё раз' });
  assert.equal(again.action.reason, 'once');
});

test('торговец раскладывает товар на прилавке (у торговца, на высоте прилавка)', async () => {
  classified = { action: 'show_goods' };
  const res = await talk({ userId: 'a6', npc: 'trader', context: ctx('canary'), text: 'Покажи товар' });
  assert.equal(res.action.ok, true);
  assert.deepEqual(world.get('goods_meat').p, [268.4, 3.95, 292]);
});

test('модель недоступна: разрешённое действие всё равно выполняется, агент говорит заготовку', async () => {
  setTransport(async () => { throw new Error('ollama down'); });
  try {
    const res = await talk({ userId: 'a7', npc: 'columbus', context: ctx('ship_day'), text: 'Уберите паруса' });
    assert.equal(res.action.ok, true);
    assert.equal(res.en, act('furl_sails').reply);
    assert.equal(res.ru, act('furl_sails').replyRu);
    assert.equal(world.get('sails').state.furled, true);
  } finally {
    setTransport(async (messages, opts) => (opts.format
      ? { text: JSON.stringify({ kind: 'small_talk', topic: 'none', person: 'none', action: 'none', ...classified }), ms: 1 }
      : { text: 'Aye.', ms: 1 }));
  }
});

test('ночная история: туман густеет и фонарь тускнеет по таймингам night_story.json', () => {
  const segments = [{ line: 's1', pause: 1 }, { line: 's2', pause: 1 }, { line: 's3', pause: 1 }, { line: 's4', pause: 1 }, { line: 's5', pause: 1 }, { line: 's6', pause: 1 }, { line: 's7', pause: 1 }, { line: 's8', pause: 1 }];
  const durations = [9, 9, 9, 9, 9, 9, 9, 9];
  const plan = storyPlan([getAgent('storyteller')], { scene: 'night_story', segments, durations, maxDuration: 150 });
  assert.deepEqual(plan.map((x) => x.ms), [0, 20_000, 40_000, 50_000, 70_000]);
  const fog = plan.map((x) => x.action.patch.find((o) => o.id === 'fog').state.density);
  const light = plan.map((x) => x.action.patch.find((o) => o.id === 'lantern').state.brightness);
  for (let i = 1; i < 4; i++) assert.ok(fog[i] > fog[i - 1] && light[i] < light[i - 1], 'туман густеет, фонарь тускнеет');
  assert.ok(fog[4] < fog[3] && light[4] > light[3], '«просто сказки» — отпускает');
  // история длиннее сцены — ускоряется, как на клиенте
  const fast = storyPlan([getAgent('storyteller')], { scene: 'night_story', segments, durations, maxDuration: 40 });
  assert.equal(fast.at(-1).ms, 35_000);
  assert.deepEqual(storyPlan([getAgent('storyteller')], { scene: 'ship_day', segments, durations }), []);
});
