// Hull of the Santa María as plain math (no three.js), shared by the renderer, the collider
// and the layout script. Ship space = world space of the `ship` zone: main deck at y = 0,
// bow toward −z, starboard toward +x.

export const L0 = -11.8; // stem
export const L1 = 11.0; // transom
export const WATER_Y = -2.25;
export const MAINZ = -0.6, FOREZ = -9.0, MIZZENZ = 10.0;
export const DECKS = {
  main: { y: 0, z0: -8.0, z1: 5.2 },
  quarter: { y: 1.95, z0: 4.8, z1: L1 - 0.02 },
  fore: { y: 1.6, z0: L0 + 0.4, z1: -7.5 },
};

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function halfBeam(z) {
  if (z < -2.5) { const t = Math.min(1, (z + 2.5) / (L0 + 2.5)); return Math.max(0.14, 3.75 * Math.pow(1 - t * t, 0.6)); }
  if (z > 3.5) { const t = Math.min(1, (z - 3.5) / (L1 - 3.5)); return 3.75 - 1.0 * t * t; }
  return 3.75;
}
// top of the bulwark: low amidships, raised at the forecastle and the quarterdeck
export const topY = (z) => 1.05 + 1.45 * sm(-5.6, -8.4, z) + 1.95 * sm(3.9, 6.2, z);
export function keelY(z) {
  let k = -3.2;
  if (z < -7.5) k += 2.6 * Math.pow((-7.5 - z) / (-7.5 - L0), 2);
  if (z > 7.5) k += 0.8 * Math.pow((z - 7.5) / (L1 - 7.5), 2);
  return k;
}
// half-section: u = 0 at the bulwark top, u = 1 at the keel → [x, y]
export function secX(z, u) {
  const top = topY(z), y = top - u * (top - keelY(z));
  const q = 0.45 + 0.4 * clamp((-5.5 - z) / 6, 0, 1);
  let x = halfBeam(z) * Math.pow(Math.max(0, 1 - Math.pow(u, 2.4)), q);
  x *= 1 - 0.08 * Math.pow(clamp((y + 1.0) / 4, 0, 1), 1.6);
  return [x, y];
}
// inner half-width of the hull at height y
export function xAtY(z, y) {
  const top = topY(z), k = keelY(z);
  return secX(z, clamp((top - y) / (top - k), 0, 1))[0];
}
