import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, mesh, boxUV, cylGeo, between, boxGeo, lathe, lenUV } from './geom.js';
import { MODELS } from './props.js';
import { ihash } from './texgen.js';
import { TAINO_MODELS, TAINO_VEGETATION } from './guanahaniModels.js';

// Models of La Gomera (ids from content/canary_layout.json); Guanahani's are in guanahaniModels.js. Buildings face +z (door side).
// Each builder returns { obj, col?: BufferGeometry[] } like the ship props.

// Whitewashed walls, stone corners and plinth, a gable roof of curved tiles; ridge along x.
function gableHouse(M, w, d, h, { wall = 'plaster', pitch = 0.45, over = 0.4 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(w, h, d, 0, h / 2, 0), M.get(wall)));
  g.add(mesh(boxGeo(w + 0.08, 0.45, d + 0.08, 0, 0.22, 0), M.get('stone')));
  if (wall !== 'stone') for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(boxGeo(0.4, h, 0.4, x * (w / 2 - 0.15), h / 2, z * (d / 2 - 0.15)), M.get('stone')));
  const rise = Math.tan(pitch) * d / 2, half = d / 2 + over, yR = h + rise;
  for (const s of [-1, 1]) {
    const r = boxGeo(w + over * 1.2, 0.14, half / Math.cos(pitch));
    r.rotateX(s * pitch);
    r.translate(0, yR - Math.tan(pitch) * half / 2 + 0.07, s * half / 2);
    g.add(mesh(r, M.get('roof')));
  }
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const prism = new THREE.ExtrudeGeometry(tri, { depth: w, bevelEnabled: false });
  prism.rotateY(Math.PI / 2); prism.translate(-w / 2, h, 0);
  g.add(mesh(boxUV(prism), M.get(wall)));
  g.add(mesh(cylGeo(0.09, 0.09, w + over * 1.2, 8).rotateZ(Math.PI / 2).translate(0, yR + 0.12, 0), M.get('roof')));
  return { g, top: yR };
}

function door(M, x, y, z, w = 1.1, h = 2.1, ry = 0) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(w + 0.25, h + 0.15, 0.06, 0, h / 2, 0), M.get('stone')));
  g.add(mesh(boxGeo(w, h, 0.1, 0, h / 2, 0.02), M.get('trim')));
  g.add(mesh(boxGeo(0.05, 0.05, 0.05, w * 0.32, h * 0.5, 0.09), M.get('iron')));
  g.position.set(x, y, z); g.rotation.y = ry;
  return g;
}

// Window with wooden shutters (typical Canarian green-painted wood is replaced by dark oak here).
function windowOn(M, x, y, z, ry = 0, w = 0.8, h = 1.0) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(w + 0.2, h + 0.2, 0.05, 0, 0, 0), M.get('stone')));
  g.add(mesh(boxGeo(w, h, 0.07, 0, 0, 0.01), M.get('darkWindow')));
  for (const s of [-1, 1]) g.add(mesh(boxGeo(w / 2, h, 0.05, s * (w * 0.75 + 0.06), 0, 0.03), M.get('trim')));
  g.position.set(x, y, z); g.rotation.y = ry;
  return g;
}

function house(M) {
  const w = 7, d = 5.5, h = 3.6, { g, top } = gableHouse(M, w, d, h);
  g.add(door(M, -0.6, 0, d / 2 + 0.03));
  g.add(windowOn(M, 1.9, 1.7, d / 2 + 0.03), windowOn(M, -2.6, 1.7, d / 2 + 0.03), windowOn(M, 0.5, 1.7, -d / 2 - 0.03, Math.PI));
  return { obj: g, col: [boxGeo(w, top, d, 0, top / 2, 0)] };
}

