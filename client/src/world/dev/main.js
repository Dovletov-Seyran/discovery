// Stand-alone page for working on the world without the server: /world-dev.html
// The real first-person controller, HUD and networking belong to Фронт 2; this is just enough to walk around.
//   ?zone=canary|guanahani  start on an island (Z cycles ship → La Gomera → Guanahani); chunks from dev/fakeServer.js
//   ?q=low|high|ultra   start on this preset (otherwise high with auto-detect)
//   ?tod=0.72    time of day
//   ?bots=2      fake remote players walking in circles (tests interpolation)
//   ?cam=x,y,z,yaw,pitch   fixed camera, no controls (for screenshots)
//   ?bench       measure every preset on this machine (see bench.js)
// Keys: C plays cut_canary (from the ship to the pier of La Gomera), V plays cut_evening (back to sea at sunset),
//   N plays cut_night (dusk, calm and fog, down to the lantern), P opens part 2 (p2_prologue on Guanahani),
//   L the night alarm (p2_alarm).
import * as THREE from 'three';
import { world } from '../index.js';
import layout from '../../../../content/ship_layout.json';
import guanahani from '../../../../content/guanahani_layout.json';
import { createFakeServer } from './fakeServer.js';

const P = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const BENCH = P.has('bench');
await world.init($('c'), P.get('q') ?? 'high', { auto: !P.get('q') && !BENCH });
// chunks: the same messages the server would send, produced locally
const fake = createFakeServer(
  // like the server: chunks around the player, not the camera (the bench and ?cam= fly the camera alone)
  () => ({ zone: world.zone, p: BENCH || P.has('cam') ? world.camera.position.toArray() : [feet.x, feet.y, feet.z] }),
  (m) => (m.t === 'chunk' ? world.chunks.receive(m.zone, m.key, m.data) : world.chunks.denied(m.zone, m.key, m.reason)),
);
world.chunks.setWorldMeta(fake.meta);
world.chunks.setSender(fake.handle);
world.setTimeOfDay(+(P.get('tod') ?? 0.4), true);
$('loading').remove();
window.world = world;
if (BENCH) {
  const { runBench } = await import('./bench.js');
  const out = $('stats');
  out.style.display = 'block'; out.style.fontSize = '14px'; $('help').remove(); $('dot').remove();
  await runBench(world, out);
}

// --- player ---------------------------------------------------------------
const RADIUS = 0.3, EYE = 1.62;
const feet = new THREE.Vector3(), vel = new THREE.Vector3();
let yaw = 0, pitch = 0, onGround = false;
const keys = new Set();
// where to stand on each island: La Gomera — the square facing the church; Guanahani — the batey facing the cacique's house
const TOWNS = { canary: [252, 300, 0], guanahani: [168, 262, 0] };
let TOWN = TOWNS.canary;
function spawn(role = 'piloto') {
  if (world.zone !== 'ship') { TOWN = TOWNS[world.zone]; feet.set(TOWN[0], fake.heightAt(TOWN[0], TOWN[1]) + 0.3, TOWN[1]); yaw = TOWN[2]; }
  else { const { p, r } = layout.spawns[role]; feet.set(p[0], p[1] + 0.05, p[2]); yaw = r; }
  pitch = -0.05; vel.set(0, 0, 0);
  world.camera.position.set(feet.x, feet.y + EYE, feet.z);
}
function setZone(zone) { world.setZone(zone); spawn(); }
// for screenshots from the console: dev.go(x, z, yaw, pitch)
window.dev = { go: (x, z, y = 0, p = 0) => { feet.set(x, (world.groundHeight(x, z) ?? fake.heightAt(x, z)) + 0.1, z); yaw = y; pitch = p; vel.set(0, 0, 0); } };
setZone(TOWNS[P.get('zone')] ? P.get('zone') : 'ship');

const fixedCam = P.get('cam')?.split(',').map(Number);
const canvas = $('c');
canvas.addEventListener('click', () => !fixedCam && canvas.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.45, 1.45);
});

