import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, mesh, cylGeo, between, boxGeo, lathe } from './geom.js';
import { ihash } from './texgen.js';

// Models of Guanahani, part 2 (ids from content/guanahani_layout.json): a Lucayan Taíno village and the island's
// plants. Buildings face +z (door side). Each builder returns { obj, col? } like the La Gomera models.
// No coconut palms (they came later), no metal: wood, cane, palm thatch, cotton, clay and stone.

function noisy(geo, amp, seed) {
  const p = geo.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = ihash(Math.round(v.x * 50), Math.round(v.y * 50) * 7 + Math.round(v.z * 50), seed);
    v.multiplyScalar(1 + (k - 0.5) * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const scaleUV = (geo, su, sv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; };

// A cotton hammock slung between a and b: the cloth hangs in a trough (edges up), sags in the middle and is
// gathered into cords at both ends (Taíno «hamaca»).
function hammock(M, a, b, sag = 0.45, w = 0.85) {
  const g = new THREE.Group(), d = new V3().subVectors(b, a), S = 16, U = 6;
  const side = new V3(-d.z, 0, d.x).normalize(), pos = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S, c = new V3().lerpVectors(a, b, 0.1 + t * 0.8), gather = Math.min(1, Math.min(t, 1 - t) / 0.18);
    c.y -= sag * Math.sin(Math.PI * (0.1 + t * 0.8));
    for (let j = 0; j <= U; j++) {
      const s = (j / U) * 2 - 1, half = (w / 2) * (0.15 + 0.85 * gather);
      pos.push(c.x + side.x * s * half, c.y + 0.16 * s * s * gather, c.z + side.z * s * half);
    }
    if (i) for (let j = 0; j < U; j++) { const k = i * (U + 1) + j, p = k - (U + 1); idx.push(p, p + 1, k, p + 1, k + 1, k); }
  }
  const cloth = new THREE.BufferGeometry();
  cloth.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cloth.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  cloth.setIndex(idx); cloth.computeVertexNormals();
  g.add(mesh(cloth, M.get('cotton')));
  const end0 = new V3().lerpVectors(a, b, 0.1), end1 = new V3().lerpVectors(a, b, 0.9);
  end0.y -= sag * Math.sin(Math.PI * 0.1); end1.y -= sag * Math.sin(Math.PI * 0.9);
  g.add(mesh(between(a, end0, 0.012, 0.012, 4), M.get('rope')), mesh(between(end1, b, 0.012, 0.012, 4), M.get('rope')));
  return g;
}

// Bohío: a round house of cane on posts with a tall conical roof of palm thatch; two hammocks inside.
function bohio(M) {
  const g = new THREE.Group(), R = 3.2, H = 1.9, gap = 0.34;
  const wall = new THREE.CylinderGeometry(R, R, H, 36, 1, true, gap / 2, Math.PI * 2 - gap);
  wall.translate(0, H / 2, 0);
  g.add(mesh(scaleUV(wall, 7, 1), M.get('cane')));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + gap; g.add(mesh(cylGeo(0.08, 0.08, H + 0.15, 6).translate(Math.sin(a) * R, (H + 0.15) / 2, Math.cos(a) * R), M.get('wood'))); }
  for (const s of [-1, 1]) g.add(mesh(cylGeo(0.09, 0.09, H + 0.1, 6).translate(Math.sin(s * gap / 2) * R, (H + 0.1) / 2, Math.cos(gap / 2) * R), M.get('trim')));
  const roof = noisy(new THREE.ConeGeometry(R + 0.75, 3.3, 28, 4, true), 0.04, 301);
  roof.translate(0, H + 1.5, 0);
  g.add(mesh(scaleUV(roof, 6, 3), M.get('thatch')));
  g.add(mesh(cylGeo(0.13, 0.11, H + 3.2, 8).translate(0, (H + 3.2) / 2, 0), M.get('wood')));
  // hammocks hang from the centre pole to the wall posts
  g.add(hammock(M, new V3(0, 1.45, 0), new V3(-2.7, 1.5, -1.6)));
  g.add(hammock(M, new V3(0, 1.4, 0), new V3(2.6, 1.45, -1.7), 0.42));
  // a cotton bundle and a clay pot by the wall
  g.add(mesh(new THREE.SphereGeometry(0.28, 10, 8).scale(1, 0.7, 1).translate(-1.9, 0.2, 1.5), M.get('cotton')));
  g.add(mesh(lathe([[0, 0], [0.2, 0.05], [0.26, 0.25], [0.2, 0.42], [0.14, 0.48]], 12).translate(2.1, 0, 1.3), M.get('clay')));
  // wall as a ring of boxes, the doorway left open
  const col = [];
  for (let i = 0; i < 14; i++) {
    const a = gap / 2 + 0.2 + (i / 14) * (Math.PI * 2 - gap - 0.4);
    const b = boxGeo(1.45, H, 0.25); b.rotateY(a); b.translate(Math.sin(a) * R, H / 2, Math.cos(a) * R); col.push(b);
  }
  col.push(boxGeo(0.3, 3, 0.3, 0, 1.5, 0));
  return { obj: g, col };
}

