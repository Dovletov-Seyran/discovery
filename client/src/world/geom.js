import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V3 = THREE.Vector3;

export function mesh(geo, mat, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}

// Box-projected UVs in metres / tile, so wood keeps its scale on boxes of any size.
export function boxUV(geo, tile = 4) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

// Planks along the length of a cylinder or lathe (texture U = length).
export function lenUV(geo, len, circ, tile = 4) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * len / tile, u * circ / tile); }
  uv.needsUpdate = true;
  return geo;
}

export function cylGeo(r0, r1, len, seg, open = false) {
  return lenUV(new THREE.CylinderGeometry(r1, r0, len, seg, 1, open), len, Math.PI * 2 * Math.max(r0, r1));
}

export function between(a, b, r0, r1, seg) {
  const d = new V3().subVectors(b, a), len = d.length();
  const g = cylGeo(r0, r1, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

export function boxGeo(w, h, d, x = 0, y = 0, z = 0) {
  const g = boxUV(new THREE.BoxGeometry(w, h, d));
  g.translate(x, y, z);
  return g;
}

export function lathe(profile, seg) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// Merge every mesh under `root` into one mesh per (material, shadow flags) — this is how the ship
// fits the draw-call budget. Subtrees marked userData.noBake (interactables, animated NPCs) are left alone.
export function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), baked = [];
  const visit = (o) => {
    if (o.userData.noBake) return;
    if (o.isMesh) {
      const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', 'color'].includes(name) || (name === 'color' && !o.material.vertexColors)) g.deleteAttribute(name);
      }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      g.clearGroups();
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      buckets.get(key).geos.push(g);
      baked.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  for (const o of baked) { o.removeFromParent(); o.geometry.dispose(); }
  for (const b of buckets.values()) {
    const m = mesh(mergeGeometries(b.geos), b.mat, b.cast, b.recv);
    for (const g of b.geos) g.dispose();
    root.add(m);
  }
  return root;
}
