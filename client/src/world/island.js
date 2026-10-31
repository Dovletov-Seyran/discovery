import * as THREE from 'three';
import { Collider } from './collision.js';
import { bake } from './geom.js';
import { ISLAND_MODELS, VEGETATION } from './islandModels.js';
import { place, colliderFor, buildInteract, buildNpc } from './props.js';
import { fbm } from './texgen.js';

// The island zone (F1.5): every chunk from the server becomes terrain + buildings + interactables + NPCs
// with its own collider. Vegetation of all visible chunks is drawn by one InstancedMesh per model part,
// so draw calls do not grow with the number of chunks.
// Chunk data (server/world/generate.js): { cx, cz, size: 32, res: 33, h: [33×33, row = z], objects, interact, npcs }.

const CS = 32, RES = 33, VEG_CAP = 700;
const C = {
  wet: new THREE.Color(0x8f7d5e), sand: new THREE.Color(0xd2bb92), dry: new THREE.Color(0xb39566), grass: new THREE.Color(0x868a4a),
  scrub: new THREE.Color(0x6a6e42), rock: new THREE.Color(0x4a433d), red: new THREE.Color(0x6a4636), earth: new THREE.Color(0xa58c6a),
};
const tmp = new THREE.Color();

function groundColor(x, z, h, ny, out) {
  const n = fbm(x / 37, z / 37, 1024, 1024, 3, 91), n2 = fbm(x / 9, z / 9, 1024, 1024, 2, 92);
  // late summer: mostly dry grass, greener in hollows and higher up
  out.copy(C.dry).lerp(C.grass, THREE.MathUtils.smoothstep(n, 0.5, 0.68));
  // the flattened town (2–4.5 m) is trodden earth
  out.lerp(C.earth, THREE.MathUtils.smoothstep(ny, 0.992, 0.999) * (1 - THREE.MathUtils.smoothstep(h, 4.2, 5)) * THREE.MathUtils.smoothstep(h, 1.8, 2.4));
  out.lerp(C.scrub, THREE.MathUtils.smoothstep(h, 12, 22));
  out.lerp(C.red, THREE.MathUtils.smoothstep(h, 26, 34) * 0.8);
  out.lerp(C.rock, THREE.MathUtils.smoothstep(1 - ny, 0.25, 0.45) * (0.7 + 0.3 * n2));
  out.lerp(C.sand, 1 - THREE.MathUtils.smoothstep(h, 1.2, 2.4));
  out.lerp(C.wet, 1 - THREE.MathUtils.smoothstep(h, -0.2, 0.5));
  return out.multiplyScalar(0.92 + n2 * 0.16);
}

export class Island {
  constructor(scene, M) {
    this.M = M;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.chunks = new Map();
    this.interactables = [];
    this.lamps = [];
    this.dirty = false;
    this.veg = {};
    for (const [m, make] of Object.entries(VEGETATION)) {
      const v = make(M);
      v.meshes = v.parts.map(({ geo, mat }) => {
        const im = new THREE.InstancedMesh(geo, mat, VEG_CAP);
        im.count = 0; im.castShadow = true; im.receiveShadow = true;
        this.group.add(im);
        return im;
      });
      this.veg[m] = v;
    }
  }

  // --- heights -------------------------------------------------------------

  // Height at a global grid node; falls back to the nearest node of chunk `own` when the neighbour is not loaded.
  node(gx, gz, own) {
    const cx = Math.floor(gx / CS), cz = Math.floor(gz / CS);
    const c = this.chunks.get(`${cx},${cz}`);
    if (c) return c.data.h[(gz - cz * CS) * RES + (gx - cx * CS)];
    const ix = THREE.MathUtils.clamp(gx - own.cx * CS, 0, CS), iz = THREE.MathUtils.clamp(gz - own.cz * CS, 0, CS);
    return own.data.h[iz * RES + ix];
  }