// Caney: the cacique's large house — oblong, cane walls, a steep hipped thatch roof, a porch, his carved duho seat.
function caney(M) {
  const g = new THREE.Group(), W = 11, D = 8, H = 2.3, door = 1.8;
  const walls = [boxGeo(W, H, 0.18, 0, H / 2, -D / 2), boxGeo(0.18, H, D, -W / 2, H / 2, 0), boxGeo(0.18, H, D, W / 2, H / 2, 0),
    boxGeo((W - door) / 2, H, 0.18, -(W + door) / 4, H / 2, D / 2), boxGeo((W - door) / 2, H, 0.18, (W + door) / 4, H / 2, D / 2)];
  for (const w of walls) g.add(mesh(scaleUV(w, 2, 1), M.get('cane')));
  const roof = new THREE.ConeGeometry(1, 4.2, 4, 3, true); roof.rotateY(Math.PI / 4); roof.scale((W + 2.4) / Math.SQRT2, 1, (D + 2.4) / Math.SQRT2);
  roof.translate(0, H + 2.05, 0);
  g.add(mesh(scaleUV(noisy(roof, 0.03, 311), 8, 3), M.get('thatch')));
  for (const x of [-W / 2, -W / 4, W / 4, W / 2]) g.add(mesh(cylGeo(0.12, 0.12, H, 8).translate(x, H / 2, D / 2 + 1.0), M.get('wood')));
  g.add(mesh(boxGeo(W + 0.4, 0.12, 1.4, 0, H, D / 2 + 0.6), M.get('thatch')));
  // duho: a low curved seat carved from one block
  const duho = new THREE.Group();
  duho.add(mesh(boxGeo(0.5, 0.08, 0.9, 0, 0.32, 0).rotateX(-0.15), M.get('trim')));
  for (const [x, z] of [[-0.18, -0.3], [0.18, -0.3], [-0.18, 0.3], [0.18, 0.3]]) duho.add(mesh(cylGeo(0.04, 0.05, 0.3, 6).translate(x, 0.15, z), M.get('trim')));
  duho.add(mesh(boxGeo(0.4, 0.5, 0.06, 0, 0.6, -0.45).rotateX(0.3), M.get('trim')));
  duho.position.set(0, 0, -D / 2 + 1.4);
  g.add(duho);
  g.add(hammock(M, new V3(-W / 2 + 0.3, 1.6, -2.5), new V3(-1.5, 1.6, -3.6)));
  const col = walls.map((w) => w.clone());
  return { obj: g, col };
}

// Batey: the plaza for the ball game and the areíto dances, ringed with upright limestone blocks.
function batey(M) {
  const g = new THREE.Group(), stones = [], col = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2, x = Math.cos(a) * 15, z = Math.sin(a) * 11, h = 0.45 + ihash(i, 3, 321) * 0.4;
    const s = noisy(new THREE.BoxGeometry(0.55, h, 0.35, 2, 2, 2), 0.25, 322 + i);
    s.rotateY(-a + Math.PI / 2 + (ihash(i, 4, 323) - 0.5) * 0.3); s.translate(x, h / 2 - 0.05, z);
    stones.push(s);
    col.push(boxGeo(0.6, h, 0.6, x, h / 2, z));
  }
  g.add(mesh(mergeGeometries(stones), M.get('limestone')));
  return { obj: g, col };
}

