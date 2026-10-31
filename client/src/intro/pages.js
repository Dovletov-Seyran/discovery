// Illustrations for the intro, drawn on 2D canvases in ink and watercolour on parchment:
// pages of Marco Polo's book, the cover, Columbus's world chart and the "unknown land" overlay.
// Everything is deterministic (seeded), so every client draws the same pages.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK = 'rgba(52,32,18,';
const ink = (a = 0.9) => `${INK}${a})`;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Aged paper: base tone, soft blotches, fibres, darker edges and a few stains.
export function parchment(ctx, w, h, seed = 1, { base = [233, 214, 172], edge = 0.55 } = {}) {
  const r = rng(seed);
  ctx.fillStyle = `rgb(${base})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, rad = (0.04 + r() * 0.18) * Math.max(w, h), d = r() < 0.5 ? -1 : 1;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, d > 0 ? 'rgba(255,248,226,0.10)' : 'rgba(150,110,60,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 900; i++) {
    const x = r() * w, y = r() * h, l = 4 + r() * 14, a = r() * Math.PI;
    ctx.strokeStyle = `rgba(110,80,40,${0.03 + r() * 0.05})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = r() * w, y = r() * h, rad = (0.03 + r() * 0.06) * w;
    ctx.strokeStyle = 'rgba(120,80,40,0.12)'; ctx.lineWidth = 2 + r() * 2;
    ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.7 + r() * 0.3), r() * 3, 0, Math.PI * 2); ctx.stroke();
  }
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(96,58,24,${edge})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// A soft watercolour wash inside a path.
function wash(ctx, path, color, alpha = 0.35) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke(path);
  ctx.restore();
}

function strokePath(ctx, path, width = 2.2, a = 0.9) {
  ctx.lineWidth = width; ctx.strokeStyle = ink(a); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke(path);
}

// Parallel hatching lines clipped to a path (engraving shadow).
function hatch(ctx, path, angle, gap, a = 0.35, w = 1.2) {
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = ink(a); ctx.lineWidth = w;
  const { width: W, height: H } = ctx.canvas, d = Math.hypot(W, H);
  ctx.translate(W / 2, H / 2); ctx.rotate(angle);
  ctx.beginPath();
  for (let x = -d; x < d; x += gap) { ctx.moveTo(x, -d); ctx.lineTo(x, d); }
  ctx.stroke();
  ctx.restore();
}

// Wobbly line through points: hand-drawn look.
function wobble(points, r, amp = 1.5) {
  const p = new Path2D();
  points.forEach(([x, y], i) => {
    const jx = (r() - 0.5) * amp, jy = (r() - 0.5) * amp;
    if (i === 0) p.moveTo(x + jx, y + jy); else p.lineTo(x + jx, y + jy);
  });
  return p;
}

// --- text pages ---------------------------------------------------------------

// Opening of Il Milione (Tuscan text, c. 1300 — public domain), set in a book hand with a red initial.
const MILIONE = [
  'Signori imperadori, re e duci e tutte altre genti che',
  'volete sapere le diverse generazioni de le genti e le',
  'diversità de le regioni del mondo, leggete questo libro',
  'dove le troverrete tutte le grandissime maraviglie e',
  'gran diversitadi de le genti d’Erminia, di Persia e di',
  'Tarteria, d’India e di molte altre province. E questo',
  'vi conterà il libro ordinatamente siccome messere',
  'Marco Polo, savio e nobile cittadino di Vinegia, le',
  'conta in questo libro e egli medesimo le vide.',
  'Ma ancora v’à di quelle cose le quali elli non vide,',
  'ma udille da persone degne di fede, e però le cose',
  'vedute dirà di veduta e l’altre per udita, acciò',
  'che l’nostro libro sia veritieri e sanza niuna',
  'menzogna. E ciascuno che questo libro leggerà o',
  'udirà, il debbia credere, perché tutte sono cose vere.',
];

