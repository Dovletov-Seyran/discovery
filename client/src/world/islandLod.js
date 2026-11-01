import * as THREE from 'three';
import { bake } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLAND_MODELS } from './islandModels.js';
import { place } from './props.js';

// Far view of La Gomera: the whole island, coarse (data: islandLodPlugin.js — heights every 8 m, trees, buildings).
// Without it the island ends where the loaded chunks end, which shows from any height and in every cutscene.
// Wherever a real chunk is loaded and visible the LOD steps aside: its terrain cells are cut out of the index,
// its buildings and trees are hidden. Same ground material as the chunks, so colours and paths match.

const CS = 32;

// far stand-ins for VEGETATION (islandModels.js): same height and colours, ~20 triangles instead of ~1000
function lodTrees(M) {
  const palmTrunk = new THREE.CylinderGeometry(0.3, 0.42, 7.5, 5, 1, true).translate(0, 3.75, 0);
  // eight drooping fronds, a kite each (a cone read as an umbrella)
  const fr = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + (k % 2) * 0.2, ca = Math.cos(a), sa = Math.sin(a), r = k % 2 ? 2.7 : 3.3;
    const c = [0, 7.9, 0], tip = [ca * r, 6.3 + (k % 2) * 0.4, sa * r];
    const l = [ca * 1.3 - sa * 0.45, 7.95, sa * 1.3 + ca * 0.45], rt = [ca * 1.3 + sa * 0.45, 7.95, sa * 1.3 - ca * 0.45];
    fr.push(...c, ...l, ...tip, ...c, ...tip, ...rt);
  }
  const palmCrown = new THREE.BufferGeometry();
  palmCrown.setAttribute('position', new THREE.Float32BufferAttribute(fr, 3));
  palmCrown.computeVertexNormals();
  // dragon tree: trunk, six branches fanning out like the real model, a spiky tuft on each
  const wood = [new THREE.CylinderGeometry(0.55, 0.75, 3.2, 6, 1, true).translate(0, 1.6, 0)], tufts = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047 + 0.3, tip = new THREE.Vector3(Math.cos(a) * 2.0, 5.0 + (i % 2) * 0.6, Math.sin(a) * 2.0);
    const dir = tip.clone().sub(new THREE.Vector3(0, 3, 0)), len = dir.length();
    wood.push(new THREE.CylinderGeometry(0.2, 0.32, len, 4, 1, true).translate(0, len / 2, 0)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize())).translate(0, 3, 0));
    tufts.push(new THREE.OctahedronGeometry(1.0).scale(1.1, 0.7, 1.1).translate(tip.x * 1.15, tip.y + 0.55, tip.z * 1.15));
  }
  const dragonTrunk = mergeGeometries(wood), dragonCrown = mergeGeometries(tufts);
  // Guanahani: a slimmer fan palm, gumbo-limbo's round crown on a red trunk, a low mangrove dome
  const fanTrunk = palmTrunk.clone().scale(0.6, 0.75, 0.6), fanCrown = palmCrown.clone().scale(0.6, 0.7, 0.6);
  const gumboTrunk = new THREE.CylinderGeometry(0.22, 0.35, 4.2, 5, 1, true).translate(0, 2.1, 0);
  const gumboCrown = new THREE.IcosahedronGeometry(2.6, 0).scale(1.1, 0.7, 1.1).translate(0, 5.0, 0);
  // mangrove: the tent of stilt roots down to the water, the crown on top
  const mangroveRoots = new THREE.ConeGeometry(1.5, 2.4, 7, 1, true).translate(0, 0.6, 0);
  const mangrove = new THREE.IcosahedronGeometry(1.8, 0).scale(1.3, 0.6, 1.3).translate(0, 2.6, 0);
  return {
    palm_canary: [{ geo: palmTrunk, mat: M.get('palmTrunk') }, { geo: palmCrown, mat: M.get('palmLeaf') }],
    dragon_tree: [{ geo: dragonTrunk, mat: M.get('dragonTrunk') }, { geo: dragonCrown, mat: M.get('dragonLeaf') }],
    palm_fan: [{ geo: fanTrunk, mat: M.get('palmTrunk') }, { geo: fanCrown, mat: M.get('palmLeaf') }],
    gumbo_limbo: [{ geo: gumboTrunk, mat: M.get('gumboBark') }, { geo: gumboCrown, mat: M.get('gumboLeaf') }],
    mangrove: [{ geo: mangroveRoots, mat: M.get('mangroveRoot') }, { geo: mangrove, mat: M.get('mangroveLeaf') }],
  };
}

