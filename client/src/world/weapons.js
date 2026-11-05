import * as THREE from 'three';
import { macana } from './macana.js';
// Оружие таино (docs/tz-combat.md): боевое копьё и лук со стрелами. Одна модель — в руке игрока
// (game/held-models.js), у воинов (warriors.js) и на стойке у батея (guanahaniModels.js).
// Как у меча и маканы: начало координат — там, где держит рука, остриё / верх лука — по +Y.
// Железа таино не знали: остриё обожжено на огне и усажено зубами акулы, наконечник стрелы — кость.
const own = (color, roughness = 0.8, metalness = 0) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); m.userData.equipmentOwned = true; return m; };
function adder(root) {
  return (geo, mat, p = [0, 0, 0], r = [0, 0, 0], name) => {
    const o = new THREE.Mesh(geo, mat); o.position.fromArray(p); o.rotation.set(...r);
    o.castShadow = o.receiveShadow = true; if (name) o.name = name; root.add(o); return o;
  };
}

// Копьё 2,3 м: держат на трети длины, древко из твёрдого дерева, обожжённое остриё с двумя рядами
// зубов акулы, обмотка хлопковым шнуром и красная полоса краски-бихи
export function warSpear() {
  const root = new THREE.Group(); root.name = 'war_spear';
  const add = adder(root);
  const wood = own(0x6a4426, 0.72), charred = own(0x2a1a10, 0.9), tooth = own(0xeee6d2, 0.45), cord = own(0xd9ccaa, 0.95), paint = own(0x9a2a1c, 0.8);
  add(new THREE.CylinderGeometry(0.017, 0.021, 2.05, 9), wood, [0, 0.27, 0]); // древко: от −0,75 до 1,3
  add(new THREE.CylinderGeometry(0.021, 0.016, 0.06, 9), wood, [0, -0.78, 0]); // скруглённый пятак
  // остриё: вытянутый обожжённый конус
  add(new THREE.CylinderGeometry(0.004, 0.019, 0.34, 8), charred, [0, 1.47, 0]);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { // зубы — по двум кромкам, остриём вперёд и наружу
    const y = 1.36 + i * 0.045, w = 0.018 - i * 0.0018;
    add(new THREE.ConeGeometry(0.008, 0.03, 4), tooth, [s * w, y, 0], [0, 0, -s * 0.9]);
  }
  for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.021, 0.0035, 4, 10), cord, [0, 1.26 + i * 0.016, 0], [Math.PI / 2, 0, 0]); // крепление острия
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 9), paint, [0, 1.16, 0]);
  for (let i = 0; i < 9; i++) add(new THREE.TorusGeometry(0.022, 0.0035, 4, 10), cord, [0, -0.08 + i * 0.02, 0], [Math.PI / 2, 0, 0.12]); // хват
  return { obj: root };
}

// Стрела 0,8 м: древко из тростника, костяной наконечник, оперение из пальмового листа. Начало — у тетивы,
// наконечник — по +Y
export function arrow({ blunt = false } = {}) {
  const root = new THREE.Group(); root.name = 'arrow';
  const add = adder(root);
  const cane = own(0xc2a66a, 0.8), bone = own(0xe8dfc8, 0.5), node = own(0x8c7444, 0.85), leaf = own(0x6f7a3a, 0.9), cord = own(0xd9ccaa, 0.95);
  add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.78, 6), cane, [0, 0.39, 0]);
  for (const y of [0.22, 0.48]) add(new THREE.CylinderGeometry(0.0068, 0.0068, 0.012, 6), node, [0, y, 0]);
  if (blunt) add(new THREE.SphereGeometry(0.016, 8, 6), cord, [0, 0.79, 0]); // тренировочная: хлопковый шарик
  else add(new THREE.ConeGeometry(0.011, 0.07, 6), bone, [0, 0.81, 0]);
  for (let i = 0; i < 2; i++) { const f = add(new THREE.BoxGeometry(0.03, 0.1, 0.002), leaf, [0, 0.07, 0], [0, i * Math.PI / 2, 0]); f.position.y = 0.08; }
  add(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 6), cord, [0, 0.008, 0]);
  return { obj: root };
}

