// server/db.js для одиночной игры в браузере: тот же набор функций, но вместо SQLite —
// память страницы + localStorage. Мир (чанки) каждый запуск строится заново и не сохраняется:
// это детерминированная генерация из content/*_layout.json, хранить её в браузере незачем.
// Сохраняется прогресс: игроки, сцена и предметы мира, память NPC, мини-игры.
import { restoreVitals } from '../../../../shared/stamina.js';
import { freshVitals, ITEM_RULES } from '../../../../shared/item-actions.js';
import { CONFIG } from '../../../../shared/config.js';

export const DATA_DIR = '/__repo__/data/';

const STORE_KEY = 'discovery.solo.save';
const empty = () => ({ v: 1, nextUser: 1, users: {}, sessions: {}, players: {}, memory: {}, minigames: {}, game: null });

function readStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s?.v === 1) return { ...empty(), ...s };
  } catch { /* приватный режим или битое сохранение — начинаем с чистого */ }
  return empty();
}
let store = readStore();

// Запись в localStorage — не чаще раза в секунду и при закрытии вкладки
let writeTimer = null;
function persist() {
  writeTimer ??= setTimeout(writeNow, 1000);
}
function writeNow() {
  clearTimeout(writeTimer);
  writeTimer = null;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { console.warn('[solo] сохранение не записалось', e); }
}
addEventListener('pagehide', () => { flushPlayers(); writeNow(); });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushPlayers(); writeNow(); } });

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// --- Мини-игры ---
export const loadMinigameState = (id) => clone(store.minigames[id] ?? null);
export const saveMinigameState = (id, state) => { store.minigames[id] = clone(state); persist(); };

// --- Пользователи и сессии (в одиночной игре пароль не нужен: имя — это слот сохранения) ---
const byLogin = (login) => Object.values(store.users).find((u) => u.login.toLowerCase() === String(login).toLowerCase());
export const getUserByLogin = (login) => { const u = byLogin(login); return u && { id: u.id, login: u.login, pass_hash: u.pass_hash }; };
export const getUserById = (id) => { const u = store.users[id]; return u && { id: u.id, login: u.login }; };
export function createUser(login, passHash = '') {
  if (byLogin(login)) throw new Error('UNIQUE constraint failed: users.login');
  const id = store.nextUser++;
  store.users[id] = { id, login, pass_hash: passHash, created_at: Date.now() };
  persist();
  return id;
}
export function createSession(userId) {
  const token = crypto.randomUUID();
  store.sessions[token] = userId;
  persist();
  return token;
}
export function getSession(token) {
  const userId = typeof token === 'string' ? store.sessions[token] : undefined;
  const u = userId != null && store.users[userId];
  return u ? { token, userId: u.id, login: u.login } : undefined;
}
export const listUsers = () => Object.values(store.users).map((u) => ({ id: u.id, login: u.login, updatedAt: store.players[u.id]?.updated_at ?? u.created_at }));
export function deleteUser(userId) {
  delete store.users[userId];
  delete store.players[userId];
  for (const [t, id] of Object.entries(store.sessions)) if (id === userId) delete store.sessions[t];
  for (const k of Object.keys(store.memory)) if (k.startsWith(`${userId}:`)) delete store.memory[k];
  writeNow();
}

// --- Состояние игрока ---
export function loadPlayer(userId) {
  const row = store.players[userId];
  if (!row) return null;
  const inv = row.inventory ?? {};
  return {
    role: row.role ?? null,
    scene: row.scene ?? null,
    zone: row.zone ?? null,
    p: row.p ?? null,
    r: row.r ?? 0,
    inventory: (inv.items ?? []).filter((id) => Object.hasOwn(ITEM_RULES, id)),
    equipped: Object.hasOwn(ITEM_RULES, inv.equipped) ? inv.equipped : null,
    money: inv.money ?? 0,
    trade: clone(inv.trade ?? {}),
    itemUses: Object.fromEntries(Object.entries(inv.itemUses ?? {}).filter(([id]) => Object.hasOwn(ITEM_RULES, id))),
    vitals: restoreVitals(clone(inv.vitals)),
    quests: clone(row.quests ?? {}),
    log: clone(row.log ?? []),
  };
}
export const loadScenePlayers = (scene) => Object.keys(store.players)
  .filter((id) => store.players[id].scene === scene).map((id) => ({ id: Number(id), ...loadPlayer(Number(id)) }));

