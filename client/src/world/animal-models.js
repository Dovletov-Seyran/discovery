// Модели животных (fauna.js и добыча охоты). Каждая часть — одна геометрия с цветом вершин: шерсть / перо
// белые (их красит цвет особи в InstancedMesh), тёмные детали — глаза, копыта, нос — уже тёмные (умножение на
// окрас их почти не меняет). Яркие детали (клюв, гребень, горло попугая) — отдельные части с цветом без окраса.
// Формат части — как в fauna.js: { key, geo, pos (сустав), anim, color(look) }; geo: null — та же геометрия,
// что у первой части с этим key. Смотрят в +z, стоят на y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = (h) => new THREE.Color(h);
export const WHITE = C(0xffffff);
const fixed = () => WHITE;
const coat = (a) => a.coat;
const tint = (k) => (a) => a.coat.clone().multiplyScalar(k);

// геометрия с цветом вершин (без uv — чтобы части сливались)
function paint(geo, hex = 0xffffff) {
  geo.deleteAttribute('uv');
  const c = C(hex), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo.index ? geo : geo;
}
// слить [геометрия, цвет] в одну
const merge = (list) => mergeGeometries(list.map(([g, hex]) => paint(g, hex)));
// эллипсоид, конус, цилиндр, палка между двумя точками
const blob = (rx, ry, rz, x = 0, y = 0, z = 0, seg = 10) => new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.7 | 0)).scale(rx, ry, rz).translate(x, y, z);
const cone = (r, h, x, y, z, rx = 0, rz = 0, seg = 6) => new THREE.ConeGeometry(r, h, seg).rotateX(rx).rotateZ(rz).translate(x, y, z);
function rod(a, b, r0, r1 = r0, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(...a);
}
const eyes = (x, y, z, r = 0.012) => [[blob(r, r, r, -x, y, z, 6), 0x111111], [blob(r, r, r, x, y, z, 6), 0x111111]];

// --- виды ---

// Утия (хутия) — местный грызун с полкошки: плотное тело, короткие лапы, круглые уши, голый хвост
function hutia() {
  return [
    { key: 'body', pos: [0, 0.17, 0], color: coat, geo: merge([
      [blob(0.15, 0.13, 0.2, 0, 0, 0.03)], [blob(0.145, 0.13, 0.14, 0, -0.005, -0.11)],
      [blob(0.1, 0.06, 0.16, 0, -0.07, 0), 0xe6d8c0]]) },
    { key: 'head', pos: [0, 0.22, 0.19], anim: 'head', color: coat, geo: merge([
      [blob(0.075, 0.07, 0.085, 0, 0.02, 0.05)], [blob(0.045, 0.042, 0.055, 0, -0.005, 0.12)],
      [blob(0.026, 0.03, 0.012, -0.048, 0.08, 0.02, 8), 0x8a6a5a], [blob(0.026, 0.03, 0.012, 0.048, 0.08, 0.02, 8), 0x8a6a5a],
      ...eyes(0.046, 0.04, 0.1, 0.012), [blob(0.014, 0.012, 0.01, 0, 0, 0.17, 6), 0x2a1a1a]]) },
    ...[[-0.08, 0.11, 'legA'], [0.08, -0.11, 'legA'], [0.08, 0.11, 'legB'], [-0.08, -0.11, 'legB']].map(([x, z, anim], i) => ({
      key: 'leg', pos: [x, 0.1, z], anim, color: coat, geo: i ? null : merge([[new THREE.CylinderGeometry(0.03, 0.024, 0.09, 6).translate(0, -0.045, 0)], [blob(0.028, 0.012, 0.04, 0, -0.092, 0.012, 6), 0x3a2e28]]) })),
    { key: 'tail', pos: [0, 0.15, -0.24], anim: 'tail', color: () => C(0x5e4c42), geo: merge([[rod([0, 0, 0], [0, -0.06, -0.2], 0.022, 0.008)]]) },
  ];
}

