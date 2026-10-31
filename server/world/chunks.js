// Выдача чанков: только в зоне игрока и в радиусе SERVER_RADIUS от его реальной позиции.
import { CONFIG } from '../../shared/config.js';
import { S2C } from '../../shared/protocol.js';
import { getChunk } from '../db.js';
import { chunkStats } from '../game/stats.js';

const cache = new Map(); // `${zone}:${key}` → данные чанка (null — нет в БД)

function loadChunk(zone, cx, cz) {
  const k = `${zone}:${cx},${cz}`;
  if (!cache.has(k)) cache.set(k, getChunk(zone, cx, cz));
  return cache.get(k);
}

export const clearChunkCache = () => cache.clear();

function parseKey(key) {
  if (typeof key !== 'string') return null;
  const m = /^(-?\d{1,4}),(-?\d{1,4})$/.exec(key);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export const chunkOf = (p) => [Math.floor(p[0] / CONFIG.CHUNK_SIZE), Math.floor(p[2] / CONFIG.CHUNK_SIZE)];

// entityState(id) → текущее состояние интерактивного объекта или undefined
export function onChunkReq(player, msg, { send, entityState }) {
  const zone = msg.zone;
  const keys = Array.isArray(msg.keys) ? msg.keys : [];
  const deny = (key, reason) => send({ t: S2C.CHUNK_DENIED, zone, key, reason });
  player.chunks ??= new Set();

  keys.forEach((key, i) => {
    if (i >= CONFIG.MAX_CHUNK_KEYS) return deny(key, 'too_many');
    if (zone !== player.zone) return deny(key, 'wrong_zone');
    const c = parseKey(key);
    if (!c) return deny(key, 'bad_key');
    if (!player.p) return deny(key, 'no_position');
    const [pcx, pcz] = chunkOf(player.p);
    if (Math.max(Math.abs(c[0] - pcx), Math.abs(c[1] - pcz)) > CONFIG.SERVER_RADIUS) return deny(key, 'too_far');
    const data = loadChunk(zone, c[0], c[1]);
    if (!data) return deny(key, 'not_found');

    const interact = data.interact.map((o) => {
      const state = entityState(o.id);
      return state === undefined ? o : { ...o, state };
    });
    send({ t: S2C.CHUNK, zone, key, data: { ...data, interact } });
    player.chunks.add(`${zone}:${key}`);
    chunkStats.add(player.id);
  });
}

export function onChunkDrop(player, msg) {
  if (!Array.isArray(msg.keys) || !player.chunks) return;
  for (const key of msg.keys.slice(0, 100)) player.chunks.delete(`${msg.zone}:${key}`);
}
