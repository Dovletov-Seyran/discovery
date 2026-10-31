import * as THREE from 'three';
import { V3, mesh, boxUV, cylGeo, between, boxGeo, bake } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L0, L1, MAINZ, FOREZ, MIZZENZ, DECKS, topY, keelY, secX, xAtY, lerp } from './hullShape.js';

// Ladders and the gaps they need in the rails — the layout of other props must keep them clear.
export const LADDERS = [
  { x: -2.35, w: 0.8, z0: 2.25, z1: 4.85, y0: 0, y1: DECKS.quarter.y },
  { x: -1.0, w: 0.6, z0: -5.4, z1: -7.5, y0: 0, y1: DECKS.fore.y },
];
const QUARTER_RAIL = { z: 4.95, h: 0.95, gap: [-2.85, -1.85] };
const FORE_RAIL = { z: -7.55, h: 0.85, gap: [-1.4, -0.6] };

function hullGeometry(NZ = 80, NU = 24) {
  const cols = 2 * NU + 1, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NZ; i++) {
    const z = L0 + (L1 - L0) * i / NZ;
    let arc = 0, px = 0, py = 0;
    for (let j = 0; j < cols; j++) {
      const s = j / NU - 1, [x, y] = secX(z, 1 - Math.abs(s)), X = Math.sign(s) * x;
      if (j > 0) arc += Math.hypot(X - px, y - py);
      px = X; py = y;
      pos.push(X, y, z); uv.push(z / 4, arc / 4);
    }
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function edgeCurve(u, off, side, z0 = L0 + 0.2, z1 = L1) {
  const pts = [];
  for (let i = 0; i <= 40; i++) { const z = lerp(z0, z1, i / 40), [x, y] = secX(z, u); pts.push(new V3(side * (x + off), y, z)); }
  return new THREE.CatmullRomCurve3(pts);
}

export function deckGeo(z0, z1, y, inset = 0.03) {
  const pts = [];
  for (let i = 0; i <= 40; i++) { const z = lerp(z0, z1, i / 40); pts.push([z, Math.max(0.05, xAtY(z, y) - inset)]); }
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [z, x] of pts) shape.lineTo(z, x);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(pts[i][0], -pts[i][1]);
  const g = new THREE.ShapeGeometry(shape);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const sx = p.getX(i), sy = p.getY(i); p.setXYZ(i, sy, y, sx); uv.setXY(i, sx / 4, sy / 4); }
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; }
    g.computeVertexNormals();
  }
  return g;
}

function sailGeo(topW, botW, h, belly, n = 28) {
  const g = new THREE.PlaneGeometry(1, 1, n, n), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
    let z = -belly * Math.sin(Math.PI * (1 - v) * 0.8) * Math.pow(Math.sin(Math.PI * u), 0.8);
    z += 0.06 * Math.sin(u * 21 + v * 5) * Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
    p.setXYZ(i, (u - 0.5) * lerp(botW, topW, v), (v - 1) * h, z);
  }
  g.computeVertexNormals();
  return g;
}

// Triangle between yard ends A, B and clew C, bellied along its normal.
function lateenGeo(A, B, C, belly, n = 22) {
  const g = new THREE.PlaneGeometry(1, 1, n, n), p = g.attributes.position;
  const nrm = new V3().crossVectors(new V3().subVectors(B, A), new V3().subVectors(C, A)).normalize();
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
    const pt = new V3().lerpVectors(C, new V3().lerpVectors(A, B, u), v);
    pt.addScaledVector(nrm, belly * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * (1 - v * 0.3));
    p.setXYZ(i, pt.x, pt.y, pt.z);
  }
  g.computeVertexNormals();
  return g;
}

function railRow(M, x0, x1, z, y0, h, gap) {
  const g = new THREE.Group(), segs = [[x0, gap[0]], [gap[1], x1]];
  for (const [a, b] of segs) {
    g.add(mesh(boxGeo(b - a, 0.1, 0.17, (a + b) / 2, y0 + h, z), M.get('trim')));
    g.add(mesh(boxGeo(b - a, 0.08, 0.12, (a + b) / 2, y0 + 0.06, z), M.get('trim')));
  }
  const prof = [[0.04, 0], [0.06, 0.06], [0.035, 0.18], [0.065, 0.4], [0.035, 0.66], [0.05, h - 0.12], [0.045, h]].map(([r, y]) => new THREE.Vector2(r, y));
  const tpl = new THREE.LatheGeometry(prof, 10), geos = [];
  for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.3) {
    if (x > gap[0] - 0.05 && x < gap[1] + 0.05) continue;
    const c = tpl.clone(); c.translate(x, y0, z); geos.push(c);
  }
  g.add(mesh(mergeGeometries(geos), M.get('wood')));
  return g;
}