// Zemí: a three-pointed stone (trigonolito) on a carved wooden stand.
function zemi(M) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.16, 0.2, 0.75, 8).translate(0, 0.375, 0), M.get('trim')));
  const st = lathe([[0, 0], [0.22, 0.03], [0.3, 0.12], [0.16, 0.22], [0.05, 0.42], [0, 0.46]], 10);
  st.scale(1.4, 1, 0.8); st.translate(0, 0.75, 0);
  g.add(mesh(noisy(st, 0.08, 331), M.get('limestone')));
  return { obj: g, col: [boxGeo(0.5, 1.1, 0.5, 0, 0.55, 0)] };
}

// Conuco: the cassava field — earth mounds in rows, each with a manioc plant (thin stem, palmate leaves).
function conuco(M) {
  const g = new THREE.Group(), mounds = [], stems = [], leaves = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
    const x = (i - 2.5) * 2.2, z = (j - 2) * 2.2, k = ihash(i, j, 341);
    mounds.push(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(x, 0, z));
    const hgt = 1.0 + k * 0.6;
    stems.push(cylGeo(0.025, 0.03, hgt, 5).translate(x, 0.3 + hgt / 2, z));
    for (let l = 0; l < 7; l++) {
      const a = l * 0.9 + k * 6, leaf = new THREE.PlaneGeometry(0.12, 0.5).translate(0, 0.25, 0);
      leaf.rotateX(-0.9); leaf.rotateY(a);
      leaf.translate(x, 0.3 + hgt * (0.65 + 0.35 * ihash(l, j, 342)), z);
      leaves.push(leaf);
    }
  }
  g.add(mesh(mergeGeometries(mounds), M.get('mound')));
  g.add(mesh(mergeGeometries(stems), M.get('trim')));
  g.add(mesh(mergeGeometries(leaves), M.get('cassavaLeaf')));
  return { obj: g };
}

function cottonBush(M) {
  const g = new THREE.Group(), green = [], bolls = [];
  for (let i = 0; i < 4; i++) green.push(noisy(new THREE.IcosahedronGeometry(0.4 + ihash(i, 0, 351) * 0.2, 1), 0.3, 352 + i).translate(Math.cos(i * 1.6) * 0.3, 0.6 + i * 0.12, Math.sin(i * 1.6) * 0.3));
  for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.45 + ihash(i, 1, 353) * 0.15; bolls.push(new THREE.SphereGeometry(0.07, 6, 5).translate(Math.cos(a) * r, 0.5 + ihash(i, 2, 354) * 0.7, Math.sin(a) * r)); }
  g.add(mesh(mergeGeometries(green), M.get('bush')));
  g.add(mesh(mergeGeometries(bolls), M.get('cotton')));
  return { obj: g };
}

function firePit(M) {
  const g = new THREE.Group(), ring = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; ring.push(noisy(new THREE.IcosahedronGeometry(0.2, 0), 0.3, 361 + i).translate(Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65)); }
  g.add(mesh(mergeGeometries(ring), M.get('limestone')));
  for (let i = 0; i < 3; i++) g.add(mesh(between(new V3(Math.cos(i * 2.1) * 0.5, 0.05, Math.sin(i * 2.1) * 0.5), new V3(0, 0.35, 0), 0.06, 0.05, 6), M.get('trim')));
  g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.5, 1).translate(0, 0.08, 0), M.get('ember')));
  return { obj: g };
}

