// Живой мир: жители и животные Канар, птицы и игуаны Гуанахани, кот и крысы на корабле.
//
// Одинаково у всех без нагрузки на сеть: маршрут каждого считается от общего серверного времени
// (world.npcClockOffset) и зерна раскладки — как ходьба NPC в shared/npc-activity.js. Реакции — простой
// автомат по world_event сервера и позициям игроков: каждый клиент считает их сам по одним и тем же событиям.
//
// Производительность: InstancedMesh на каждую часть тела вида (≈30 вызовов отрисовки на всех), дальние
// без анимации (> ANIM_DIST), совсем дальние скрыты (> HIDE_DIST). Сколько их — setDensity() из настроек.
import * as THREE from 'three';

const ANIM_DIST = 40, HIDE_DIST = 95;
const WALK = { human: 1.15, goat: 0.45, chicken: 0.55, dog: 1.7, cat: 0.7, rat: 1.1, iguana: 0.25, gull: 6.5, parrot: 5 };
const RUN = { human: 3.8, goat: 3, chicken: 2.6, dog: 4.5, cat: 3, rat: 3.5, iguana: 1.6, gull: 9, parrot: 8 };

// --- зерно: одинаковые маршруты у всех клиентов ---
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// --- маршрут: точки по кругу, ходьба с остановками; положение — функция времени ---
function makeRoute(points, speed, waits) {
  const legs = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return { from: p, to: q, len: Math.hypot(q[0] - p[0], q[1] - p[1]), wait: waits[i % waits.length] };
  });
  const period = legs.reduce((s, l) => s + l.wait + l.len / speed, 0) || 1;
  return { legs, period, speed };
}
function sampleRoute(r, t, out) {
  let s = ((t % r.period) + r.period) % r.period;
  for (const l of r.legs) {
    if (s < l.wait) { out.x = l.from[0]; out.z = l.from[1]; out.heading = Math.atan2(l.to[0] - l.from[0], l.to[1] - l.from[1]); out.moving = false; return out; }
    s -= l.wait;
    const d = l.len / r.speed;
    if (s < d) { const k = s / d; out.x = l.from[0] + (l.to[0] - l.from[0]) * k; out.z = l.from[1] + (l.to[1] - l.from[1]) * k; out.heading = Math.atan2(l.to[0] - l.from[0], l.to[1] - l.from[1]); out.moving = true; return out; }
    s -= d;
  }
  const l = r.legs[0]; out.x = l.from[0]; out.z = l.from[1]; out.heading = 0; out.moving = false; return out;
}
const ring = (rand, cx, cz, radius, n) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 + rand() * 0.8, r = radius * (0.45 + rand() * 0.55);
  return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
});

