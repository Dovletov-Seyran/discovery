import * as THREE from 'three';
import { Collider } from './collision.js';
import { bake } from './geom.js';
import { ISLAND_MODELS, VEGETATION } from './islandModels.js';
import { place, colliderFor, buildInteract, buildNpc } from './props.js';
import { fbm } from './texgen.js';
import { IslandLod } from './islandLod.js';

// The island zone (F1.5): every chunk from the server becomes terrain + buildings + interactables + NPCs
// with its own collider. Vegetation of all visible chunks is drawn by one InstancedMesh per model part,
// so draw calls do not grow with the number of chunks.
// Chunk data (server/world/generate.js): { cx, cz, size: 32, res: 33, h: [33×33, row = z], objects, interact, npcs }.

const CS = 32, RES = 33, VEG_CAP = 700;
const col = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && v > 255 ? new THREE.Color(v) : v]));
// Ground palettes. sand: beach below sandTop m; scrub from scrubAt m; red tuff (La Gomera's peak) from redAt m.
const PALETTES = {
  canary: col({
    wet: 0x8f7d5e, sand: 0xd2bb92, dry: 0xb39566, grass: 0x868a4a, scrub: 0x6a6e42, rock: 0x4a433d, red: 0x6a4636, earth: 0xa58c6a,
    sandTop: 2.4, scrubAt: [12, 22], redAt: [26, 34], grassy: [0.5, 0.68],
  }),
  // Guanahani: white coral sand, low green coppice on limestone, pale grey rock where it shows
  guanahani: col({
    wet: 0xa89a7c, sand: 0xe6dcc2, dry: 0x9a8a5e, grass: 0x6f7c40, scrub: 0x58653a, rock: 0xa8a090, red: 0x58653a, earth: 0x9a8262,
    sandTop: 1.9, scrubAt: [5, 10], redAt: [99, 100], grassy: [0.42, 0.62],
  }),
};
const tmp = new THREE.Color();

// Paths (canary_layout.json → paths) are painted by the ground shader per pixel: a 3 m lane gets crisp,
// slightly ragged edges instead of the 1 m blur vertex colours would give. Every polyline segment is a capsule;
// "stone": true paths (plaza, main streets) are cobbled, the rest are trodden earth. A negative width marks stone.
const PATH_MAX = 48;
const PATH_PARS = /* glsl */ `
uniform vec4 pathSeg[${PATH_MAX}];
uniform float pathW[${PATH_MAX}];
uniform int pathN;
uniform vec3 pathDirt, pathStone, pathGrout;
varying vec3 vPathPos;
float pathHash(vec2 p) { p = mod(p, 289.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pathNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pathHash(i), pathHash(i + vec2(1, 0)), f.x), mix(pathHash(i + vec2(0, 1)), pathHash(i + vec2(1, 1)), f.x), f.y);
}
// cobbles: x — distance to the joint between stones, y — this stone's random tone
vec2 pathCobble(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), c = g + 0.2 + 0.6 * vec2(pathHash(i + g), pathHash(i + g + 17.3)) - f;
    float d = dot(c, c);
    if (d < d1) { d2 = d1; d1 = d; id = pathHash(i + g + 5.1); } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}`;