export class IslandLod {
  // shade(x, z, h, normalY, outColor) — the chunks' ground colour
  constructor(parent, M, data, shade, ground = M.get('ground')) {
    const { size, step, res, h } = data;
    this.res = res; this.per = CS / step; this.n = size / CS;
    const g = new THREE.BufferGeometry(), pos = new Float32Array(res * res * 3), uv = new Float32Array(res * res * 2);
    for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
      const i = iz * res + ix, x = ix * step, z = iz * step;
      pos.set([x, h[i], z], i * 3); uv.set([x / 4, z / 4], i * 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(this.cells(() => true));
    g.computeVertexNormals();
    const nrm = g.attributes.normal, col = new Float32Array(res * res * 3), c = new THREE.Color();
    for (let i = 0; i < res * res; i++) {
      shade(pos[i * 3], pos[i * 3 + 2], pos[i * 3 + 1], nrm.getY(i), c);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.terrain = new THREE.Mesh(g, ground);
    parent.add(this.terrain);

    // buildings: the real models, baked per material across the whole island (~8 draw calls); each chunk's
    // triangles are a range of the index, so hiding a chunk is an index rebuild, not a separate mesh
    const perChunk = new Map();
    for (const b of data.buildings) {
      const make = ISLAND_MODELS[b.m];
      if (!make) continue;
      const key = `${Math.floor(b.p[0] / CS)},${Math.floor(b.p[2] / CS)}`;
      if (!perChunk.has(key)) perChunk.set(key, new THREE.Group());
      perChunk.get(key).add(place(make(M).obj, b));
    }
    const byMat = new Map();
    for (const [key, grp] of perChunk) {
      bake(grp);
      for (const m of grp.children) {
        if (!m.isMesh) continue; // the emptied model groups bake() leaves behind
        if (!byMat.has(m.material)) byMat.set(m.material, []);
        byMat.get(m.material).push({ key, geo: m.geometry });
      }
    }
    this.houses = [...byMat].map(([mat, parts]) => {
      const merged = mergeGeometries(parts.map((p) => p.geo)), full = merged.index.array;
      let at = 0;
      const ranges = parts.map(({ key, geo }) => { const r = { key, from: at, to: at + geo.index.count }; at = r.to; return r; });
      for (const p of parts) p.geo.dispose();
      const m = new THREE.Mesh(merged, mat);
      parent.add(m);
      return { mesh: m, full, ranges };
    });

    // trees: a few dozen triangles each — from afar a palm is a trunk and a drooping crown
    // on the coarse ground itself: the 8 m grid misses a narrow dune, and a tree at its real height would hover
    // over the LOD surface (the same triangles as the index below: a, b, a+1 / b, b+1, a+1)
    const lodY = (x, z) => {
      const gx = x / step, gz = z / step, i = Math.min(res - 2, Math.max(0, Math.floor(gx))), j = Math.min(res - 2, Math.max(0, Math.floor(gz)));
      const fx = gx - i, fz = gz - j, at = (di, dj) => h[(j + dj) * res + i + di];
      return fx + fz <= 1 ? at(0, 0) + fx * (at(1, 0) - at(0, 0)) + fz * (at(0, 1) - at(0, 0))
        : at(1, 1) + (1 - fx) * (at(0, 1) - at(1, 1)) + (1 - fz) * (at(1, 0) - at(1, 1));
    };
    this.trees = data.trees.map(([m, x, y, z, r, s]) => ({ m, key: `${Math.floor(x / CS)},${Math.floor(z / CS)}`, x, y: Math.min(y, lodY(x, z)), z, r, s }));
    this.veg = {};
    for (const [m, parts] of Object.entries(lodTrees(M))) {
      const n = this.trees.filter((t) => t.m === m).length;
      if (!n) continue;
      this.veg[m] = parts.map(({ geo, mat }) => {
        const im = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
        im.count = 0; parent.add(im);
        return im;
      });
    }
    this.update(new Set());
  }

  // triangles of the cells whose chunk passes keep(cx, cz)
  cells(keep) {
    const idx = [], R = this.res;
    for (let cz = 0; cz < this.n; cz++) for (let cx = 0; cx < this.n; cx++) {
      if (!keep(cx, cz)) continue;
      for (let j = cz * this.per; j < (cz + 1) * this.per; j++) for (let i = cx * this.per; i < (cx + 1) * this.per; i++) {
        const a = j * R + i, b = a + R;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return idx;
  }

  // covered: keys of the chunks that are loaded and visible right now
  update(covered) {
    this.terrain.geometry.setIndex(this.cells((cx, cz) => !covered.has(`${cx},${cz}`)));
    for (const h of this.houses) {
      const idx = [];
      for (const r of h.ranges) if (!covered.has(r.key)) for (let i = r.from; i < r.to; i++) idx.push(h.full[i]);
      h.mesh.geometry.setIndex(idx);
      h.mesh.visible = idx.length > 0;
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [m, meshes] of Object.entries(this.veg)) {
      let n = 0;
      for (const t of this.trees) {
        if (t.m !== m || covered.has(t.key)) continue;
        m4.compose(p.set(t.x, t.y, t.z), q.setFromAxisAngle(up, t.r), s.setScalar(t.s));
        for (const im of meshes) im.setMatrixAt(n, m4);
        n++;
      }
      for (const im of meshes) { im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    }
  }
}