function textPage(ctx, w, h, { seed, heading, initial, lines, folio }) {
  parchment(ctx, w, h, seed);
  const m = w * 0.13, top = h * 0.12, lh = h * 0.042;
  ctx.textBaseline = 'alphabetic';
  if (heading) {
    ctx.fillStyle = 'rgba(150,28,20,0.92)';
    ctx.font = `600 ${h * 0.034}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center';
    ctx.fillText(heading, w / 2, top);
  }
  // illuminated initial: gold square, red letter, ink frame
  const s = lh * 3.1, x0 = m, y0 = top + lh * 0.7;
  ctx.fillStyle = 'rgba(196,150,58,0.9)';
  ctx.fillRect(x0, y0, s, s);
  ctx.strokeStyle = ink(0.8); ctx.lineWidth = 2; ctx.strokeRect(x0, y0, s, s);
  ctx.fillStyle = 'rgba(140,24,18,0.95)';
  ctx.font = `700 ${s * 0.86}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(initial, x0 + s / 2, y0 + s * 0.8);
  ctx.textAlign = 'left';
  ctx.font = `italic ${lh * 0.62}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = ink(0.86);
  lines.forEach((t, i) => {
    const y = top + lh * (1.6 + i), indent = i < 3 ? s + lh * 0.35 : 0;
    ctx.fillText(i === 0 ? t.slice(1) : t, m + indent, y, w - 2 * m - indent);
  });
  if (folio) {
    ctx.font = `${lh * 0.55}px Georgia, serif`; ctx.textAlign = 'center';
    ctx.fillText(folio, w / 2, h * 0.94);
  }
}

// --- pictures ------------------------------------------------------------------

function frame(ctx, w, h, r) {
  const m = w * 0.08, p = wobble([[m, m], [w - m, m], [w - m, h - m], [m, h - m], [m, m]], r, 2);
  strokePath(ctx, p, 3, 0.75);
  const q = wobble([[m + 10, m + 10], [w - m - 10, m + 10], [w - m - 10, h - m - 10], [m + 10, h - m - 10], [m + 10, m + 10]], r, 1.5);
  strokePath(ctx, q, 1.2, 0.55);
  return { x0: m + 10, y0: m + 10, x1: w - m - 10, y1: h - m - 10 };
}

function caption(ctx, w, h, text) {
  ctx.fillStyle = 'rgba(140,24,18,0.9)';
  ctx.font = `600 ${h * 0.03}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h * 0.95);
}

// Cipangu: pagodas with golden roofs on a hill over the sea.
function goldenPalace(ctx, w, h) {
  const r = rng(11);
  parchment(ctx, w, h, 11);
  const b = frame(ctx, w, h, r), W = b.x1 - b.x0, H = b.y1 - b.y0, X = (u) => b.x0 + u * W, Y = (v) => b.y0 + v * H;
  ctx.save(); ctx.beginPath(); ctx.rect(b.x0, b.y0, W, H); ctx.clip();
  // sky wash and sun
  wash(ctx, new Path2D(`M${X(0)} ${Y(0)}H${X(1)}V${Y(0.55)}H${X(0)}Z`), '#9fb8c8', 0.25);
  const sun = new Path2D(); sun.arc(X(0.78), Y(0.16), W * 0.07, 0, Math.PI * 2);
  wash(ctx, sun, '#e3b04a', 0.55); strokePath(ctx, sun, 1.6, 0.7);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, p = new Path2D();
    p.moveTo(X(0.78) + Math.cos(a) * W * 0.09, Y(0.16) + Math.sin(a) * W * 0.09);
    p.lineTo(X(0.78) + Math.cos(a) * W * 0.13, Y(0.16) + Math.sin(a) * W * 0.13);
    strokePath(ctx, p, 1.4, 0.55);
  }
  // hill
  const hill = wobble([[X(0), Y(0.7)], [X(0.18), Y(0.55)], [X(0.42), Y(0.47)], [X(0.7), Y(0.52)], [X(1), Y(0.62)], [X(1), Y(1)], [X(0), Y(1)]], r, 3);
  wash(ctx, hill, '#8a9a5a', 0.35); strokePath(ctx, hill, 2, 0.8); hatch(ctx, hill, 0.6, 9, 0.18);
  // sea
  const sea = new Path2D(`M${X(0)} ${Y(0.82)}H${X(1)}V${Y(1)}H${X(0)}Z`);
  wash(ctx, sea, '#5f86a0', 0.35);
  for (let i = 0; i < 9; i++) { const y = Y(0.85 + i * 0.017), x = X(0.05 + (i % 3) * 0.3); strokePath(ctx, wobble([[x, y], [x + W * 0.08, y - 3], [x + W * 0.16, y]], r, 1), 1.2, 0.5); }
  // pagodas: tiers of curved golden roofs
  const pagoda = (cx, base, s, tiers) => {
    let y = base;
    for (let t = 0; t < tiers; t++) {
      const bw = s * (1 - t * 0.17), wall = s * 0.26;
      const body = new Path2D(`M${cx - bw * 0.36} ${y}V${y - wall}H${cx + bw * 0.36}V${y}Z`);
      wash(ctx, body, '#b0563a', 0.45); strokePath(ctx, body, 1.6);
      for (let k = -1; k <= 1; k++) { const win = new Path2D(`M${cx + k * bw * 0.2 - 4} ${y - wall * 0.25}v${-wall * 0.45}h8v${wall * 0.45}Z`); ctx.fillStyle = ink(0.75); ctx.fill(win); }
      y -= wall;
      const roof = new Path2D();
      roof.moveTo(cx - bw * 0.62, y + s * 0.02);
      roof.quadraticCurveTo(cx - bw * 0.42, y - s * 0.02, cx - bw * 0.3, y - s * 0.14);
      roof.lineTo(cx + bw * 0.3, y - s * 0.14);
      roof.quadraticCurveTo(cx + bw * 0.42, y - s * 0.02, cx + bw * 0.62, y + s * 0.02);
      roof.closePath();
      ctx.save(); ctx.globalAlpha = 0.95; ctx.fillStyle = '#c9982e'; ctx.fill(roof); ctx.restore();
      hatch(ctx, roof, -0.2, 6, 0.25, 1);
      ctx.save(); ctx.clip(roof); ctx.fillStyle = 'rgba(255,236,160,0.45)'; ctx.fillRect(cx - bw * 0.5, y - s * 0.14, bw * 0.35, s * 0.06); ctx.restore();
      strokePath(ctx, roof, 1.8);
      y -= s * 0.14;
    }
    const spire = new Path2D(`M${cx} ${y - s * 0.25}L${cx - 4} ${y}H${cx + 4}Z`);
    ctx.fillStyle = '#c9982e'; ctx.fill(spire); strokePath(ctx, spire, 1.2);
  };
  pagoda(X(0.48), Y(0.6), W * 0.36, 4);
  pagoda(X(0.2), Y(0.68), W * 0.2, 3);
  pagoda(X(0.8), Y(0.66), W * 0.22, 3);
  // little boat
  const boat = new Path2D(`M${X(0.12)} ${Y(0.9)}q${W * 0.08} ${H * 0.03} ${W * 0.16} 0l${-W * 0.02} ${H * 0.025}h${-W * 0.12}z`);
  wash(ctx, boat, '#6a4a2a', 0.5); strokePath(ctx, boat, 1.5);
  strokePath(ctx, new Path2D(`M${X(0.2)} ${Y(0.9)}V${Y(0.8)}l${W * 0.06} ${H * 0.07}z`), 1.4);
  ctx.restore();
  caption(ctx, w, h, 'Cipangu · tetti d’oro');
}

