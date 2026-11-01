import * as THREE from 'three';

// Placeholder people built from capsules, one vertex-coloured material for everybody.
// NPCs are baked into a single mesh; players keep their limbs for the walk/sit animation.
// Swap for rigged Quaternius models later — `person()` is the only thing that would change.

export const ROLE_LOOK = {
  grumete: { shirt: 0xe6dcc4, pants: 0x7a6a55, hat: 'cap', hatColor: 0xb3332a },
  piloto: { shirt: 0x2f4a7a, sleeves: 0x2f4a7a, pants: 0x2a2a30, vest: 0x22365c, hat: 'brim', hatColor: 0x1d1f26 },
  lengua: { shirt: 0x7a2228, sleeves: 0x7a2228, pants: 0x2a2220, vest: 0x5a1820, hat: 'none', hair: 0x1a120c },
};
export const ROLE_NAME = { grumete: 'Юнга', piloto: 'Штурман', lengua: 'Переводчик' };

// Part 2: the same three players as Lucayan Taíno of Guanahani. Bare skin with red achiote paint and cotton.
const TAINO_SKIN = 0xa8714c, TAINO_HAIR = 0x120d0a;
const taino = (o) => ({ shirt: TAINO_SKIN, sleeves: TAINO_SKIN, pants: TAINO_SKIN, skin: TAINO_SKIN, hair: TAINO_HAIR, hat: 'none', longHair: true, barefoot: true, ...o });
export const TAINO_ROLE_LOOK = {
  grumete: taino({ loincloth: 0xe9e2d0, bodyPaint: 0x9a2a1c }), // the fisher
  piloto: taino({ nagua: 0xece5d2, bands: 0xece5d2 }), // the woman who bakes the casabe
  lengua: taino({ loincloth: 0xe9e2d0, bands: 0xe9e2d0, hat: 'band', hatColor: 0xe9e2d0, bodyPaint: 0x1e1814 }), // the cacique's apprentice
};
export const TAINO_ROLE_NAME = { grumete: 'Рыбак', piloto: 'Хозяйка', lengua: 'Ученик касика' };

export const NPC_LOOK = {
  columbus: { shirt: 0x2c2430, sleeves: 0x2c2430, pants: 0x1e1a18, cloak: 0x4a1f1c, hat: 'brim', hatColor: 0x17120f, hair: 0xb8b0a4, skin: 0xd8a888 },
  boatswain: { shirt: 0xcfc2a5, vest: 0x5a3a22, pants: 0x3e4a5c, hatColor: 0x7a2a20, hair: 0x2a1f16 },
  cook: { shirt: 0xe8e0cc, pants: 0x5b4f40, hat: 'none', hair: 0x1f1810, vest: 0x8a7a5e },
  storyteller: { shirt: 0xb8ab90, vest: 0x4a3a2a, pants: 0x4a4038, hatColor: 0x6a2a22, hair: 0xd0ccc4, skin: 0xc08a68 },
  sailor_1: { shirt: 0xd9cdb3, pants: 0x5f5444, hatColor: 0xa02a22 },
  sailor_2: { shirt: 0xe0d5bd, pants: 0x6f6150, hatColor: 0xb3332a },
  sailor_3: { shirt: 0xc9bfa8, pants: 0x4a5560, hatColor: 0x8a2a24, skin: 0xb88660 },
  musician: { shirt: 0xe4d8bf, vest: 0x5a3a26, pants: 0x3e4a52, hat: 'brim', hatColor: 0x4a3422, hair: 0x2a1c12 },
  // La Gomera
  trader: { shirt: 0x8a5a2c, sleeves: 0xd8ccb2, vest: 0x5a3a1e, pants: 0x3a3028, hat: 'brim', hatColor: 0x3a2a1a, hair: 0x2a1f16, skin: 0xc68a62 },
  carpenter: { shirt: 0xcfc0a0, pants: 0x5a4a38, vest: 0x8a6a44, hat: 'none', hair: 0x6a5038, skin: 0xc08060 },
  beatriz: { shirt: 0x5a1e2e, sleeves: 0x5a1e2e, pants: 0x3a1420, skirt: 0x6a2236, hat: 'none', hair: 0x2a160e, skin: 0xe2b494 },
  town_1: { shirt: 0xc8b48c, pants: 0x6a5a44, hat: 'brim', hatColor: 0x8a7650, skin: 0xb07a52 },
  town_2: { shirt: 0xe4dccb, sleeves: 0xe4dccb, skirt: 0x3f5a6e, pants: 0x3f5a6e, hat: 'none', hair: 0x1c140e, skin: 0xc48a64 },
  town_3: { shirt: 0x9a8a70, pants: 0x4a4038, hat: 'none', hair: 0xd8d4cc, skin: 0xb88466 },
  // Guanahani
  cacique: taino({ loincloth: 0xf0e8d4, bodyPaint: 0x9a2a1c, bands: 0xf0e8d4, hat: 'band', hatColor: 0xb8302a, gold: true, guanin: true }),
  elder: taino({ loincloth: 0xd9d0bc, hair: 0x9a948c, bodyPaint: 0x1e1814 }),
  villager_1: taino({ nagua: 0xe6dfcb, bands: 0xe6dfcb }),
  villager_2: taino({ loincloth: 0xe0d8c4, bodyPaint: 0x9a2a1c }),
  villager_3: taino({ loincloth: 0xe0d8c4, gold: true }),
};
// Guanahani, 12 October: the landing party as the villagers see it (layout ids admiral, notary, sailor_es)
NPC_LOOK.admiral = { ...NPC_LOOK.columbus, cloak: 0x8a1f1c };
NPC_LOOK.notary = { shirt: 0x1c1a1c, sleeves: 0x1c1a1c, pants: 0x1a1818, vest: 0x2a2428, hat: 'brim', hatColor: 0x121012, hair: 0x3a2a1c, skin: 0xd8a888 };
NPC_LOOK.sailor_es = { ...NPC_LOOK.sailor_2, hatColor: 0x2f4a7a };

