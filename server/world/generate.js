// Генерация мира в таблицу chunks: остров canary (16×16 чанков) и корабль ship (1 чанк).
import { CONFIG } from '../../shared/config.js';
import { loadContent } from '../content.js';
import { createHash } from 'node:crypto';
import { putChunk, clearZone, worldMeta, withTransaction, getWorldValue, setWorldValue } from '../db.js';
import { mulberry32, createNoise2D, fbm, smoothstep, lerp } from './noise.js';

const CS = CONFIG.CHUNK_SIZE;
const RES = CS + 1; // 33×33 высот, края совпадают с соседями
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// Высота рельефа острова → функция (x, z) в метрах; уровень моря 0
export function makeHeightFn(layout) {
  const rand = mulberry32(layout.seed);
  const hillsNoise = createNoise2D(rand);
  const shapeNoise = createNoise2D(rand);
  const { center: [tx, tz], half, height: townH } = layout.town;

  return (x, z) => {
    // Форма — эллипс с изрезанным шумом краем, вулкан на севере, бухта на юге у пристани
    const e = Math.hypot((x - 256) / 225, (z - 215) / 165) + 0.12 * shapeNoise(x / 90, z / 90);
    const land = 1 - smoothstep(0.62, 1.0, e);
    const peak = Math.exp(-((x - 250) ** 2 + (z - 150) ** 2) / (2 * 75 * 75));
    const hills = (fbm(hillsNoise, x / 120, z / 120, 5) + 1) / 2;
    let h = land * (2 + 26 * peak + 12 * hills * (0.4 + peak)); // вершина ≤ 40 м
    h = lerp(-8, h, smoothstep(0, 0.35, land));

    // Бухта к югу от города
    const bay = Math.exp(-(((x - tx) / 45) ** 2 + ((z - (tz + half + 45)) / 30) ** 2));
    h = lerp(h, -6, bay);

    // К югу от города — пляж, спускающийся к бухте
    const southEdge = tz + half - 10;
    if (z > southEdge) {
      const beach = lerp(townH, -2, smoothstep(southEdge, tz + half + 30, z));
      h = lerp(h, Math.min(h, beach), 1 - smoothstep(half, half + 25, Math.abs(x - tx)));
    }
    // Город выравниваем до 2–4 м
    const d = Math.max(Math.abs(x - tx), Math.abs(z - tz));
    const w = (1 - smoothstep(half, half + 25, d)) * (1 - smoothstep(southEdge, tz + half, z));
    const target = townH + 0.8 * shapeNoise(x / 30, z / 30);
    return lerp(h, target, w);
  };
}

const distToSegment = (px, pz, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

function onPath(layout, x, z, margin) {
  for (const path of layout.paths ?? []) {
    for (let i = 1; i < path.points.length; i++) {
      if (distToSegment(x, z, path.points[i - 1], path.points[i]) < path.width / 2 + margin) return true;
    }
  }
  return false;
}

// Процедурные объекты: случайные точки с минимальным расстоянием (сетка-хеш для проверки соседей)
function scatter(layout, heightAt) {
  const rand = mulberry32(layout.seed + 7);
  const { center: [tx, tz], half } = layout.town;
  const placed = [];
  const grid = new Map();
  const CELL = 8;
  const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const tooClose = (x, z, m, minDist) => {
    const r = Math.ceil(minDist / CELL);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      for (const o of grid.get(`${cx + i},${cz + j}`) ?? []) {
        const d = Math.hypot(o.p[0] - x, o.p[2] - z);
        if (d < 2.5 || (o.m === m && d < minDist)) return true;
      }
    }
    return false;
  };

  for (const type of layout.scatter ?? []) {
    let n = 0;
    for (let tries = 0; tries < type.count * 30 && n < type.count; tries++) {
      const x = 4 + rand() * (layout.size - 8);
      const z = 4 + rand() * (layout.size - 8);
      const h = heightAt(x, z);
      if (h < type.h[0] || h > type.h[1]) continue;
      if (Math.max(Math.abs(x - tx), Math.abs(z - tz)) < half + 8) continue;
      if (onPath(layout, x, z, 2) || tooClose(x, z, type.m, type.minDist)) continue;
      const obj = {
        id: `${type.m}_${n}`, m: type.m, p: [r1(x), r1(h), r1(z)],
        r: r2(rand() * Math.PI * 2), s: r2(lerp(type.scale[0], type.scale[1], rand())),
      };
      placed.push(obj);
      const k = cellKey(x, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(obj);
      n++;
    }
    if (n < type.count) console.warn(`[seed] ${type.m}: поставлено ${n} из ${type.count}`);
  }
  return placed;
}

// [x, z] → [x, рельеф, z]; [x, y, z] — как есть
const place = (p, heightAt) => (p.length === 2 ? [p[0], r1(Math.max(heightAt(p[0], p[1]), 0)), p[1]] : p);

export function generateCanary() {
  const layout = loadContent('canary_layout.json', null);
  if (!layout) throw new Error('нет content/canary_layout.json');
  const heightAt = makeHeightFn(layout);
  const n = layout.size / CS;
  const chunks = new Map();
  for (let cz = 0; cz < n; cz++) {
    for (let cx = 0; cx < n; cx++) {
      const h = new Array(RES * RES);
      for (let iz = 0; iz < RES; iz++) {
        for (let ix = 0; ix < RES; ix++) h[iz * RES + ix] = r1(heightAt(cx * CS + ix, cz * CS + iz));
      }
      chunks.set(`${cx},${cz}`, { zone: 'canary', cx, cz, size: CS, res: RES, h, objects: [], interact: [], npcs: [] });
    }
  }
  const put = (list, obj) => {
    const key = `${Math.floor(obj.p[0] / CS)},${Math.floor(obj.p[2] / CS)}`;
    const chunk = chunks.get(key);
    if (chunk) chunk[list].push(obj);
    else console.warn(`[seed] ${obj.id} вне острова: ${obj.p}`);
  };
  for (const o of layout.objects ?? []) put('objects', { ...o, p: place(o.p, heightAt) });
  for (const o of scatter(layout, heightAt)) put('objects', o);
  for (const o of layout.interact ?? []) put('interact', { ...o, p: place(o.p, heightAt) });
  for (const o of layout.npcs ?? []) put('npcs', { ...o, p: place(o.p, heightAt) });
  return { chunks: [...chunks.values()], heightAt, layout };
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
const GENERATOR_VERSION = 2;
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
