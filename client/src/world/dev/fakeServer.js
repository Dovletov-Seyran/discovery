// Offline stand-in for the chunk part of the server, so /world-dev.html works without it.
// The island generator is a copy of makeHeightFn/scatter/generateCanary from server/world/generate.js (Бэк 1);
// the real chunks always come from the server.
import { mulberry32, createNoise2D, fbm, smoothstep, lerp } from './noise.js';
import canaryLayout from '../../../../content/canary_layout.json';
import shipLayout from '../../../../content/ship_layout.json';

const CS = 32, RES = CS + 1, SERVER_RADIUS = 3;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function makeHeightFn(layout) {
  const rand = mulberry32(layout.seed);
  const hillsNoise = createNoise2D(rand), shapeNoise = createNoise2D(rand);
  const { center: [tx, tz], half, height: townH } = layout.town;
  return (x, z) => {
    const e = Math.hypot((x - 256) / 225, (z - 215) / 165) + 0.12 * shapeNoise(x / 90, z / 90);
    const land = 1 - smoothstep(0.62, 1.0, e);
    const peak = Math.exp(-((x - 250) ** 2 + (z - 150) ** 2) / (2 * 75 * 75));
    const hills = (fbm(hillsNoise, x / 120, z / 120, 5) + 1) / 2;
    let h = land * (2 + 26 * peak + 12 * hills * (0.4 + peak));
    h = lerp(-8, h, smoothstep(0, 0.35, land));
    const bay = Math.exp(-(((x - tx) / 45) ** 2 + ((z - (tz + half + 45)) / 30) ** 2));
    h = lerp(h, -6, bay);
    const southEdge = tz + half - 10;
    if (z > southEdge) {
      const beach = lerp(townH, -2, smoothstep(southEdge, tz + half + 30, z));
      h = lerp(h, Math.min(h, beach), 1 - smoothstep(half, half + 25, Math.abs(x - tx)));
    }
    const d = Math.max(Math.abs(x - tx), Math.abs(z - tz));
    const w = (1 - smoothstep(half, half + 25, d)) * (1 - smoothstep(southEdge, tz + half, z));
    return lerp(h, townH + 0.8 * shapeNoise(x / 30, z / 30), w);
  };
}

const distToSegment = (px, pz, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
const onPath = (layout, x, z, m) => (layout.paths ?? []).some((path) => path.points.slice(1).some((b, i) => distToSegment(x, z, path.points[i], b) < path.width / 2 + m));

function scatter(layout, heightAt) {
  const rand = mulberry32(layout.seed + 7), { center: [tx, tz], half } = layout.town, placed = [], grid = new Map(), CELL = 8;
  const tooClose = (x, z, m, minDist) => {
    const r = Math.ceil(minDist / CELL), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const o of grid.get(`${cx + i},${cz + j}`) ?? []) {
      const d = Math.hypot(o.p[0] - x, o.p[2] - z);
      if (d < 2.5 || (o.m === m && d < minDist)) return true;
    }
    return false;
  };
  for (const type of layout.scatter ?? []) {
    let n = 0;
    for (let tries = 0; tries < type.count * 30 && n < type.count; tries++) {
      const x = 4 + rand() * (layout.size - 8), z = 4 + rand() * (layout.size - 8), h = heightAt(x, z);
      if (h < type.h[0] || h > type.h[1]) continue;
      if (Math.max(Math.abs(x - tx), Math.abs(z - tz)) < half + 8) continue;
      if (onPath(layout, x, z, 2) || tooClose(x, z, type.m, type.minDist)) continue;
      const obj = { id: `${type.m}_${n}`, m: type.m, p: [r1(x), r1(h), r1(z)], r: r2(rand() * Math.PI * 2), s: r2(lerp(type.scale[0], type.scale[1], rand())) };
      placed.push(obj);
      const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(obj);
      n++;
    }
  }
  return placed;
}

const place = (p, heightAt) => (p.length === 2 ? [p[0], r1(Math.max(heightAt(p[0], p[1]), 0)), p[1]] : p);

function generateCanary(layout) {
  const heightAt = makeHeightFn(layout), n = layout.size / CS, chunks = new Map();
  for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
    const h = new Array(RES * RES);
    for (let iz = 0; iz < RES; iz++) for (let ix = 0; ix < RES; ix++) h[iz * RES + ix] = r1(heightAt(cx * CS + ix, cz * CS + iz));
    chunks.set(`${cx},${cz}`, { zone: 'canary', cx, cz, size: CS, res: RES, h, objects: [], interact: [], npcs: [] });
  }
  const put = (list, obj) => chunks.get(`${Math.floor(obj.p[0] / CS)},${Math.floor(obj.p[2] / CS)}`)?.[list].push(obj);
  for (const o of layout.objects ?? []) put('objects', { ...o, p: place(o.p, heightAt) });
  for (const o of scatter(layout, heightAt)) put('objects', o);
  for (const o of layout.interact ?? []) put('interact', { ...o, p: place(o.p, heightAt) });
  for (const o of layout.npcs ?? []) put('npcs', { ...o, p: place(o.p, heightAt) });
  return { chunks, heightAt };
}

// getPlayer() → { zone, p: [x, y, z] }, deliver(msg) → the client's handler for server messages
export function createFakeServer(getPlayer, deliver) {
  const { chunks: canary, heightAt } = generateCanary(canaryLayout);
  const { _comment, ...ship } = shipLayout;
  const store = { 'ship:0,0': { ...ship, zone: 'ship', cx: 0, cz: 0, size: CS, res: 0, h: null } };
  for (const [k, c] of canary) store[`canary:${k}`] = c;
  let totalBytes = 0;
  for (const c of Object.values(store)) totalBytes += JSON.stringify(c).length;
  const totalChunks = Object.keys(store).length;
  const meta = { zones: { ship: { chunks: 1 }, canary: { chunks: canary.size } }, totalChunks, totalBytes, cacheLimit: Math.floor(0.1 * totalChunks) };

  function handle(msg) {
    if (msg.t !== 'chunk_req') return;
    const pl = getPlayer(), pcx = Math.floor(pl.p[0] / CS), pcz = Math.floor(pl.p[2] / CS);
    for (const key of msg.keys) {
      const [cx, cz] = key.split(',').map(Number), data = store[`${msg.zone}:${key}`];
      let reply;
      if (msg.zone !== pl.zone) reply = { t: 'chunk_denied', zone: msg.zone, key, reason: 'wrong_zone' };
      else if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > SERVER_RADIUS) reply = { t: 'chunk_denied', zone: msg.zone, key, reason: 'too_far' };
      else if (!data) reply = { t: 'chunk_denied', zone: msg.zone, key, reason: 'not_found' };
      else reply = { t: 'chunk', zone: msg.zone, key, data: structuredClone(data) };
      setTimeout(() => deliver(reply), 15 + Math.random() * 25);
    }
  }
  return { meta, handle, heightAt };
}
