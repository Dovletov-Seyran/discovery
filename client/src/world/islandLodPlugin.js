// Vite plugin (runs in Node at dev/build time): `import lod from 'virtual:island-lod'` (La Gomera) or
// 'virtual:island-lod/guanahani' (part 2) gives the client a coarse summary of the island for the far view —
// heights every 8 m, the trees and the buildings. It is computed from the server's own generator, so it always
// matches the real chunks; the generator itself never reaches the browser.
// Size: 65×65 heights + a few hundred objects ≈ 2% of the full chunk data, the chunk rule (≤10% cached) still holds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ID = 'virtual:island-lod', STEP = 8;
const TERRAIN = fileURLToPath(new URL('../../../server/world/terrain.js', import.meta.url));
const layoutFile = (name) => fileURLToPath(new URL(`../../../content/${name}_layout.json`, import.meta.url));
const TREES = new Set(['palm_canary', 'dragon_tree', 'palm_fan', 'gumbo_limbo', 'mangrove']);
const r1 = (v) => Math.round(v * 10) / 10;

export default function islandLod() {
  return {
    name: 'island-lod',
    resolveId: (id) => (id === ID || id.startsWith(ID + '/') ? '\0' + id : null),
    async load(id) {
      if (!id.startsWith('\0' + ID)) return null;
      const LAYOUT = layoutFile(id.slice(ID.length + 2) || 'canary');
      this.addWatchFile(TERRAIN); this.addWatchFile(LAYOUT);
      const { generateCanary } = await import(`${TERRAIN}?t=${Date.now()}`); // fresh after an edit
      const layout = JSON.parse(readFileSync(LAYOUT, 'utf8'));
      const { chunks, heightAt } = generateCanary(layout, { warn: () => {} });
      const res = layout.size / STEP + 1, h = [];
      for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) h.push(r1(heightAt(ix * STEP, iz * STEP)));
      const trees = [], buildings = [];
      for (const c of chunks.values()) {
        for (const o of c.objects) {
          const [x, y, z] = o.p;
          if (TREES.has(o.m)) trees.push([o.m, r1(x), r1(y), r1(z), r1(o.r ?? 0), r1(o.s ?? 1)]);
          else if (o.id) buildings.push({ m: o.m, p: o.p, r: o.r ?? 0 });
        }
      }
      return `export default ${JSON.stringify({ size: layout.size, step: STEP, res, h, trees, buildings })};`;
    },
  };
}