const TODS = [0.4, 0.58, 0.72, 0.85, 0.95];
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'F3') { e.preventDefault(); const s = $('stats'); s.style.display = s.style.display === 'block' ? 'none' : 'block'; }
  if (e.code === 'KeyT') { const i = TODS.findIndex((t) => t > world.env.target + 0.01); world.setTimeOfDay(TODS[i < 0 ? 0 : i]); }
  if (e.code === 'KeyQ') world.setQuality({ low: 'high', high: 'ultra', ultra: 'low' }[world.quality]);
  if (e.code === 'Digit1') spawn('grumete');
  if (e.code === 'Digit2') spawn('piloto');
  if (e.code === 'Digit3') spawn('lengua');
  if (e.code === 'KeyE' && target) interact(target);
  if (e.code === 'KeyZ') setZone({ ship: 'canary', canary: 'guanahani', guanahani: 'ship' }[world.zone]);
  // as in the game: the server's cut_canary moves everyone to the pier at once and switches the zone
  if (e.code === 'KeyC' && !world.cutscene.active) {
    world.setZone('canary');
    feet.set(256, 1.55, 328); yaw = 0; pitch = 0; vel.set(0, 0, 0);
    world.cutscene.play('cut_canary');
  }
  // the farewell to La Gomera: the server moves everyone onto the deck at the start of cut_evening
  if (e.code === 'KeyV' && !world.cutscene.active) {
    world.setZone('ship');
    const { p, r } = layout.spawns.piloto; feet.set(p[0], p[1] + 0.05, p[2]); yaw = r; pitch = 0; vel.set(0, 0, 0);
    world.cutscene.play('cut_evening');
  }
  // the calm before the story: the server seats everyone at the lantern when cut_night starts
  if (e.code === 'KeyN' && !world.cutscene.active) {
    world.setZone('ship');
    const { p, r } = layout.seats[1]; feet.set(p[0], p[1] + 0.05, p[2]); yaw = r; pitch = 0; vel.set(0, 0, 0);
    world.cutscene.play('cut_night');
  }
  // part 2 opens: the ships at dawn from above, the title, waking up in a hammock in one's own bohío
  if (e.code === 'KeyP' && !world.cutscene.active) {
    world.setZone('guanahani');
    const { p, r } = guanahani.spawns.grumete; feet.set(p[0], fake.heightAt(p[0], p[1], 'guanahani') + 0.05, p[1]); yaw = r; pitch = 0; vel.set(0, 0, 0);
    world.cutscene.play('p2_prologue');
  }
  if (e.code === 'KeyL' && !world.cutscene.active) { // the night alarm: lights on the sea
    world.setZone('guanahani');
    const { p, r } = guanahani.spawns.grumete; feet.set(p[0], fake.heightAt(p[0], p[1], 'guanahani') + 0.05, p[1]); yaw = r; pitch = 0; vel.set(0, 0, 0);
    world.cutscene.play('p2_alarm');
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));

const cap = { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: RADIUS };
function move(dt) {
  const speed = keys.has('ShiftLeft') ? 5.5 : 3;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const wish = new THREE.Vector3(s, 0, -f);
  if (wish.lengthSq()) wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(speed);
  vel.x = wish.x; vel.z = wish.z;
  // nothing to stand on until the chunk under us has arrived
  if (world.groundHeight(feet.x, feet.z) === null) { vel.set(0, 0, 0); return; }
  vel.y = onGround && keys.has('Space') ? 5 : vel.y - 20 * dt;
  const steps = 4;
  onGround = false;
  for (let i = 0; i < steps; i++) {
    feet.addScaledVector(vel, dt / steps);
    cap.start.set(feet.x, feet.y + RADIUS, feet.z);
    cap.end.set(feet.x, feet.y + EYE - 0.15, feet.z);
    const res = world.collide(cap);
    feet.set(cap.start.x, cap.start.y - RADIUS, cap.start.z);
    if (res.onGround) { onGround = true; vel.y = Math.max(0, vel.y); }
    else if (res.delta.y < -1e-4) vel.y = Math.min(0, vel.y);
  }
  if (feet.y < -12) spawn();
}