// --- виды: части тела. pivot — точка сустава; anim — что качается при ходьбе ---
const C = (h) => new THREE.Color(h);
const SKIN = [0xc98f6a, 0xb57a55, 0xd9a582, 0x9c6844];
const CLOTH = [0x7d5a3c, 0x5b6b4a, 0x8a3f30, 0x6b5f8a, 0xb59a6a, 0x44546b, 0x8c7b5e];
const HUMAN = (dress) => [
  { key: 'torso', geo: new THREE.CylinderGeometry(0.16, 0.2, 0.62, 8), pos: [0, 1.06, 0], color: (a) => a.shirt },
  { key: 'head', geo: new THREE.SphereGeometry(0.11, 10, 8), pos: [0, 1.5, 0], color: (a) => a.skin },
  { key: 'hat', geo: new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pos: [0, 1.53, 0], color: (a) => a.hair },
  ...(dress ? [{ key: 'skirt', geo: new THREE.ConeGeometry(0.3, 0.78, 10).translate(0, -0.39, 0), pos: [0, 0.8, 0], color: (a) => a.pants }] : []),
  { key: 'leg', geo: new THREE.CylinderGeometry(0.06, 0.055, 0.8, 6).translate(0, -0.4, 0), pos: [-0.09, 0.8, 0], anim: 'legA', color: (a) => a.pants },
  { key: 'leg', geo: null, pos: [0.09, 0.8, 0], anim: 'legB', color: (a) => a.pants },
  { key: 'arm', geo: new THREE.CylinderGeometry(0.045, 0.04, 0.58, 6).translate(0, -0.29, 0), pos: [-0.22, 1.32, 0], anim: 'armA', color: (a) => a.shirt },
  { key: 'arm', geo: null, pos: [0.22, 1.32, 0], anim: 'armB', color: (a) => a.shirt },
];
const QUAD = (body, head, legH, legX, legZ, extra = []) => [
  { key: 'body', geo: new THREE.BoxGeometry(...body), pos: [0, legH + body[1] / 2 - 0.02, 0], color: (a) => a.coat },
  { key: 'head', geo: new THREE.BoxGeometry(...head), pos: [0, legH + body[1] + head[1] * 0.2, body[2] / 2 + head[2] * 0.35], anim: 'head', color: (a) => a.coat },
  ...[[-legX, legZ, 'legA'], [legX, -legZ, 'legA'], [legX, legZ, 'legB'], [-legX, -legZ, 'legB']].map(([x, z, anim], i) => ({
    key: 'leg', geo: i ? null : new THREE.CylinderGeometry(0.03, 0.025, legH, 5).translate(0, -legH / 2, 0), pos: [x, legH, z], anim, color: (a) => a.legs ?? a.coat,
  })),
  ...extra,
];
const BIRD = (len, span) => [
  { key: 'body', geo: new THREE.SphereGeometry(0.5, 8, 6).scale(len * 0.35, len * 0.3, len), pos: [0, 0, 0], color: (a) => a.coat },
  { key: 'head', geo: new THREE.SphereGeometry(len * 0.17, 8, 6), pos: [0, len * 0.12, len * 0.5], color: (a) => a.head ?? a.coat },
  { key: 'wing', geo: new THREE.BoxGeometry(span, 0.012, len * 0.45).translate(-span / 2, 0, 0), pos: [-len * 0.12, len * 0.05, 0], anim: 'wingA', color: (a) => a.wing ?? a.coat },
  { key: 'wing', geo: null, pos: [len * 0.12, len * 0.05, 0], anim: 'wingB', ry: Math.PI, color: (a) => a.wing ?? a.coat }, // правое — то же крыло, повёрнутое на 180°
];
const SPECIES = {
  human: HUMAN(false),
  woman: HUMAN(true),
  goat: QUAD([0.32, 0.3, 0.7], [0.16, 0.18, 0.24], 0.46, 0.1, 0.24, [
    { key: 'horn', geo: new THREE.ConeGeometry(0.025, 0.16, 5).rotateX(-0.6), pos: [-0.05, 0.98, 0.38], color: () => C(0x4a3b2c) },
    { key: 'horn', geo: null, pos: [0.05, 0.98, 0.38], color: () => C(0x4a3b2c) }]),
  dog: QUAD([0.22, 0.24, 0.62], [0.16, 0.17, 0.22], 0.36, 0.08, 0.22, [
    { key: 'tail', geo: new THREE.CylinderGeometry(0.02, 0.015, 0.28, 5).rotateX(-0.9), pos: [0, 0.62, -0.38], anim: 'tail', color: (a) => a.coat }]),
  cat: QUAD([0.14, 0.15, 0.36], [0.12, 0.11, 0.12], 0.2, 0.05, 0.13, [
    { key: 'tail', geo: new THREE.CylinderGeometry(0.015, 0.01, 0.3, 5).rotateX(0.7), pos: [0, 0.38, -0.24], anim: 'tail', color: (a) => a.coat }]),
  iguana: QUAD([0.18, 0.12, 0.5], [0.1, 0.09, 0.16], 0.1, 0.1, 0.16, [
    { key: 'tail', geo: new THREE.ConeGeometry(0.06, 0.7, 6).rotateX(-Math.PI / 2), pos: [0, 0.14, -0.6], anim: 'tail', color: (a) => a.coat }]),
  chicken: [
    { key: 'body', geo: new THREE.SphereGeometry(0.13, 8, 6).scale(0.9, 1, 1.3), pos: [0, 0.27, 0], color: (a) => a.coat },
    { key: 'head', geo: new THREE.SphereGeometry(0.065, 8, 6), pos: [0, 0.42, 0.13], anim: 'peck', color: (a) => a.coat },
    { key: 'comb', geo: new THREE.BoxGeometry(0.02, 0.05, 0.07), pos: [0, 0.49, 0.13], anim: 'peck', color: () => C(0xc0281e) },
    { key: 'leg', geo: new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4).translate(0, -0.08, 0), pos: [-0.05, 0.16, 0], anim: 'legA', color: () => C(0xd9a33a) },
    { key: 'leg', geo: null, pos: [0.05, 0.16, 0], anim: 'legB', color: () => C(0xd9a33a) },
  ],
  rat: [
    { key: 'body', geo: new THREE.SphereGeometry(0.06, 8, 6).scale(0.8, 0.7, 1.6), pos: [0, 0.05, 0], color: (a) => a.coat },
    { key: 'tail', geo: new THREE.CylinderGeometry(0.008, 0.004, 0.18, 4).rotateX(Math.PI / 2 + 0.2), pos: [0, 0.04, -0.17], anim: 'tail', color: () => C(0xc49a8a) },
  ],
  gull: BIRD(0.42, 0.55),
  parrot: BIRD(0.32, 0.32),
};
// какие виды кто ест/боится: реакции автомата
const BEGS = new Set(['goat', 'dog', 'chicken', 'cat']);
const PEOPLE = new Set(['human', 'woman']);
const FLYING = new Set(['gull', 'parrot']);