// Игуана (каменная игуана Багам): длинное тело, гребень шипов, подгрудок, хвост с полосами
function iguana() {
  const crest = [];
  for (let i = 0; i < 13; i++) { const z = 0.32 - i * 0.05, h = 0.05 - Math.abs(i - 3) * 0.003; crest.push([cone(0.011, Math.max(0.02, h), 0, 0.075 + h / 2 - Math.max(0, i - 6) * 0.006, z)]); }
  const tail = [[cone(0.055, 0.78, 0, 0, -0.39, -Math.PI / 2, 0, 8)]];
  for (let i = 1; i <= 4; i++) tail.push([new THREE.CylinderGeometry(0.056 - i * 0.011, 0.056 - i * 0.011, 0.04, 8).rotateX(Math.PI / 2).translate(0, 0, -i * 0.15), 0x6a6a5a]);
  return [
    { key: 'body', pos: [0, 0.12, 0], color: coat, geo: merge([
      [blob(0.1, 0.07, 0.26, 0, 0, 0)], [blob(0.07, 0.06, 0.1, 0, 0.02, 0.24)], [blob(0.08, 0.035, 0.22, 0, -0.045, 0.02), 0xd6cfa2]]) },
    { key: 'crest', pos: [0, 0.12, 0], color: tint(0.55), geo: merge(crest) },
    { key: 'head', pos: [0, 0.15, 0.32], anim: 'head', color: coat, geo: merge([
      [blob(0.058, 0.048, 0.09, 0, 0, 0.06)], [blob(0.05, 0.028, 0.075, 0, -0.03, 0.06)],
      [blob(0.012, 0.045, 0.05, 0, -0.06, 0.03, 8), 0xd8c878], [blob(0.016, 0.016, 0.006, -0.056, 0.0, 0.0, 8), 0xc8b878], [blob(0.016, 0.016, 0.006, 0.056, 0.0, 0.0, 8), 0xc8b878],
      ...eyes(0.045, 0.018, 0.08, 0.011)]) },
    ...[[-0.1, 0.17, 'legA'], [0.1, -0.15, 'legA'], [0.1, 0.17, 'legB'], [-0.1, -0.15, 'legB']].map(([x, z, anim], i) => ({
      key: 'leg', pos: [x, 0.11, z], anim, color: coat, geo: i ? null : merge([[new THREE.CylinderGeometry(0.026, 0.02, 0.11, 6).translate(0, -0.055, 0)], [blob(0.03, 0.01, 0.045, 0, -0.112, 0.02, 6), 0x3a3a2a]]) })),
    { key: 'tail', pos: [0, 0.11, -0.25], anim: 'tail', color: coat, geo: merge(tail) },
  ];
}

// Краб: панцирь, глаза на стебельках, клешни, восемь ног. Ходит боком: «перёд» краба смотрит вбок (+x)
function crab() {
  const legs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = -0.045 + i * 0.03, a = [x, 0, s * 0.07], b = [x * 1.4, 0.035, s * 0.15], c = [x * 1.6, -0.07, s * 0.2];
    legs.push([rod(a, b, 0.011, 0.009, 5)], [rod(b, c, 0.009, 0.005, 5)]);
  }
  return [
    { key: 'body', pos: [0, 0.08, 0], color: coat, geo: merge([
      [blob(0.075, 0.038, 0.1, 0, 0, 0)], [blob(0.06, 0.02, 0.085, 0, -0.025, 0), 0xe8d0b0],
      [rod([0.05, 0.02, -0.03], [0.06, 0.06, -0.035], 0.006)], [rod([0.05, 0.02, 0.03], [0.06, 0.06, 0.035], 0.006)],
      [blob(0.014, 0.014, 0.014, 0.06, 0.065, -0.035, 6), 0x111111], [blob(0.014, 0.014, 0.014, 0.06, 0.065, 0.035, 6), 0x111111]]) },
    { key: 'legs', pos: [0, 0.08, 0], anim: 'scuttle', color: tint(0.85), geo: merge(legs) },
    { key: 'claws', pos: [0.06, 0.07, 0], anim: 'head', color: coat, geo: merge([
      [rod([0, 0, -0.06], [0.06, 0.01, -0.09], 0.012)], [blob(0.035, 0.022, 0.045, 0.085, 0.01, -0.1, 8)], [blob(0.02, 0.008, 0.03, 0.11, 0.0, -0.1, 6), 0xe8d8c0],
      [rod([0, 0, 0.06], [0.05, 0.01, 0.08], 0.01)], [blob(0.025, 0.016, 0.032, 0.07, 0.01, 0.085, 8)]]) },
  ];
}