// A dugout canoe: one trunk hollowed out, pointed ends, two paddles inside.
function canoe(M) {
  const g = new THREE.Group(), L = 6.4, B = 0.48, D = 0.5, NZ = 18, NU = 8, cols = 2 * NU + 1, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NZ; i++) {
    const z = -L / 2 + (L * i) / NZ, t = z / (L / 2), hw = B * Math.pow(Math.max(0, 1 - t * t), 0.45) + 0.02;
    for (let j = 0; j < cols; j++) {
      const s = j / NU - 1, u = 1 - Math.abs(s), y = D * 0.55 - u * D * (1 - 0.3 * t * t) + 0.12 * t * t;
      pos.push(Math.sign(s) * hw * Math.sqrt(Math.max(0, 1 - u * u * 0.85)), y, z); uv.push(z / 2, j / 8);
    }
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < cols - 1; j++) { const a = i * cols + j; idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols); }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hull.setIndex(idx); hull.computeVertexNormals();
  g.add(mesh(hull, M.get('hull')));
  for (const s of [-1, 1]) {
    g.add(mesh(between(new V3(s * 0.15, 0.1, s * 0.6), new V3(-s * 0.1, 0.18, s * 1.9), 0.025, 0.025, 6), M.get('wood')));
    g.add(mesh(boxGeo(0.16, 0.02, 0.45, -s * 0.12, 0.18, s * 2.1), M.get('wood')));
  }
  return { obj: g, col: [boxGeo(1.0, 0.6, L - 0.6, 0, 0.1, 0)] };
}

// A fishing spear (a hardwood shaft, the point barbed with fish teeth) resting on two forked sticks.
function fishSpear(M) {
  const g = new THREE.Group();
  for (const z of [-0.8, 0.8]) g.add(mesh(cylGeo(0.035, 0.04, 0.7, 6).translate(0, 0.35, z), M.get('trim')));
  g.add(mesh(between(new V3(0, 0.68, -1.4), new V3(0, 0.72, 1.3), 0.025, 0.02, 6), M.get('wood')));
  g.add(mesh(new THREE.ConeGeometry(0.03, 0.18, 5).rotateX(Math.PI / 2).translate(0, 0.72, 1.39), M.get('limestone')));
  return { obj: g, col: [boxGeo(0.3, 0.8, 2.8, 0, 0.4, 0)] };
}

// Burén: the clay griddle for cassava bread, on three stones over the embers, a flat round of casabe on it.
function buren(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(mesh(noisy(new THREE.IcosahedronGeometry(0.17, 0), 0.3, 371 + i).translate(Math.cos(a) * 0.38, 0.12, Math.sin(a) * 0.38), M.get('limestone'))); }
  g.add(mesh(cylGeo(0.55, 0.55, 0.05, 20).translate(0, 0.3, 0), M.get('clay')));
  g.add(mesh(cylGeo(0.36, 0.36, 0.015, 18).translate(0.05, 0.335, 0), M.get('cotton')));
  g.add(mesh(new THREE.SphereGeometry(0.18, 8, 6).scale(1, 0.4, 1).translate(0, 0.04, 0), M.get('ember')));
  return { obj: g, col: [boxGeo(1.2, 0.4, 1.2, 0, 0.2, 0)] };
}

// The cassava grater: a board studded with stone chips, propped on a stone.
function grater(M) {
  const g = new THREE.Group(), chips = [];
  const board = boxGeo(0.4, 0.04, 0.9, 0, 0, 0); board.rotateX(-0.35); board.translate(0, 0.22, 0);
  g.add(mesh(board, M.get('wood')));
  for (let i = 0; i < 40; i++) chips.push(new THREE.BoxGeometry(0.02, 0.015, 0.02).translate((ihash(i, 0, 381) - 0.5) * 0.32, 0.03, (ihash(i, 1, 382) - 0.5) * 0.75));
  const c = mergeGeometries(chips); c.rotateX(-0.35); c.translate(0, 0.22, 0);
  g.add(mesh(c, M.get('limestone')));
  g.add(mesh(noisy(new THREE.IcosahedronGeometry(0.15, 0), 0.3, 383).translate(0, 0.1, -0.38), M.get('limestone')));
  g.add(mesh(lathe([[0, 0], [0.22, 0.03], [0.28, 0.16], [0.26, 0.22]], 14).translate(0.4, 0, 0.35), M.get('clay')));
  return { obj: g, col: [boxGeo(0.6, 0.45, 1.0, 0, 0.22, 0)] };
}