// --- кто живёт в каждой зоне (зерно — от раскладки, у всех одно и то же) ---
function canaryPopulation(rand, canaryLayout) {
  const out = [];
  const town = canaryLayout.paths.filter((p) => (p.width ?? 3) >= 3);
  const houses = canaryLayout.objects.filter((o) => o.m === 'house' && Array.isArray(o.p));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  // 18 жителей: 14 ходят по улицам туда-обратно, 4 стоят у рынка и у колодца и переминаются
  for (let i = 0; i < 18; i++) {
    const kind = rand() < 0.45 ? 'woman' : 'human';
    const look = { skin: C(pick(SKIN)), shirt: C(pick(CLOTH)), pants: C(pick(CLOTH)).multiplyScalar(0.8), hair: C(rand() < 0.5 ? 0x2d2219 : pick(CLOTH)) };
    let points;
    if (i < 14) {
      const path = town[i % town.length], side = (rand() - 0.5) * Math.max(0.5, (path.width ?? 3) - 1.2);
      const pts = path.points.map(([x, z]) => [x + side, z + side * 0.6]);
      points = [...pts, ...pts.slice(1, -1).reverse()];
      if (points.length < 2) points = [pts[0], pts[0]];
    } else {
      const spot = [[262.5, 288], [262.5, 296], [249, 300], [252, 294]][i - 14];
      points = ring(rand, spot[0], spot[1], 1.2, 3);
    }
    out.push({ kind, look, route: makeRoute(points, WALK.human * (0.8 + rand() * 0.4), [2 + rand() * 6, 1 + rand() * 4]), phase: rand() * 300 });
  }
  // козы: два стада на склонах за городом
  for (const [cx, cz] of [[214, 252], [304, 252]]) for (let i = 0; i < 5; i++) {
    out.push({ kind: 'goat', look: { coat: C(pick([0xe9e2d2, 0x6b4a2f, 0x2b2420, 0xb98d5c])) }, route: makeRoute(ring(rand, cx + (rand() - 0.5) * 6, cz + (rand() - 0.5) * 6, 9, 4), WALK.goat, [6 + rand() * 8, 4 + rand() * 6]), phase: rand() * 300 });
  }
  // куры: у дверей домов
  for (const h of houses.slice(0, 7)) for (let i = 0; i < 2; i++) {
    const r = h.r ?? 0, fx = h.p[0] + Math.sin(r) * 5.2, fz = h.p[1] + Math.cos(r) * 5.2;
    out.push({ kind: 'chicken', look: { coat: C(pick([0xf2ede0, 0x9a5a2a, 0x2b2a28, 0xc7883a])) }, route: makeRoute(ring(rand, fx, fz, 2.2, 4), WALK.chicken, [2 + rand() * 3, 1 + rand() * 3]), phase: rand() * 300 });
  }
  // собаки бегают по улицам
  for (let i = 0; i < 4; i++) {
    const path = town[(i * 3 + 1) % town.length], pts = path.points;
    out.push({ kind: 'dog', look: { coat: C(pick([0x6b4a2f, 0xc9a26a, 0x2b2420, 0x8c8478])) }, route: makeRoute([...pts, ...pts.slice(1, -1).reverse()], WALK.dog, [3 + rand() * 5, 2]), phase: rand() * 300 });
  }
  // чайки кружат над гаванью
  for (let i = 0; i < 10; i++) {
    const r = 10 + rand() * 22, pts = Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return [256 + Math.cos(a) * r, 326 + Math.sin(a) * r * 0.7]; });
    out.push({ kind: 'gull', look: { coat: C(0xf1f0ea), wing: C(0xb9bec4), head: C(0xf7f7f2) }, fly: 8 + rand() * 8, route: makeRoute(rand() < 0.5 ? pts : pts.reverse(), WALK.gull, [0]), phase: rand() * 300 });
  }
  return out;
}
function guanahaniPopulation(rand) {
  const out = [];
  for (let i = 0; i < 8; i++) { // попугаи над деревней
    const r = 8 + rand() * 18, pts = Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return [172 + Math.cos(a) * r, 255 + Math.sin(a) * r]; });
    const pal = [[0x2f9a3a, 0xd23a2a], [0x2fa04a, 0x2a63b8], [0x3aa53a, 0xe8c040]][i % 3];
    out.push({ kind: 'parrot', look: { coat: C(pal[0]), wing: C(pal[1]), head: C(0xd23a2a) }, fly: 9 + rand() * 6, route: makeRoute(rand() < 0.5 ? pts : pts.reverse(), WALK.parrot, [0]), phase: rand() * 300 });
  }
  for (let i = 0; i < 7; i++) { // чайки над пляжем
    const r = 12 + rand() * 20, pts = Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return [118 + Math.cos(a) * r * 0.6, 255 + Math.sin(a) * r]; });
    out.push({ kind: 'gull', look: { coat: C(0xf1f0ea), wing: C(0xb9bec4) }, fly: 8 + rand() * 8, route: makeRoute(pts, WALK.gull, [0]), phase: rand() * 300 });
  }
  for (let i = 0; i < 6; i++) { // игуаны греются и медленно ползают у камней и бохио
    const c = [[196, 258], [140, 262], [152, 236], [200, 236], [176, 286], [160, 222]][i];
    out.push({ kind: 'iguana', look: { coat: C([0x5f7a3a, 0x7b8a4a, 0x4e5f36][i % 3]) }, route: makeRoute(ring(rand, c[0], c[1], 2.5, 3), WALK.iguana, [10 + rand() * 12, 6]), phase: rand() * 300 });
  }
  return out;
}
function shipPopulation(rand) {
  return [
    { kind: 'cat', look: { coat: C(0x8a6a48) }, route: makeRoute([[-1.8, 2.2], [1.6, 1.6], [1.5, -2.8], [-1.4, -1.8]], WALK.cat, [8, 5, 10, 4]), phase: rand() * 100, deck: 0 },
    { kind: 'rat', look: { coat: C(0x5a5048) }, route: makeRoute([[-2.4, -7.2], [-2.0, -5.6], [-2.6, -4.6]], WALK.rat, [4, 2, 6]), phase: rand() * 100, deck: 0 },
    { kind: 'rat', look: { coat: C(0x4a423c) }, route: makeRoute([[2.2, -6.9], [2.5, -5.4], [1.9, -6.2]], WALK.rat, [3, 5, 2]), phase: rand() * 100, deck: 0 },
  ];
}
const POPULATION = { canary: canaryPopulation, guanahani: guanahaniPopulation, ship: shipPopulation };