// Птицы: тело, голова с клювом, хвост, крылья (машут). parrot — амазон: зелёный, красное горло, белый лоб
function bird(len, span, { beak = 0xe8dcb0, face = null, tailLen = 0.5, tips = null } = {}) {
  const wing = [[blob(span / 2, 0.012, len * 0.22, -span / 2, 0, -len * 0.04, 10)]];
  if (tips) wing.push([blob(span * 0.2, 0.013, len * 0.16, -span * 0.86, 0, -len * 0.08, 8), tips]);
  return [
    { key: 'body', pos: [0, 0, 0], color: coat, geo: merge([[blob(len * 0.24, len * 0.24, len * 0.42, 0, 0, 0)], [blob(len * 0.12, len * 0.03, len * tailLen * 0.5, 0, 0.01, -len * (0.42 + tailLen * 0.4), 8)]]) },
    { key: 'head', pos: [0, 0, 0], color: (a) => a.head ?? a.coat, geo: merge([[blob(len * 0.17, len * 0.17, len * 0.18, 0, len * 0.16, len * 0.38)]]) },
    { key: 'beak', pos: [0, 0, 0], color: fixed, geo: merge([
      [cone(len * 0.06, len * 0.16, 0, len * 0.13, len * 0.6, Math.PI / 2 + 0.25, 0, 6), beak],
      ...eyes(len * 0.12, len * 0.2, len * 0.46, len * 0.03),
      ...(face ? [[blob(len * 0.08, len * 0.05, len * 0.05, 0, len * 0.27, len * 0.5, 6), face]] : [])]) },
    { key: 'wing', pos: [-len * 0.15, len * 0.06, 0], anim: 'wingA', color: (a) => a.wing ?? a.coat, geo: merge(wing) },
    { key: 'wing', geo: null, pos: [len * 0.15, len * 0.06, 0], anim: 'wingB', ry: Math.PI, color: (a) => a.wing ?? a.coat },
  ];
}

// Коза: тело, шея и голова с бородой и рогами, копыта, короткий хвост
function goat() {
  const horn = (s) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.04, 0.3, 0.17), new THREE.Vector3(s * 0.06, 0.4, 0.1), new THREE.Vector3(s * 0.08, 0.42, 0.0), new THREE.Vector3(s * 0.085, 0.37, -0.06)]), 8, 0.016, 5);
  return [
    { key: 'body', pos: [0, 0.66, 0], color: coat, geo: merge([
      [blob(0.19, 0.2, 0.34, 0, 0, 0)], [blob(0.16, 0.18, 0.12, 0, 0.02, 0.27)], [blob(0.17, 0.18, 0.12, 0, 0.02, -0.26)],
      [blob(0.04, 0.07, 0.03, 0, 0.14, -0.36, 6)]]) },
    { key: 'head', pos: [0, 0.76, 0.32], anim: 'head', color: coat, geo: merge([
      [rod([0, 0, 0], [0, 0.16, 0.1], 0.08, 0.065)], [blob(0.075, 0.085, 0.13, 0, 0.24, 0.17)], [blob(0.055, 0.055, 0.075, 0, 0.2, 0.28)],
      [blob(0.07, 0.025, 0.035, -0.1, 0.27, 0.12, 6)], [blob(0.07, 0.025, 0.035, 0.1, 0.27, 0.12, 6)],
      [cone(0.03, 0.11, 0, 0.1, 0.27, Math.PI, 0, 5), 0x555048], ...eyes(0.055, 0.27, 0.24, 0.014), [blob(0.02, 0.012, 0.012, 0, 0.21, 0.35, 6), 0x2a2420]]) },
    { key: 'horn', pos: [0, 0.76, 0.32], anim: 'head', color: fixed, geo: merge([[horn(-1), 0x4a3b2c], [horn(1), 0x4a3b2c]]) },
    ...[[-0.1, 0.25, 'legA'], [0.1, -0.24, 'legA'], [0.1, 0.25, 'legB'], [-0.1, -0.24, 'legB']].map(([x, z, anim], i) => ({
      key: 'leg', pos: [x, 0.5, z], anim, color: coat, geo: i ? null : merge([[new THREE.CylinderGeometry(0.038, 0.026, 0.44, 6).translate(0, -0.22, 0)], [new THREE.CylinderGeometry(0.03, 0.033, 0.06, 6).translate(0, -0.47, 0), 0x2a2420]]) })),
  ];
}