function writePlayer(userId, s) {
  store.players[userId] = clone({
    role: s.role ?? null, zone: s.zone ?? null, p: s.p ?? null, r: s.r ?? 0, scene: s.scene ?? null,
    inventory: { items: s.inventory ?? [], equipped: s.equipped ?? null, money: s.money ?? 0, trade: s.trade ?? {}, itemUses: s.itemUses ?? {}, vitals: s.vitals ?? freshVitals() },
    quests: s.quests ?? {}, log: s.log ?? [], updated_at: Date.now(),
  });
  persist();
}

const pending = new Map();
let flushTimer = null;
export function savePlayer(userId, state, { now = false } = {}) {
  if (now) { pending.delete(userId); writePlayer(userId, state); return; }
  pending.set(userId, state);
  flushTimer ??= setTimeout(flushPlayers, CONFIG.SAVE_DELAY_MS);
}
export function flushPlayers() {
  clearTimeout(flushTimer);
  flushTimer = null;
  const batch = [...pending];
  pending.clear();
  for (const [id, s] of batch) writePlayer(id, s);
}

// Транзакций нет: всё синхронно в одном потоке, прервать посередине некому
export const withTransaction = (fn) => fn();

// --- Память агентов ---
export function loadAgentMemory(userId, agentId) {
  const m = store.memory[`${userId}:${agentId}`];
  return { told: clone(m?.told ?? []), history: clone(m?.history ?? []) };
}
export function saveAgentMemory(userId, agentId, { told = [], history = [] }) {
  store.memory[`${userId}:${agentId}`] = clone({ told, history });
  persist();
}
export const deleteAgentMemory = (userId, agentId) => { delete store.memory[`${userId}:${agentId}`]; persist(); };

// --- Глобальное состояние игры ---
export const loadGameState = () => clone(store.game);
export function saveGameState({ scene, startAt, entities = {} }) {
  store.game = clone({ scene, startAt, entities });
  persist();
}

// --- Чанки мира (только память) ---
const chunks = new Map();
const world = new Map();
const chunkKey = (zone, cx, cz) => `${zone}:${cx}:${cz}`;
export const getChunk = (zone, cx, cz) => chunks.get(chunkKey(zone, cx, cz))?.data ?? null;
export function putChunk(zone, cx, cz, data) {
  chunks.set(chunkKey(zone, cx, cz), { zone, data, bytes: JSON.stringify(data).length });
  metaCache = null;
}
export const getWorldValue = (key) => world.get(key) ?? null;
export const setWorldValue = (key, value) => { world.set(key, value); };
export function clearZone(zone) {
  for (const [k, c] of chunks) if (c.zone === zone) chunks.delete(k);
  metaCache = null;
}

let metaCache = null;
export function worldMeta() {
  if (metaCache) return metaCache;
  const zones = {};
  let totalChunks = 0, totalBytes = 0;
  for (const { zone, bytes } of chunks.values()) {
    zones[zone] ??= { chunks: 0, bytes: 0 };
    zones[zone].chunks++;
    zones[zone].bytes += bytes;
    totalChunks++;
    totalBytes += bytes;
  }
  metaCache = { zones, totalChunks, totalBytes, cacheLimit: Math.floor(CONFIG.CACHE_FRACTION * totalChunks) };
  return metaCache;
}

// --- Служебное ---
export function resetProgress() {
  pending.clear();
  store = { ...store, players: {}, memory: {}, minigames: {}, game: null };
  writeNow();
}
export function closeDb() { flushPlayers(); writeNow(); }