  // Terrain height at (x, z), matching the triangles of the mesh; null outside loaded chunks.
  heightAt(x, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS), c = this.chunks.get(`${cx},${cz}`);
    if (!c) return null;
    const lx = x - cx * CS, lz = z - cz * CS, ix = Math.min(CS - 1, Math.floor(lx)), iz = Math.min(CS - 1, Math.floor(lz));
    const fx = lx - ix, fz = lz - iz, h = c.data.h, at = (i, j) => h[(iz + j) * RES + ix + i];
    if (fx + fz <= 1) return at(0, 0) + fx * (at(1, 0) - at(0, 0)) + fz * (at(0, 1) - at(0, 0));
    return at(1, 1) + (1 - fx) * (at(0, 1) - at(1, 1)) + (1 - fz) * (at(1, 0) - at(1, 1));
  }

  // Normals from neighbouring nodes (across chunk borders when the neighbour is loaded), then colours.
  shade(c) {
    const g = c.terrain.geometry, nrm = g.attributes.normal, col = g.attributes.color;
    const ox = c.cx * CS, oz = c.cz * CS, n = new THREE.Vector3();
    for (let iz = 0; iz < RES; iz++) for (let ix = 0; ix < RES; ix++) {
      const gx = ox + ix, gz = oz + iz, i = iz * RES + ix;
      n.set(-(this.node(gx + 1, gz, c) - this.node(gx - 1, gz, c)) / 2, 1, -(this.node(gx, gz + 1, c) - this.node(gx, gz - 1, c)) / 2).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
      groundColor(gx, gz, c.data.h[i], n.y, tmp);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    nrm.needsUpdate = true; col.needsUpdate = true;
  }

  terrain(c) {
    const g = new THREE.PlaneGeometry(CS, CS, CS, CS);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ix = i % RES, iz = Math.floor(i / RES), x = c.cx * CS + ix, z = c.cz * CS + iz;
      p.setXYZ(i, x, c.data.h[i], z);
      uv.setXY(i, x / 4, z / 4);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, this.M.get('ground'));
    m.receiveShadow = true;
    return m;
  }

  // --- chunks --------------------------------------------------------------

  add(key, data) {
    if (this.chunks.has(key)) this.remove(key);
    const [cx, cz] = key.split(',').map(Number);
    const c = { key, cx, cz, data, visible: true, root: new THREE.Group(), veg: [], interact: [], npcs: [] };
    c.terrain = this.terrain(c);
    c.root.add(c.terrain);
    const col = [c.terrain.geometry], decor = new THREE.Group();
    for (const o of data.objects ?? []) {
      if (VEGETATION[o.m]) {
        c.veg.push(o);
        if (this.veg[o.m].col) col.push(...colliderFor(this.veg[o.m].col, o));
        continue;
      }
      const make = ISLAND_MODELS[o.m];
      if (!make) { console.warn('[world] unknown island model', o.m); continue; }
      const { obj, col: cc } = make(this.M);
      decor.add(place(obj, o));
      if (cc) col.push(...colliderFor(cc, o));
    }
    bake(decor);
    c.root.add(decor);
    for (const o of data.interact ?? []) {
      const built = buildInteract(this.M, o, ISLAND_MODELS);
      if (!built) continue;
      c.interact.push(built.obj); c.root.add(built.obj); col.push(...built.col);
    }
    for (const n of data.npcs ?? []) {
      const { obj, col: cc } = buildNpc(this.M, n);
      c.npcs.push(obj); c.root.add(obj); col.push(...cc);
    }
    c.collider = new Collider(col);
    this.chunks.set(key, c);
    this.group.add(c.root);
    this.shade(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = this.chunks.get(`${cx + dx},${cz + dz}`);
      if (nb) this.shade(nb);
    }
    this.dirty = true;
  }

  remove(key) {
    const c = this.chunks.get(key);
    if (!c) return;
    c.root.removeFromParent();
    c.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    c.collider.geometry.dispose();
    this.chunks.delete(key);
    this.dirty = true;
  }

  setVisible(key, v) {
    const c = this.chunks.get(key);
    if (!c || c.visible === v) return;
    c.visible = v; c.root.visible = v;
    this.dirty = true;
  }

  // Rebuild vegetation instances and the interactable list after chunks came or went.
  refresh() {
    if (!this.dirty) return;
    this.dirty = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [m, v] of Object.entries(this.veg)) {
      let n = 0;
      for (const c of this.chunks.values()) {
        if (!c.visible) continue;
        for (const o of c.veg) {
          if (o.m !== m || n >= VEG_CAP) continue;
          m4.compose(p.fromArray(o.p), q.setFromAxisAngle(up, o.r ?? 0), s.setScalar(o.s ?? 1));
          for (const im of v.meshes) im.setMatrixAt(n, m4);
          n++;
        }
      }
      for (const im of v.meshes) { im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    }
    this.interactables.length = 0;
    for (const c of this.chunks.values()) if (c.visible) this.interactables.push(...c.interact, ...c.npcs);
  }

  // --- collisions ------------------------------------------------------------

  collide(capsule) {
    let onGround = false;
    const delta = new THREE.Vector3(), { start, end } = capsule;
    for (const c of this.chunks.values()) {
      if (!c.visible) continue;
      const x0 = c.cx * CS - 3, z0 = c.cz * CS - 3;
      if (start.x < x0 || start.x > x0 + CS + 6 || start.z < z0 || start.z > z0 + CS + 6) continue;
      const r = c.collider.collide(capsule);
      onGround ||= r.onGround;
      delta.add(r.delta);
    }
    // the sea: walk in up to the waist, then the slope pushes you back ashore
    for (let k = 0; k < 20; k++) {
      const h = this.heightAt(start.x, start.z);
      if (h === null || h > -1.0) break;
      const gx = (this.heightAt(start.x + 0.5, start.z) ?? h) - (this.heightAt(start.x - 0.5, start.z) ?? h);
      const gz = (this.heightAt(start.x, start.z + 0.5) ?? h) - (this.heightAt(start.x, start.z - 0.5) ?? h);
      const len = Math.hypot(gx, gz) || 1;
      start.x += (gx / len) * 0.1; start.z += (gz / len) * 0.1; end.x = start.x; end.z = start.z;
      delta.x += (gx / len) * 0.1; delta.z += (gz / len) * 0.1;
    }
    return { onGround, delta };
  }

  groundHeight(x, z, fromY) {
    const c = this.chunks.get(`${Math.floor(x / CS)},${Math.floor(z / CS)}`);
    return c ? (c.collider.groundHeight(x, z, fromY) ?? this.heightAt(x, z)) : null;
  }
}