// Лук 1,5 м: гибкое дерево, хват обмотан хлопком, тетива — хлопковый шнур. Начало — хват; плечи — по ±Y,
// тетива — к стрелку (−Z). userData.draw(k): натянуть на k ∈ [0, 1] (стрела на тетиве — userData.arrow)
export function bow() {
  const root = new THREE.Group(); root.name = 'bow';
  const add = adder(root);
  const wood = own(0x7a4f2a, 0.68), dark = own(0x4a2e18, 0.8), cord = own(0xd9ccaa, 0.95), paint = own(0x9a2a1c, 0.8);
  const L = 0.74, BACK = 0.16, pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16 * 2 - 1; pts.push(new THREE.Vector3(0, t * L, -BACK * t * t - 0.025 * (1 - t * t))); }
  const stave = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.014, 7, false);
  // плечи к концам тоньше
  const pos = stave.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); const t = Math.abs(v.y) / L, k = 1 - 0.45 * t, c = pts[Math.round((v.y / L + 1) * 8)];
    pos.setXYZ(i, c.x + (v.x - c.x) * k, v.y, c.z + (v.z - c.z) * k);
  }
  stave.computeVertexNormals();
  add(stave, wood);
  for (let i = 0; i < 7; i++) add(new THREE.TorusGeometry(0.017, 0.004, 4, 10), cord, [0, -0.06 + i * 0.02, -0.025], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), paint, [0, s * 0.22, -0.025 - BACK * 0.09]);
    add(new THREE.SphereGeometry(0.012, 8, 6), dark, [0, s * L, -BACK]); // зарубки для тетивы
  }
  // тетива: две половины от концов до точки натяжения
  const top = new THREE.Vector3(0, L, -BACK), bottom = new THREE.Vector3(0, -L, -BACK), nock = new THREE.Vector3();
  const half = () => add(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 4), cord);
  const upper = half(), lower = half();
  const arrowObj = arrow({ blunt: true }).obj; arrowObj.rotation.x = Math.PI / 2; root.add(arrowObj); // наконечником вперёд (+Z)
  for (const o of [upper, lower, arrowObj]) o.userData.noBake = true; // geom.bake не сливает: тетива и стрела двигаются
  const span = (mesh, a, b) => { mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.scale.set(1, a.distanceTo(b), 1); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.copy(b).sub(a).normalize()); };
  const draw = (k = 0) => {
    nock.set(0, 0, -BACK - 0.5 * THREE.MathUtils.clamp(k, 0, 1));
    span(upper, top, nock); span(lower, nock, bottom);
    arrowObj.position.set(0.012, 0, nock.z);
  };
  draw(0);
  Object.assign(root.userData, { draw, arrow: arrowObj });
  return { obj: root };
}

// Точка полёта метнутого копья: прямая от руки до места падения плюс дуга высотой arc (u ∈ [0, 1])
export function arcPoint(a, b, arc, u, out = new THREE.Vector3()) {
  out.lerpVectors(a, b, u); out.y += Math.sin(u * Math.PI) * arc;
  return out;
}

// Стойка воинов у батея: две рогатины и перекладина, на ней оружие (одна стойка — один предмет)
export function weaponRack(M, item) {
  const g = new THREE.Group(), wood = M?.get ? M.get('wood') : own(0x6a4a2c), add = adder(g);
  for (const x of [-0.45, 0.45]) {
    add(new THREE.CylinderGeometry(0.03, 0.035, 1.25, 6), wood, [x, 0.62, 0]);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.018, 0.022, 0.22, 5), wood, [x + s * 0.05, 1.3, 0], [0, 0, -s * 0.5]);
  }
  add(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 6), wood, [0, 1.3, 0], [0, 0, Math.PI / 2]);
  let obj = { war_spear: warSpear, bow, macana }[item]().obj;
  // копьё лежит на перекладине, лук прислонён к ней наискосок (дугой к зрителю), макана висит на петле
  if (item === 'war_spear') obj.position.set(0.25, 1.34, 0.04), obj.rotation.set(0, 0, Math.PI / 2);
  else if (item === 'bow') { obj.rotation.y = Math.PI / 2; const lean = new THREE.Group(); lean.add(obj); lean.position.set(0, 0.7, 0.07); lean.rotation.z = 0.45; obj = lean; }
  else obj.position.set(0, 0.22, 0.12), obj.rotation.set(-0.42, 0, 0);
  g.add(obj);
  const col = new THREE.BoxGeometry(1.1, 1.5, 0.35); col.translate(0, 0.75, 0);
  return { obj: g, col: [col], weapon: obj };
}