const tmpColor = new THREE.Color();
function paint(geo, hex) {
  tmpColor.set(hex);
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = tmpColor.r; c[i * 3 + 1] = tmpColor.g; c[i * 3 + 2] = tmpColor.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

export function person(mat, look) {
  const {
    shirt = 0xd8ccb2, sleeves = null, pants = 0x6b5c4a, vest = null, hat = 'cap', hatColor = 0xa62a20,
    skin = 0xd29a74, hair = 0x3a2a1c, cloak = null, skirt = null,
    // Taíno (part 2): loincloth / nagua (a married woman's short cotton skirt), body paint, cotton bands on arms
    // and calves, long hair, gold — a nose ornament and, for the cacique, a guanín disc on the chest
    loincloth = null, nagua = null, bodyPaint = null, bands = null, longHair = false, gold = false, guanin = false, barefoot = false,
  } = look;
  const seg = 12;
  const part = (geo, hex, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(paint(geo, hex), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  const limb = (len, r, hex, parent) => {
    const p = new THREE.Group(); parent.add(p);
    const g = new THREE.CapsuleGeometry(r, len, 4, seg); g.translate(0, -len / 2, 0);
    part(g, hex, p); return p;
  };
  const root = new THREE.Group();
  const hip = new THREE.Group(); hip.position.y = 0.95; root.add(hip);
  const legs = [];
  for (const s of [-1, 1]) {
    const th = limb(0.4, 0.08, pants, hip); th.position.x = s * 0.1;
    const sh = limb(0.4, 0.066, pants, th); sh.position.y = -0.46;
    part(new THREE.BoxGeometry(0.1, 0.07, 0.22), barefoot ? skin : 0x2a1d14, sh, 0, -0.47, 0.04);
    legs.push({ th, sh });
  }
  const torso = new THREE.Group(); hip.add(torso);
  const body = new THREE.CapsuleGeometry(0.175, 0.36, 4, seg); body.scale(1, 1, 0.7); part(body, shirt, torso, 0, 0.3, 0);
  if (vest) { const v = new THREE.CylinderGeometry(0.19, 0.2, 0.42, seg, 1, true); v.scale(1, 1, 0.74); part(v, vest, torso, 0, 0.3, 0); }
  const belt = new THREE.CylinderGeometry(0.185, 0.185, 0.06, seg); belt.scale(1, 1, 0.72); part(belt, 0x3a2616, torso, 0, 0.08, 0);
  part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, seg), skin, torso, 0, 0.62, 0);
  const head = new THREE.Group(); head.position.y = 0.76; torso.add(head);
  const hg = new THREE.SphereGeometry(0.105, seg, seg); hg.scale(0.95, 1.08, 1); part(hg, skin, head);
  const hr = new THREE.SphereGeometry(0.11, seg, seg, 0, Math.PI * 2, 0, Math.PI * 0.55); hr.rotateX(-0.35); part(hr, hair, head, 0, 0.012, -0.012);
  const nose = new THREE.ConeGeometry(0.018, 0.04, 4); nose.rotateX(Math.PI / 2); part(nose, skin, head, 0, -0.005, 0.105);
  if (hat === 'cap') { const c = new THREE.ConeGeometry(0.105, 0.2, seg); c.rotateX(-0.5); part(c, hatColor, head, 0, 0.1, -0.02); }
  if (hat === 'band') part(new THREE.CylinderGeometry(0.113, 0.113, 0.035, seg * 2, 1, true), hatColor, head, 0, 0.045, -0.005);
  if (longHair) { const h = new THREE.BoxGeometry(0.2, 0.36, 0.05); h.translate(0, -0.12, -0.085); part(h, hair, head); }
  if (gold) part(new THREE.SphereGeometry(0.014, 6, 4), 0xd8aa3c, head, 0, -0.045, 0.1);
  if (hat === 'brim') {
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, seg * 2), hatColor, head, 0, 0.07, 0);
    part(new THREE.CylinderGeometry(0.1, 0.115, 0.12, seg * 2), hatColor, head, 0, 0.13, 0);
  }
  if (bodyPaint) for (const y of [0.4, 0.47]) { const b = new THREE.CylinderGeometry(0.181, 0.181, 0.03, seg, 1, true); b.scale(1, 1, 0.72); part(b, bodyPaint, torso, 0, y, 0); }
  if (guanin) part(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 16).rotateX(Math.PI / 2), 0xd8aa3c, torso, 0, 0.44, 0.13);
  if (bands) for (const { sh } of legs) part(new THREE.CylinderGeometry(0.072, 0.072, 0.06, seg, 1, true), bands, sh, 0, -0.08, 0);
  if (loincloth) {
    part(new THREE.CylinderGeometry(0.18, 0.18, 0.04, seg, 1, true).scale(1, 1, 0.72), loincloth, hip, 0, 0.02, 0);
    part(new THREE.BoxGeometry(0.2, 0.3, 0.02).translate(0, -0.13, 0.125), loincloth, hip);
  }
  if (nagua) { const g = new THREE.CylinderGeometry(0.19, 0.27, 0.36, seg * 2, 1, true); g.scale(1, 1, 0.8); g.translate(0, -0.12, 0); const m = part(g, nagua, hip); m.material = mat.clone(); m.material.side = THREE.DoubleSide; }
  const arms = [];
  for (const s of [-1, 1]) {
    const ua = limb(0.27, 0.058, sleeves ?? shirt, torso); ua.position.set(s * 0.235, 0.54, 0);
    const fa = limb(0.25, 0.05, sleeves ?? shirt, ua); fa.position.y = -0.31;
    part(new THREE.SphereGeometry(0.05, seg, seg), skin, fa, 0, -0.3, 0);
    if (bands) part(new THREE.CylinderGeometry(0.066, 0.066, 0.05, seg, 1, true), bands, ua, 0, -0.07, 0);
    arms.push({ ua, fa, s });
  }
  if (cloak) {
    const c = new THREE.CylinderGeometry(0.25, 0.46, 1.2, seg * 2, 1, true); c.scale(1, 1, 0.8); c.translate(0, -0.05, -0.02);
    const m = part(c, cloak, torso);
    m.material = mat.clone(); m.material.side = THREE.DoubleSide;
  }
  if (skirt) {
    const g = new THREE.CylinderGeometry(0.2, 0.42, 0.98, seg * 2, 1, true); g.translate(0, -0.42, 0);
    const m = part(g, skirt, hip);
    m.material = mat.clone(); m.material.side = THREE.DoubleSide;
  }
  const rig = { root, hip, torso, head, legs, arms };
  pose(rig, 'stand');
  return rig;
}

