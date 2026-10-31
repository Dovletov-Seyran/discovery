import * as THREE from 'three';

// Procedural textures are generated in a worker (~1.5 s on an Apple M1), so the intro keeps playing smoothly.
export function generateTextures(quality, anisotropy) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./texgen.worker.js', import.meta.url), { type: 'module' });
    const out = {};
    worker.onerror = reject;
    worker.onmessage = ({ data }) => {
      if (data.done) { worker.terminate(); resolve(out); return; }
      const set = {};
      for (const [slot, img] of Object.entries(data.set)) {
        const t = new THREE.DataTexture(new Uint8Array(img.data.buffer), img.w, img.h, THREE.RGBAFormat);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = anisotropy;
        t.needsUpdate = true;
        set[slot] = t;
      }
      out[data.name] = set;
    };
    worker.postMessage({ quality });
  });
}

const DEF = {
  deck: { tex: 'deck' },
  hull: { tex: 'hull', side: THREE.DoubleSide },
  wall: { tex: 'wall' },
  wallDouble: { tex: 'wall', side: THREE.DoubleSide },
  trim: { tex: 'dark' },
  wood: { tex: 'grain' },
  stave: { tex: 'stave' },
  staveDouble: { tex: 'stave', side: THREE.DoubleSide },
  iron: { color: 0x2b2927, rough: 0.5, metal: 0.75 },
  brass: { color: 0xc9963c, rough: 0.32, metal: 1.0 },
  rope: { color: 0xb49b6b, rough: 0.95 },
  sail: { tex: 'sail', sail: true },
  sailCross: { tex: 'sailCross', sail: true },
  sand: { color: 0xe3c07a, rough: 0.9 },
  black: { color: 0x1d1813, rough: 0.8 },
  leather: { color: 0x5a3820, rough: 0.7 },
  steel: { color: 0xb8bcc0, rough: 0.25, metal: 1.0 },
  water: { color: 0x3e6670, rough: 0.15 },
  ember: { color: 0x401000, emissive: 0xff5a10, ei: 4 },
  flame: { color: 0xff9a30, emissive: 0xff8a20, ei: 6 },
  lampGlass: { color: 0xfff0c0, emissive: 0xffc870, ei: 0.3, rough: 0.2 },
  glass: { color: 0xdcecf5, rough: 0.05, transparent: 0.28 },
  // island
  plaster: { tex: 'plaster', rough: 0.92 },
  roof: { tex: 'tiles', rough: 0.8 },
  stone: { tex: 'stone', rough: 0.9 },
  ground: { tex: 'ground', vertexColors: true, rough: 0.96 },
  rock: { color: 0x5a534d, rough: 0.95, flat: true },
  palmTrunk: { color: 0x7a6650, rough: 0.95 },
  palmLeaf: { color: 0x4d7530, rough: 0.75, side: THREE.DoubleSide },
  dragonTrunk: { color: 0x7f786c, rough: 0.9 },
  dragonLeaf: { color: 0x5a7d52, rough: 0.8 },
  bush: { color: 0x6b7a3a, rough: 0.9 },
  darkWindow: { color: 0x1a1612, rough: 0.6 },
  cheese: { color: 0xe3c46a, rough: 0.7 },
  sack: { color: 0xb8a27a, rough: 0.95 },
  tar: { color: 0x0e0b09, rough: 0.2 },
  seaWater: { color: 0x2f5d68, rough: 0.1 },
};

export class Materials {
  constructor(textures) {
    this.tex = textures;
    this.cache = {};
    this.canvasCache = {};
    this.person = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  }

  get(kind) {
    if (this.cache[kind]) return this.cache[kind];
    const d = DEF[kind], ts = d.tex ? this.tex[d.tex] : null;
    const m = new THREE.MeshStandardMaterial({
      color: ts ? 0xffffff : d.color,
      map: ts?.map ?? null, normalMap: ts?.normalMap ?? null, roughnessMap: ts?.roughnessMap ?? null,
      roughness: d.rough ?? (ts?.roughnessMap ? 1 : 0.85), metalness: d.metal ?? 0,
      side: d.sail ? THREE.DoubleSide : (d.side ?? THREE.FrontSide),
      vertexColors: !!d.vertexColors, flatShading: !!d.flat,
    });
    if (d.sail) {
      // cheap translucency: the side away from the sun still glows a little
      m.emissive.set(0xffffff); m.emissiveMap = ts.map; m.emissiveIntensity = 0.09;
      m.roughness = 0.95; m.normalScale.set(0.6, 0.6);
    }
    if (d.emissive !== undefined) { m.emissive.set(d.emissive); m.emissiveIntensity = d.ei; }
    if (d.transparent !== undefined) { m.transparent = true; m.opacity = d.transparent; m.depthWrite = false; }
    return (this.cache[kind] = m);
  }

  // Material with a texture drawn on a 2D canvas (compass card, sea chart).
  canvas(key, size, draw, opts = {}) {
    if (this.canvasCache[key]) return this.canvasCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return (this.canvasCache[key] = new THREE.MeshStandardMaterial({ map: t, roughness: opts.rough ?? 0.7, side: opts.side ?? THREE.FrontSide }));
  }
}
