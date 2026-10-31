// Генерация мира в таблицу chunks: остров canary (16×16 чанков) и корабль ship (1 чанк).
import { CONFIG } from '../../shared/config.js';
import { loadContent } from '../content.js';
import { createHash } from 'node:crypto';
import { putChunk, clearZone, worldMeta, withTransaction, getWorldValue, setWorldValue } from '../db.js';
import { generateCanary as generateCanaryChunks } from './terrain.js';

const CS = CONFIG.CHUNK_SIZE;

// Остров строит server/world/terrain.js (его же использует офлайн-страница мира клиента)
export function generateCanary() {
  const layout = loadContent('canary_layout.json', null);
  if (!layout) throw new Error('нет content/canary_layout.json');
  const { chunks, heightAt, layout: resolved } = generateCanaryChunks(layout);
  return { chunks: [...chunks.values()], heightAt, layout: resolved };
}

// Корабль — один чанк: весь content/ship_layout.json (его ведёт Фронт 1) + служебные поля чанка
export function generateShip() {
  const { _comment, ...layout } = loadContent('ship_layout.json', {});
  return {
    ...layout,
    zone: 'ship', cx: 0, cz: 0, size: CS, res: 0, h: null,
    objects: layout.objects ?? [], interact: layout.interact ?? [], npcs: layout.npcs ?? [],
  };
}

// Меняется при правке раскладок или генератора → сервер перегенерирует мир при старте
const GENERATOR_VERSION = 5;
export function layoutHash() {
  const h = createHash('sha1').update(String(GENERATOR_VERSION));
  for (const name of ['canary_layout.json', 'ship_layout.json']) h.update(JSON.stringify(loadContent(name, null)));
  return h.digest('hex');
}

export const worldIsStale = () => !worldMeta().totalChunks || getWorldValue('layout_hash') !== layoutHash();

export function seedWorld() {
  const t0 = Date.now();
  const { chunks } = generateCanary();
  const ship = generateShip();
  withTransaction(() => {
    clearZone('canary');
    clearZone('ship');
    for (const c of chunks) putChunk(c.zone, c.cx, c.cz, c);
    putChunk('ship', 0, 0, ship);
    setWorldValue('layout_hash', layoutHash());
  });
  const meta = worldMeta();
  console.log(`[seed] мир готов за ${Date.now() - t0} мс: ${meta.totalChunks} чанков, ${(meta.totalBytes / 1024).toFixed(0)} КБ, лимит кеша ${meta.cacheLimit}`);
  return meta;
}
