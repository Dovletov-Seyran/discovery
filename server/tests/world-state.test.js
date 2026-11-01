import { test, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE = ':memory:';
process.env.AI = '0';
const db = await import('../db.js');
const game = await import('../game/index.js');
const { players } = await import('../game/players.js');
const director = await import('../game/director.js');
const entities = await import('../game/entities.js');
const world = await import('../game/world-state.js');
const quests = await import('../game/quests.js');
const rules = await import('../game/rules.js');
after(() => db.closeDb());

// Игрок с поддельным сокетом: всё, что ему пришло, — в inbox
function crew(login, role) {
  const inbox = [];
  const ws = { readyState: 1, send: (json) => inbox.push(JSON.parse(json)), close() {} };
  const p = game.join({ userId: db.createUser(login, 'x'), login }, ws);
  p.role = role;
  return { p, ws, inbox, patches: () => inbox.filter((m) => m.t === 'world_patch') };
}
const a = crew('ws-a', 'piloto');
director.init();

test('patch применяется и уходит всем; ошибки операций — понятные', () => {
  a.inbox.length = 0;
  const r = world.apply([
    { op: 'set', id: 'lantern', state: { lit: true } },
    { op: 'spawn', id: 'crate_x', kind: 'item', model: 'crate', p: [1, 0, 2], state: { item: 'biscuit' } },
  ]);
  assert.equal(r.ok, true);
  const [msg] = a.patches();
  assert.equal(msg.ops.length, 2);
  assert.deepEqual(msg.ops[0], { op: 'set', id: 'lantern', state: { lit: true } });
  assert.equal(msg.ops[1].op, 'spawn');
  assert.equal(msg.ops[1].zone, director.zone());
  assert.ok(world.isApplied([{ op: 'set', id: 'lantern', state: { lit: true } }]));
  assert.ok(!world.isApplied([{ op: 'set', id: 'lantern', state: { lit: false } }]));
  assert.match(world.apply([{ op: 'fly', id: 'x' }]).error, /op/);
  assert.match(world.apply([{ op: 'spawn', id: 'x' }]).error, /позиция/);
  // повторный remove ничего не шлёт
  world.apply([{ op: 'remove', id: 'crate_x' }]);
  a.inbox.length = 0;
  world.apply([{ op: 'remove', id: 'crate_x' }]);
  assert.equal(a.patches().length, 0);
});

test('переживает рестарт: снапшот в БД → load', () => {
  world.apply([{ op: 'spawn', id: 'keep_me', kind: 'barrel', model: 'barrel', p: [0, 0, 0] }, { op: 'remove', id: 'hourglass' }]);
  director.persistNow();
  const saved = db.loadGameState().entities;
  world.load(null);
  assert.equal(world.has('keep_me'), false);
  entities.load(saved);
  assert.equal(world.has('keep_me'), true);
  assert.equal(world.has('hourglass'), false);
  assert.ok(world.isApplied([{ op: 'set', id: 'lantern', state: { lit: true } }]));
});

test('новый и переподключившийся игрок получает полное состояние', () => {
  const b = crew('ws-b', 'grumete');
  const full = b.patches().find((m) => m.full);
  assert.ok(full, 'полный world_patch при входе');
  const byId = Object.fromEntries(full.ops.map((o) => [o.id, o]));
  assert.equal(byId.keep_me.op, 'spawn');
  assert.equal(byId.hourglass.op, 'remove');
  assert.deepEqual(byId.lantern.state, { lit: true });
  // переподключение
  b.inbox.length = 0;
  game.leave(b.p, b.ws);
  const ws2 = { readyState: 1, send: (json) => b.inbox.push(JSON.parse(json)), close() {} };
  game.join({ userId: b.p.id, login: 'ws-b' }, ws2);
  assert.ok(b.patches().some((m) => m.full && m.ops.some((o) => o.id === 'keep_me')));
});

test('сброс: /reset и новое прохождение забывают патчи и говорят клиентам', () => {
  a.inbox.length = 0;
  director.resetToStart();
  assert.equal(world.all().length, 0);
  // явные операции: клиент Санджара не обязан понимать full
  const ops = a.patches().flatMap((m) => m.ops);
  assert.ok(ops.some((o) => o.op === 'remove' && o.id === 'keep_me'));
  assert.ok(ops.some((o) => o.op === 'set' && o.id === 'lantern' && o.state.lit === null));
});

test('предмет из патча можно взять — у всех он исчезает', () => {
  director.setScene('ship_day');
  world.apply([{ op: 'spawn', id: 'ration_t', kind: 'item', model: 'biscuit', zone: 'ship', p: [0.5, 0, 0.5], state: { item: 'biscuit' } }]);
  a.p.zone = 'ship';
  a.p.p = [0.5, 0, 0.5];
  a.p.inventory = [];
  a.inbox.length = 0;
  game.handle(a.p, { t: 'pickup', id: 'ration_t' });
  assert.ok(a.p.inventory.includes('biscuit'));
  assert.equal(world.has('ration_t'), false);
  assert.ok(a.patches().some((m) => m.ops.some((o) => o.op === 'remove' && o.id === 'ration_t')));
});

test('поступки: вода с Гомеры — бочки вечером, руль починен — Пинта из ремонта', () => {
  director.resetToStart();
  director.setScene('canary');
  const party = players.party();
  // водонос — юнга: игрок ws-b; руль — штурман: ws-a
  const grumete = party.find((p) => p.role === 'grumete');
  quests.completeFor(grumete, 'canary');
  assert.equal(world.has('water_barrel_1'), false, 'бочки — только вечером');
  quests.completeFor(a.p, 'canary');
  assert.deepEqual(world.get('pinta').state, { repaired: true });
  director.setScene('ship_evening');
  assert.equal(world.get('water_barrel_1')?.zone, 'ship');
  // страховочный таймер не считается поступком
  director.resetToStart();
  director.setScene('canary');
  quests.forceComplete(director.scene(), players.party());
  director.setScene('ship_evening');
  assert.equal(world.has('water_barrel_1'), false);
  assert.equal(world.has('pinta'), false);
});

test('после смены сцены (и зоны) агентские объекты приходят заново', () => {
  director.setScene('ship_day');
  world.apply([{ op: 'spawn', id: 'again', kind: 'prop', item: 'cheese', zone: 'ship', p: [0, 0, 0] }]);
  a.inbox.length = 0;
  director.setScene('ship_evening');
  assert.ok(a.patches().some((m) => m.full && m.ops.some((o) => o.id === 'again' && o.item === 'cheese')));
});

test('купили товар с прилавка — он исчезает', async () => {
  director.setScene('canary');
  world.apply([{ op: 'spawn', id: 'goods_cheese', kind: 'goods', model: 'cheese', at: 'trader', off: [-1.6, 0.95, 0] }]);
  const g = world.get('goods_cheese');
  const trader = entities.def('trader');
  assert.equal(g.p[0], Math.round((trader.p[0] - 1.6) * 100) / 100);
  a.p.zone = 'canary';
  a.p.p = [...trader.p];
  a.p.money = 100;
  a.p.trade = {};
  a.p.inventory = [];
  a.p.lastTradeAt = 0;
  a.p.npcRequest = null;
  await rules.trade(a.p, { npc: 'trader', item: 'cheese', offer: 40 });
  assert.ok(a.p.inventory.includes('cheese'));
  assert.equal(world.has('goods_cheese'), false);
});
