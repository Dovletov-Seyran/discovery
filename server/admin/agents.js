// Админка, вкладка «Агенты»: JSON агентов, память агента об игроке, метрики ИИ.
//   GET  /api/admin/agents                       — список агентов (+ игроки для просмотра памяти)
//   GET  /api/admin/agents/:id                   — JSON агента
//   PUT  /api/admin/agents/:id                   — проверить, записать content/agents/<id>.json, применить без перезапуска
//   GET  /api/admin/agents/:id/memory?user=      — память агента об игроке (id или логин)
//   POST /api/admin/agents/:id/memory/reset      — { user } — забыть игрока
//   GET  /api/admin/ai                           — очередь к модели и средние времена ответа
// Доступ — только с ADMIN_TOKEN.
import { timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AI } from '../ai/config.js';
import { loadAgents, getAgent } from '../ai/agents.js';
import { validateOp } from '../game/world-state.js';
import { loadAgentMemory, deleteAgentMemory, getUserById, getUserByLogin } from '../db.js';
import { loadContent } from '../content.js';
import { players } from '../game/players.js';
import * as ai from '../game/ai-bridge.js';

// Проверка токена — в одном месте; когда появится server/admin/auth.js Тамерлана, заменить на него
export function authorized(req, token = process.env.ADMIN_TOKEN) {
  if (!token) return false;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization ?? '');
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const SCENES = new Set(loadContent('scenes.json', []).map((s) => s.id));
const ID = /^[a-z][a-z0-9_]{0,40}$/;

// --- Проверка JSON агента: → массив понятных ошибок (пустой — всё хорошо) ---

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function validateAgent(a, id) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  if (!a || typeof a !== 'object' || Array.isArray(a)) return ['агент: ожидается JSON-объект'];
  need(a.id === id, `id: должен совпадать с адресом (${id})`);
  for (const k of ['name', 'voice', 'persona']) need(isStr(a[k]), `${k}: непустая строка`);
  need(isStrList(a.style) && a.style.length > 0, 'style: непустой список строк');
  need(isStrList(a.rules), 'rules: список строк');
  need(isStr(a.greeting?.en) && isStr(a.greeting?.ru), 'greeting: { en, ru } — непустые строки');
  need(Array.isArray(a.fallbacks) && a.fallbacks.length > 0 && a.fallbacks.every((f) => isStr(f?.en) && isStr(f?.ru)), 'fallbacks: непустой список { en, ru }');
  if (a.self != null) need(isStrList(a.self), 'self: список строк');
  if (a.playerIs != null) need(typeof a.playerIs === 'string', 'playerIs: строка');
  if (a.knowledge != null) need(typeof a.knowledge === 'object' && !Array.isArray(a.knowledge) && Object.values(a.knowledge).every((v) => typeof v === 'string'), 'knowledge: объект строк { when, where, unknown }');
  if (a.reactions != null) need(typeof a.reactions === 'object' && !Array.isArray(a.reactions) && Object.values(a.reactions).every((v) => typeof v === 'string'), 'reactions: объект строк');
  if (a.temperature != null) need(Number.isFinite(a.temperature) && a.temperature >= 0 && a.temperature <= 1.5, 'temperature: число от 0 до 1.5');

  if (!Array.isArray(a.cards)) errors.push('cards: список тем');
  else {
    const seen = new Set();
    a.cards.forEach((c, i) => {
      const at = `cards[${i}]${c?.id ? ` (${c.id})` : ''}`;
      need(typeof c?.id === 'string' && ID.test(c.id), `${at}.id: латиница, цифры и _`);
      need(!seen.has(c?.id), `${at}.id: повторяется`);
      seen.add(c?.id);
      for (const k of ['topic', 'fact', 'hint']) need(isStr(c?.[k]), `${at}.${k}: непустая строка`);
      need(isStrList(c?.kw), `${at}.kw: список строк`);
    });
  }

  if (a.actions != null) {
    if (!Array.isArray(a.actions)) errors.push('actions: список действий');
    else {
      const seen = new Set();
      a.actions.forEach((x, i) => {
        const at = `actions[${i}]${x?.id ? ` (${x.id})` : ''}`;
        need(typeof x?.id === 'string' && ID.test(x.id), `${at}.id: латиница, цифры и _`);
        need(!seen.has(x?.id), `${at}.id: повторяется`);
        seen.add(x?.id);
        need(isStr(x?.en), `${at}.en: что это (по-английски, для модели)`);
        need(isStrList(x?.scenes), `${at}.scenes: список сцен`);
        for (const s of isStrList(x?.scenes) ? x.scenes : []) need(SCENES.has(s), `${at}.scenes: нет сцены «${s}» (есть: ${[...SCENES].join(', ')})`);
        if (x?.cooldownSec != null) need(Number.isFinite(x.cooldownSec) && x.cooldownSec >= 0, `${at}.cooldownSec: число ≥ 0`);
        if (x?.once != null) need(typeof x.once === 'boolean', `${at}.once: true или false`);
        need(Array.isArray(x?.patch), `${at}.patch: список операций`);
        (Array.isArray(x?.patch) ? x.patch : []).forEach((op, j) => {
          const v = validateOp(op);
          if (typeof v === 'string') errors.push(`${at}.patch[${j}]: ${v}`);
        });
        if (x?.at != null) need(Number.isInteger(x.at?.segment) && x.at.segment >= 0 && (x.at.offset == null || Number.isFinite(x.at.offset)), `${at}.at: { segment: целое ≥ 0, offset: секунды }`);
        else {
          // по просьбе игрока: нужны ключевые фразы (подтверждают выбор модели) и ответ агента
          need(isStrList(x?.kw) && x.kw.length > 0, `${at}.kw: ключевые фразы просьбы («зажги фонари»)`);
          need(isStr(x?.reply), `${at}.reply: что агент говорит, соглашаясь`);
        }
        if (x?.replyRu != null) need(typeof x.replyRu === 'string', `${at}.replyRu: строка`);
      });
    }
  }
  return errors;
}

