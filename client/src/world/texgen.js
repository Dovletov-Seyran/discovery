// Procedural textures as raw RGBA arrays — no three.js and no DOM, so this runs in a Web Worker.
// Every texture tiles. Wood textures cover 4 × 4 m and the planks run along U.

export function ihash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const mod = (a, p) => ((a % p) + p) % p;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = mod(xi, px), x1 = mod(xi + 1, px), y0 = mod(yi, py), y1 = mod(yi + 1, py);
  const a = ihash(x0, y0, s), b = ihash(x1, y0, s), c = ihash(x0, y1, s), d = ihash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, px, py, oct = 4, s = 0) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x, y, px, py, s + i * 17);
    norm += amp; x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
  }
  return sum / norm;
}

const img = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });

function normalFromHeight(w, h, hgt, strength) {
  const out = img(w, h), d = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const L = hgt[y * w + mod(x - 1, w)], R = hgt[y * w + mod(x + 1, w)];
    const U = hgt[mod(y - 1, h) * w + x], D = hgt[mod(y + 1, h) * w + x];
    // rows are stored top-down and uploaded without flipY, so +y in the array is +v
    let nx = -(R - L) * strength, ny = -(D - U) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  return out;
}

export function planks(o) {
  const {
    size = 1024, rows = 16, segMin = 1, segMax = 3, base = [176, 138, 90], tintVar = 0.14, grain = 0.22,
    seam = [34, 25, 18], seamPx = 3, nails = true, weather = 0.25, seed = 1, normalStrength = 2.2, roughBase = 0.78,
  } = o;
  const N = size, col = img(N, N), rgh = img(N, N), hgt = new Float32Array(N * N);
  const rowH = N / rows, info = [];
  for (let r = 0; r < rows; r++) info.push({ k: segMin + Math.floor(ihash(r, 0, seed) * (segMax - segMin + 0.999)), off: ihash(r, 1, seed) });
  for (let y = 0; y < N; y++) {
    const r = Math.floor(y / rowH), vy = (y - r * rowH) / rowH, { k, off } = info[r], segPx = N / k;
    for (let x = 0; x < N; x++) {
      const u = x / N, su = (u + off) * k, seg = Math.floor(su), fu = su - seg, segId = mod(seg, k);
      const t = ihash(r, segId + 5, seed), t2 = ihash(r, segId + 9, seed);
      const g = fbm(u * 3, y / N * rows * 7 + t2 * 3, 3, rows * 7, 4, seed + segId * 3);
      const rings = 0.5 + 0.5 * Math.sin((vy * 3.0 + g * 6.0 + t2 * 10) * Math.PI * 2);
      const wv = fbm(u * 2, y / N * 2, 2, 2, 3, seed + 99);
      let lum = 1 + (t - 0.5) * 2 * tintVar + (g - 0.5) * 2 * grain + (rings - 0.5) * grain * 0.6;
      lum *= 1 - weather * (wv - 0.35);
      const seamD = Math.min(vy, 1 - vy) * rowH, buttD = Math.min(fu, 1 - fu) * segPx, edge = Math.min(seamD, buttD);
      let cr = base[0] * lum, cg = base[1] * lum, cb = base[2] * lum, h = 1, ro = roughBase + (g - 0.5) * 0.15;
      const grey = (cr + cg + cb) / 3, wmix = Math.max(0, weather * (wv - 0.45) * 1.6);
      cr += (grey * 1.05 - cr) * wmix; cg += (grey * 1.03 - cg) * wmix; cb += (grey - cb) * wmix;
      if (seamPx > 0) {
        if (edge < seamPx) { cr = seam[0]; cg = seam[1]; cb = seam[2]; h = 0; ro = 0.55; }
        else { const bev = smooth(seamPx, seamPx + 3, edge); h = 0.35 + 0.65 * bev; const d = 0.75 + 0.25 * bev; cr *= d; cg *= d; cb *= d; }
        if (nails && buttD > 4 && buttD < 12 && edge >= seamPx) {
          for (const ny of [0.3, 0.7]) {
            const dx = buttD - 8, dy = (vy - ny) * rowH;
            if (dx * dx + dy * dy < 7) { cr *= 0.45; cg *= 0.42; cb *= 0.4; h = 0.6; }
          }
        }
      }
      h += (g - 0.5) * 0.25 + (rings - 0.5) * 0.05;
      const i = (y * N + x) * 4, rv = Math.min(1, Math.max(0, ro)) * 255;
      col.data[i] = cr; col.data[i + 1] = cg; col.data[i + 2] = cb; col.data[i + 3] = 255;
      rgh.data[i] = rv; rgh.data[i + 1] = rv; rgh.data[i + 2] = rv; rgh.data[i + 3] = 255;
      hgt[y * N + x] = h;
    }
  }
  return { map: col, roughnessMap: rgh, normalMap: normalFromHeight(N, N, hgt, normalStrength) };
}

