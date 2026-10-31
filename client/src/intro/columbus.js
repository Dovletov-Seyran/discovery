import * as THREE from 'three';
import { person, NPC_LOOK } from '../world/people.js';
import { canvas, rng } from './pages.js';

// Columbus for close-ups: the body is the same capsule figure as every NPC (Фронт 1, people.js),
// the head is sculpted — a sphere displaced into a face, with eyes, lids, brows, ears, long grey hair and a cap.
// Head space: metres, centre of the skull at 0, face towards +z, like people.js.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
const pair = (x, y, cx, cy, sx, sy) => g2(x, y, cx, cy, sx, sy) + g2(x, y, -cx, cy, sx, sy);

const EYE = { x: 0.031, y: 0.012, r: 0.0124 };

// Forward relief of the face (metres) at a point of the face plane.
function relief(x, y) {
  let d = 0;
  d += 0.011 * g2(x, y, 0, 0.002, 0.006, 0.022); // bridge of the nose
  d += 0.021 * g2(x, y, 0, -0.026, 0.0088, 0.017); // nose
  d += 0.009 * g2(x, y, 0, -0.041, 0.0085, 0.0075); // tip
  d += 0.006 * pair(x, y, 0.0125, -0.041, 0.0065, 0.0055); // wings
  d -= 0.012 * pair(x, y, EYE.x, EYE.y, 0.017, 0.012); // eye sockets
  d += 0.0055 * pair(x, y, 0.03, 0.033, 0.024, 0.0075); // brow ridge
  d += 0.005 * pair(x, y, 0.052, -0.008, 0.016, 0.014); // cheekbones
  d -= 0.0032 * pair(x, y, 0.047, -0.046, 0.014, 0.016); // a lean face under them
  d += 0.0065 * g2(x, y, 0, -0.061, 0.019, 0.0048); // upper lip
  d += 0.007 * g2(x, y, 0, -0.0725, 0.017, 0.0052); // lower lip
  d -= 0.0032 * g2(x, y, 0, -0.0667, 0.021, 0.0016); // the line of the mouth
  d -= 0.0022 * g2(x, y, 0, -0.082, 0.016, 0.004); // under the lower lip
  d += 0.0095 * g2(x, y, 0, -0.099, 0.018, 0.012); // chin
  d -= 0.002 * pair(x, y, 0.024, -0.052, 0.005, 0.016); // lines from nose to mouth
  return d;
}

// Shape of the skull: an ellipsoid, a narrower jaw, a fuller back of the head; relief only on the face.
function shape(v) {
  let { x, y, z } = v;
  x *= 0.82; y *= 1.11; z *= z < 0 ? 1.06 : 0.98;
  const jaw = sm(-0.005, -0.112, y);
  x *= 1 - 0.34 * jaw;
  if (z < 0) z *= 1 - 0.35 * jaw;
  const front = sm(0.025, 0.075, z);
  z += relief(x, y) * front - 0.009 * front * sm(-0.035, -0.09, y); // the mouth and chin sit behind the nose
  v.set(x, y, z);
  return front;
}

// Surface depth of the face at (x, y), for placing eyes and brows.
function faceZ(x, y) {
  const v = new THREE.Vector3(), dir = new THREE.Vector3();
  let best = -1, bz = 0;
  for (let i = 0; i <= 400; i++) {
    const t = i / 400, el = Math.asin(clamp(y / 0.111, -1, 1));
    // scan the meridian through x: brute force is fine for a handful of calls
    const az = (t - 0.5) * Math.PI * 0.9;
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    v.copy(dir).multiplyScalar(0.1);
    shape(v);
    if (Math.abs(v.x - x) < 0.0015 && Math.abs(v.y - y) < 0.004 && v.z > best) { best = v.z; bz = v.z; }
  }
  return bz;
}