const PATH_FRAG = /* glsl */ `
{
  vec2 xz = vPathPos.xz;
  float dd = 1e5, ds = 1e5;
  for (int i = 0; i < ${PATH_MAX}; i++) {
    if (i >= pathN) break;
    vec2 a = pathSeg[i].xy, ab = pathSeg[i].zw - a, ap = xz - a;
    float d = length(ap - ab * clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0)) - abs(pathW[i]) * 0.5;
    if (pathW[i] < 0.0) ds = min(ds, d); else dd = min(dd, d);
  }
  // ragged edge: grass creeps in, the lane frays out; paving keeps a cleaner line
  float jag = (pathNoise(xz * 0.8) - 0.5) * 0.9 + (pathNoise(xz * 3.3) - 0.5) * 0.4;
  float dry = smoothstep(0.4, 1.0, vPathPos.y); // nothing under water
  float md = (1.0 - smoothstep(-0.3, 0.3, dd + jag)) * dry;
  float ms = (1.0 - smoothstep(-0.12, 0.12, ds + jag * 0.35)) * dry;
  if (md + ms > 0.0) {
    vec3 tex = diffuseColor.rgb / max(vColor.rgb, vec3(0.02)); // the ground texture alone
    float grit = pathNoise(xz * 7.0), ruts = smoothstep(-1.4, -0.3, dd) * (1.0 - smoothstep(-0.3, 0.1, dd));
    vec3 dirt = pathDirt * (0.88 + 0.22 * grit) * (1.0 - 0.18 * ruts); // trodden darker along the edges
    vec2 cb = pathCobble(xz * 3.2); // stones ~30 cm, rounded: darker towards the joints
    vec3 stone = pathStone * (0.7 + 0.45 * cb.y) * (0.9 + 0.2 * grit) * (0.72 + 0.28 * smoothstep(0.03, 0.4, cb.x));
    stone = mix(pathGrout * (0.8 + 0.4 * grit), stone, smoothstep(0.02, 0.09, cb.x));
    vec3 base = diffuseColor.rgb;
    diffuseColor.rgb = mix(base, tex * dirt, md);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(tex, vec3(dot(tex, vec3(0.333))), 0.6) * stone, ms);
  }
}`;

function groundColor(x, z, h, ny, out, C = PALETTES.canary) {
  const n = fbm(x / 37, z / 37, 1024, 1024, 3, 91), n2 = fbm(x / 9, z / 9, 1024, 1024, 2, 92);
  // late summer: mostly dry grass, greener in hollows and higher up
  out.copy(C.dry).lerp(C.grass, THREE.MathUtils.smoothstep(n, C.grassy[0], C.grassy[1]));
  // the flattened town (2–4.5 m): grass worn to earth in patches — the streets themselves are painted by the shader
  out.lerp(C.earth, 0.45 * THREE.MathUtils.smoothstep(ny, 0.992, 0.999) * (1 - THREE.MathUtils.smoothstep(h, 4.2, 5)) * THREE.MathUtils.smoothstep(h, 1.8, 2.4));
  out.lerp(C.scrub, THREE.MathUtils.smoothstep(h, C.scrubAt[0], C.scrubAt[1]));
  out.lerp(C.red, THREE.MathUtils.smoothstep(h, C.redAt[0], C.redAt[1]) * 0.8);
  out.lerp(C.rock, THREE.MathUtils.smoothstep(1 - ny, 0.25, 0.45) * (0.7 + 0.3 * n2));
  out.lerp(C.sand, 1 - THREE.MathUtils.smoothstep(h, C.sandTop - 1.2, C.sandTop));
  out.lerp(C.wet, 1 - THREE.MathUtils.smoothstep(h, -0.2, 0.5));
  return out.multiplyScalar(0.92 + n2 * 0.16);
}