export function sail({ size = 1024, cross = false }) {
  const N = size, col = img(N, N), hgt = new Float32Array(N * N), cloths = 14;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = 1 - y / N; // v: 0 = top edge (the yard); rows go up in UV space
    let r = 236, g = 228, b = 206, h = 0.5;
    const fu = (u * cloths) % 1, sd = Math.min(fu, 1 - fu) * N / cloths;
    if (sd < 1.5) { r *= 0.86; g *= 0.85; b *= 0.82; h = 0.8; } else if (sd < 4) h = 0.65;
    h += (((x >> 1) + (y >> 1)) & 1) * 0.06;
    const n = fbm(u * 6, v * 6, 6, 6, 4, 7);
    const dirt = 1 - 0.16 * smooth(0.55, 1.0, v) * (0.6 + n) - (n - 0.5) * 0.12;
    r *= dirt; g *= dirt * 0.99; b *= dirt * 0.95;
    if (Math.min(u, 1 - u, v, 1 - v) * N < 6) { r *= 0.8; g *= 0.76; b *= 0.68; h = 0.9; }
    if (cross) {
      const cx = Math.abs(u - 0.5), cy = Math.abs(v - 0.45);
      if ((cx < 0.075 && cy < 0.3) || (cy < 0.075 && cx < 0.255)) { r *= 0.68; g *= 0.13; b *= 0.11; }
    }
    const i = (y * N + x) * 4;
    col.data[i] = r; col.data[i + 1] = g; col.data[i + 2] = b; col.data[i + 3] = 255;
    hgt[y * N + x] = h;
  }
  return { map: col, normalMap: normalFromHeight(N, N, hgt, 1.5) };
}

export function waterNormals(size = 512) {
  const N = size, hgt = new Float32Array(N * N), waves = [];
  for (let i = 0; i < 24; i++) {
    const a = ihash(i, 1, 3) * Math.PI * 2, f = 2 + Math.floor(ihash(i, 2, 3) * 14);
    waves.push({ kx: Math.round(Math.cos(a) * f), ky: Math.round(Math.sin(a) * f), ph: ihash(i, 3, 3) * 6.283, amp: 1 / (1 + f * 0.35) });
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    let h = 0;
    for (const w of waves) h += w.amp * Math.sin((w.kx * u + w.ky * v) * Math.PI * 2 + w.ph);
    hgt[y * N + x] = h + (fbm(u * 8, v * 8, 8, 8, 4, 11) - 0.5) * 2.5;
  }
  return { normalMap: normalFromHeight(N, N, hgt, 2.0) };
}


export function soft(size = 128) {
  const N = size, col = img(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x / N - 0.5, dy = y / N - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2;
    const n = fbm(x / N * 4, y / N * 4, 4, 4, 3, 5), i = (y * N + x) * 4;
    col.data[i] = col.data[i + 1] = col.data[i + 2] = 255;
    col.data[i + 3] = Math.max(0, 1 - d) ** 1.5 * (0.6 + 0.4 * n) * 255;
  }
  return { map: col };
}

// The full set the ship scene needs. `quality` 'low' halves the wood and sail resolution.
export function recipes(quality) {
  const S = quality === 'low' ? 512 : 1024;
  return {
    deck: () => planks({ size: S, rows: 16, segMin: 1, segMax: 3, base: [170, 136, 96], weather: 0.32, seed: 1, tintVar: 0.13 }),
    hull: () => planks({ size: S, rows: 14, segMin: 1, segMax: 2, base: [96, 64, 40], seam: [22, 16, 12], weather: 0.35, seed: 2, nails: false }),
    wall: () => planks({ size: S / 2, rows: 12, segMin: 1, segMax: 1, base: [128, 88, 55], seed: 3, nails: false, weather: 0.25 }),
    grain: () => planks({ size: 512, rows: 6, segMin: 1, segMax: 1, seamPx: 0, base: [142, 102, 64], seed: 4, grain: 0.3, weather: 0.15 }),
    dark: () => planks({ size: 512, rows: 6, segMin: 1, segMax: 1, seamPx: 0, base: [74, 49, 32], seed: 5, grain: 0.25, weather: 0.1 }),
    stave: () => planks({ size: 512, rows: 16, segMin: 1, segMax: 1, base: [140, 100, 62], seed: 6, nails: false, seamPx: 2 }),
    sail: () => sail({ size: S }),
    sailCross: () => sail({ size: S, cross: true }),
    water: () => waterNormals(512),
    soft: () => soft(),
  };
}