// --- одна зона: инстансы частей всех её видов ---
class Herd {
  constructor(world, zone, agents) {
    this.world = world; this.zone = zone; this.agents = agents;
    this.group = new THREE.Group(); this.group.name = `fauna:${zone}`;
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.meshes = new Map(); // `${species}:${key}` → { mesh, slots }
    const counts = new Map();
    for (const a of agents) for (const part of SPECIES[a.kind]) {
      const id = `${a.kind}:${part.key}`;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      const [kind, key] = id.split(':'), geo = SPECIES[kind].find((p) => p.key === key && p.geo).geo;
      const mesh = new THREE.InstancedMesh(geo, this.material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = PEOPLE.has(kind) || kind === 'goat';
      mesh.frustumCulled = false; mesh.userData.noBake = true;
      this.group.add(mesh); this.meshes.set(id, { mesh, next: 0 });
    }
    for (const a of agents) {
      a.slots = SPECIES[a.kind].map((part) => {
        const m = this.meshes.get(`${a.kind}:${part.key}`), slot = m.next++;
        m.mesh.setColorAt(slot, part.color(a.look));
        return { mesh: m.mesh, slot, part };
      });
      a.p = null; a.mode = 'route'; a.until = 0; a.heading = 0; a.step = 0; a.cool = 0;
    }
    for (const { mesh } of this.meshes.values()) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.group.removeFromParent();
    for (const { mesh } of this.meshes.values()) mesh.dispose();
    for (const kind of new Set(this.agents.map((a) => a.kind))) for (const p of SPECIES[kind]) p.geo?.dispose?.();
    this.material.dispose();
  }
}

const M4 = new THREE.Matrix4(), BASE = new THREE.Matrix4(), PART = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SAMPLE = { x: 0, z: 0, heading: 0, moving: false };

export class Fauna {
  // layouts: { canary } — раскладка Ла-Гомеры (дорожки и дома для маршрутов); её передаёт world/index.js
  constructor(world, { layouts = {} } = {}) {
    this.world = world; this.layouts = layouts; this.herds = new Map(); this.density = 1; this.events = [];
  }