function ladder(M, { x, w, z0, z1, y0, y1 }) {
  const g = new THREE.Group(), n = 8;
  for (const s of [-1, 1]) g.add(mesh(between(new V3(x + s * w / 2, y0, z0), new V3(x + s * w / 2, y1 + 0.1, z1), 0.05, 0.05, 4), M.get('trim')));
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    g.add(mesh(boxGeo(w, 0.05, 0.24, x, lerp(y0, y1, t), lerp(z0, z1, t)), M.get('wood')));
  }
  return g;
}

function rampGeo({ x, w, z0, z1, y0, y1 }) {
  const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
  const g = new THREE.BoxGeometry(w, 0.08, len);
  g.rotateX(-Math.atan2(dy, dz));
  g.translate(x, (y0 + y1) / 2 - 0.04, (z0 + z1) / 2);
  return g;
}

// Ship model. `far` skips interior details for the two ships in the distance.
// Returns { group, collider: BufferGeometry[] } — the collider only for the player's ship.
export function buildShip(M, { far = false, lateen = false } = {}) {
  const ship = new THREE.Group(), col = [];
  const add = (o) => (ship.add(o), o);
  const hull = hullGeometry(far ? 40 : 80, far ? 12 : 24);
  add(mesh(hull, M.get('hull')));
  col.push(hull);
  // transom
  {
    const sh = new THREE.Shape(), n = 12;
    for (let j = 0; j <= 2 * n; j++) { const s = j / n - 1, [x, y] = secX(L1, 1 - Math.abs(s)); j ? sh.lineTo(Math.sign(s) * x, y) : sh.moveTo(Math.sign(s) * x, y); }
    const g = boxUV(new THREE.ShapeGeometry(sh)); g.translate(0, 0, L1);
    add(mesh(g, M.get('wallDouble'))); col.push(g);
  }
  // stem
  {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const z = lerp(-7.5, L0, i / 12); pts.push(new V3(0, keelY(z), z - 0.05)); }
    pts.push(new V3(0, topY(L0) + 0.5, L0 - 0.35));
    add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.16, 8), M.get('trim')));
  }
  for (const side of [-1, 1]) {
    add(mesh(new THREE.TubeGeometry(edgeCurve(0, -0.02, side), 90, 0.085, 8), M.get('wood')));
    add(mesh(new THREE.TubeGeometry(edgeCurve(0.3, 0.05, side, L0 + 0.6, L1 - 0.1), 90, 0.1, 8), M.get('trim')));
    add(mesh(new THREE.TubeGeometry(edgeCurve(0.43, 0.05, side, L0 + 0.9, L1 - 0.2), 90, 0.1, 8), M.get('trim')));
  }
  for (const d of Object.values(DECKS)) { const g = deckGeo(d.z0, d.z1, d.y); add(mesh(g, M.get('deck'))); col.push(g); }
  // castle bulkheads
  {
    const w = 2 * Math.min(xAtY(-7.6, 0), xAtY(-7.6, 1.6)) - 0.06;
    const a = boxGeo(w, 1.6, 0.14, 0, 0.8, -7.6); add(mesh(a, M.get('wall'))); col.push(a);
    const w2 = 2 * Math.min(xAtY(4.9, 0), xAtY(4.9, 1.95)) - 0.06;
    const b = boxGeo(w2, 1.95, 0.14, 0, 0.975, 4.9); add(mesh(b, M.get('wall'))); col.push(b);
  }
  // masts, tops, yards
  const mast = (r0, r1, y0, y1, z) => { const g = cylGeo(r0, r1, y1 - y0, 16); g.translate(0, (y0 + y1) / 2, z); add(mesh(g, M.get('wood'))); if (!far) col.push(g); };
  const yard = (len, y, z, r = 0.2) => { for (const s of [-1, 1]) add(mesh(between(new V3(0, y, z), new V3(s * len / 2, y, z), r, r * 0.42, 10), M.get('wood'))); };
  const top = (r, y, z) => {
    const g = cylGeo(r * 0.8, r, 0.35, 20); g.translate(0, y, z); add(mesh(g, M.get('trim')));
    const rim = cylGeo(r, r * 1.02, 0.55, 20, true); rim.translate(0, y + 0.42, z); add(mesh(rim, M.get('wallDouble')));
  };
  const rig = [];
  const R = (a, b, r = 0.028) => rig.push(between(a, b, r, r, 5));
  const ratlines = (low, topP, y0, y1, step = 0.42) => {
    for (let y = y0; y < y1; y += step) {
      const t = (y - low[0].y) / (topP.y - low[0].y);
      R(new V3().lerpVectors(low[0], topP, t), new V3().lerpVectors(low[low.length - 1], topP, t), 0.013);
    }
  };

  if (!lateen) {
    mast(0.34, 0.24, -0.2, 15.6, MAINZ); top(1.15, 15.0, MAINZ); mast(0.18, 0.1, 14.8, 24.6, MAINZ);
    mast(0.27, 0.18, 1.6, 12.6, FOREZ); top(0.75, 11.7, FOREZ);
    yard(15, 13.7, MAINZ - 0.42); yard(8, 21.6, MAINZ - 0.3, 0.13); yard(10, 11.0, FOREZ - 0.36, 0.16);
    add(mesh(between(new V3(0, 2.4, -10.6), new V3(0, 5.5, -17.6), 0.2, 0.09, 16), M.get('wood')));
    const s1 = add(mesh(sailGeo(14.2, 15.2, 9.0, 1.7), M.get('sailCross'))); s1.position.set(0, 13.55, MAINZ - 0.62);
    const s2 = add(mesh(sailGeo(7.2, 9.6, 6.0, 0.9), M.get('sail'))); s2.position.set(0, 21.45, MAINZ - 0.45);
    const s3 = add(mesh(sailGeo(9.6, 10.4, 7.2, 1.2), M.get('sail'))); s3.position.set(0, 10.85, FOREZ - 0.5);
    // mizzen with a lateen sail, above the heads of people on the quarterdeck
    mast(0.2, 0.13, DECKS.quarter.y, 13.5, MIZZENZ);
    {
      const A = new V3(0.35, 4.5, MIZZENZ - 3.6), B = new V3(0.35, 14.2, MIZZENZ + 3.4), C = new V3(0.45, 4.6, MIZZENZ + 3.9);
      add(mesh(between(A, B, 0.11, 0.07, 10), M.get('wood')));
      add(mesh(lateenGeo(A, B, C, 0.8), M.get('sail')));
      R(C, new V3(2.0, 3.0, L1 - 0.2), 0.025);
    }
    for (const s of [-1, 1]) {
      const topP = new V3(s * 0.33, 14.7, MAINZ), low = [];
      for (const dz of [-1.0, -0.2, 0.6, 1.4, 2.2]) { const z = MAINZ + dz, p = new V3(s * (xAtY(z, 0.9) + 0.28), 0.9, z); low.push(p); R(p, topP, 0.032); }
      ratlines(low, topP, 1.9, 13.9);
      add(mesh(boxGeo(0.42, 0.09, 3.9, s * (xAtY(MAINZ, 0.85) + 0.2), 0.85, MAINZ + 0.6), M.get('trim')));
      const topP2 = new V3(s * 0.18, 22.6, MAINZ), low2 = [];
      for (const dz of [-0.5, 0, 0.5]) { const p = new V3(s * 1.08, 15.3, MAINZ + dz); low2.push(p); R(p, topP2, 0.022); }
      ratlines(low2, topP2, 15.8, 22.0, 0.45);
      const topF = new V3(s * 0.26, 10.8, FOREZ), lowF = [];
      for (const dz of [-0.4, 0.4, 1.2]) { const z = FOREZ + dz, p = new V3(s * (xAtY(z, 2.3) + 0.22), 2.3, z); lowF.push(p); R(p, topF, 0.028); }
      ratlines(lowF, topF, 3.0, 10.4);
      const topM = new V3(s * 0.2, 11.0, MIZZENZ);
      for (const dz of [-0.6, 0.4]) R(new V3(s * (xAtY(MIZZENZ + dz, 2.8) + 0.15), 2.8, MIZZENZ + dz), topM, 0.025);
      R(new V3(s * 7.3, 13.75, MAINZ - 0.42), new V3(s * 0.25, 15.1, MAINZ));
      R(new V3(s * 7.3, 13.75, MAINZ - 0.42), new V3(s * 3.0, 3.1, 10.7), 0.022);
      R(new V3(s * 7.55, 4.6, MAINZ - 0.62), new V3(s * (xAtY(4, 1) + 0.05), 1.05, 4.0), 0.03);
      R(new V3(s * 7.55, 4.6, MAINZ - 0.62), new V3(s * 2.4, 2.5, -8.2), 0.026);
      R(new V3(s * 4.8, 11.1, FOREZ - 0.36), new V3(s * 0.3, 12.5, MAINZ), 0.022);
      R(new V3(s * 5.15, 3.7, FOREZ - 0.5), new V3(s * (xAtY(-4.5, 1) + 0.05), 1.05, -4.5), 0.026);
      R(new V3(s * 4.75, 15.45, MAINZ - 0.45), new V3(s * 7.2, 13.75, MAINZ - 0.42), 0.02);
      R(new V3(s * 4.0, 21.6, MAINZ - 0.3), new V3(s * 0.15, 23.4, MAINZ), 0.02);
    }
    R(new V3(0, 14.9, MAINZ - 0.35), new V3(0.35, 2.7, -11.2), 0.05);
    R(new V3(0, 12.0, FOREZ - 0.2), new V3(0, 5.45, -17.4), 0.04);
    R(new V3(0, 24.0, MAINZ), new V3(0, 12.4, FOREZ), 0.025);
    R(new V3(0, 13.9, MAINZ - 0.42), new V3(0, 15.6, MAINZ - 0.25), 0.04);
  } else {
    // Niña under her original lateen rig (squared at the Canaries)
    for (const [z, h, yl] of [[-6.5, 10.5, 9], [-0.6, 15, 12], [6.5, 10, 7.5]]) {
      mast(0.26, 0.15, 0, h, z);
      const A = new V3(0.35, 2.6, z - yl * 0.55), B = new V3(0.35, h + 2.2, z + yl * 0.45), C = new V3(0.35, 2.4, z + yl * 0.45);
      add(mesh(between(A, B, 0.12, 0.07, 10), M.get('wood')));
      add(mesh(lateenGeo(A, B, C, 1.0), M.get('sail')));
      R(new V3(0, h, z), new V3(3.2, 1, z), 0.03); R(new V3(0, h, z), new V3(-3.2, 1, z), 0.03);
    }
  }
  add(mesh(mergeGeometries(rig), M.get('rope'), true, false));

  if (!far) {
    // stanchions along the inside of the bulwarks
    for (const side of [-1, 1]) for (let z = -7.2; z <= 10.6; z += 0.95) {
      const y0 = z > 4.9 ? DECKS.quarter.y : (z < -7.6 ? DECKS.fore.y : 0), y1 = topY(z) - 0.05;
      if (y1 - y0 < 0.3) continue;
      add(mesh(boxGeo(0.12, y1 - y0, 0.14, side * (xAtY(z, (y0 + y1) / 2) - 0.08), (y0 + y1) / 2, z), M.get('trim')));
    }
    {
      const w = 2 * Math.min(xAtY(QUARTER_RAIL.z, 1.95), xAtY(QUARTER_RAIL.z, 3.0)) - 0.15;
      add(railRow(M, -w / 2, w / 2, QUARTER_RAIL.z, DECKS.quarter.y, QUARTER_RAIL.h, QUARTER_RAIL.gap));
      const w2 = 2 * Math.min(xAtY(FORE_RAIL.z, 1.6), xAtY(FORE_RAIL.z, 2.5)) - 0.15;
      add(railRow(M, -w2 / 2, w2 / 2, FORE_RAIL.z, DECKS.fore.y, FORE_RAIL.h, FORE_RAIL.gap));
      for (const [r, y0, w_] of [[QUARTER_RAIL, DECKS.quarter.y, w], [FORE_RAIL, DECKS.fore.y, w2]]) {
        for (const [a, b] of [[-w_ / 2, r.gap[0]], [r.gap[1], w_ / 2]]) col.push(boxGeo(b - a, 1.1, 0.2, (a + b) / 2, y0 + 0.55, r.z));
      }
    }
    for (const l of LADDERS) { add(ladder(M, l)); col.push(rampGeo(l)); }
    add(mesh(boxGeo(0.85, 1.3, 0.05, 0.75, 0.65, -7.5), M.get('trim')));
    add(mesh(boxGeo(0.06, 0.06, 0.06, 0.45, 0.65, -7.46), M.get('iron')));
    add(mesh(boxGeo(0.85, 1.4, 0.05, 1.2, 0.7, 4.82), M.get('trim')));
    // invisible fence above the bulwarks so nobody falls overboard
    for (const side of [-1, 1]) {
      const pos = [], idx = [], n = 60;
      for (let i = 0; i <= n; i++) {
        const z = lerp(L0 + 0.3, L1, i / n), x = side * secX(z, 0)[0], y = topY(z);
        pos.push(x, y - 0.2, z, x, y + 1.5, z);
        if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      col.push(g);
    }
    col.push(boxGeo(2 * secX(L1, 0)[0], 1.5, 0.1, 0, topY(L1) + 0.6, L1));
  }
  bake(ship);
  return { group: ship, collider: col };
}