function camel(ctx, x, y, s, r, rider) {
  const p = new Path2D();
  p.moveTo(x - s * 0.5, y - s * 0.55);
  p.bezierCurveTo(x - s * 0.45, y - s * 0.95, x - s * 0.1, y - s * 0.95, x, y - s * 0.7);
  p.bezierCurveTo(x + s * 0.12, y - s * 0.92, x + s * 0.35, y - s * 0.85, x + s * 0.42, y - s * 0.6);
  p.lineTo(x + s * 0.55, y - s * 0.95);
  p.quadraticCurveTo(x + s * 0.6, y - s * 1.12, x + s * 0.72, y - s * 1.08);
  p.lineTo(x + s * 0.8, y - s * 1.02);
  p.lineTo(x + s * 0.66, y - s * 0.98);
  p.lineTo(x + s * 0.52, y - s * 0.5);
  p.quadraticCurveTo(x + s * 0.45, y - s * 0.4, x + s * 0.3, y - s * 0.42);
  p.lineTo(x + s * 0.32, y); p.lineTo(x + s * 0.24, y); p.lineTo(x + s * 0.2, y - s * 0.4);
  p.lineTo(x - s * 0.25, y - s * 0.4);
  p.lineTo(x - s * 0.3, y); p.lineTo(x - s * 0.38, y); p.lineTo(x - s * 0.42, y - s * 0.45);
  p.closePath();
  wash(ctx, p, '#a87a48', 0.6);
  hatch(ctx, p, 0.9, 5, 0.22, 1);
  strokePath(ctx, p, 1.6);
  // load: bales tied over the humps
  const bale = new Path2D(); bale.roundRect(x - s * 0.32, y - s * 0.86, s * 0.42, s * 0.2, 4);
  wash(ctx, bale, r() < 0.5 ? '#8a3a28' : '#5a6a8a', 0.7); strokePath(ctx, bale, 1.3);
  if (rider) {
    const body = new Path2D(`M${x - s * 0.05} ${y - s * 0.88}l${-s * 0.06} ${-s * 0.28}q${s * 0.08} ${-s * 0.06} ${s * 0.14} 0l${-s * 0.02} ${s * 0.28}z`);
    wash(ctx, body, '#2f4a6a', 0.7); strokePath(ctx, body, 1.3);
    const head = new Path2D(); head.arc(x - s * 0.04, y - s * 1.22, s * 0.055, 0, Math.PI * 2);
    ctx.fillStyle = '#e8d2b0'; ctx.fill(head); strokePath(ctx, head, 1.2);
    const turban = new Path2D(); turban.ellipse(x - s * 0.04, y - s * 1.26, s * 0.065, s * 0.035, 0, Math.PI, 0);
    ctx.fillStyle = '#efe8d8'; ctx.fill(turban); strokePath(ctx, turban, 1.1);
  }
}

