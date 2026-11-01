import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DB_FILE = ':memory:';
process.env.TTS = '0';
process.env.ADMIN_TOKEN = 'test-admin-token';
const { AI } = await import('../ai/config.js');
const { setTransport } = await import('../ai/llm.js');
const db = await import('../db.js');
const ai = await import('../game/ai-bridge.js');
const { handleHttp } = await import('../http.js');

// Агенты — во временной копии: тест не трогает content/agents
const dir = mkdtempSync(join(tmpdir(), 'agents-'));
cpSync(AI.AGENTS_DIR, dir, { recursive: true });
AI.AGENTS_DIR = dir;
setTransport(async (messages, opts) => ({ text: opts.format ? JSON.stringify({ kind: 'small_talk', topic: 'none', person: 'none' }) : 'Aye.', ms: 1 }));

let server, base;
before(async () => {
  server = createServer(handleHttp);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

const auth = { Authorization: 'Bearer test-admin-token' };
const call = async (path, { method = 'GET', body, headers = auth } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...headers, ...(body != null ? { 'Content-Type': 'application/json' } : {}) }, body: typeof body === 'string' ? body : body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('без токена и с чужим токеном — 401', async () => {
  for (const path of ['/api/admin/agents', '/api/admin/agents/columbus', '/api/admin/ai', '/api/admin/agents/columbus/memory?user=1']) {
    assert.equal((await call(path, { headers: {} })).status, 401, path);
    assert.equal((await call(path, { headers: { Authorization: 'Bearer wrong' } })).status, 401, path);
  }
  assert.equal((await call('/api/admin/agents/columbus', { method: 'PUT', body: {}, headers: {} })).status, 401);
});

test('список и JSON агента', async () => {
  const list = await call('/api/admin/agents');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.agents.map((a) => a.id).sort(), ['columbus', 'storyteller', 'trader']);
  const one = await call('/api/admin/agents/columbus');
  assert.equal(one.body.id, 'columbus');
  assert.ok(Array.isArray(one.body.actions));
  assert.equal((await call('/api/admin/agents/nobody')).status, 404);
  assert.equal((await call('/api/admin/agents/..%2Fcrew')).status, 404);
});

test('кривой JSON — 400 с понятной ошибкой; файл не меняется', async () => {
  const before = readFileSync(join(dir, 'columbus.json'), 'utf8');
  const bad = await call('/api/admin/agents/columbus', { method: 'PUT', body: '{"id": "columbus",' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /JSON/);
  const agent = JSON.parse(before);
  const broken = { ...agent, style: 'одна строка', actions: [{ ...agent.actions[0], scenes: ['moon'], patch: [{ op: 'explode', id: 'x' }] }], temperature: 7 };
  const invalid = await call('/api/admin/agents/columbus', { method: 'PUT', body: broken });
  assert.equal(invalid.status, 400);
  const text = invalid.body.errors.join('\n');
  assert.match(text, /style/);
  assert.match(text, /нет сцены «moon»/);
  assert.match(text, /patch\[0\]: op/);
  assert.match(text, /temperature/);
  assert.match((await call('/api/admin/agents/columbus', { method: 'PUT', body: { ...agent, id: 'trader' } })).body.message, /id/);
  assert.equal(readFileSync(join(dir, 'columbus.json'), 'utf8'), before);
});

test('PUT меняет ответы агента без перезапуска', async () => {
  const agent = (await call('/api/admin/agents/columbus')).body;
  const first = await ai.talk({ userId: 900, npc: 'columbus', context: { scene: 'ship_day' } });
  assert.equal(first.en, agent.greeting.en);
  db.deleteAgentMemory(900, 'columbus');
  const greeting = { en: 'Welcome aboard, the admin changed me.', ru: 'Добро пожаловать, меня поменяла админка.' };
  const put = await call('/api/admin/agents/columbus', { method: 'PUT', body: { ...agent, greeting, temperature: 0.5 } });
  assert.equal(put.status, 200);
  assert.equal(JSON.parse(readFileSync(join(dir, 'columbus.json'), 'utf8')).greeting.en, greeting.en);
  const again = await ai.talk({ userId: 900, npc: 'columbus', context: { scene: 'ship_day' } });
  assert.equal(again.en, greeting.en);
});

test('память агента об игроке: просмотр и сброс', async () => {
  const uid = db.createUser('memo', 'x');
  await ai.talk({ userId: uid, npc: 'trader', context: { scene: 'canary' } });
  await ai.talk({ userId: uid, npc: 'trader', context: { scene: 'canary' }, text: 'Привет!' });
  const mem = await call('/api/admin/agents/trader/memory?user=memo');
  assert.equal(mem.status, 200);
  assert.equal(mem.body.user.id, uid);
  assert.equal(mem.body.memory.turns.length, 4);
  assert.equal(mem.body.memory.lastScene, 'canary');
  assert.equal((await call('/api/admin/agents/trader/memory?user=nobody')).status, 400);
  const reset = await call('/api/admin/agents/trader/memory/reset', { method: 'POST', body: { user: uid } });
  assert.equal(reset.status, 200);
  assert.equal((await call(`/api/admin/agents/trader/memory?user=${uid}`)).body.memory.turns.length, 0);
});

test('метрики ИИ: очередь и средние времена', async () => {
  const m = await call('/api/admin/ai');
  assert.equal(m.status, 200);
  assert.equal(m.body.queue.waiting, 0);
  assert.ok(m.body.answers >= 1);
  for (const k of ['understand', 'reply', 'translate', 'tts', 'total']) assert.ok(Number.isFinite(m.body.avgMs[k]), k);
});