// --- interaction (demo only: the server decides in the real game) ----------
let target = null;
const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
function findTarget() {
  world.camera.getWorldDirection(fwd);
  let best = null, bestScore = 0;
  for (const o of world.interactables) {
    if (!o.visible) continue;
    o.getWorldPosition(tmp); tmp.y += o.userData.kind === 'npc' ? 1.3 : 0.15;
    const to = tmp.sub(world.camera.position), d = to.length();
    if (d > 2.6) continue;
    const score = to.normalize().dot(fwd) - d * 0.05;
    if (score > 0.8 && score > bestScore) { best = o; bestScore = score; }
  }
  return best;
}
function interact(o) {
  const { id, kind, label } = o.userData;
  // what the server would answer with an `entity` message
  if (kind === 'hourglass') world.applyEntity(id, { emptyAt: Date.now() + 60000 });
  if (kind === 'item') world.applyEntity(id, { holder: 'me' });
  console.info('[dev] interact', id, label);
}

// --- fake remote players ---------------------------------------------------
const bots = +(P.get('bots') ?? 0);
const ROLES = ['grumete', 'lengua', 'piloto'];
for (let i = 0; i < bots; i++) world.players.upsert('bot' + i, { name: ['Педро', 'Луис', 'Хуан'][i % 3], role: ROLES[i % 3] });
let botClock = 0, botSent = 0;
function updateBots(dt) {
  botClock += dt;
  if (!bots || botClock - botSent < 1 / 15) return;
  botSent = botClock;
  const list = [];
  for (let i = 0; i < bots; i++) {
    const a = botClock * 0.35 + i * 2.1, x = Math.cos(a) * 1.4, z = -3.2 + Math.sin(a) * 1.6;
    const p = world.zone === 'ship' ? [x, 0, z] : [TOWN[0] + x * 3, fake.heightAt(TOWN[0] + x * 3, TOWN[1] - 6 + z * 3), TOWN[1] - 6 + z * 3];
    list.push({ id: 'bot' + i, p, r: Math.PI - a, a: 'walk' });
  }
  world.players.snapshot(list, Date.now());
}

// --- loop ---------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (fixedCam) {
    const [x, y, z, yw, pt] = fixedCam;
    world.camera.position.set(x, y, z);
    world.camera.rotation.set(pt ?? 0, yw ?? 0, 0, 'YXZ');
  } else {
    move(dt);
    world.camera.position.set(feet.x, feet.y + EYE, feet.z);
    world.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  world.chunks.update(world.camera.position, dt);
  updateBots(dt);
  world.frame(dt);
  target = fixedCam ? null : findTarget();
  const pr = $('prompt');
  pr.style.display = target ? 'block' : 'none';
  if (target) pr.textContent = `E — ${target.userData.label}`;
  if ($('stats').style.display === 'block') {
    const s = world.stats();
    $('stats').textContent = `${s.fps.toFixed(0)} FPS · ${s.quality}\n${s.calls} draw calls · ${(s.triangles / 1000).toFixed(0)}k tris\ntod ${s.tod.toFixed(2)} · ${feet.x.toFixed(1)}, ${feet.y.toFixed(2)}, ${feet.z.toFixed(1)}\nМир: ${s.chunks.loaded}/${s.chunks.total} чанков (${s.chunks.pct.toFixed(1)}%) · ${(s.chunks.bytes / 1024).toFixed(0)} КБ / ${(s.chunks.totalBytes / 1024).toFixed(0)} КБ`;
  }
  requestAnimationFrame(loop);
}
if (!BENCH) requestAnimationFrame(loop);