// Equirectangular eyeball texture (2:1, so the iris stays round on the sphere): the iris sits at the
// centre, which SphereGeometry maps to +x; the eyeball is turned so it looks along +z.
function irisTexture(color) {
  const W = 512, H = 256, cx = W / 2, cy = H / 2, R = 0.5 * W / (2 * Math.PI); // ~0.5 rad iris radius
  const c = canvas(W, H), x = c.getContext('2d'), r = rng(5);
  x.fillStyle = '#eee6da'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(170,60,50,0.25)'; x.lineWidth = 0.8;
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, x0 = cx + Math.cos(a) * W * 0.22, y0 = cy + Math.sin(a) * H * 0.4;
    x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + cx) / 2 + (r() - 0.5) * 30, (y0 + cy) / 2 + (r() - 0.5) * 30, cx + Math.cos(a) * R * 1.4, cy + Math.sin(a) * R * 1.4); x.stroke();
  }
  const g = x.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#0b0a09'); g.addColorStop(0.33, '#0b0a09'); g.addColorStop(0.37, color[0]); g.addColorStop(0.8, color[1]); g.addColorStop(0.97, '#25272c'); g.addColorStop(1, 'rgba(37,39,44,0)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 1;
  for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * R * 0.4, cy + Math.sin(a) * R * 0.4); x.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function hairTexture(base) {
  const c = canvas(256, 512), x = c.getContext('2d'), r = rng(7), col = new THREE.Color(base);
  x.fillStyle = `#${col.getHexString()}`; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 900; i++) {
    const px = r() * 256, l = 80 + r() * 300, py = r() * 512 - 60, s = 0.75 + r() * 0.5;
    x.strokeStyle = `rgba(${Math.min(255, col.r * 255 * s)},${Math.min(255, col.g * 255 * s)},${Math.min(255, col.b * 255 * s)},0.5)`;
    x.lineWidth = 0.8 + r() * 1.4;
    x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + (r() - 0.5) * 20, py + l / 3, px + (r() - 0.5) * 20, py + l * 0.66, px + (r() - 0.5) * 16, py + l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function sculptedHead(look = NPC_LOOK.columbus) {
  const skin = new THREE.Color(look.skin ?? 0xd8a888), hairCol = look.hair ?? 0xb8b0a4;
  const g = new THREE.Group();

  // --- the face
  const geo = new THREE.SphereGeometry(0.1, 128, 96);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), v = new THREE.Vector3(), c = new THREE.Color();
  const lip = new THREE.Color(0xb0645a), cheek = new THREE.Color(0xcf8a78), shadow = new THREE.Color(0x9a6a52), stubble = new THREE.Color(0xa88a76);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const front = shape(v);
    pos.setXYZ(i, v.x, v.y, v.z);
    const { x, y } = v;
    c.copy(skin);
    c.lerp(lip, 0.7 * front * (g2(x, y, 0, -0.0625, 0.0155, 0.0032) + g2(x, y, 0, -0.0715, 0.0145, 0.0038)));
    c.lerp(cheek, 0.35 * front * pair(x, y, 0.045, -0.02, 0.018, 0.018));
    c.lerp(cheek, 0.25 * front * g2(x, y, 0, -0.036, 0.008, 0.008));
    c.lerp(shadow, 0.55 * front * pair(x, y, EYE.x, EYE.y - 0.002, 0.017, 0.011));
    c.lerp(shadow, 0.3 * front * g2(x, y, 0, -0.05, 0.01, 0.0025));
    c.lerp(new THREE.Color(0x6a3a30), 0.75 * front * g2(x, y, 0, -0.0667, 0.017, 0.0011)); // the mouth line
    c.lerp(new THREE.Color(0x3a2018), 0.85 * front * pair(x, y, 0.0075, -0.046, 0.0036, 0.0022));
    c.lerp(shadow, 0.3 * front * pair(x, y, 0.012, -0.022, 0.004, 0.014));
    c.lerp(shadow, 0.35 * front * pair(x, y, 0.025, -0.054, 0.004, 0.014));
    c.lerp(stubble, 0.28 * front * sm(-0.06, -0.09, y) * (1 - g2(x, y, 0, -0.072, 0.02, 0.006)));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });
  const face = new THREE.Mesh(geo, skinMat);
  face.castShadow = face.receiveShadow = true;
  g.add(face);

  // --- eyes: white, iris with a dark pupil; each eye can look at a point
  const white = new THREE.MeshStandardMaterial({ map: irisTexture(['#6f8796', '#4a5e6a']), roughness: 0.12 });
  const lidMat = new THREE.MeshStandardMaterial({ color: skin.clone().multiplyScalar(0.9), roughness: 0.6 });
  const eyes = [];
  for (const s of [-1, 1]) {
    const ex = s * EYE.x, ey = EYE.y, ez = faceZ(ex, ey) - EYE.r * 0.62;
    const ball = new THREE.SphereGeometry(EYE.r, 32, 24);
    ball.rotateY(-Math.PI / 2); // the texture's centre (the iris) from +x to +z
    const eye = new THREE.Mesh(ball, white);
    eye.position.set(ex, ey, ez);
    g.add(eye); eyes.push(eye);
    // upper lid covers the top third, lower lid a sliver; both stay with the head
    const up = new THREE.SphereGeometry(EYE.r * 1.07, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
    up.rotateX(-0.26);
    const upper = new THREE.Mesh(up, lidMat); upper.position.copy(eye.position); g.add(upper);
    const lo = new THREE.SphereGeometry(EYE.r * 1.05, 32, 8, 0, Math.PI * 2, Math.PI * 0.74, Math.PI * 0.26);
    lo.rotateX(0.02);
    const lower = new THREE.Mesh(lo, lidMat); lower.position.copy(eye.position); g.add(lower);
    // brow
    const bz = (bx, by) => faceZ(bx, by) + 0.0015;
    const pts = [[0.011, 0.029], [0.025, 0.033], [0.041, 0.033], [0.054, 0.027]].map(([bx, by]) => new THREE.Vector3(s * bx, by, bz(s * bx, by)));
    const brow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0032, 6), new THREE.MeshStandardMaterial({ color: new THREE.Color(hairCol).multiplyScalar(0.62), roughness: 0.9 }));
    brow.scale.set(1, 1, 1); g.add(brow);
    // ear
    const ear = new THREE.SphereGeometry(0.026, 16, 12);
    ear.scale(0.32, 0.62, 0.42);
    const em = new THREE.Mesh(ear, skinMat.clone()); em.material.vertexColors = false; em.material.color.copy(skin).multiplyScalar(0.95);
    em.position.set(s * 0.083, -0.004, -0.008); em.rotation.y = s * 0.3; g.add(em);
  }
  g.userData.eyes = eyes;

  // --- long grey hair and a dark cap
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: hairTexture(hairCol), roughness: 0.78, side: THREE.DoubleSide });
  const cap = new THREE.SphereGeometry(0.107, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.42);
  cap.scale(0.9, 1.1, 1.08); cap.rotateX(-0.3); cap.translate(0, 0.006, -0.01);
  const capM = new THREE.Mesh(cap, hairMat); capM.castShadow = true; g.add(capM);
  const back = new THREE.CylinderGeometry(0.1, 0.125, 0.19, 48, 6, true, Math.PI * 0.4, Math.PI * 1.2);
  const bp = back.attributes.position;
  for (let i = 0; i < bp.count; i++) { // a softer, uneven hem
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), a = Math.atan2(x, z);
    if (y < -0.09) bp.setY(i, y + 0.012 * Math.sin(a * 7));
    bp.setZ(i, z * 0.98 - (y < 0 ? 0.01 : 0));
  }
  back.computeVertexNormals();
  back.scale(0.98, 1, 1); back.translate(0, -0.075, -0.012);
  const backM = new THREE.Mesh(back, hairMat); backM.castShadow = true; g.add(backM);
  const capMat = new THREE.MeshStandardMaterial({ color: look.hatColor ?? 0x17120f, roughness: 0.85 });
  const crown = new THREE.LatheGeometry([[0, 0.06], [0.07, 0.058], [0.1, 0.045], [0.112, 0.02], [0.112, 0.0], [0.106, -0.008]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
  crown.scale(0.95, 1, 1.05); crown.rotateX(-0.12); crown.translate(0, 0.078, -0.012);
  const crownM = new THREE.Mesh(crown, capMat); crownM.castShadow = true; g.add(crownM);

  g.userData.lookAt = (world) => { for (const e of eyes) e.lookAt(world); };
  return g;
}

// Hands for close-ups: a palm and fingers in one mitten, plus a thumb.
function hand(mat) {
  const g = new THREE.Group();
  const palm = new THREE.CapsuleGeometry(0.032, 0.045, 4, 12); palm.scale(1, 1, 0.42);
  const pm = new THREE.Mesh(palm, mat); pm.position.y = -0.035; g.add(pm);
  const th = new THREE.CapsuleGeometry(0.011, 0.03, 4, 8);
  const tm = new THREE.Mesh(th, mat); tm.position.set(0.028, -0.025, 0.012); tm.rotation.z = 0.6; g.add(tm);
  for (const m of [pm, tm]) m.castShadow = true;
  return g;
}

export function buildColumbus(M) {
  // the NPC's cloak is a tube around the whole body — fine from afar, odd in a close-up; here it hangs from the back only
  const look = NPC_LOOK.columbus, rig = person(M.person, { ...look, cloak: null, vest: 0x3a2a2e });
  const capeGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.15, 32, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  capeGeo.scale(1, 1, 0.75); capeGeo.translate(0, -0.03, -0.02);
  const cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: look.cloak, roughness: 0.85, side: THREE.DoubleSide }));
  cape.castShadow = true; rig.torso.add(cape);
  rig.head.clear();
  const head = sculptedHead(look);
  head.position.y = 0.004;
  rig.head.add(head);
  const handMat = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.6 });
  for (const { fa } of rig.arms) {
    const sphere = fa.children.find((o) => o.isMesh && o.geometry.type === 'SphereGeometry');
    if (sphere) fa.remove(sphere);
    const h = hand(handMat); h.position.y = -0.29; fa.add(h);
  }
  rig.face = head;
  return rig;
}

// Leaning over the table, hands on the chart, looking down at it.
export function poseLean(rig, k = 1) {
  const { torso, head, arms, hip } = rig;
  hip.position.y = 0.95;
  torso.rotation.set(0.42 * k, 0, 0);
  head.rotation.set(0.38 * k, -0.05, 0);
  arms[0].ua.rotation.set(-0.62 * k, 0, -0.18); arms[0].fa.rotation.set(-0.55 * k, 0, 0.1);
  arms[1].ua.rotation.set(-0.7 * k, 0, 0.16); arms[1].fa.rotation.set(-0.45 * k, 0, -0.1);
}