  // Настройки: 1 — все, 0.5 — половина, 0 — никого
  setDensity(k) {
    this.density = Math.max(0, Math.min(1, Number(k) || 0));
    for (const herd of this.herds.values()) herd.dispose();
    this.herds.clear();
  }

  herd(zone) {
    if (this.herds.has(zone)) return this.herds.get(zone);
    const make = POPULATION[zone];
    let herd = null;
    if (make && this.density > 0) {
      const layout = this.layouts[zone];
      if (zone === 'canary' && !layout) { this.herds.set(zone, null); return null; }
      const rand = rng(zone.length * 7919 + (layout?.seed ?? 1492));
      const all = make(rand, layout), keep = all.filter((_, i) => (i * 0.618034) % 1 < this.density + 1e-6);
      if (keep.length) {
        herd = new Herd(this.world, zone, keep);
        (zone === 'ship' ? this.world.ship : this.world.scene).add(herd.group);
      }
    }
    this.herds.set(zone, herd);
    return herd;
  }

  // world_event от сервера: { type, who, p, zone }
  react(event) {
    if (event?.p && event.zone) this.events.push({ ...event, at: performance.now() });
    if (this.events.length > 32) this.events.shift();
  }

  update(dt) {
    const w = this.world, zone = w.zone;
    for (const [z, herd] of this.herds) if (herd) herd.group.visible = z === zone;
    const herd = this.herd(zone);
    if (!herd) { this.events.length = 0; return; }
    const t = (Date.now() + (w.npcClockOffset ?? 0)) / 1000, now = performance.now();
    const cam = w.camera.position, island = w.island;
    // кто рядом: локальный игрок и другие игроки
    const people = [[cam.x, cam.z], ...[...(w.players?.map.values() ?? [])].filter((p) => p.rig.root.visible).map((p) => [p.rig.root.position.x, p.rig.root.position.z])];
    const events = this.events.splice(0);
    for (const a of herd.agents) this.step(a, herd, t, now, dt, events, people, cam, island);
    for (const { mesh } of herd.meshes.values()) mesh.instanceMatrix.needsUpdate = true;
  }