export class Island {
  // opts: { palette: 'canary' | 'guanahani', veg: the VEGETATION kinds this island grows }
  constructor(scene, M, { palette = 'canary', veg = ['palm_canary', 'dragon_tree', 'rock', 'bush'] } = {}) {
    this.M = M;
    this.palette = PALETTES[palette];
    // own copy of the ground material: its path uniforms are this island's (the program itself is shared)
    this.ground = M.get('ground').clone();
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.chunks = new Map();
    this.interactables = [];
    this.lamps = [];
    this.dirty = false;
    this.veg = {};
    for (const m of veg) {
      const v = VEGETATION[m](M);
      v.meshes = v.parts.map(({ geo, mat }) => {
        const im = new THREE.InstancedMesh(geo, mat, VEG_CAP);
        im.count = 0; im.castShadow = true; im.receiveShadow = true;
        this.group.add(im);
        return im;
      });
      this.veg[m] = v;
    }
    this.pathU = {
      pathSeg: { value: Array.from({ length: PATH_MAX }, () => new THREE.Vector4()) },
      pathW: { value: new Float32Array(PATH_MAX) },
      pathN: { value: 0 },
      pathDirt: { value: new THREE.Color(0xcdb68c) },
      pathStone: { value: new THREE.Color(0xa59a88) },
      pathGrout: { value: new THREE.Color(0x7a6a52) },
    };
    const ground = this.ground;
    ground.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.pathU);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPathPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPathPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\n${PATH_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${PATH_FRAG}`);
    };
    ground.customProgramCacheKey = () => 'island-paths';
  }

  // the whole island, coarse, for everything beyond the loaded chunks (islandLod.js)
  setLod(data) {
    this.lod = new IslandLod(this.group, this.M, data, (x, z, h, ny, out) => groundColor(x, z, h, ny, out, this.palette), this.ground);
    this.dirty = true;
  }

  // [{ points: [[x, z], …], width, stone? }] from canary_layout.json
  setPaths(paths) {
    let n = 0;
    for (const { points, width, stone } of paths ?? []) {
      for (let i = 1; i < points.length && n < PATH_MAX; i++, n++) {
        this.pathU.pathSeg.value[n].set(...points[i - 1], ...points[i]);
        this.pathU.pathW.value[n] = stone ? -width : width;
      }
    }
    this.pathU.pathN.value = n;
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
      groundColor(gx, gz, c.data.h[i], n.y, tmp, this.palette);
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
    const m = new THREE.Mesh(g, this.ground);
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
      if (this.veg[o.m]) {
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
    this.lod?.update(new Set([...this.chunks.values()].filter((c) => c.visible).map((c) => c.key)));
  }

  // --- collisions ------------------------------------------------------------

  collide(capsule) {
    let onGround = false;
    const delta = new THREE.Vector3(), { start, end, radius } = capsule;
    // The chunk under the player has not arrived yet (scene start, reconnect, a fast run): stand still
    // instead of falling under a ground that is about to appear.
    if (this.heightAt(start.x, start.z) === null) {
      this.hold ??= start.y;
      const dy = this.hold - start.y;
      start.y += dy; end.y += dy; delta.y += dy;
      return { onGround: true, delta };
    }
    this.hold = null;
    for (const c of this.chunks.values()) {
      if (!c.visible) continue;
      const x0 = c.cx * CS - 3, z0 = c.cz * CS - 3;
      if (start.x < x0 || start.x > x0 + CS + 6 || start.z < z0 || start.z > z0 + CS + 6) continue;
      const r = c.collider.collide(capsule);
      onGround ||= r.onGround;
      delta.add(r.delta);
    }
    // the sea: walk in up to the waist, then the slope pushes you back ashore — only someone in the water,
    // not on the pier or the boat above it (that used to stop players 8 m along the pier)
    for (let k = 0; k < 20 && start.y - radius < 0.4; k++) {
      const h = this.heightAt(start.x, start.z);
      if (h === null || h > -1.0) break;
      const gx = (this.heightAt(start.x + 0.5, start.z) ?? h) - (this.heightAt(start.x - 0.5, start.z) ?? h);
      const gz = (this.heightAt(start.x, start.z + 0.5) ?? h) - (this.heightAt(start.x, start.z - 0.5) ?? h);
      const len = Math.hypot(gx, gz) || 1;
      start.x += (gx / len) * 0.1; start.z += (gz / len) * 0.1; end.x = start.x; end.z = start.z;
      delta.x += (gx / len) * 0.1; delta.z += (gz / len) * 0.1;
    }
    // Safety net: feet never end up under the terrain (nothing walkable is below it)
    const ground = this.heightAt(start.x, start.z);
    if (ground !== null && start.y - radius < ground - 0.3) {
      const dy = ground - (start.y - radius);
      start.y += dy; end.y += dy; delta.y += dy;
      onGround = true;
    }
    return { onGround, delta };
  }

  groundHeight(x, z, fromY) {
    const c = this.chunks.get(`${Math.floor(x / CS)},${Math.floor(z / CS)}`);
    return c ? (c.collider.groundHeight(x, z, fromY) ?? this.heightAt(x, z)) : null;
  }
}