function governorHouse(M) {
  const w = 11, d = 8, h = 6.8, { g, top } = gableHouse(M, w, d, h);
  const fz = d / 2 + 0.03;
  g.add(door(M, 0, 0, fz, 1.5, 2.6));
  for (const x of [-3.6, -1.8, 1.8, 3.6]) g.add(windowOn(M, x, 1.8, fz));
  for (const x of [-3.6, 3.6]) g.add(windowOn(M, x, 4.9, fz));
  // Canarian wooden balcony on the upper floor
  const b = new THREE.Group(), bw = 5.4, by = 3.75;
  b.add(mesh(boxGeo(bw, 0.14, 1.2, 0, by, d / 2 + 0.6), M.get('wood')));
  for (let x = -bw / 2 + 0.1; x <= bw / 2; x += 0.22) b.add(mesh(boxGeo(0.06, 1.0, 0.06, x, by + 0.55, d / 2 + 1.15), M.get('trim')));
  b.add(mesh(boxGeo(bw + 0.1, 0.1, 0.12, 0, by + 1.08, d / 2 + 1.15), M.get('trim')));
  for (const x of [-bw / 2, bw / 2]) b.add(mesh(boxGeo(0.14, 2.6, 0.14, x, by + 1.3, d / 2 + 1.15), M.get('trim')));
  const roof = boxGeo(bw + 0.6, 0.1, 1.5); roof.rotateX(0.35); roof.translate(0, by + 2.75, d / 2 + 0.7); b.add(mesh(roof, M.get('roof')));
  for (const x of [-1.3, 1.3]) b.add(door(M, x, by + 0.07, fz, 0.9, 2.0));
  for (let i = 0; i < 4; i++) b.add(mesh(between(new V3(-bw / 2 + 0.6 + i * 1.4, by - 0.05, d / 2 + 0.05), new V3(-bw / 2 + 0.6 + i * 1.4, by - 0.6, d / 2 + 0.05), 0.07, 0.07, 6), M.get('trim')));
  g.add(b);
  return { obj: g, col: [boxGeo(w, top, d, 0, top / 2, 0)] };
}

// Nave along z with the facade at +z, bell tower at the front corner.
function church(M) {
  const g = new THREE.Group(), L = 18, W = 8, H = 7.5;
  const { g: nave, top } = gableHouse(M, L, W, H, { pitch: 0.5 });
  nave.rotation.y = Math.PI / 2; g.add(nave);
  g.add(door(M, 0, 0, L / 2 + 0.03, 1.8, 3.4));
  const rose = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), M.get('darkWindow')); rose.position.set(0, 5.4, L / 2 + 0.05); g.add(rose);
  g.add(mesh(new THREE.TorusGeometry(0.75, 0.1, 6, 24).translate(0, 5.4, L / 2 + 0.06), M.get('stone')));
  for (const z of [-5, 0, 5]) for (const s of [-1, 1]) g.add(windowOn(M, s * (W / 2 + 0.03), 4.2, z, s * Math.PI / 2, 0.7, 1.6));
  const tx = W / 2 + 2.2, tz = L / 2 - 2.2, th = 14;
  g.add(mesh(boxGeo(4.2, th, 4.2, tx, th / 2, tz), M.get('stone')));
  g.add(mesh(boxGeo(4.5, 0.3, 4.5, tx, th, tz), M.get('stone')));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, o = new V3(Math.sin(a) * 2.12, 0, Math.cos(a) * 2.12);
    g.add(windowOn(M, tx + o.x, th - 1.8, tz + o.z, a, 0.9, 1.6));
  }
  const spire = new THREE.ConeGeometry(3.1, 3.4, 4); spire.rotateY(Math.PI / 4); spire.translate(tx, th + 1.85, tz);
  g.add(mesh(spire, M.get('roof')));
  g.add(mesh(boxGeo(0.12, 1.4, 0.12, tx, th + 4.2, tz), M.get('iron')), mesh(boxGeo(0.7, 0.12, 0.12, tx, th + 4.45, tz), M.get('iron')));
  g.add(mesh(boxGeo(0.14, 1.2, 0.14, 0, top + 0.6, L / 2), M.get('iron')), mesh(boxGeo(0.6, 0.14, 0.14, 0, top + 0.85, L / 2), M.get('iron')));
  return { obj: g, col: [boxGeo(W, top, L, 0, top / 2, 0), boxGeo(4.2, th, 4.2, tx, th / 2, tz)] };
}

function warehouse(M) {
  const w = 12, d = 7, h = 4.5, { g, top } = gableHouse(M, w, d, h, { wall: 'stone', pitch: 0.38 });
  g.add(door(M, 0, 0, d / 2 + 0.03, 2.6, 3.0));
  return { obj: g, col: [boxGeo(w, top, d, 0, top / 2, 0)] };
}