  // Автомат одного существа: route (по маршруту) → look / face / beg / flee / dance → назад к маршруту
  step(a, herd, t, now, dt, events, people, cam, island) {
    const r = sampleRoute(a.route, t + a.phase, SAMPLE), kind = a.kind, ship = herd.zone === 'ship';
    if (!a.p) a.p = [r.x, r.z];
    for (const ev of events) this.consider(a, ev, now, ship);
    if (PEOPLE.has(kind) && a.mode === 'route' && now > a.cool) {
      for (const [x, z] of people) {
        if (Math.hypot(x - a.p[0], z - a.p[1]) < 3.2) { a.mode = 'look'; a.target = [x, z]; a.until = now + 2500; a.cool = now + 12000; break; }
      }
    }
    if (a.mode !== 'route' && now > a.until) a.mode = 'route';
    // куда идти и как быстро
    let gx = r.x, gz = r.z, speed = WALK[PEOPLE.has(kind) ? 'human' : kind], face = null, moving = r.moving;
    if (a.mode === 'flee' || a.mode === 'beg' || a.mode === 'dance') { [gx, gz] = a.goal; speed = a.mode === 'flee' ? RUN[PEOPLE.has(kind) ? 'human' : kind] : speed * 1.4; }
    if (a.mode === 'look' || a.mode === 'face') { gx = a.p[0]; gz = a.p[1]; face = a.target; moving = false; }
    const dx = gx - a.p[0], dz = gz - a.p[1], d = Math.hypot(dx, dz);
    const stepLen = Math.min(d, speed * dt * (a.mode === 'route' && d > 3 ? 2 : 1));
    if (d > 6 && a.mode === 'route' && !this.near(a, cam)) { a.p[0] = gx; a.p[1] = gz; } // далеко от игрока — сразу на маршрут
    else if (d > 0.02) { a.p[0] += (dx / d) * stepLen; a.p[1] += (dz / d) * stepLen; moving = d > 0.15 || moving; face ??= [gx, gz]; }
    if (a.mode === 'beg' && d < 0.4) { face = a.target; moving = false; }
    if (a.mode === 'dance' && d < 0.4) { face = a.target; moving = false; }
    const heading = face ? Math.atan2(face[0] - a.p[0], face[1] - a.p[1]) : r.heading;
    const diff = Math.atan2(Math.sin(heading - a.heading), Math.cos(heading - a.heading));
    a.heading += diff * Math.min(1, dt * 6);
    // высота: остров — рельеф, корабль — палуба, птицы — над землёй
    let y = ship ? a.deck ?? 0 : island?.heightAt(a.p[0], a.p[1]);
    const dist = Math.hypot(cam.x - a.p[0], cam.z - a.p[1]);
    const hidden = y == null || dist > HIDE_DIST;
    if (FLYING.has(kind)) y = Math.max(y ?? 0, 0) + a.fly + Math.sin((t + a.phase) * 0.7) * 0.8 + (a.mode === 'flee' ? 6 : 0);
    if (hidden) { for (const s of a.slots) s.mesh.setMatrixAt(s.slot, ZERO); return; }
    a.step += dt * (moving ? (a.mode === 'flee' ? 11 : 6.5) : 0);
    const animate = dist < ANIM_DIST;
    const swing = animate && moving ? Math.sin(a.step) : 0, bob = PEOPLE.has(kind) && a.mode === 'dance' ? Math.abs(Math.sin(t * 5 + a.phase)) * 0.08 : 0;
    const flap = FLYING.has(kind) ? (animate ? Math.sin((t + a.phase) * (kind === 'parrot' ? 14 : 7)) * 0.7 : 0.2) : 0;
    const graze = animate && !moving && (kind === 'goat' || kind === 'chicken') ? 0.5 + 0.4 * Math.sin((t + a.phase) * (kind === 'chicken' ? 6 : 0.8)) : 0;
    BASE.compose(V.set(a.p[0], y + bob, a.p[1]), Q.setFromEuler(E.set(0, a.heading, 0)), ONE);
    for (const s of a.slots) {
      const p = s.part;
      let rx = 0, rz = 0;
      if (p.anim === 'legA') rx = swing * 0.6; else if (p.anim === 'legB') rx = -swing * 0.6;
      else if (p.anim === 'armA') rx = -swing * 0.5 + (a.mode === 'dance' ? -2.4 : 0); else if (p.anim === 'armB') rx = swing * 0.5 + (a.mode === 'dance' ? -2.4 : 0);
      else if (p.anim === 'head' || p.anim === 'peck') rx = graze;
      else if (p.anim === 'tail') rz = animate ? Math.sin((t + a.phase) * 6) * 0.3 : 0;
      else if (p.anim === 'wingA' || p.anim === 'wingB') rz = flap; // правое повёрнуто на 180°: тот же знак — взмах зеркальный
      PART.compose(V.set(...p.pos), Q.setFromEuler(E.set(rx, p.ry ?? 0, rz, 'YXZ')), ONE);
      s.mesh.setMatrixAt(s.slot, M4.multiplyMatrices(BASE, PART));
    }
  }

