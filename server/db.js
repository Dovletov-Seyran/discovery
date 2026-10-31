// SQLite (node:sqlite). Схема — docs/README.md §8.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../shared/config.js';

export const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || DATA_DIR + 'game.db');
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL COLLATE NOCASE,
  pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS player_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  role TEXT, zone TEXT, x REAL, y REAL, z REAL, ry REAL,
  inventory TEXT, quests TEXT, log TEXT,
  updated_at INTEGER, scene TEXT);
CREATE TABLE IF NOT EXISTS agent_memory (
  user_id INTEGER, agent_id TEXT,
  told TEXT, history TEXT,
  PRIMARY KEY (user_id, agent_id));
CREATE TABLE IF NOT EXISTS game_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scene TEXT, scene_started_at INTEGER, entities TEXT);
CREATE TABLE IF NOT EXISTS world_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS chunks (
  zone TEXT, cx INTEGER, cz INTEGER, data TEXT, bytes INTEGER,
  PRIMARY KEY (zone, cx, cz));
`);

// Миграция: колонка scene появилась позже — сцена, в которой игрок был последний раз
if (!db.prepare('PRAGMA table_info(player_state)').all().some((c) => c.name === 'scene')) {
  db.exec('ALTER TABLE player_state ADD COLUMN scene TEXT');
}

const parse = (s, fallback) => {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

// --- Пользователи и сессии ---

const qUserByLogin = db.prepare('SELECT id, login, pass_hash FROM users WHERE login = ?');
const qUserById = db.prepare('SELECT id, login FROM users WHERE id = ?');
const qCreateUser = db.prepare('INSERT INTO users (login, pass_hash, created_at) VALUES (?, ?, ?)');
const qCreateSession = db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)');
const qSession = db.prepare(`
  SELECT s.token, s.user_id AS userId, u.login FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ?`);

export const getUserByLogin = (login) => qUserByLogin.get(login);
export const getUserById = (id) => qUserById.get(id);
export const createUser = (login, passHash) => Number(qCreateUser.run(login, passHash, Date.now()).lastInsertRowid);

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  qCreateSession.run(token, userId, Date.now());
  return token;
}

export const getSession = (token) => (typeof token === 'string' && token ? qSession.get(token) : undefined);

// --- Состояние игрока ---

const qLoadPlayer = db.prepare('SELECT * FROM player_state WHERE user_id = ?');
const qSavePlayer = db.prepare(`
  INSERT INTO player_state (user_id, role, zone, x, y, z, ry, inventory, quests, log, updated_at, scene)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, zone = excluded.zone,
    x = excluded.x, y = excluded.y, z = excluded.z, ry = excluded.ry,
    inventory = excluded.inventory, quests = excluded.quests, log = excluded.log,
    updated_at = excluded.updated_at, scene = excluded.scene`);

// → { role, scene, zone, p, r, inventory: [itemId...], money, quests, log } или null
// В колонке inventory хранится { items, money }.
export function loadPlayer(userId) {
  const row = qLoadPlayer.get(userId);
  if (!row) return null;
  const inv = parse(row.inventory, {});
  return {
    role: row.role ?? null,
    scene: row.scene ?? null,
    zone: row.zone ?? null,
    p: row.x == null ? null : [row.x, row.y, row.z],
    r: row.ry ?? 0,
    inventory: Array.isArray(inv) ? inv : inv.items ?? [],
    money: inv.money ?? 0,
    quests: parse(row.quests, {}),
    log: parse(row.log, []),
  };
}

// Only states from this exact scene run: recover abandoned quest supplies after a server restart.
const qScenePlayers=db.prepare('SELECT user_id FROM player_state WHERE scene = ?');
export const loadScenePlayers=scene=>qScenePlayers.all(scene).map(row=>({id:row.user_id,...loadPlayer(row.user_id)}));

function writePlayer(userId, s) {
  const p = s.p ?? [null, null, null];
  qSavePlayer.run(userId, s.role ?? null, s.zone ?? null, p[0], p[1], p[2], s.r ?? 0,
    JSON.stringify({ items: s.inventory ?? [], money: s.money ?? 0 }), JSON.stringify(s.quests ?? {}),
    JSON.stringify(s.log ?? []), Date.now(), s.scene ?? null);
}

// Отложенная запись: копим последнее состояние, пишем раз в SAVE_DELAY_MS.
// { now: true } — сразу (отключение, смена сцены).
const pending = new Map();
let flushTimer = null;

export function savePlayer(userId, state, { now = false } = {}) {
  if (now) {
    pending.delete(userId);
    writePlayer(userId, state);
    return;
  }
  pending.set(userId, state);
  flushTimer ??= setTimeout(flushPlayers, CONFIG.SAVE_DELAY_MS);
}

export function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function flushPlayers() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!pending.size) return;
  const batch = [...pending];
  pending.clear();
  withTransaction(() => {
    for (const [id, s] of batch) writePlayer(id, s);
  });
}

// --- Память агентов (для Бэка 2) ---

const qLoadMem = db.prepare('SELECT told, history FROM agent_memory WHERE user_id = ? AND agent_id = ?');
const qSaveMem = db.prepare(`
  INSERT INTO agent_memory (user_id, agent_id, told, history) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, agent_id) DO UPDATE SET told = excluded.told, history = excluded.history`);

// → { told: [cardId...], history: [{role, content}...] }
export function loadAgentMemory(userId, agentId) {
  const row = qLoadMem.get(userId, agentId);
  return { told: parse(row?.told, []), history: parse(row?.history, []) };
}

export function saveAgentMemory(userId, agentId, { told = [], history = [] }) {
  qSaveMem.run(userId, agentId, JSON.stringify(told), JSON.stringify(history));
}

const qDeleteMem = db.prepare('DELETE FROM agent_memory WHERE user_id = ? AND agent_id = ?');
export const deleteAgentMemory = (userId, agentId) => { qDeleteMem.run(userId, agentId); };

// --- Глобальное состояние игры ---

const qLoadGame = db.prepare('SELECT scene, scene_started_at, entities FROM game_state WHERE id = 1');
const qSaveGame = db.prepare(`
  INSERT INTO game_state (id, scene, scene_started_at, entities) VALUES (1, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET scene = excluded.scene,
    scene_started_at = excluded.scene_started_at, entities = excluded.entities`);

// → { scene, startAt, entities } или null
export function loadGameState() {
  const row = qLoadGame.get();
  if (!row) return null;
  return { scene: row.scene, startAt: row.scene_started_at, entities: parse(row.entities, {}) };
}

export function saveGameState({ scene, startAt, entities = {} }) {
  qSaveGame.run(scene, startAt, JSON.stringify(entities));
}

// --- Чанки мира ---

const qGetChunk = db.prepare('SELECT data FROM chunks WHERE zone = ? AND cx = ? AND cz = ?');
const qPutChunk = db.prepare(`
  INSERT INTO chunks (zone, cx, cz, data, bytes) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(zone, cx, cz) DO UPDATE SET data = excluded.data, bytes = excluded.bytes`);
const qMeta = db.prepare('SELECT zone, COUNT(*) AS n, SUM(bytes) AS bytes FROM chunks GROUP BY zone');

export function getChunk(zone, cx, cz) {
  const row = qGetChunk.get(zone, cx, cz);
  return row ? parse(row.data, null) : null;
}

export function putChunk(zone, cx, cz, data) {
  const json = JSON.stringify(data);
  qPutChunk.run(zone, cx, cz, json, Buffer.byteLength(json));
  metaCache = null;
}

const qGetWorld = db.prepare('SELECT value FROM world_meta WHERE key = ?');
const qSetWorld = db.prepare('INSERT INTO world_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
export const getWorldValue = (key) => qGetWorld.get(key)?.value ?? null;
export const setWorldValue = (key, value) => { qSetWorld.run(key, value); };

export function clearZone(zone) {
  db.prepare('DELETE FROM chunks WHERE zone = ?').run(zone);
  metaCache = null;
}

// → { zones: {canary: {chunks, bytes}}, totalChunks, totalBytes, cacheLimit }
let metaCache = null;
export function worldMeta() {
  if (metaCache) return metaCache;
  const zones = {};
  let totalChunks = 0, totalBytes = 0;
  for (const { zone, n, bytes } of qMeta.all()) {
    zones[zone] = { chunks: n, bytes: bytes ?? 0 };
    totalChunks += n;
    totalBytes += bytes ?? 0;
  }
  metaCache = { zones, totalChunks, totalBytes, cacheLimit: Math.floor(CONFIG.CACHE_FRACTION * totalChunks) };
  return metaCache;
}

// --- Служебное ---

// npm run reset: прогресс и сцена, пользователи остаются.
export function resetProgress() {
  pending.clear();
  db.exec('DELETE FROM game_state; DELETE FROM player_state; DELETE FROM agent_memory;');
}

export function closeDb() {
  flushPlayers();
  db.close();
}