function marketStall(M) {
  const g = new THREE.Group(), w = 3.2, d = 1.8;
  for (const [x, z, hh] of [[-1, -1, 2.6], [1, -1, 2.6], [-1, 1, 2.2], [1, 1, 2.2]]) g.add(mesh(boxGeo(0.1, hh, 0.1, x * w / 2, hh / 2, z * d / 2), M.get('trim')));
  g.add(mesh(boxGeo(w, 0.08, d * 0.8, 0, 0.9, 0.1), M.get('wood')));
  g.add(mesh(boxGeo(w - 0.1, 0.8, 0.05, 0, 0.45, d * 0.45), M.get('wall')));
  const awning = new THREE.PlaneGeometry(w + 0.4, d + 0.6, 1, 1); awning.rotateX(-Math.PI / 2 + 0.22); awning.translate(0, 2.45, 0);
  g.add(mesh(awning, M.canvas('awning', 128, (x, S) => {
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#e8dcc0' : '#a8322a'; x.fillRect(i * S / 8, 0, S / 8, S); }
  }, { side: THREE.DoubleSide, rough: 0.95 })));
  // goods: cheese wheels, sacks, a basket of biscuits
  for (let i = 0; i < 3; i++) g.add(mesh(cylGeo(0.2, 0.2, 0.12, 16).translate(-1.1 + i * 0.25, 1.0 + (i === 1 ? 0.12 : 0), 0.1), M.get('cheese')));
  for (let i = 0; i < 2; i++) { const s = new THREE.SphereGeometry(0.3, 12, 8); s.scale(1, 1.25, 0.9); s.translate(0.3 + i * 0.55, 1.25, 0.05); g.add(mesh(s, M.get('sack'))); }
  g.add(mesh(lenUV(lathe([[0.18, 0], [0.24, 0.18], [0.26, 0.2]], 14), 0.2, 1.6).translate(1.25, 0.94, 0.15), M.get('stave')));
  return { obj: g, col: [boxGeo(w, 1.0, d * 0.8, 0, 0.5, 0.1)] };
}

function shipyard(M) {
  const g = new THREE.Group();
  const slip = boxGeo(5, 0.25, 14, 0, 0, 0); slip.rotateX(0.06); slip.translate(0, 0.35, 0);
  g.add(mesh(slip, M.get('deck')));
  for (let z = -6; z <= 6; z += 2) for (const s of [-1, 1]) g.add(mesh(boxGeo(0.2, 0.8, 0.2, s * 2.3, 0.1, z), M.get('trim')));
  // a hull on the stocks: keel, stem and ribs
  g.add(mesh(boxGeo(0.25, 0.3, 10, 0, 0.95, 0), M.get('trim')));
  for (let z = -4.2; z <= 4.2; z += 0.7) {
    const k = 1 - (z / 5) ** 2, rib = new THREE.TorusGeometry(1.6 * k + 0.2, 0.07, 5, 16, Math.PI);
    rib.rotateZ(Math.PI); rib.scale(1, 1.2, 1); rib.translate(0, 2.9, z);
    g.add(mesh(rib, M.get('wood')));
  }
  for (let i = 0; i < 3; i++) g.add(mesh(between(new V3(-2.8, 0, -4 + i * 4), new V3(-1.5, 3.2, -4 + i * 4), 0.08, 0.08, 6), M.get('trim')));
  for (let i = 0; i < 6; i++) g.add(mesh(cylGeo(0.18, 0.18, 4, 10).rotateX(Math.PI / 2).translate(3.3 + (i % 3) * 0.37, 0.18 + Math.floor(i / 3) * 0.33, -2), M.get('dragonTrunk')));
  return { obj: g, col: [boxGeo(5, 1.0, 14, 0, 0.5, 0), boxGeo(1.2, 0.7, 4, 3.7, 0.35, -2)] };
}

function pier(M) {
  const g = new THREE.Group(), L = 24, W = 3;
  g.add(mesh(boxGeo(W, 0.14, L, 0, 0, L / 2), M.get('deck')));
  for (let z = 0.5; z <= L; z += 2.5) for (const s of [-1, 1]) g.add(mesh(cylGeo(0.14, 0.14, 4.6, 8).translate(s * (W / 2 - 0.1), -2.2, z), M.get('trim')));
  for (const s of [-1, 1]) g.add(mesh(boxGeo(0.12, 0.12, L, s * (W / 2 - 0.06), 0.13, L / 2), M.get('trim')));
  g.add(mesh(cylGeo(0.12, 0.15, 0.6, 10).translate(1.1, 0.35, L - 1), M.get('trim')));
  return { obj: g, col: [boxGeo(W, 0.3, L, 0, -0.08, L / 2)] };
}

