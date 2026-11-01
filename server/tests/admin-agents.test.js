import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer, request } from 'node:https';
import selfsigned from 'selfsigned';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DB_FILE = ':memory:';
process.env.TTS = '0';
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.DEV = '1'; // админка Тамерлана: по http только с этого же компьютера и под DEV
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

let server, base, certificate;
before(async () => {
  const tls = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 1, keySize: 2048, extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }],
  });
  certificate = tls.cert;
  server = createServer({ key: tls.private, cert: tls.cert }, handleHttp);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `https://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

const auth = { Authorization: 'Bearer test-admin-token' };
const call = async (path, { method = 'GET', body, headers = auth } = {}) => {
  const payload = typeof body === 'string' ? body : body && JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(base + path, { method, ca: certificate, headers: { ...headers, ...(body != null ? { 'Content-Type': 'application/json' } : {}) } }, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.end(payload);
  });
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
  assert.equal(list.body.agents.length,22); // + 8 агентов Гуанахани
  for(const id of ['columbus','storyteller','trader','cook','boatswain','musician','town_1','cacique','elder','admiral'])assert.ok(list.body.agents.some(a=>a.id===id));
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


test('валидный токен по незашифрованному HTTP с другого ноутбука не открывает админку', async () => {
  const { handleAdmin } = await import('../admin/index.js');
  let status, body;
  const res = { writeHead: (code) => { status = code; }, end: (json) => { body = JSON.parse(json); } };
  const req = { method: 'GET', url: '/api/admin/agents', headers: auth, socket: { encrypted: false, remoteAddress: '192.168.1.23' } };
  await handleAdmin(req, res, '/api/admin/agents');
  assert.equal(status, 403);
  assert.equal(body.error, 'https_only');
});
