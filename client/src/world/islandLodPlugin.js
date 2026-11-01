// Vite plugin (runs in Node at dev/build time): `import lod from 'virtual:island-lod'` gives the client a coarse
// summary of La Gomera for the far view — heights every 8 m, the trees and the buildings. It is computed from the
// server's own generator, so it always matches the real chunks; the generator itself never reaches the browser.
// The summary is part of the 10% budget: export its UTF-8 size so Chunks reserves space before loading nearby chunks.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ID = 'virtual:island-lod', RID = '\0' + ID, STEP = 8;
const TERRAIN = fileURLToPath(new URL('../../../server/world/terrain.js', import.meta.url));
const LAYOUT = fileURLToPath(new URL('../../../content/canary_layout.json', import.meta.url));
const TREES = new Set(['palm_canary', 'dragon_tree']);
const r1 = (v) => Math.round(v * 10) / 10;

export default function islandLod() {
  return {
    name: 'island-lod',
    resolveId: (id) => (id === ID ? RID : null),
    async load(id) {
      if (id !== RID) return null;
      this.addWatchFile(TERRAIN); this.addWatchFile(LAYOUT);
      const { generateCanary } = await import(`${pathToFileURL(TERRAIN).href}?t=${Date.now()}`); // fresh after an edit; as a file:// URL, a bare Windows path (C:/...) fails
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
      const data={size:layout.size,step:STEP,res,h,trees,buildings};
      data.byteLength=Buffer.byteLength(JSON.stringify(data),'utf8')+64;
      return `export default ${JSON.stringify(data)};`;
    },
  };
}
