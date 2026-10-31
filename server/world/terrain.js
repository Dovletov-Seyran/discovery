// Генератор острова Ла-Гомера — чистые функции без БД и Node API, поэтому им пользуются и сервер
// (generate.js → таблица chunks), и офлайн-страница мира клиента (client/src/world/dev/fakeServer.js).
//
// canary_layout.json:
//   shape   — форма острова: центр и радиусы эллипса, вулкан
//   town    — центр и полуширина выровненного города
//   objects / interact / npcs / spawns — точки:
//     p: [x, z]          y = рельеф;     p: [x, y, z] — как есть
//     rel: "<id>", off: [dx, dz], dy?    — относительно другого объекта (с учётом его поворота)
//     shore: { deck, from }              — пристань: начало там, где берег опускается до высоты настила
//   Под постройками рельеф выравнивается (FOOTPRINTS + запас), чтобы не было ступенек и щелей.
import { mulberry32, createNoise2D, fbm, smoothstep, lerp } from './noise.js';

export const CS = 32, RES = CS + 1;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// Площадки под моделями: прямоугольник [x0, x1, z0, z1] в осях модели (вход/фасад — +z), м
const FOOTPRINTS = {
  house: [-4.5, 4.5, -3.8, 3.8],
  house_governor: [-6.5, 6.5, -5, 6.2],
  church: [-5, 9.4, -10, 10],
  warehouse: [-7, 7, -4.5, 4.5],
  market_stall: [-2.3, 2.3, -1.6, 1.6],
  shipyard: [-3.5, 5, -8, 8],
  well: [-1.7, 1.7, -1.7, 1.7],
  pier: [-2.6, 2.6, -4, 1.2], // только сухой конец: настил и земля вровень
};
const BLEND = 4; // м: плавный переход площадки в рельеф

// Поворот как у three.js rotation.y: локальные (x, z) → мировые смещения
const rot = (r, x, z) => [x * Math.cos(r) + z * Math.sin(r), -x * Math.sin(r) + z * Math.cos(r)];

// Базовый рельеф без площадок
function baseHeight(layout) {
  const rand = mulberry32(layout.seed);
  const hillsNoise = createNoise2D(rand), shapeNoise = createNoise2D(rand);
  const { center: [cx, cz], radius: [rx, rz], peak: [px, pz, pr], peakHeight } = layout.shape;
  const { center: [tx, tz], half, height: townH } = layout.town;
  return (x, z) => {
    // эллипс с изрезанным шумом берегом; вулкан на севере
    const e = Math.hypot((x - cx) / rx, (z - cz) / rz) + 0.1 * shapeNoise(x / 60, z / 60);
    const land = 1 - smoothstep(0.62, 1.0, e);
    const peak = Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * pr * pr));
    const hills = (fbm(hillsNoise, x / 70, z / 70, 5) + 1) / 2;
    let h = land * (2 + peakHeight * peak + 10 * hills * (0.4 + peak));
    h = lerp(-8, h, smoothstep(0, 0.35, land));
    // бухта к югу от города
    h = lerp(h, -6, Math.exp(-(((x - tx) / 34) ** 2 + ((z - (tz + half + 36)) / 24) ** 2)));
    // от южного края города пляж спускается к воде
    const southEdge = tz + half - 8;
    if (z > southEdge) {
      const beach = lerp(townH, -2, smoothstep(southEdge, tz + half + 26, z));
      h = lerp(h, Math.min(h, beach), 1 - smoothstep(half, half + 20, Math.abs(x - tx)));
    }
    // город почти ровный: 2.7–3.3 м
    const d = Math.max(Math.abs(x - tx), Math.abs(z - tz));
    const w = (1 - smoothstep(half, half + 18, d)) * (1 - smoothstep(southEdge, tz + half, z));
    return lerp(h, townH + 0.3 * shapeNoise(x / 25, z / 25), w);
  };
}

// Точки раскладки → мировые координаты; площадки под постройками
function resolve(layout, h0) {
  const byId = new Map(), pads = [];
  const point = (o) => {
    if (o.rel) {
      const base = byId.get(o.rel);
      if (!base) throw new Error(`[terrain] ${o.id}: нет объекта ${o.rel}`);
      const [dx, dz] = rot(base.r ?? 0, o.off[0], o.off[1]);
      const x = base.p[0] + dx, z = base.p[2] + dz;
      return [r1(x), o.y ?? (o.dy !== undefined ? r1(base.p[1] + o.dy) : null), r1(z)];
    }
    if (o.shore) {
      // идём от суши к морю, пока берег не опустится ниже настила; пристань начинается на метр раньше
      const { deck, from } = o.shore, x = o.p[0];
      let z = from;
      while (z < layout.size && h0(x, z) > deck - 0.1) z += 0.25;
      return [x, deck, r1(z - 1)];
    }
    return o.p.length === 3 ? [...o.p] : [o.p[0], null, o.p[1]];
  };
  const out = { objects: [], interact: [], npcs: [], spawns: {} };
  for (const list of ['objects', 'interact', 'npcs']) {
    for (const o of layout[list] ?? []) {
      const p = point(o);
      const r = o.r ?? 0;
      // постройка встаёт на свою площадку: высота — рельеф в её центре
      const fp = FOOTPRINTS[o.m];
      if (fp && p[1] === null) p[1] = r1(Math.max(h0(p[0], p[2]), 0.3));
      if (fp) pads.push({ x: p[0], z: p[2], r, rect: fp, y: o.m === 'pier' ? p[1] + 0.02 : p[1] });
      const item = { ...o, p, r };
      delete item.rel; delete item.off; delete item.dy; delete item.shore;
      out[list].push(item);
      if (o.id) byId.set(o.id, item);
    }
  }
  for (const [role, s] of Object.entries(layout.spawns ?? {})) out.spawns[role] = { p: point(s), r: s.r ?? 0 };
  return { out, pads };
}

