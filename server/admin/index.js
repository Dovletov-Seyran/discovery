// Админ-панель: API /api/admin/* для страницы /admin (client/admin.html).
// Доступ: токен ADMIN_TOKEN из окружения (Authorization: Bearer <токен>) и только HTTPS.
// Нет токена — API выключен (404), страница так и скажет. Под DEV=1 разрешён ещё http с этого же компьютера.
//
// Маршруты — route(метод, '/api/admin/путь/:параметр', обработчик). Обработчик получает
// { req, params, body } и возвращает JSON-ответ (или { status, body }). Вкладку «Агенты» Сейран
// подключает своими route(...) — см. конец файла.
import { createHash, timingSafeEqual } from 'node:crypto';
import { CONFIG } from '../../shared/config.js';
import { players } from '../game/players.js';
import * as director from '../game/director.js';
import * as game from '../game/index.js';
import * as ai from '../game/ai-bridge.js';
import { clientHistory, serverStats } from '../game/stats.js';
import * as world from './world.js';

const TOKEN = (process.env.ADMIN_TOKEN ?? '').trim();
const MIN_TOKEN = 12;
export const enabled = TOKEN.length >= MIN_TOKEN;
if (TOKEN && !enabled) console.warn(`[admin] ADMIN_TOKEN короче ${MIN_TOKEN} символов — админка выключена`);

const MAX_BODY = 1024 * 1024; // раскладка острова с комментариями — десятки КБ
const FAIL_LIMIT = 10, FAIL_WINDOW_MS = 5 * 60 * 1000; // неверных токенов с одного адреса