// Курица: тело с хвостом и крыльями, голова клюёт; гребень, бородка и клюв — красное и жёлтое
function chicken() {
  return [
    { key: 'body', pos: [0, 0.27, 0], color: coat, geo: merge([
      [blob(0.11, 0.12, 0.16, 0, 0, 0)], [blob(0.02, 0.09, 0.08, 0, 0.1, -0.16, 8)], [blob(0.02, 0.07, 0.07, 0.03, 0.07, -0.17, 8)], [blob(0.02, 0.07, 0.07, -0.03, 0.07, -0.17, 8)],
      [blob(0.03, 0.07, 0.11, -0.1, 0.01, -0.01, 8)], [blob(0.03, 0.07, 0.11, 0.1, 0.01, -0.01, 8)]]) },
    { key: 'head', pos: [0, 0.33, 0.1], anim: 'peck', color: coat, geo: merge([[rod([0, 0, 0], [0, 0.08, 0.04], 0.045, 0.035)], [blob(0.055, 0.06, 0.055, 0, 0.11, 0.05)], ...eyes(0.04, 0.125, 0.08, 0.009)]) },
    { key: 'comb', pos: [0, 0.33, 0.1], anim: 'peck', color: fixed, geo: merge([
      [blob(0.012, 0.035, 0.05, 0, 0.17, 0.05, 6), 0xc0281e], [blob(0.012, 0.025, 0.015, 0, 0.06, 0.1, 6), 0xc0281e], [cone(0.016, 0.04, 0, 0.1, 0.12, Math.PI / 2, 0, 5), 0xd9a33a]]) },
    { key: 'leg', pos: [-0.045, 0.17, 0], anim: 'legA', color: fixed, geo: merge([[new THREE.CylinderGeometry(0.011, 0.011, 0.16, 4).translate(0, -0.08, 0), 0xd9a33a], [blob(0.03, 0.006, 0.04, 0, -0.16, 0.015, 6), 0xd9a33a]]) },
    { key: 'leg', geo: null, pos: [0.045, 0.17, 0], anim: 'legB', color: fixed },
  ];
}