function withPads(h0, pads) {
  return (x, z) => {
    let h = h0(x, z);
    for (const pd of pads) {
      const dx = x - pd.x, dz = z - pd.z;
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      // в оси площадки (обратный поворот)
      const lx = dx * Math.cos(pd.r) - dz * Math.sin(pd.r), lz = dx * Math.sin(pd.r) + dz * Math.cos(pd.r);
      const [x0, x1, z0, z1] = pd.rect;
      const ox = Math.max(x0 - lx, 0, lx - x1), oz = Math.max(z0 - lz, 0, lz - z1);
      const w = 1 - smoothstep(0, BLEND, Math.hypot(ox, oz));
      if (w > 0) h = lerp(h, pd.y, w);
    }
    return h;
  };
}

// → { heightAt, layout: { objects, interact, npcs, spawns } } с мировыми координатами
export function resolveLayout(layout) {
  const h0 = baseHeight(layout);
  const { out, pads } = resolve(layout, h0);
  const heightAt = withPads(h0, pads);
  const ground = (p) => (p[1] === null ? [p[0], r1(Math.max(heightAt(p[0], p[2]), 0)), p[2]] : p);
  for (const list of ['objects', 'interact', 'npcs']) for (const o of out[list]) o.p = ground(o.p);
  for (const s of Object.values(out.spawns)) s.p = ground(s.p);
  return { heightAt, layout: out, pads };
}

const distToSegment = (px, pz, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

const onPath = (layout, x, z, margin) =>
  (layout.paths ?? []).some((path) => path.points.slice(1).some((b, i) => distToSegment(x, z, path.points[i], b) < path.width / 2 + margin));

const onPad = (pads, x, z, margin) => pads.some((pd) => {
  const dx = x - pd.x, dz = z - pd.z;
  const lx = dx * Math.cos(pd.r) - dz * Math.sin(pd.r), lz = dx * Math.sin(pd.r) + dz * Math.cos(pd.r);
  const [x0, x1, z0, z1] = pd.rect;
  return lx > x0 - margin && lx < x1 + margin && lz > z0 - margin && lz < z1 + margin;
});

// Растительность и камни: случайные точки с минимальным расстоянием, не в городе, не на дорожках и площадках
function scatter(layout, heightAt, pads, warn) {
  const rand = mulberry32(layout.seed + 7);
  const { center: [tx, tz], half } = layout.town;
  const placed = [], grid = new Map(), CELL = 8;
  const tooClose = (x, z, m, minDist) => {
    const r = Math.ceil(minDist / CELL), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      for (const o of grid.get(`${cx + i},${cz + j}`) ?? []) {
        const d = Math.hypot(o.p[0] - x, o.p[2] - z);
        if (d < 2.2 || (o.m === m && d < minDist)) return true;
      }
    }
    return false;
  };
  for (const type of layout.scatter ?? []) {
    let n = 0;
    for (let tries = 0; tries < type.count * 40 && n < type.count; tries++) {
      const x = 4 + rand() * (layout.size - 8), z = 4 + rand() * (layout.size - 8), h = heightAt(x, z);
      if (h < type.h[0] || h > type.h[1]) continue;
      if (Math.max(Math.abs(x - tx), Math.abs(z - tz)) < half + 4) continue;
      if (onPath(layout, x, z, 2) || onPad(pads, x, z, 3) || tooClose(x, z, type.m, type.minDist)) continue;
      const obj = { id: `${type.m}_${n}`, m: type.m, p: [r1(x), r1(h), r1(z)], r: r2(rand() * Math.PI * 2), s: r2(lerp(type.scale[0], type.scale[1], rand())) };
      placed.push(obj);
      const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(obj);
      n++;
    }
    if (n < type.count) warn?.(`[seed] ${type.m}: поставлено ${n} из ${type.count}`);
  }
  return placed;
}

// Весь остров: Map 'cx,cz' → чанк { zone, cx, cz, size, res, h, objects, interact, npcs }
export function generateCanary(layout, { warn = console.warn } = {}) {
  const { heightAt, layout: L, pads } = resolveLayout(layout);
  const n = layout.size / CS, chunks = new Map();
  for (let cz = 0; cz < n; cz++) {
    for (let cx = 0; cx < n; cx++) {
      const h = new Array(RES * RES);
      for (let iz = 0; iz < RES; iz++) for (let ix = 0; ix < RES; ix++) h[iz * RES + ix] = r1(heightAt(cx * CS + ix, cz * CS + iz));
      chunks.set(`${cx},${cz}`, { zone: 'canary', cx, cz, size: CS, res: RES, h, objects: [], interact: [], npcs: [] });
    }
  }
  const put = (list, obj) => {
    const chunk = chunks.get(`${Math.floor(obj.p[0] / CS)},${Math.floor(obj.p[2] / CS)}`);
    if (chunk) chunk[list].push(obj);
    else warn?.(`[seed] ${obj.id} вне острова: ${obj.p}`);
  };
  for (const o of L.objects) put('objects', o);
  for (const o of scatter(layout, heightAt, pads, warn)) put('objects', o);
  for (const o of L.interact) put('interact', o);
  for (const o of L.npcs) put('npcs', o);
  return { chunks, heightAt, layout: L };
}