// Cibucán: the woven tube that squeezes the poisonous juice out of grated cassava, hung from a frame and
// stretched by a stone tied below.
function cibucan(M) {
  const g = new THREE.Group();
  for (const x of [-0.7, 0.7]) g.add(mesh(cylGeo(0.06, 0.07, 2.2, 6).translate(x, 1.1, 0), M.get('wood')));
  g.add(mesh(cylGeo(0.05, 0.05, 1.6, 6).rotateZ(Math.PI / 2).translate(0, 2.15, 0), M.get('wood')));
  const tube = lathe([[0.02, 0], [0.09, 0.15], [0.1, 0.8], [0.08, 1.35], [0.02, 1.45]], 10);
  tube.translate(0, 0.55, 0);
  g.add(mesh(scaleUV(tube, 3, 6), M.get('cane')));
  g.add(mesh(cylGeo(0.01, 0.01, 0.2, 4).translate(0, 2.05, 0), M.get('rope')));
  g.add(mesh(noisy(new THREE.IcosahedronGeometry(0.16, 0), 0.3, 391).translate(0, 0.38, 0), M.get('limestone')));
  g.add(mesh(lathe([[0, 0], [0.18, 0.02], [0.22, 0.14]], 12), M.get('clay')));
  return { obj: g, col: [boxGeo(1.6, 2.2, 0.3, 0, 1.1, 0)] };
}

// A frame for weaving a hammock, the cotton half done.
function loom(M) {
  const g = new THREE.Group();
  for (const x of [-1.1, 1.1]) g.add(mesh(cylGeo(0.06, 0.07, 1.8, 6).translate(x, 0.9, 0), M.get('wood')));
  for (const y of [0.35, 1.65]) g.add(mesh(cylGeo(0.04, 0.04, 2.4, 6).rotateZ(Math.PI / 2).translate(0, y, 0), M.get('wood')));
  g.add(mesh(new THREE.PlaneGeometry(1.9, 0.7).translate(0, 1.25, 0), M.get('cotton')));
  const warp = [];
  for (let i = 0; i < 24; i++) warp.push(new THREE.BoxGeometry(0.008, 0.6, 0.008).translate(-0.95 + i * 0.083, 0.62, 0));
  g.add(mesh(mergeGeometries(warp), M.get('cotton')));
  return { obj: g, col: [boxGeo(2.4, 1.8, 0.3, 0, 0.9, 0)] };
}

function waterJar(M) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.16, 0.02], [0.27, 0.2], [0.28, 0.38], [0.16, 0.56], [0.1, 0.62], [0.12, 0.66]], 14), M.get('clay')));
  return { obj: g, col: [boxGeo(0.5, 0.65, 0.5, 0, 0.32, 0)] };
}

export const TAINO_MODELS = {
  bohio, caney, batey, zemi, conuco, cotton_bush: cottonBush, fire_pit: firePit,
  canoe, fish_spear: fishSpear, buren, grater, cibucan, loom, water_jar: waterJar,
};

// --- plants of Guanahani -------------------------------------------------------------------

// Thatch palm: a slim grey trunk and a head of round, pleated fan leaves.
function fanCrown() {
  const geos = [];
  for (let f = 0; f < 14; f++) {
    const a = f * 2.4, tilt = 0.25 + (f % 3) * 0.3, leaf = new THREE.CircleGeometry(0.95, 9, -1.1, 2.2);
    const p = leaf.attributes.position; // pleats
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), ang = Math.atan2(y, x); p.setZ(i, 0.05 * Math.sin(ang * 18) * Math.hypot(x, y)); }
    leaf.rotateX(-Math.PI / 2 + tilt); leaf.translate(0, 0, 0.15); leaf.rotateY(a);
    geos.push(leaf);
  }
  const g = mergeGeometries(geos); g.computeVertexNormals();
  return g;
}