const routes = [];
export function route(method, path, fn) {
  const names = [];
  const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; })}$`);
  routes.push({ method, re, names, fn });
}

// --- доступ ---

const digest = (s) => createHash('sha256').update(s).digest();
const tokenOk = (got) => enabled && typeof got === 'string' && timingSafeEqual(digest(got), digest(TOKEN));
const loopback = (a = '') => a === '::1' || a.startsWith('127.') || a === '::ffff:127.0.0.1';
const secure = (req) => !!req.socket.encrypted || (CONFIG.DEV && loopback(req.socket.remoteAddress));

const fails = new Map(); // адрес → { n, since }
function tooManyFails(addr, now = Date.now()) {
  const f = fails.get(addr);
  if (f && now - f.since > FAIL_WINDOW_MS) fails.delete(addr);
  return (fails.get(addr)?.n ?? 0) >= FAIL_LIMIT;
}
function noteFail(addr, now = Date.now()) {
  const f = fails.get(addr) ?? { n: 0, since: now };
  f.n++;
  fails.set(addr, f);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.removeAllListeners('data'); req.resume(); reject(new Error('too_large')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export async function handleAdmin(req, res, path) {
  if (!enabled) return send(res, 404, { error: 'admin_disabled', message: 'Админка выключена: задайте ADMIN_TOKEN (от 12 символов) и перезапустите сервер' });
  if (!secure(req)) return send(res, 403, { error: 'https_only', message: 'Админка работает только по HTTPS: npm run start:https' });
  const addr = req.socket.remoteAddress ?? '';
  if (tooManyFails(addr)) return send(res, 429, { error: 'too_many', message: 'Слишком много неверных токенов, подождите 5 минут' });
  const auth = req.headers.authorization ?? '';
  if (!tokenOk(auth.startsWith('Bearer ') ? auth.slice(7) : null)) {
    noteFail(addr);
    return send(res, 401, { error: 'bad_token', message: 'Неверный токен' });
  }
  fails.delete(addr);

  for (const r of routes) {
    const m = r.method === req.method && r.re.exec(path);
    if (!m) continue;
    let body = null;
    if (req.method !== 'GET') {
      try { body = await readBody(req); } catch { return send(res, 413, { error: 'too_large', message: 'Слишком большой запрос' }); }
    }
    const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const out = await r.fn({ req, params, body, json: () => JSON.parse(body || '{}') });
    return out?.status ? send(res, out.status, out.body) : send(res, 200, out ?? { ok: true });
  }
  send(res, 404, { error: 'not_found' });
}

const bad = (message, extra) => ({ status: 400, body: { error: 'bad_request', message, ...extra } });
const parse = (ctx) => { try { return ctx.json(); } catch { return null; } };

// --- метрики ---

route('GET', '/api/admin/clients', () => ({
  serverNow: Date.now(),
  clients: players.party().map((p) => ({
    id: p.id, name: p.name, role: p.role, zone: p.zone, connected: p.connected, a: p.a ?? null,
    chunks: p.chunks?.size ?? 0, history: clientHistory(p.id),
  })),
}));

route('GET', '/api/admin/server', async () => {
  const s = director.scene(), status = await ai.status().catch(() => ({}));
  return {
    serverNow: Date.now(), ...serverStats(),
    players: { connected: players.connectedCount(), party: players.party().length, max: CONFIG.MAX_PLAYERS },
    scene: { id: s.id, type: s.type }, ai: { ollama: !!status.ollama, tts: !!status.tts, model: status.model ?? null },
    flags: { demo: CONFIG.DEMO_MODE, dev: CONFIG.DEV, https: CONFIG.HTTPS },
  };
});

// --- вселенная ---

route('GET', '/api/admin/universe', () => {
  const s = director.scene(), msg = director.sceneMessage({});
  const list = director.allScenes();
  return {
    serverNow: Date.now(),
    scene: { id: s.id, type: s.type, zone: msg.zone, startAt: msg.startAt, duration: msg.duration, tod: msg.tod, next: s.next ?? null, progress: msg.progress },
    scenes: list.map((x) => ({ id: x.id, type: x.type, zone: x.zone ?? null, duration: director.sceneDuration(x), configured: x.duration ?? null, fit: x.fit ?? null, tod: x.tod ?? null, advance: x.advance ?? null, next: x.next ?? null })),
    files: Object.entries(world.FILES).map(([file, f]) => ({ file, title: f.title })),
  };
});

route('GET', '/api/admin/world/:file', ({ params }) => {
  if (!world.FILES[params.file]) return { status: 404, body: { error: 'not_found', message: 'Этот файл из админки не правится' } };
  return { file: params.file, text: world.read(params.file) };
});

// PUT ?check=1 — только проверить; без него — проверить, записать и применить
route('PUT', '/api/admin/world/:file', ({ req, params, body }) => {
  const { errors, notes } = world.validate(params.file, body ?? '');
  if (errors.length) return { status: 422, body: { error: 'invalid', message: 'Есть ошибки — ничего не применено', errors, notes } };
  if (new URL(req.url, 'http://x').searchParams.get('check')) return { ok: true, checked: true, notes };
  const applied = world.save(params.file, body);
  return { ok: true, applied, notes };
});

// --- управление ---

route('POST', '/api/admin/scene', (ctx) => {
  const id = parse(ctx)?.id;
  if (typeof id !== 'string' || !director.setScene(id)) return bad(`Нет сцены ${id}`);
  console.log(`[admin] сцена → ${id}`);
  return { ok: true, scene: id };
});

route('POST', '/api/admin/reset', () => {
  game.resetAll();
  console.log('[admin] сброс прогресса');
  return { ok: true };
});

route('POST', '/api/admin/kick', (ctx) => {
  const id = Number(parse(ctx)?.id);
  return game.kick(id) ? { ok: true } : bad('Нет такого игрока');
});

route('POST', '/api/admin/announce', (ctx) => {
  const text = String(parse(ctx)?.text ?? '').trim();
  if (!text || text.length > CONFIG.CHAT_MAX_LEN) return bad(`Объявление — от 1 до ${CONFIG.CHAT_MAX_LEN} символов`);
  game.announce(text);
  console.log(`[admin] объявление: ${text}`);
  return { ok: true };
});

// --- агенты (Сейран): route('GET', '/api/admin/agents/:id', …) и т. д. ---
