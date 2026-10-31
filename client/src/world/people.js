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

export const NPC_LOOK = {
  columbus: { shirt: 0x2c2430, sleeves: 0x2c2430, pants: 0x1e1a18, cloak: 0x4a1f1c, hat: 'brim', hatColor: 0x17120f, hair: 0xb8b0a4, skin: 0xd8a888 },
  boatswain: { shirt: 0xcfc2a5, vest: 0x5a3a22, pants: 0x3e4a5c, hatColor: 0x7a2a20, hair: 0x2a1f16 },
  cook: { shirt: 0xe8e0cc, pants: 0x5b4f40, hat: 'none', hair: 0x1f1810, vest: 0x8a7a5e },
  storyteller: { shirt: 0xb8ab90, vest: 0x4a3a2a, pants: 0x4a4038, hatColor: 0x6a2a22, hair: 0xd0ccc4, skin: 0xc08a68 },
  sailor_1: { shirt: 0xd9cdb3, pants: 0x5f5444, hatColor: 0xa02a22 },
  sailor_2: { shirt: 0xe0d5bd, pants: 0x6f6150, hatColor: 0xb3332a },
  sailor_3: { shirt: 0xc9bfa8, pants: 0x4a5560, hatColor: 0x8a2a24, skin: 0xb88660 },
  sailor_4: { shirt: 0xd4c8ad, vest: 0x6a4a2c, pants: 0x5a4c3c, hat: 'none', hair: 0x4a3420 },
};

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
    skin = 0xd29a74, hair = 0x3a2a1c, cloak = null,
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
    part(new THREE.BoxGeometry(0.1, 0.07, 0.22), 0x2a1d14, sh, 0, -0.47, 0.04);
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
  if (hat === 'brim') {
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, seg * 2), hatColor, head, 0, 0.07, 0);
    part(new THREE.CylinderGeometry(0.1, 0.115, 0.12, seg * 2), hatColor, head, 0, 0.13, 0);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const ua = limb(0.27, 0.058, sleeves ?? shirt, torso); ua.position.set(s * 0.235, 0.54, 0);
    const fa = limb(0.25, 0.05, sleeves ?? shirt, ua); fa.position.y = -0.31;
    part(new THREE.SphereGeometry(0.05, seg, seg), skin, fa, 0, -0.3, 0);
    arms.push({ ua, fa, s });
  }
  if (cloak) {
    const c = new THREE.CylinderGeometry(0.25, 0.46, 1.2, seg * 2, 1, true); c.scale(1, 1, 0.8); c.translate(0, -0.05, -0.02);
    const m = part(c, cloak, torso);
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