function well(M) {
  const g = new THREE.Group();
  const ring = new THREE.CylinderGeometry(0.85, 0.9, 0.9, 20, 1, true); ring.translate(0, 0.45, 0);
  g.add(mesh(boxUV(ring), M.get('stone')));
  const inner = new THREE.CylinderGeometry(0.62, 0.62, 0.9, 20, 1, true); inner.translate(0, 0.45, 0);
  const im = M.get('stone').clone(); im.side = THREE.BackSide; g.add(mesh(boxUV(inner), im));
  g.add(mesh(new THREE.TorusGeometry(0.74, 0.13, 6, 20).rotateX(Math.PI / 2).translate(0, 0.9, 0), M.get('stone')));
  g.add(mesh(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2).translate(0, 0.3, 0), M.get('seaWater')));
  for (const s of [-1, 1]) g.add(mesh(boxGeo(0.12, 1.9, 0.12, s * 0.8, 1.35, 0), M.get('trim')));
  g.add(mesh(cylGeo(0.06, 0.06, 1.8, 8).rotateZ(Math.PI / 2).translate(0, 2.1, 0), M.get('wood')));
  g.add(mesh(cylGeo(0.012, 0.012, 0.9, 4).translate(0, 1.65, 0), M.get('rope')));
  g.add(mesh(lenUV(new THREE.CylinderGeometry(0.15, 0.12, 0.25, 12, 1, true), 0.25, 1).translate(0, 1.1, 0), M.get('staveDouble')));
  return { obj: g, col: [boxGeo(1.9, 1.0, 1.9, 0, 0.5, 0)] };
}

function rowboat(M) {
  const g = new THREE.Group(), L = 5, B = 0.85, D = 0.65, NZ = 16, NU = 8;
  const pos = [], uv = [], idx = [], cols = 2 * NU + 1;
  for (let i = 0; i <= NZ; i++) {
    const z = -L / 2 + L * i / NZ, t = z / (L / 2), hw = B * Math.pow(Math.max(0, 1 - t * t), 0.55) + 0.03;
    for (let j = 0; j < cols; j++) {
      const s = j / NU - 1, u = 1 - Math.abs(s), y = D * 0.55 - u * D + 0.15 * t * t;
      pos.push(Math.sign(s) * hw * Math.sqrt(Math.max(0, 1 - u * u * 0.9)), y, z); uv.push(z / 2, j / 8);
    }
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < cols - 1; j++) { const a = i * cols + j; idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols); }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hull.setIndex(idx); hull.computeVertexNormals();
  g.add(mesh(hull, M.get('hull')));
  for (const z of [-1.2, 0, 1.2]) g.add(mesh(boxGeo(1.4 * (1 - (z / 2.5) ** 2), 0.05, 0.25, 0, 0.12, z), M.get('wood')));
  for (const s of [-1, 1]) g.add(mesh(between(new V3(s * 0.6, 0.25, 0.2), new V3(s * 1.6, -0.15, 1.6), 0.03, 0.03, 6), M.get('wood')));
  return { obj: g, col: [boxGeo(1.8, 0.8, L, 0, 0.1, 0)] };
}

function plankStack(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) g.add(mesh(boxGeo(0.28, 0.06, 3, (i % 3 - 1) * 0.3, 0.05 + Math.floor(i / 3) * 0.07, (i % 2) * 0.1), M.get('wood')));
  return { obj: g, col: [boxGeo(1.0, 0.3, 3, 0, 0.15, 0)] };
}

function tarBucket(M) {
  const g = new THREE.Group();
  g.add(mesh(lenUV(new THREE.CylinderGeometry(0.2, 0.16, 0.38, 14, 1, true), 0.38, 1).translate(0, 0.19, 0), M.get('staveDouble')));
  g.add(mesh(new THREE.CircleGeometry(0.19, 14).rotateX(-Math.PI / 2).translate(0, 0.3, 0), M.get('tar')));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 14, Math.PI).translate(0, 0.38, 0), M.get('iron')));
  return { obj: g };
}

export const ISLAND_MODELS = {
  house, house_governor: governorHouse, church, warehouse, market_stall: marketStall, shipyard, pier,
  well, boat: rowboat, planks: plankStack, tar_bucket: tarBucket, barrel: MODELS.barrel,
  ...TAINO_MODELS,
};

