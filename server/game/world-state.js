// Динамические объекты мира: что появилось (spawn), что убрано (remove), что изменилось (set).
// Мир меняет только сервер — агенты, поступки игроков, админка. Клиенты получают world_patch:
// полный ({ ops, full: true }) — при входе, переподключении и сбросе; частичный — всем при каждом изменении.
// Состояние сохраняется вместе со снапшотом entities.js (game_state в БД) и переживает рестарт.
import { S2C } from '../../shared/protocol.js';

const OPS = new Set(['spawn', 'remove', 'set']);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

// id → { id, kind?, model?, zone?, p?, r?, state?, spawned?, removed? }
//   spawned — объект создан патчем (его нет в раскладке); removed — убран (в т.ч. объект раскладки)
let objects = new Map();
let flags = new Set(); // разовые события прохождения: поступки игроков, «паёк уже выдан»
let dirty = false;

// Подключает game/index.js: рассылка всем, точка привязки (позиция объекта раскладки), текущая зона
let hooks = { broadcast: () => {}, anchor: () => null, zone: () => null };
export const setHooks = (h) => { hooks = { ...hooks, ...h }; };

// Проверка операции → нормализованная операция или строка-ошибка
export function validateOp(raw) {
  if (!raw || typeof raw !== 'object') return 'операция должна быть объектом';
  const { op, id } = raw;
  if (!OPS.has(op)) return `op: ожидается spawn | remove | set, получено ${JSON.stringify(op)}`;
  if (typeof id !== 'string' || !id || id.length > 64) return 'id: непустая строка до 64 символов';
  const out = { op, id };
  for (const k of ['kind', 'model', 'zone', 'at']) {
    if (raw[k] == null) continue;
    if (typeof raw[k] !== 'string') return `${k}: ожидается строка`;
    out[k] = raw[k];
  }
  if (raw.p != null) { if (!isVec3(raw.p)) return 'p: ожидается [x, y, z]'; out.p = [...raw.p]; }
  if (raw.off != null) { if (!isVec3(raw.off)) return 'off: ожидается [dx, dy, dz]'; out.off = [...raw.off]; }
  if (raw.r != null) { if (!Number.isFinite(raw.r)) return 'r: ожидается число'; out.r = raw.r; }
  if (raw.state != null) {
    if (typeof raw.state !== 'object' || Array.isArray(raw.state)) return 'state: ожидается объект';
    out.state = { ...raw.state };
  }
  if (op === 'spawn' && !out.p && !out.at) return 'spawn: нужна позиция p или привязка at';
  return out;
}

// Привязка к объекту раскладки: at: 'trader', off: [dx, dy, dz] — высота рельефа уже в позиции объекта
function place(op) {
  if (!op.at) return op;
  const base = hooks.anchor(op.at);
  const { at, off, ...rest } = op;
  if (!isVec3(base)) return rest.p ? rest : null;
  const d = off ?? [0, 0, 0];
  return { ...rest, p: [0, 1, 2].map((i) => Math.round((base[i] + d[i]) * 100) / 100) };
}

/**
 * Применить патч: проверить, обновить состояние, разослать всем изменившиеся операции.
 * → { ok, ops } (применённые) или { ok: false, error }
 */
export function apply(rawOps, { source = 'server' } = {}) {
  if (!Array.isArray(rawOps) || !rawOps.length) return { ok: false, error: 'ops: ожидается непустой массив' };
  const ops = [];
  for (const raw of rawOps) {
    const v = validateOp(raw);
    if (typeof v === 'string') return { ok: false, error: v };
    const op = place(v);
    if (op) ops.push(op);
  }
  const sent = [];
  for (const op of ops) {
    const cur = objects.get(op.id);
    if (op.op === 'remove') {
      if (cur?.removed) continue;
      // Помним убранным: и объект раскладки, и появившийся по патчу (новый игрок получит remove — это безвредно)
      objects.set(op.id, { id: op.id, zone: op.zone ?? cur?.zone, removed: true });
      sent.push({ op: 'remove', id: op.id });
      continue;
    }
    if (op.op === 'spawn') {
      const obj = { id: op.id, kind: op.kind, model: op.model, zone: op.zone ?? hooks.zone() ?? undefined, p: op.p, r: op.r ?? 0, state: op.state ?? {}, spawned: true };
      objects.set(op.id, obj);
      sent.push(toOp(obj));
      continue;
    }
    // set: объект патча или раскладки; позиция и поворот — по желанию
    const next = { ...(cur?.removed ? { id: op.id } : cur ?? { id: op.id }) };
    if (op.kind) next.kind = op.kind;
    if (op.zone) next.zone = op.zone;
    if (op.p) next.p = op.p;
    if (op.r != null) next.r = op.r;
    next.state = { ...next.state, ...op.state };
    objects.set(op.id, next);
    sent.push({ op: 'set', id: op.id, ...pick(next, ['kind', 'zone']), ...pick(op, ['p', 'r']), state: op.state ?? {} });
  }
  if (sent.length) {
    dirty = true;
    hooks.broadcast({ t: S2C.WORLD_PATCH, ops: sent, source });
  }
  return { ok: true, ops: sent };
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));

