import test from 'node:test';
import assert from 'node:assert/strict';

// Одиночная сборка (itch.io): сохранения в localStorage вместо SQLite и заглушки модулей Node
const memory = new Map();
globalThis.localStorage ??= { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
globalThis.addEventListener ??= () => {};
globalThis.document ??= { visibilityState: 'visible' };

test('solo db: name-only login, player state and game state survive a reload of the store', async () => {
  const db = await import('../src/solo/shims/db.js');
  const id = db.createUser('Тестер', '');
  assert.throws(() => db.createUser('тестер', ''), /UNIQUE/);
  const token = db.createSession(id);
  assert.deepEqual(db.getSession(token), { token, userId: id, login: 'Тестер' });
  assert.equal(db.getSession('nope'), undefined);

  db.savePlayer(id, { role: 'grumete', scene: 'ship_day', zone: 'ship', p: [1, 2, 3], r: 0.5, inventory: ['purse', 'no_such_item'], money: 7, quests: { q: 1 } }, { now: true });
  db.saveGameState({ scene: 'ship_day', startAt: 5, entities: { a: 1 } });
  db.closeDb();
  const saved = JSON.parse(localStorage.getItem('discovery.solo.save'));
  assert.equal(saved.game.scene, 'ship_day');
  const p = db.loadPlayer(id);
  assert.deepEqual([p.role, p.scene, p.p, p.money, p.inventory], ['grumete', 'ship_day', [1, 2, 3], 7, ['purse']]);
  assert.equal(db.loadScenePlayers('ship_day')[0].id, id);

  db.putChunk('ship', 0, 0, { zone: 'ship' });
  assert.deepEqual(db.getChunk('ship', 0, 0), { zone: 'ship' });
  assert.equal(db.worldMeta().totalChunks, 1);
  assert.equal(JSON.parse(localStorage.getItem('discovery.solo.save')).chunks, undefined, 'мир не сохраняется');

  db.resetProgress();
  assert.equal(db.loadPlayer(id), null);
  assert.equal(db.loadGameState(), null);
  assert.ok(db.getSession(token), 'имя-слот остаётся после «Новой игры»');
});

test('solo shims: path, url and crypto behave like Node for the server code paths', async () => {
  const path = await import('../src/solo/shims/path.js');
  const { fileURLToPath } = await import('../src/solo/shims/url.js');
  const crypto = await import('../src/solo/shims/crypto.js');
  assert.equal(path.join('/__repo__/content/', 'agents', 'x.json'), '/__repo__/content/agents/x.json');
  assert.equal(path.resolve('/a/b', '../c'), '/a/c');
  assert.equal(fileURLToPath(new URL('../content/', 'file:///__repo__/server/content.js')), '/__repo__/content/');
  const h = (s) => crypto.createHash('sha1').update(s).digest('hex');
  assert.equal(h('abc'), h('abc'));
  assert.notEqual(h('abc'), h('abd'));
  for (let i = 0; i < 50; i++) { const n = crypto.randomInt(3, 6); assert.ok(n >= 3 && n < 6); }
  assert.equal(crypto.randomBytes(32).toString('base64url').length, 43);
});