export function pose(rig, name, t = 0) {
  const { hip, torso, head, legs, arms } = rig;
  hip.position.y = 0.95; hip.rotation.set(0, 0, 0); torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
  for (const { th, sh } of legs) { th.rotation.set(0, 0, 0); sh.rotation.set(0, 0, 0); }
  for (const { ua, fa, s } of arms) { ua.rotation.set(0, 0, s * 0.1); fa.rotation.set(-0.15, 0, 0); }
  switch (name) {
    case 'walk': case 'run': {
      const amp = name === 'run' ? 0.8 : 0.5, sw = Math.sin(t);
      legs[0].th.rotation.x = sw * amp; legs[1].th.rotation.x = -sw * amp;
      legs[0].sh.rotation.x = Math.max(0, -sw) * amp * 1.2; legs[1].sh.rotation.x = Math.max(0, sw) * amp * 1.2;
      arms[0].ua.rotation.x = -sw * amp * 0.8; arms[1].ua.rotation.x = sw * amp * 0.8;
      hip.position.y = 0.95 - Math.abs(Math.cos(t)) * 0.03;
      if (name === 'run') torso.rotation.x = 0.15;
      break;
    }
    case 'sit':
      hip.position.y = 0.48;
      for (const { th, sh } of legs) { th.rotation.x = -1.5; sh.rotation.x = 1.45; }
      for (const { ua, fa } of arms) { ua.rotation.x = -0.35; fa.rotation.x = -0.6; }
      break;
    case 'akimbo':
      for (const { ua, fa, s } of arms) { ua.rotation.set(0.15, 0, s * 0.55); fa.rotation.set(0, 0, -s * 1.7); }
      break;
    case 'kneel':
      hip.position.y = 0.52; torso.rotation.x = 0.85; head.rotation.x = -0.5;
      for (const { th, sh } of legs) { th.rotation.x = -0.1; sh.rotation.x = Math.PI / 2 + 0.1; }
      for (const { ua, fa } of arms) { ua.rotation.x = -1.35; fa.rotation.x = -0.4; }
      arms[1].ua.rotation.x = -1.7;
      break;
    case 'haul':
      torso.rotation.x = -0.18; head.rotation.x = -0.3;
      legs[0].th.rotation.x = -0.45; legs[0].sh.rotation.x = 0.25; legs[1].th.rotation.x = 0.3; legs[1].sh.rotation.x = 0.2;
      for (const { ua, fa, s } of arms) { ua.rotation.set(-2.3 - s * 0.15, 0, s * 0.15); fa.rotation.x = -0.3; }
      break;
    case 'stir':
      torso.rotation.x = 0.25;
      for (const { ua, fa } of arms) { ua.rotation.x = -0.8; fa.rotation.x = -0.9; }
      arms[0].ua.rotation.x = -0.3; arms[0].fa.rotation.x = -0.1;
      break;
    case 'admiral':
      head.rotation.set(-0.12, 0.35, 0);
      arms[0].ua.rotation.x = 0.35; arms[0].fa.rotation.x = -0.9; arms[1].ua.rotation.x = 0.4; arms[1].fa.rotation.x = -1.0;
      break;
  }
}