// Собака и кошка: тело, голова с мордой и ушами, лапы, хвост
function dog() {
  return [
    { key: 'body', pos: [0, 0.48, 0], color: coat, geo: merge([[blob(0.12, 0.14, 0.28, 0, 0, 0)], [blob(0.12, 0.15, 0.1, 0, 0.02, 0.23)]]) },
    { key: 'head', pos: [0, 0.56, 0.3], anim: 'head', color: coat, geo: merge([
      [rod([0, 0, 0], [0, 0.1, 0.06], 0.07, 0.06)], [blob(0.085, 0.085, 0.1, 0, 0.12, 0.1)], [blob(0.05, 0.05, 0.085, 0, 0.09, 0.21)],
      [blob(0.03, 0.06, 0.015, -0.075, 0.13, 0.06, 6), 0x6a6460], [blob(0.03, 0.06, 0.015, 0.075, 0.13, 0.06, 6), 0x6a6460],
      ...eyes(0.045, 0.15, 0.18, 0.012), [blob(0.02, 0.016, 0.014, 0, 0.11, 0.29, 6), 0x111111]]) },
    ...[[-0.08, 0.2, 'legA'], [0.08, -0.2, 'legA'], [0.08, 0.2, 'legB'], [-0.08, -0.2, 'legB']].map(([x, z, anim], i) => ({
      key: 'leg', pos: [x, 0.38, z], anim, color: coat, geo: i ? null : merge([[new THREE.CylinderGeometry(0.035, 0.026, 0.36, 6).translate(0, -0.18, 0)], [blob(0.034, 0.02, 0.045, 0, -0.37, 0.015, 6)]]) })),
    { key: 'tail', pos: [0, 0.56, -0.28], anim: 'tail', color: coat, geo: merge([[rod([0, 0, 0], [0, 0.16, -0.22], 0.024, 0.012)]]) },
  ];
}
function cat() {
  const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, -0.12), new THREE.Vector3(0, 0.26, -0.14), new THREE.Vector3(0, 0.32, -0.08)]), 10, 0.016, 5);
  return [
    { key: 'body', pos: [0, 0.22, 0], color: coat, geo: merge([[blob(0.07, 0.08, 0.17, 0, 0, 0)], [blob(0.065, 0.075, 0.07, 0, 0.01, 0.13)]]) },
    { key: 'head', pos: [0, 0.27, 0.17], anim: 'head', color: coat, geo: merge([
      [blob(0.06, 0.055, 0.055, 0, 0.04, 0.04)], [blob(0.03, 0.025, 0.03, 0, 0.02, 0.09)],
      [cone(0.022, 0.045, -0.035, 0.1, 0.035)], [cone(0.022, 0.045, 0.035, 0.1, 0.035)], ...eyes(0.03, 0.05, 0.085, 0.01)]) },
    ...[[-0.04, 0.12, 'legA'], [0.04, -0.12, 'legA'], [0.04, 0.12, 'legB'], [-0.04, -0.12, 'legB']].map(([x, z, anim], i) => ({
      key: 'leg', pos: [x, 0.18, z], anim, color: coat, geo: i ? null : merge([[new THREE.CylinderGeometry(0.018, 0.015, 0.18, 5).translate(0, -0.09, 0)]]) })),
    { key: 'tail', pos: [0, 0.25, -0.16], anim: 'tail', color: coat, geo: merge([[tail]]) },
  ];
}
function rat() {
  return [
    { key: 'body', pos: [0, 0.05, 0], color: coat, geo: merge([[blob(0.045, 0.04, 0.09, 0, 0, 0)], [blob(0.03, 0.028, 0.05, 0, 0.005, 0.09)], [cone(0.018, 0.04, 0, 0.005, 0.15, Math.PI / 2, 0, 5)],
      [blob(0.016, 0.018, 0.006, -0.022, 0.035, 0.08, 6), 0xc49a8a], [blob(0.016, 0.018, 0.006, 0.022, 0.035, 0.08, 6), 0xc49a8a], ...eyes(0.02, 0.02, 0.12, 0.007)]) },
    { key: 'tail', pos: [0, 0.04, -0.08], anim: 'tail', color: () => C(0xc49a8a), geo: merge([[rod([0, 0, 0], [0, -0.02, -0.18], 0.008, 0.003, 4)]]) },
  ];
}

export const ANIMALS = {
  hutia: hutia(), iguana: iguana(), crab: crab(), goat: goat(), chicken: chicken(), dog: dog(), cat: cat(), rat: rat(),
  parrot: bird(0.34, 0.34, { face: 0xf0ece0, tailLen: 0.55 }),
  gull: bird(0.44, 0.58, { beak: 0xe8c040, tips: 0x1a1a1a, tailLen: 0.3 }),
};

// Отдельная модель (добыча охоты, тушка на земле и в руке): части с цветами особи, лежит на боку
export function animalModel(kind, look, { lying = true } = {}) {
  const parts = ANIMALS[kind];
  if (!parts) return null;
  const root = new THREE.Group(), body = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); material.userData.equipmentOwned = true;
  for (const part of parts) {
    const geo = (part.geo ?? parts.find((p) => p.key === part.key && p.geo).geo).clone();
    const c = part.color(look), col = geo.attributes.color;
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    const m = new THREE.Mesh(geo, material);
    m.position.fromArray(part.pos); m.rotation.set(0, part.ry ?? 0, 0); m.castShadow = true;
    body.add(m);
  }
  if (lying) { // на боку, лапами в сторону; приподнять на полтолщины
    const box = new THREE.Box3().setFromObject(body), h = (box.max.y - box.min.y) / 2;
    body.rotation.z = Math.PI / 2; body.position.y = Math.max(0.04, (box.max.x - box.min.x) / 2); body.position.x = h * 0.3;
  }
  root.add(body); root.name = `carcass-${kind}`;
  return root;
}
// Окрас тушки по умолчанию — как у большинства особей в деревне
export const CARCASS_LOOK = {
  hutia: { coat: C(0x6b5039) }, iguana: { coat: C(0x6f8240) }, crab: { coat: C(0xd0703a) },
  goat: { coat: C(0x8a6a48) }, chicken: { coat: C(0xc7883a) }, rat: { coat: C(0x5a5048) },
};