// --- Память ---

function findUser(q) {
  if (q == null || q === '') return null;
  const n = Number(q);
  return (Number.isInteger(n) && getUserById(n)) || getUserByLogin(String(q)) || null;
}

function memoryOf(userId, agentId) {
  const raw = loadAgentMemory(userId, agentId);
  const h = raw.history;
  const conv = Array.isArray(h) ? { turns: h } : h ?? {};
  return { told: raw.told ?? [], turns: conv.turns ?? [], summary: conv.summary ?? '', lastAt: conv.lastAt ?? null, lastScene: conv.lastScene ?? null, visits: conv.visits ?? 0 };
}

const fileOf = (id) => join(AI.AGENTS_DIR, `${id}.json`);
const agentIds = () => [...loadAgents().keys()];

// → true, если путь обработан
export async function handle(req, res, path, { sendJson, readJson }) {
  if (path !== '/api/admin/ai' && path !== '/api/admin/agents' && !path.startsWith('/api/admin/agents/')) return false;
  if (!authorized(req)) {
    sendJson(res, 401, { error: 'unauthorized', message: process.env.ADMIN_TOKEN ? 'Нужен заголовок Authorization: Bearer <ADMIN_TOKEN>' : 'Админка выключена: сервер запущен без ADMIN_TOKEN' });
    return true;
  }
  const url = new URL(req.url, 'http://x');

  if (path === '/api/admin/ai' && req.method === 'GET') {
    sendJson(res, 200, ai.metrics());
    return true;
  }

  if (path === '/api/admin/agents' && req.method === 'GET') {
    const list = agentIds().map((id) => {
      const a = getAgent(id);
      return { id, name: a.name, cards: a.cards?.length ?? 0, actions: a.actions?.length ?? 0 };
    });
    sendJson(res, 200, { agents: list, players: players.all().map((p) => ({ id: p.id, name: p.name, role: p.role, connected: p.connected })), scenes: [...SCENES] });
    return true;
  }

  const m = /^\/api\/admin\/agents\/([^/]+)(\/memory(\/reset)?)?$/.exec(path);
  const id = m?.[1];
  if (!m || !ID.test(id) || !existsSync(fileOf(id))) {
    sendJson(res, 404, { error: 'not_found', message: `Нет агента ${id ?? ''}` });
    return true;
  }

  // Память агента об игроке
  if (m[2]) {
    const isReset = !!m[3];
    if (isReset ? req.method !== 'POST' : req.method !== 'GET') {
      sendJson(res, 405, { error: 'method' });
      return true;
    }
    let q = url.searchParams.get('user');
    if (isReset && !q) {
      try { q = (await readJson(req)).user; } catch { q = null; }
    }
    const user = findUser(q);
    if (!user) {
      sendJson(res, 400, { error: 'bad_user', message: 'Укажи игрока: user=<id или логин>' });
      return true;
    }
    if (isReset) {
      deleteAgentMemory(user.id, id);
      sendJson(res, 200, { ok: true, user: { id: user.id, login: user.login } });
    } else {
      sendJson(res, 200, { user: { id: user.id, login: user.login }, memory: memoryOf(user.id, id) });
    }
    return true;
  }

  if (req.method === 'GET') {
    sendJson(res, 200, JSON.parse(readFileSync(fileOf(id), 'utf8')));
    return true;
  }

  if (req.method === 'PUT') {
    let body;
    try { body = await readJson(req, 256 * 1024); } catch (e) {
      sendJson(res, e.message === 'too_large' ? 413 : 400, { error: e.message === 'too_large' ? 'too_large' : 'bad_json', message: e.message === 'too_large' ? 'Слишком большой JSON' : 'Не JSON: проверь запятые и кавычки' });
      return true;
    }
    const errors = validateAgent(body, id);
    if (errors.length) {
      sendJson(res, 400, { error: 'invalid_agent', message: errors[0], errors });
      return true;
    }
    // Через временный файл: сервер не прочитает наполовину записанный JSON
    const tmp = `${fileOf(id)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`);
    renameSync(tmp, fileOf(id));
    loadAgents();
    sendJson(res, 200, { ok: true, agent: getAgent(id) });
    return true;
  }

  sendJson(res, 405, { error: 'method' });
  return true;
}