function toOp(obj) {
  if (obj.removed) return { op: 'remove', id: obj.id, ...pick(obj, ['zone']) };
  if (obj.spawned) return { op: 'spawn', id: obj.id, ...pick(obj, ['kind', 'model', 'zone', 'p', 'r']), state: obj.state ?? {} };
  return { op: 'set', id: obj.id, ...pick(obj, ['kind', 'zone', 'p', 'r']), state: obj.state ?? {} };
}

// Полное состояние для нового или переподключившегося игрока
export const fullMessage = () => ({ t: S2C.WORLD_PATCH, full: true, ops: [...objects.values()].map(toOp) });

// Патч уже в силе? (фонари уже горят, товар уже на прилавке) — тогда действие повторять незачем
export function isApplied(rawOps = []) {
  if (!rawOps.length) return false;
  return rawOps.every((raw) => {
    const cur = objects.get(raw.id);
    if (raw.op === 'remove') return !cur || cur.removed;
    if (raw.op === 'spawn') return !!cur && !cur.removed;
    if (raw.op === 'set') return !!cur && !cur.removed && Object.entries(raw.state ?? {}).every(([k, v]) => JSON.stringify(cur.state?.[k]) === JSON.stringify(v));
    return false;
  });
}

export const get = (id) => {
  const o = objects.get(id);
  return o && !o.removed ? o : null;
};
export const has = (id) => !!get(id);
export const all = () => [...objects.values()];

export const hasFlag = (f) => flags.has(f);
export function setFlag(f) {
  if (flags.has(f)) return false;
  flags.add(f);
  dirty = true;
  return true;
}

// Сохранение: game_state.entities.world (через entities.snapshot)
export const snapshot = () => ({ objects: [...objects.values()], flags: [...flags] });
export function load(saved) {
  objects = new Map((saved?.objects ?? []).filter((o) => o?.id).map((o) => [o.id, o]));
  flags = new Set(saved?.flags ?? []);
  dirty = false;
}

// /reset и новое прохождение: всё из патчей забыть и сказать клиентам
export function reset() {
  const had = objects.size > 0;
  objects = new Map();
  flags = new Set();
  dirty = true;
  if (had) hooks.broadcast(fullMessage());
}

export function takeDirty() {
  const d = dirty;
  dirty = false;
  return d;
}

// --- Поступки игроков без LLM ---
// Задание выполнено → флаг прохождения; патч сразу или в начале нужной сцены (рендер — Фронт 1)
const DEEDS = {
  // Вода для Америки: вечером на палубе стоят бочки с водой с Гомеры
  q_water: {
    scene: 'ship_evening',
    patch: [
      { op: 'spawn', id: 'water_barrel_1', kind: 'water_barrel', model: 'barrel', zone: 'ship', p: [3, 0, 0.5], r: 0.2, state: { full: true } },
      { op: 'spawn', id: 'water_barrel_2', kind: 'water_barrel', model: 'barrel', zone: 'ship', p: [3, 0, 1.3], r: 1.1, state: { full: true } },
      { op: 'spawn', id: 'water_barrel_3', kind: 'water_barrel', model: 'barrel', zone: 'ship', p: [2.9, 0, 2.1], r: 2.3, state: { full: true } },
    ],
  },
  // Руль «Пинты» починен: Пинта уходит из ремонта
  q_rudder: { patch: [{ op: 'set', id: 'pinta', kind: 'ship', state: { repaired: true } }] },
};

export function onQuestDone(questId) {
  const deed = DEEDS[questId];
  if (!deed || !setFlag(`deed:${questId}`)) return;
  if (!deed.scene) apply(deed.patch, { source: `deed:${questId}` });
}

export function onSceneStart(scene) {
  for (const [questId, deed] of Object.entries(DEEDS)) {
    if (deed.scene === scene.id && hasFlag(`deed:${questId}`)) apply(deed.patch, { source: `deed:${questId}` });
  }
}
