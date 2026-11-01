// Админка, вкладка «Агенты»: JSON агентов, память агента об игроке, метрики ИИ.
//   GET  /api/admin/agents                       — список агентов (+ игроки для просмотра памяти)
//   GET  /api/admin/agents/:id                   — JSON агента
//   PUT  /api/admin/agents/:id                   — проверить, записать content/agents/<id>.json, применить без перезапуска
//   GET  /api/admin/agents/:id/memory?user=      — память агента об игроке (id или логин)
//   POST /api/admin/agents/:id/memory/reset      — { user } — забыть игрока
//   GET  /api/admin/ai                           — очередь к модели и средние времена ответа
// Подключение — registerAgentRoutes(route) в server/admin/index.js: доступ, HTTPS и токен решает каркас Тамерлана.
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AI } from '../ai/config.js';
import { loadAgents, getAgent } from '../ai/agents.js';
import { validateOp } from '../game/world-state.js';
import { loadAgentMemory, deleteAgentMemory, getUserById, getUserByLogin } from '../db.js';
import { loadContent } from '../content.js';
import { players } from '../game/players.js';
import * as ai from '../game/ai-bridge.js';

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
        // patch — изменение мира; у действий без него (музыка гитариста: performance) его нет
        need(x?.patch == null ? typeof x?.performance === 'string' : Array.isArray(x.patch), `${at}.patch: список операций (или performance)`);
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
const known = (id) => ID.test(id) && existsSync(fileOf(id));
const notFound = (id) => ({ status: 404, body: { error: 'not_found', message: `Нет агента ${id}` } });
const userParam = (req) => new URL(req.url, 'http://x').searchParams.get('user');
const noUser = { status: 400, body: { error: 'bad_user', message: 'Укажи игрока: user=<id или логин>' } };

export function registerAgentRoutes(route) {
  route('GET', '/api/admin/ai', () => ai.metrics());

  // В списке — только ИИ-агенты (npcs.json type llm); неагентные NPC с готовыми репликами — отдельно, для справки
  route('GET', '/api/admin/agents', () => {
    const npcs = new Map(loadContent('npcs.json', []).map((n) => [n.id, n]));
    const known = loadAgents();
    // порядок как в игре (npcs.json): Колумб, Хуан, торговец… затем часть 2
    const agents = [...npcs.keys()].filter((id) => known.has(id) && npcs.get(id).type === 'llm').map((id) => {
      const a = getAgent(id);
      return { id, ru: npcs.get(id)?.name ?? id, name: a.name, cards: a.cards?.length ?? 0, actions: a.actions?.length ?? 0 };
    });
    const scripted = [...npcs.values()].filter((n) => n.type !== 'llm').map((n) => ({ id: n.id, ru: n.name }));
    return {
    agents, scripted,
    players: players.all().map((p) => ({ id: p.id, name: p.name, role: p.role, connected: p.connected })),
    scenes: [...SCENES],
    };
  });

  route('GET', '/api/admin/agents/:id', ({ params }) => (known(params.id) ? JSON.parse(readFileSync(fileOf(params.id), 'utf8')) : notFound(params.id)));

  // Проверить, записать content/agents/<id>.json, применить без перезапуска
  route('PUT', '/api/admin/agents/:id', ({ params, body }) => {
    if (!known(params.id)) return notFound(params.id);
    let agent;
    try { agent = JSON.parse(body || ''); } catch {
      return { status: 400, body: { error: 'bad_json', message: 'Не JSON: проверь запятые и кавычки' } };
    }
    const errors = validateAgent(agent, params.id);
    if (errors.length) return { status: 400, body: { error: 'invalid_agent', message: errors[0], errors } };
    // через временный файл: сервер не прочитает наполовину записанный JSON
    const tmp = `${fileOf(params.id)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(agent, null, 2)}\n`);
    renameSync(tmp, fileOf(params.id));
    loadAgents();
    console.log(`[admin] агент ${params.id} обновлён`);
    return { ok: true, agent: getAgent(params.id) };
  });

  route('GET', '/api/admin/agents/:id/memory', ({ req, params }) => {
    if (!known(params.id)) return notFound(params.id);
    const user = findUser(userParam(req));
    if (!user) return noUser;
    return { user: { id: user.id, login: user.login }, memory: memoryOf(user.id, params.id) };
  });

  route('POST', '/api/admin/agents/:id/memory/reset', ({ req, params, json }) => {
    if (!known(params.id)) return notFound(params.id);
    let q = userParam(req);
    if (!q) { try { q = json().user; } catch { q = null; } }
    const user = findUser(q);
    if (!user) return noUser;
    deleteAgentMemory(user.id, params.id);
    return { ok: true, user: { id: user.id, login: user.login } };
  });
}