// The Silk Road: a caravan over the dunes, sacks of spices in front.
function caravan(ctx, w, h) {
  const r = rng(21);
  parchment(ctx, w, h, 21);
  const b = frame(ctx, w, h, r), W = b.x1 - b.x0, H = b.y1 - b.y0, X = (u) => b.x0 + u * W, Y = (v) => b.y0 + v * H;
  ctx.save(); ctx.beginPath(); ctx.rect(b.x0, b.y0, W, H); ctx.clip();
  wash(ctx, new Path2D(`M${X(0)} ${Y(0)}H${X(1)}V${Y(0.5)}H${X(0)}Z`), '#e6c48a', 0.3);
  const sun = new Path2D(); sun.arc(X(0.25), Y(0.2), W * 0.08, 0, Math.PI * 2);
  wash(ctx, sun, '#d98a3a', 0.45); strokePath(ctx, sun, 1.4, 0.6);
  const dune = (pts, c, a) => { const p = wobble(pts, r, 2); wash(ctx, p, c, a); strokePath(ctx, p, 1.8, 0.7); hatch(ctx, p, -0.4, 10, 0.12); };
  dune([[X(0), Y(0.55)], [X(0.3), Y(0.42)], [X(0.6), Y(0.5)], [X(1), Y(0.4)], [X(1), Y(1)], [X(0), Y(1)]], '#d4a868', 0.4);
  dune([[X(0), Y(0.72)], [X(0.35), Y(0.6)], [X(0.7), Y(0.66)], [X(1), Y(0.58)], [X(1), Y(1)], [X(0), Y(1)]], '#c99a58', 0.45);
  // distant caravan as small silhouettes on the ridge
  for (let i = 0; i < 6; i++) camel(ctx, X(0.55 + i * 0.07), Y(0.48 - i * 0.012), W * 0.06, r, i % 2 === 0);
  // main caravan
  camel(ctx, X(0.28), Y(0.78), W * 0.2, r, true);
  camel(ctx, X(0.55), Y(0.76), W * 0.18, r, false);
  camel(ctx, X(0.8), Y(0.73), W * 0.16, r, true);
  // spice sacks
  const sack = (cx, cy, s, color) => {
    const p = new Path2D(`M${cx - s} ${cy}q${-s * 0.2} ${-s * 1.2} ${s * 0.15} ${-s * 1.45}h${s * 1.7}q${s * 0.35} ${s * 0.25} ${s * 0.15} ${s * 1.45}z`);
    wash(ctx, p, '#c8b48a', 0.75); strokePath(ctx, p, 1.6);
    const top = new Path2D(); top.ellipse(cx, cy - s * 1.45, s * 0.85, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill(top); strokePath(ctx, top, 1.2);
    for (let i = 0; i < 26; i++) { ctx.fillStyle = ink(0.35); ctx.fillRect(cx + (r() - 0.5) * s * 1.4, cy - s * 1.45 + (r() - 0.5) * s * 0.3, 2, 2); }
  };
  sack(X(0.12), Y(0.98), W * 0.06, '#b8401e');
  sack(X(0.28), Y(0.99), W * 0.055, '#e0a82a');
  sack(X(0.44), Y(0.985), W * 0.05, '#7a4a22');
  ctx.restore();
  caption(ctx, w, h, 'La via de la seta e de le spezie');
}

// Constantinople, 1453: the land walls and towers, domes behind, Ottoman tents, cannon smoke.
function constantinople(ctx, w, h) {
  const r = rng(31);
  parchment(ctx, w, h, 31);
  const b = frame(ctx, w, h, r), W = b.x1 - b.x0, H = b.y1 - b.y0, X = (u) => b.x0 + u * W, Y = (v) => b.y0 + v * H;
  ctx.save(); ctx.beginPath(); ctx.rect(b.x0, b.y0, W, H); ctx.clip();
  wash(ctx, new Path2D(`M${X(0)} ${Y(0)}H${X(1)}V${Y(0.5)}H${X(0)}Z`), '#b9a49a', 0.25);
  // city behind the walls: domes and roofs
  const dome = (cx, cy, s) => {
    const d = new Path2D(); d.moveTo(cx - s, cy); d.quadraticCurveTo(cx - s, cy - s * 1.1, cx, cy - s * 1.15); d.quadraticCurveTo(cx + s, cy - s * 1.1, cx + s, cy); d.closePath();
    wash(ctx, d, '#7a8a96', 0.5); hatch(ctx, d, 0.3, 6, 0.25, 1); strokePath(ctx, d, 1.6);
    const drum = new Path2D(`M${cx - s} ${cy}h${s * 2}v${s * 0.5}h${-s * 2}z`); wash(ctx, drum, '#c8b49a', 0.6); strokePath(ctx, drum, 1.4);
    strokePath(ctx, new Path2D(`M${cx} ${cy - s * 1.15}v${-s * 0.35}M${cx - s * 0.12} ${cy - s * 1.35}h${s * 0.24}`), 1.4);
  };
  dome(X(0.5), Y(0.36), W * 0.13);
  dome(X(0.25), Y(0.42), W * 0.07);
  dome(X(0.75), Y(0.4), W * 0.08);
  for (let i = 0; i < 9; i++) {
    const x = X(0.05 + i * 0.11), hh = H * (0.05 + r() * 0.05), roof = new Path2D(`M${x} ${Y(0.5)}v${-hh}l${W * 0.04} ${-H * 0.04}l${W * 0.04} ${H * 0.04}v${hh}z`);
    wash(ctx, roof, '#c98a6a', 0.35); strokePath(ctx, roof, 1.2, 0.7);
  }
  // the walls with crenellated towers
  const wall = new Path2D(`M${X(0)} ${Y(0.5)}H${X(1)}V${Y(0.72)}H${X(0)}Z`);
  wash(ctx, wall, '#c8b08a', 0.6); hatch(ctx, wall, 0, 12, 0.18, 1); strokePath(ctx, wall, 2);
  for (let i = 0; i < 6; i++) {
    const cx = X(0.08 + i * 0.17), tw = W * 0.09, t = new Path2D(`M${cx - tw / 2} ${Y(0.72)}V${Y(0.4)}H${cx + tw / 2}V${Y(0.72)}Z`);
    wash(ctx, t, '#bfa47c', 0.7); hatch(ctx, t, 1.2, 7, 0.2, 1); strokePath(ctx, t, 1.8);
    for (let k = 0; k < 3; k++) { const m = new Path2D(`M${cx - tw / 2 + k * tw / 3 + 3} ${Y(0.4)}v-10h${tw / 3 - 6}v10`); strokePath(ctx, m, 1.6); }
    ctx.fillStyle = ink(0.8); ctx.fillRect(cx - 4, Y(0.48), 8, 14);
  }
  // banner of the besiegers
  strokePath(ctx, new Path2D(`M${X(0.85)} ${Y(0.98)}V${Y(0.76)}`), 2);
  const flag = new Path2D(`M${X(0.85)} ${Y(0.76)}q${W * 0.06} ${H * 0.01} ${W * 0.11} ${-H * 0.005}l${-W * 0.01} ${H * 0.05}q${-W * 0.05} ${H * 0.01} ${-W * 0.1} 0z`);
  wash(ctx, flag, '#a8281e', 0.8); strokePath(ctx, flag, 1.4);
  const moon = new Path2D(); moon.arc(X(0.9), Y(0.783), W * 0.016, 0.6, Math.PI * 2 - 0.6);
  ctx.strokeStyle = 'rgba(245,235,210,0.95)'; ctx.lineWidth = 3; ctx.stroke(moon);
  // tents and cannon smoke in front of the walls
  for (let i = 0; i < 4; i++) {
    const cx = X(0.12 + i * 0.2), t = new Path2D(`M${cx - W * 0.06} ${Y(0.95)}L${cx} ${Y(0.83)}L${cx + W * 0.06} ${Y(0.95)}Z`);
    wash(ctx, t, '#e8dcc0', 0.8); hatch(ctx, t, 0.8, 6, 0.18, 1); strokePath(ctx, t, 1.6);
  }
  for (let i = 0; i < 14; i++) {
    const c = new Path2D(); c.arc(X(0.35 + r() * 0.3), Y(0.7 + r() * 0.12), W * (0.025 + r() * 0.03), 0, Math.PI * 2);
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#e9e2d2'; ctx.fill(c); ctx.restore(); strokePath(ctx, c, 1, 0.35);
  }
  ctx.restore();
  caption(ctx, w, h, 'Constantinopolis · MCCCCLIII');
}

// --- the book and its cover ------------------------------------------------------

export const PAGE_W = 768, PAGE_H = 1024;

export function drawPage(id) {
  const c = canvas(PAGE_W, PAGE_H), ctx = c.getContext('2d');
  switch (id) {
    case 'text1': textPage(ctx, PAGE_W, PAGE_H, { seed: 3, heading: 'Il libro di messer Marco Polo', initial: 'S', lines: MILIONE.slice(0, 15), folio: 'i' }); break;
    case 'text2': textPage(ctx, PAGE_W, PAGE_H, { seed: 4, heading: 'De le spezie e de la seta', initial: 'Q', lines: ['Questa provincia à molto pepe e gengiovo e', 'cannella e altre spezie assai, e di quindi', ...MILIONE.slice(2, 15)], folio: 'xlvii' }); break;
    case 'text3': textPage(ctx, PAGE_W, PAGE_H, { seed: 5, heading: 'Del Gran Cane e di Cipangu', initial: 'C', lines: ['Cipangu è una isola inver levante, ch’è ne', 'l’alto mare mille cinquecento miglia. Egli', 'ànno oro in grandissima abbondanza; il pala-', 'gio del signore è tutto coperto d’oro fine.', ...MILIONE.slice(4, 15)], folio: 'clii' }); break;
    case 'palace': goldenPalace(ctx, PAGE_W, PAGE_H); break;
    case 'caravan': caravan(ctx, PAGE_W, PAGE_H); break;
    case 'city': constantinople(ctx, PAGE_W, PAGE_H); break;
    default: parchment(ctx, PAGE_W, PAGE_H, 9);
  }
  return c;
}

// Leather cover with blind-tooled borders and a gilt title.
export function drawCover() {
  const w = 768, h = 1024, c = canvas(w, h), ctx = c.getContext('2d'), r = rng(41);
  ctx.fillStyle = '#5a2e1a'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '20,8,2' : '140,90,60'},${0.04 + r() * 0.06})`;
    ctx.beginPath(); ctx.arc(r() * w, r() * h, 2 + r() * 10, 0, Math.PI * 2); ctx.fill();
  }
  const edge = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, h * 0.75);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(10,4,0,0.55)');
  ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
  const line = (m, col, wd) => { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.strokeRect(m, m * 1.1, w - 2 * m, h - 2.2 * m); };
  line(40, 'rgba(20,8,2,0.6)', 6); line(46, 'rgba(200,150,70,0.55)', 2); line(90, 'rgba(20,8,2,0.5)', 4);
  // diamond lattice tooling
  ctx.strokeStyle = 'rgba(20,8,2,0.35)'; ctx.lineWidth = 3;
  for (let k = -8; k < 12; k++) {
    ctx.beginPath(); ctx.moveTo(100 + k * 90, 110); ctx.lineTo(100 + k * 90 + (h - 220), h - 110); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - 100 - k * 90, 110); ctx.lineTo(w - 100 - k * 90 - (h - 220), h - 110); ctx.stroke();
  }
  ctx.fillStyle = '#5a2e1a'; ctx.fillRect(150, 330, w - 300, 260);
  ctx.strokeStyle = 'rgba(200,150,70,0.7)'; ctx.lineWidth = 3; ctx.strokeRect(150, 330, w - 300, 260);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d8a84a';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.font = '700 86px Georgia, serif'; ctx.fillText('IL MILIONE', w / 2, 455);
  ctx.font = 'italic 40px Georgia, serif'; ctx.fillText('di Marco Polo', w / 2, 530);
  return c;
}

// --- Columbus's chart -------------------------------------------------------------

// A chart in the manner of Toscanelli and Behaim (1474–1492): Europe and Africa on the right,
// one Ocean Sea, then Cipangu and Cathay on the left. No America — nobody had drawn it yet.
export function drawWorldChart(w = 2048, h = 1365) {
  const c = canvas(w, h), ctx = c.getContext('2d'), r = rng(51);
  parchment(ctx, w, h, 51, { base: [228, 206, 160], edge: 0.6 });
  const X = (u) => u * w, Y = (v) => v * h;
  // rhumb lines from two compass roses
  for (const [cx, cy] of [[X(0.55), Y(0.5)], [X(0.25), Y(0.45)]]) {
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(40,30,20,0.28)' : i % 2 ? 'rgba(150,40,30,0.22)' : 'rgba(40,90,50,0.22)';
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w); ctx.stroke();
    }
    const rose = new Path2D();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 - Math.PI / 2, l = i % 2 ? w * 0.025 : w * 0.05;
      rose.moveTo(cx, cy); rose.lineTo(cx + Math.cos(a - 0.12) * l * 0.35, cy + Math.sin(a - 0.12) * l * 0.35);
      rose.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); rose.lineTo(cx + Math.cos(a + 0.12) * l * 0.35, cy + Math.sin(a + 0.12) * l * 0.35); rose.closePath();
    }
    wash(ctx, rose, '#9a2a1e', 0.55); strokePath(ctx, rose, 1.4, 0.7);
  }
  const land = (pts, color = '#b9a06a') => { const p = wobble(pts.map(([u, v]) => [X(u), Y(v)]), r, 3); wash(ctx, p, color, 0.55); hatch(ctx, p, 0.8, 9, 0.12); strokePath(ctx, p, 2.4, 0.85); return p; };
  // Europe and Africa (east)
  land([[0.86, 0.02], [0.8, 0.1], [0.83, 0.18], [0.78, 0.24], [0.8, 0.3], [0.86, 0.33], [0.81, 0.38], [0.78, 0.46], [0.8, 0.56], [0.76, 0.66], [0.8, 0.78], [0.86, 0.9], [0.9, 1], [1, 1], [1, 0], [0.86, 0.02]]);
  // the islands the age knew: Canaries, Azores, Cape Verde
  for (const [u, v, s] of [[0.74, 0.47, 0.008], [0.72, 0.48, 0.006], [0.7, 0.465, 0.007], [0.6, 0.3, 0.008], [0.58, 0.32, 0.006], [0.71, 0.66, 0.006]]) {
    const p = new Path2D(); p.ellipse(X(u), Y(v), w * s * 1.4, w * s, 0.3, 0, Math.PI * 2);
    wash(ctx, p, '#b9a06a', 0.7); strokePath(ctx, p, 1.6, 0.8);
  }
  // Asia (west): Cathay coast and Cipangu
  land([[0, 0.05], [0.12, 0.08], [0.15, 0.2], [0.11, 0.3], [0.16, 0.38], [0.12, 0.5], [0.15, 0.6], [0.1, 0.72], [0.12, 0.86], [0.05, 1], [0, 1]], '#c2a670');
  land([[0.26, 0.42], [0.3, 0.38], [0.34, 0.41], [0.33, 0.5], [0.29, 0.55], [0.25, 0.5], [0.26, 0.42]], '#c9a85a');
  // legendary islands of the Ocean Sea
  for (const [u, v] of [[0.47, 0.28], [0.52, 0.62]]) {
    const p = new Path2D(); p.ellipse(X(u), Y(v), w * 0.022, w * 0.012, 0.4, 0, Math.PI * 2);
    wash(ctx, p, '#b9a06a', 0.4); strokePath(ctx, p, 1.4, 0.6);
  }
  // waves
  for (let i = 0; i < 70; i++) {
    const x = X(0.2 + r() * 0.55), y = Y(0.08 + r() * 0.86), s = w * 0.008;
    strokePath(ctx, new Path2D(`M${x} ${y}q${s} ${-s} ${s * 2} 0q${s} ${-s} ${s * 2} 0`), 1.2, 0.35);
  }
  // scale bar in leagues
  const sx = X(0.6), sy = Y(0.9);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? 'rgba(52,32,18,0.8)' : 'rgba(240,226,190,0.9)'; ctx.fillRect(sx + i * w * 0.02, sy, w * 0.02, 12); }
  ctx.strokeStyle = ink(0.8); ctx.lineWidth = 1.5; ctx.strokeRect(sx, sy, w * 0.12, 12);
  ctx.fillStyle = ink(0.85); ctx.textAlign = 'center';
  ctx.font = `italic ${w * 0.012}px Georgia, serif`; ctx.fillText('leguas', sx + w * 0.06, sy + 34);
  // labels
  ctx.font = `italic ${w * 0.03}px Georgia, serif`; ctx.fillStyle = 'rgba(60,35,20,0.85)';
  ctx.fillText('Mare Oceanum', X(0.5), Y(0.2));
  ctx.font = `italic ${w * 0.018}px Georgia, serif`;
  ctx.fillText('Hispania', X(0.9), Y(0.27)); ctx.fillText('Africa', X(0.9), Y(0.62));
  ctx.fillText('Cathay', X(0.06), Y(0.25)); ctx.fillText('Mangi', X(0.06), Y(0.62));
  ctx.fillStyle = 'rgba(140,24,18,0.9)'; ctx.fillText('Cipangu', X(0.295), Y(0.6));
  ctx.fillStyle = 'rgba(60,35,20,0.85)';
  ctx.font = `italic ${w * 0.012}px Georgia, serif`;
  ctx.fillText('Insulae Fortunatae', X(0.7), Y(0.52)); ctx.fillText('Antillia', X(0.47), Y(0.33)); ctx.fillText('S. Brandan', X(0.52), Y(0.67));
  // the route Columbus believed in: from the Canaries due west to Cipangu
  ctx.setLineDash([14, 10]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(150,28,20,0.75)';
  ctx.beginPath(); ctx.moveTo(X(0.71), Y(0.47)); ctx.quadraticCurveTo(X(0.52), Y(0.44), X(0.34), Y(0.47)); ctx.stroke();
  ctx.setLineDash([]);
  return c;
}

// The land nobody knew of, sketched over the ocean with a question mark (panel 5). Transparent background.
export function drawUnknownLand(w = 2048, h = 1365) {
  const c = canvas(w, h), ctx = c.getContext('2d'), r = rng(61);
  const X = (u) => u * w, Y = (v) => v * h;
  const pts = [[0.42, 0.08], [0.47, 0.12], [0.45, 0.2], [0.5, 0.28], [0.46, 0.36], [0.44, 0.44], [0.5, 0.5], [0.55, 0.56], [0.52, 0.66], [0.48, 0.76], [0.45, 0.88], [0.41, 0.95], [0.38, 0.86], [0.4, 0.74], [0.37, 0.62], [0.39, 0.5], [0.36, 0.4], [0.38, 0.26], [0.36, 0.14], [0.42, 0.08]];
  const p = wobble(pts.map(([u, v]) => [X(u), Y(v)]), r, 4);
  ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#8a6a3a'; ctx.fill(p); ctx.restore();
  ctx.setLineDash([18, 12]); strokePath(ctx, p, 3.5, 0.75); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(150,28,20,0.85)';
  ctx.textAlign = 'center';
  ctx.font = `700 ${w * 0.12}px Georgia, serif`;
  ctx.fillText('?', X(0.45), Y(0.58));
  ctx.font = `italic ${w * 0.02}px Georgia, serif`;
  ctx.fillText('terra incognita', X(0.45), Y(0.7));
  return c;
}

// Globe gores in the manner of Behaim's Erdapfel (1492): equirectangular, same geography as the chart.
export function drawGlobe(w = 1024, h = 512) {
  const c = canvas(w, h), ctx = c.getContext('2d'), r = rng(71);
  parchment(ctx, w, h, 71, { base: [222, 196, 146], edge: 0.2 });
  ctx.fillStyle = 'rgba(70,110,120,0.35)'; ctx.fillRect(0, 0, w, h);
  const X = (u) => u * w, Y = (v) => v * h;
  const land = (pts) => { const p = wobble(pts.map(([u, v]) => [X(u), Y(v)]), r, 2); ctx.fillStyle = 'rgba(196,170,110,0.95)'; ctx.fill(p); strokePath(ctx, p, 1.6, 0.8); };
  land([[0.45, 0.12], [0.55, 0.1], [0.62, 0.2], [0.6, 0.32], [0.55, 0.36], [0.6, 0.48], [0.58, 0.7], [0.52, 0.82], [0.48, 0.66], [0.43, 0.48], [0.45, 0.34], [0.42, 0.22]]);
  land([[0.62, 0.1], [0.9, 0.08], [0.98, 0.22], [0.92, 0.4], [0.82, 0.5], [0.72, 0.42], [0.66, 0.3], [0.62, 0.2]]);
  land([[0.0, 0.1], [0.08, 0.12], [0.06, 0.3], [0.0, 0.34]]);
  const cip = new Path2D(); cip.ellipse(X(0.22), Y(0.38), 18, 26, 0.3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(205,170,90,0.95)'; ctx.fill(cip); strokePath(ctx, cip, 1.4);
  ctx.strokeStyle = 'rgba(52,32,18,0.35)'; ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(X(i / 12), 0); ctx.lineTo(X(i / 12), h); ctx.stroke(); }
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, Y(i / 6)); ctx.lineTo(w, Y(i / 6)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(150,28,20,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  return c;
}