  near(a, cam) { return Math.hypot(cam.x - a.p[0], cam.z - a.p[1]) < HIDE_DIST; }

  // Реакция на событие: кто и как
  consider(a, ev, now, ship) {
    const [ex, , ez] = ev.p, d = Math.hypot(ex - a.p[0], ez - a.p[1]), kind = a.kind;
    if (ship !== (ev.zone === 'ship')) return;
    const away = (dist) => { const k = d > 0.01 ? dist / d : 0; return [a.p[0] + (a.p[0] - ex) * k + (d < 0.01 ? dist : 0), a.p[1] + (a.p[1] - ez) * k]; };
    switch (ev.type) {
      case 'run': case 'swing': case 'throw':
        if (d < (ev.type === 'run' ? 5 : 6) && (kind !== 'human' && kind !== 'woman' || ev.type !== 'run')) { a.mode = 'flee'; a.goal = away(FLYING.has(kind) ? 10 : 6); a.until = now + 2600; }
        else if (PEOPLE.has(kind) && d < 4) { a.mode = 'flee'; a.goal = away(2.5); a.until = now + 1500; } // бегущий — посторониться
        break;
      case 'scare': // выстрел эспингарды и «Бу!»: разбегаются все в округе
        if (d < 18) { a.mode = 'flee'; a.goal = away(FLYING.has(kind) ? 14 : 8); a.until = now + 3500; }
        break;
      case 'eat':
        if (BEGS.has(kind) && d < 8) { a.mode = 'beg'; a.target = [ex, ez]; const k = d > 0.01 ? (d - 1.1) / d : 0; a.goal = [a.p[0] + (ex - a.p[0]) * k, a.p[1] + (ez - a.p[1]) * k]; a.until = now + 7000; }
        break;
      case 'talk':
        if (PEOPLE.has(kind) && d < 8 && a.mode === 'route') { a.mode = 'face'; a.target = [ex, ez]; a.until = now + 3500; }
        break;
      case 'dance':
        if (PEOPLE.has(kind) && d < 22) {
          const ang = Math.atan2(a.p[0] - ex, a.p[1] - ez) + (Math.random() - 0.5) * 0.4;
          a.mode = 'dance'; a.target = [ex, ez]; a.goal = [ex + Math.sin(ang) * 2.6, ez + Math.cos(ang) * 2.6]; a.until = now + 15000;
        }
        break;
    }
  }

  // для отладки и админки: сколько всего и сколько вызовов отрисовки добавляет зона
  stats() {
    const herd = this.herds.get(this.world.zone);
    return herd ? { creatures: herd.agents.length, drawCalls: herd.meshes.size } : { creatures: 0, drawCalls: 0 };
  }
}