export const TAINO_VEGETATION = {
  palm_fan: (M) => {
    const H = 5.2, trunk = cylGeo(0.17, 0.12, H, 8).translate(0, H / 2, 0);
    const crown = fanCrown().translate(0, H, 0);
    return { parts: [{ geo: trunk, mat: M.get('palmTrunk') }, { geo: crown, mat: M.get('fanLeaf') }], col: [boxGeo(0.4, 3, 0.4, 0, 1.5, 0)] };
  },
  // Gumbo-limbo: peeling copper-red bark, a few stout limbs, an open rounded crown.
  gumbo_limbo: (M) => {
    const wood = [cylGeo(0.32, 0.22, 2.4, 9).translate(0, 1.2, 0)], leaves = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.4, tip = new V3(Math.cos(a) * 1.6, 3.8 + (i % 2) * 0.5, Math.sin(a) * 1.6);
      wood.push(between(new V3(0, 2.2, 0), tip, 0.17, 0.09, 7));
      leaves.push(noisy(new THREE.IcosahedronGeometry(1.25, 1), 0.35, 401 + i).scale(1, 0.7, 1).translate(tip.x, tip.y + 0.5, tip.z));
    }
    leaves.push(noisy(new THREE.IcosahedronGeometry(1.4, 1), 0.3, 409).scale(1, 0.7, 1).translate(0, 4.6, 0));
    return { parts: [{ geo: mergeGeometries(wood), mat: M.get('gumboBark') }, { geo: mergeGeometries(leaves), mat: M.get('gumboLeaf') }], col: [boxGeo(0.8, 3, 0.8, 0, 1.5, 0)] };
  },
  // Sea grape: a low sprawling shrub of big round leaves behind the beach.
  sea_grape: (M) => {
    const geos = [];
    for (let i = 0; i < 6; i++) {
      const r = 0.55 + ihash(i, 1, 411) * 0.35, g = noisy(new THREE.IcosahedronGeometry(r, 1), 0.45, 412 + i);
      g.scale(1.2, 0.75, 1.2).translate(Math.cos(i * 1.1) * 0.8, r * 0.6 + (i % 2) * 0.3, Math.sin(i * 1.1) * 0.8);
      geos.push(g);
    }
    return { parts: [{ geo: mergeGeometries(geos), mat: M.get('seaGrape') }] };
  },
  // Red mangrove: arching prop roots in the shallows, a dense crown above.
  mangrove: (M) => {
    const roots = [], leaves = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, r = 1.2 + ihash(i, 2, 421) * 0.6, top = new V3(Math.cos(a) * 0.25, 1.6, Math.sin(a) * 0.25);
      const mid = new V3(Math.cos(a) * r * 0.7, 1.3, Math.sin(a) * r * 0.7), foot = new V3(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      roots.push(between(top, mid, 0.06, 0.05, 5), between(mid, foot, 0.05, 0.04, 5));
    }
    roots.push(cylGeo(0.16, 0.12, 1.4, 7).translate(0, 2.2, 0));
    for (let i = 0; i < 5; i++) leaves.push(noisy(new THREE.IcosahedronGeometry(1.1, 1), 0.35, 431 + i).scale(1.1, 0.65, 1.1).translate(Math.cos(i * 1.3) * 0.9, 3.0 + (i % 2) * 0.4, Math.sin(i * 1.3) * 0.9));
    return { parts: [{ geo: mergeGeometries(roots), mat: M.get('mangroveRoot') }, { geo: mergeGeometries(leaves), mat: M.get('mangroveLeaf') }], col: [boxGeo(1.4, 2, 1.4, 0, 1, 0)] };
  },
  rock_lime: (M) => {
    const g = noisy(new THREE.IcosahedronGeometry(1, 1), 0.6, 441);
    g.scale(1.2, 0.5, 1); g.translate(0, 0.15, 0);
    return { parts: [{ geo: g, mat: M.get('limestone') }], col: [boxGeo(1.8, 0.8, 1.6, 0, 0.3, 0)] };
  },
};