// Name / chat label above a head.
export function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false }));
  sprite.scale.set(2.3, 0.72, 1);
  sprite.renderOrder = 10;
  sprite.draw = (title, subtitle, bubble) => {
    const x = canvas.getContext('2d');
    x.clearRect(0, 0, 512, 160);
    x.textAlign = 'center';
    if (bubble) {
      x.font = '500 30px system-ui, sans-serif';
      const text = bubble.length > 34 ? bubble.slice(0, 33) + '…' : bubble, w = Math.min(500, x.measureText(text).width + 36);
      x.fillStyle = 'rgba(250,244,230,0.95)';
      x.beginPath(); x.roundRect(256 - w / 2, 4, w, 52, 14); x.fill();
      x.fillStyle = '#2a1d12'; x.fillText(text, 256, 41);
    }
    x.font = '600 34px system-ui, sans-serif';
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.fillStyle = '#fff';
    x.strokeText(title, 256, 104); x.fillText(title, 256, 104);
    if (subtitle) {
      x.font = '26px system-ui, sans-serif'; x.fillStyle = '#f2d9a0';
      x.strokeText(subtitle, 256, 140); x.fillText(subtitle, 256, 140);
    }
    tex.needsUpdate = true;
  };
  return sprite;
}

// A four-course guitar of the 1490s (the «guitarra» Tinctoris describes): small waisted body, short neck,
// four pegs — not the modern six-string. Body centred at the origin, neck along +x, top facing +z.
export function guitar(mat) {
  const g = new THREE.Group();
  const add = (geo, hex, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(paint(geo, hex), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const half = (x) => Math.max(0.105 * Math.sqrt(Math.max(0, 1 - ((x + 0.06) / 0.115) ** 2)), 0.085 * Math.sqrt(Math.max(0, 1 - ((x - 0.085) / 0.09) ** 2)), x > -0.17 && x < 0.17 ? 0.068 : 0);
  const sh = new THREE.Shape(), N = 28, pts = [];
  for (let i = 0; i <= N; i++) { const x = -0.175 + (0.35 * i) / N; pts.push([x, half(x)]); }
  sh.moveTo(pts[0][0], 0);
  for (const [x, y] of pts) sh.lineTo(x, y);
  for (const [x, y] of pts.reverse()) sh.lineTo(x, -y);
  const body = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
  body.translate(0, 0, -0.035);
  add(body, 0x8a5a32);
  const top = new THREE.ShapeGeometry(sh); add(top, 0xd3a86a, 0, 0, 0.042);
  add(new THREE.CircleGeometry(0.03, 16), 0x1a120c, 0.055, 0, 0.0435);
  add(new THREE.BoxGeometry(0.03, 0.07, 0.008), 0x4a2e18, -0.1, 0, 0.047); // bridge
  add(new THREE.BoxGeometry(0.33, 0.042, 0.022), 0x5e3c22, 0.33, 0, 0.032); // neck
  const head = add(new THREE.BoxGeometry(0.11, 0.055, 0.02), 0x5e3c22, 0.545, 0, 0.022); head.rotation.y = 0.25;
  for (const [dx, dy] of [[0.515, 1], [0.565, 1], [0.515, -1], [0.565, -1]]) add(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), 0x3a2414, dx, dy * 0.045, 0.02);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.6, 0.0025, 0.0025), 0xece2c8, 0.2, -0.014 + i * 0.0093, 0.047);
  return g;
}