// --- vegetation, drawn with InstancedMesh: { parts: [{ geo, mat, cast }], col?: BufferGeometry[] } ---

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

function palmFronds() {
  const geos = [], n = 26;
  for (let f = 0; f < n; f++) {
    const a = f * 2.39996, lift = 0.35 + (f % 3) * 0.25, len = 3.4 + (f % 4) * 0.25;
    const dir = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-dir.z, 0, dir.x);
    const pos = [], idx = [], S = 8;
    for (let i = 0; i <= S; i++) {
      const t = i / S, w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.04;
      const c = dir.clone().multiplyScalar(t * len); c.y = t * lift * 2.2 - t * t * (1.6 + lift * 1.6);
      for (const s of [-1, 1]) { const e = c.clone().addScaledVector(side, s * w / 2); e.y -= w * 0.25; pos.push(e.x, e.y, e.z); }
      pos.push(c.x, c.y + 0.03, c.z);
      if (i) { const b = (i - 1) * 3, k = i * 3; idx.push(b, b + 2, k, k, b + 2, k + 2, b + 2, b + 1, k + 2, k + 2, b + 1, k + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setIndex(idx); g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeometries(geos);
}

export const VEGETATION = {
  palm_canary: (M) => {
    const H = 7.5;
    const trunk = cylGeo(0.42, 0.3, H, 10); trunk.translate(0, H / 2, 0);
    const knob = new THREE.SphereGeometry(0.62, 12, 8); knob.translate(0, H, 0);
    const fronds = palmFronds(); fronds.translate(0, H + 0.1, 0);
    return {
      parts: [{ geo: mergeGeometries([trunk, knob]), mat: M.get('palmTrunk') }, { geo: fronds, mat: M.get('palmLeaf') }],
      col: [boxGeo(0.8, 4, 0.8, 0, 2, 0)],
    };
  },
  dragon_tree: (M) => {
    const wood = [cylGeo(0.75, 0.55, 3.2, 12).translate(0, 1.6, 0)], leaves = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.3, tip = new V3(Math.cos(a) * 2.0, 5.0 + (i % 2) * 0.6, Math.sin(a) * 2.0);
      wood.push(between(new V3(0, 3.0, 0), tip, 0.32, 0.2, 8));
      for (let j = 0; j < 2; j++) {
        const b = a + (j ? 0.45 : -0.45), tip2 = tip.clone().add(new V3(Math.cos(b) * 0.9, 0.9, Math.sin(b) * 0.9));
        wood.push(between(tip, tip2, 0.18, 0.13, 6));
        for (let k = 0; k < 16; k++) {
          const u = ihash(i * 7 + j, k, 61), v = ihash(i * 7 + j, k, 62), dir = new V3(Math.cos(u * 6.28) * (0.3 + v), 1.0, Math.sin(u * 6.28) * (0.3 + v)).normalize();
          const c = new THREE.ConeGeometry(0.06, 0.95, 3);
          c.translate(0, 0.45, 0);
          c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir));
          c.translate(tip2.x, tip2.y, tip2.z);
          leaves.push(c);
        }
      }
    }
    return { parts: [{ geo: mergeGeometries(wood), mat: M.get('dragonTrunk') }, { geo: mergeGeometries(leaves), mat: M.get('dragonLeaf') }], col: [boxGeo(1.5, 3, 1.5, 0, 1.5, 0)] };
  },
  rock: (M) => {
    const g = noisy(new THREE.IcosahedronGeometry(1, 1), 0.55, 71);
    g.scale(1, 0.65, 1); g.translate(0, 0.25, 0);
    return { parts: [{ geo: g, mat: M.get('rock') }], col: [boxGeo(1.6, 1.0, 1.6, 0, 0.4, 0)] };
  },
  bush: (M) => {
    const geos = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.45 + ihash(i, 1, 81) * 0.35, g = noisy(new THREE.IcosahedronGeometry(r, 1), 0.35, 82 + i);
      g.translate(Math.cos(i * 1.3) * 0.45, r * 0.7, Math.sin(i * 1.3) * 0.45);
      geos.push(g);
    }
    return { parts: [{ geo: mergeGeometries(geos), mat: M.get('bush') }] };
  },
  ...TAINO_VEGETATION,
};