// Seated with the guitar across the right thigh, neck to the left; strum() plays it.
export function guitarist(mat, look) {
  const rig = person(mat, look);
  pose(rig, 'sit');
  const gtr = guitar(mat);
  gtr.position.set(-0.06, 0.62, 0.25);
  gtr.rotation.set(-0.25, 0.2, 0.5);
  gtr.scale.setScalar(1.1);
  rig.root.add(gtr);
  rig.guitar = gtr;
  strum(rig, 0);
  return rig;
}

// Two-bone reach: point the upper arm and the forearm so the hand lands on `target` (world), the elbow bending
// towards `pole` (torso space). Arm bones hang along −y; upper arm 0.31 m, forearm to the hand 0.30 m.
const DOWN = new THREE.Vector3(0, -1, 0), _S = new THREE.Vector3(), _T = new THREE.Vector3(), _E = new THREE.Vector3(), _P = new THREE.Vector3(), _q = new THREE.Quaternion();
export function reach(rig, arm, target, pole) {
  const A = 0.31, B = 0.3;
  _S.copy(arm.ua.position);
  _T.copy(target); rig.torso.worldToLocal(_T);
  const st = _T.clone().sub(_S), d = Math.min(st.length(), A + B - 0.01);
  st.normalize();
  const x = (A * A - B * B + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A * A - x * x));
  _P.copy(pole).addScaledVector(st, -pole.dot(st)).normalize();
  _E.copy(_S).addScaledVector(st, x).addScaledVector(_P, h);
  arm.ua.quaternion.setFromUnitVectors(DOWN, _E.clone().sub(_S).normalize());
  const toHand = _S.copy(_S).addScaledVector(st, d).sub(_E).normalize().applyQuaternion(_q.copy(arm.ua.quaternion).invert());
  arm.fa.quaternion.setFromUnitVectors(DOWN, toHand);
}

const POLE_R = new THREE.Vector3(-1, -0.6, -0.4), POLE_L = new THREE.Vector3(1, -0.8, -0.3);
// playing: false — night, the guitar rests on the knee, right hand on its top, head up to listen
export function strum(rig, t, playing = true) {
  const beat = playing ? Math.sin(t * Math.PI * 2 * 1.6) : 0, lazy = Math.sin(t * 0.9);
  rig.torso.rotation.set(playing ? 0.12 + 0.02 * beat : 0.04, 0, 0);
  rig.head.rotation.set(playing ? 0.3 : 0.05, playing ? -0.25 + 0.1 * lazy : 0.35 + 0.05 * lazy, 0);
  rig.root.updateMatrixWorld(true);
  const g = rig.guitar;
  for (const arm of rig.arms) {
    if (arm.s < 0) reach(rig, arm, g.localToWorld(playing ? _T.set(0.05, 0.035 * beat, 0.1) : _T.set(-0.06, 0.06, 0.09)), POLE_R); // right hand: sound hole, or resting on the top
    else reach(rig, arm, g.localToWorld(_T.set(0.42 + (playing ? 0.02 * lazy : 0), -0.01, 0.07)), POLE_L); // left hand on the neck
  }
}
