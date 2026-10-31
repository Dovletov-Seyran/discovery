import * as THREE from 'three';
import { furlSails } from './ship.js';
import { ISLAND_MODELS } from './islandModels.js';
import { person, pose, NPC_LOOK } from './people.js';
import CUTSCENES from '../../../content/cutscenes.json';

// 3D cutscenes (F1.8). The camera flies along CatmullRom curves through the key points of content/cutscenes.json
// while the world plays its part: zone and time of day switch behind a dip to black, the fleet glides to its
// anchorage, sails furl, the anchor splashes. Every frame is a pure function of server time (Date.now() − startAt),
// so all players see the same shot and someone who joins late starts in the middle.
// The game keeps calling world.frame(); the cutscene takes the camera inside it, after the game has set it.

const EASE = { linear: (u) => u, inOut: (u) => u * u * (3 - 2 * u), out: (u) => 1 - (1 - u) ** 3 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// piecewise-linear [[t, v], …]
const track = (list, t) => {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1] = list[i], [t0, v0] = list[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
  }
  return list.at(-1)[1];
};
const curve = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');

const SPLASH = 18;

export class Cutscenes {
  constructor(world) {
    this.w = world;
    this.cur = null;
    this.look = new THREE.Vector3();
    this.gamePos = new THREE.Vector3();
    this.gameQuat = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    // the anchor's splash: a few soft sprites thrown up from the bow, then falling back
    this.splash = new THREE.Group();
    for (let i = 0; i < SPLASH; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.smokeMat.map, color: 0xf2f6f8, transparent: true, depthWrite: false }));
      s.userData = { a: (i / SPLASH) * Math.PI * 2 + i * 0.37, up: 5 + (i % 4) * 1.6, out: 1.2 + (i % 3) * 0.9, size: 2.4 + (i % 5) * 0.5 };
      this.splash.add(s);
    }
    this.splash.visible = false;
    world.scene.add(this.splash);
  }

  // → Promise that resolves when the cutscene is over (right away for an unknown id)
  play(id, startAt = Date.now()) {
    const def = CUTSCENES[id];
    this.stop();
    if (!def) { console.warn('[world] no cutscene', id); return Promise.resolve(); }
    const shots = def.shots.map((s) => ({ ...s, cam: curve(s.cam), look: curve(s.look), end: new THREE.Vector3(...s.cam.at(-1)), ease: EASE[s.ease ?? 'inOut'] }));
    // zone / time-of-day switches, each behind a dip to black; a single one may be given as zone/tod/switchAt
    const switches = def.switch ?? [{ at: def.switchAt ?? 0, zone: def.zone, tod: def.tod, focus: def.focus }];
    return new Promise((done) => {
      this.cur = { id, def, shots, switches, next: 0, startAt: startAt ?? Date.now(), done, switched: false, fov: this.w.camera.fov };
      this.setTitle(def);
      this.overlay().root.style.display = 'block';
      document.body.classList.add('cinematic');
      this.w.players.group.visible = false;
    });
  }

  get active() { return !!this.cur; }

  // called by world.frame before anything uses the camera
  update(dt) {
    const c = this.cur;
    if (!c) return;
    const { def } = c, w = this.w, cam = w.camera, t = (Date.now() - c.startAt) / 1000;
    // where the game put its camera this frame (the player's eyes) — the last shot lands there
    this.gamePos.copy(cam.position); this.gameQuat.copy(cam.quaternion);
    if (t >= def.duration) { this.handOver(); return; }

    // behind the black: new zone and time of day, chunks load around the shots, not around the player
    while (c.next < c.switches.length && t >= c.switches[c.next].at) {
      const sw = c.switches[c.next++];
      c.switched = true;
      if (sw.zone && w.zone !== sw.zone) w.setZone(sw.zone);
      if (sw.tod != null) w.setTimeOfDay(sw.tod, true);
      w.chunks.focus = sw.focus ? new THREE.Vector3(sw.focus[0], 0, sw.focus[1]) : null;
    }
    if (c.switched && w.chunks.focus) w.chunks.update(w.chunks.focus, dt);
    if (def.todTrack && c.switched) w.setTimeOfDay(track(def.todTrack, t), true);

    const shot = def.shots.findIndex((s) => t >= s.from && t < s.to);
    if (shot >= 0) {
      const s = c.shots[shot], u = s.ease(clamp01((t - s.from) / (s.to - s.from)));
      s.cam.getPoint(u, cam.position);
      cam.lookAt(s.look.getPoint(u, this.look));
      // shadows centre on where the shot ends, so the last frame has the same shadows as the game's first
      this.shadowFocus = s.end;
      // fov keys may end on "game": back to the player's own lens, so the hand-over does not zoom
      const fov = def.fov ? track(def.fov.map(([k, v]) => [k, v === 'game' ? c.fov : v]), t) : c.fov;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      // the last `blend` seconds glide into each player's own eyes (spawns differ by role); only when the
      // game camera is already near the end of the shot — a player not yet moved there gets the hold instead
      const b = def.blend ?? 0, wgt = EASE.inOut(clamp01((t - (def.duration - b)) / b));
      if (b && wgt > 0 && this.gamePos.distanceTo(c.shots.at(-1).end) < 10) {
        cam.position.lerp(this.gamePos, wgt);
        cam.quaternion.slerp(this.gameQuat, wgt);
      }
    }

    if (c.switched) { this.fleet(def, t); this.rowboat(def, t); }
    this.anchor(def, t);
    this.lamps(def, t);

    const o = this.overlay();
    o.fade.style.opacity = def.fade ? track(def.fade, t) : 0;
    const bars = Math.min(clamp01((t - def.bars.in[0]) / (def.bars.in[1] - def.bars.in[0])), 1 - clamp01((t - def.bars.out[0]) / (def.bars.out[1] - def.bars.out[0])));
    o.top.style.transform = `translateY(${(bars - 1) * 100}%)`;
    o.bottom.style.transform = `translateY(${(1 - bars) * 100}%)`;
    const tt = def.title;
    o.title.style.opacity = tt ? Math.min(clamp01((t - tt.from) / 0.8), clamp01((tt.to - t) / 0.8)) : 0;
  }

  // Ships always make way bow first (no sideways drift). Two kinds of moves:
  //   { run, t } — come to the anchorage: `run` metres astern of it at t[0], there at t[1], gliding to a stop;
  //   { from, to, t } — sail a straight leg [x, z] → [x, z] at an even pace, heading along it.
  // A move only drives its ship between its own t (several per ship are fine).
  fleet(def, t) {
    const env = this.w.env;
    for (const f of def.fleet ?? []) {
      if (t < f.t[0] || (t > f.t[1] && f.until !== 'end')) continue;
      const u = clamp01((t - f.t[0]) / (f.t[1] - f.t[0]));
      if (f.run != null) {
        const [x, z, h] = env.fleet[f.ship].userData.bay, left = f.run * (1 - EASE.out(u));
        env.placeShip(f.ship, x + Math.sin(h) * left, z + Math.cos(h) * left, h);
      } else {
        const dx = f.to[0] - f.from[0], dz = f.to[1] - f.from[1];
        env.placeShip(f.ship, f.from[0] + dx * u, f.from[1] + dz * u, Math.atan2(-dx, -dz));
      }
    }
    // furl: [t0, t1] — furl them; or keys [[t, k], …] with k 1 furled, 0 set
    if (def.furl) {
      const k = typeof def.furl[0] === 'number' ? EASE.inOut(clamp01((t - def.furl[0]) / (def.furl[1] - def.furl[0]))) : EASE.inOut(track(def.furl, t));
      for (const ship of env.fleet) furlSails(ship.userData.sails, k);
    }
  }

  // lanterns lit one after another: { from, step } — lamp i comes up at from + i·step
  lamps(def, t) {
    const l = def.lamps, env = this.w.env;
    if (!l) return;
    env.lampScale = env.lamps.map((_, i) => clamp01((t - l.from - i * l.step) / 0.35));
  }

  // the landing party rows ashore and ties up where the game's boat waits (that one is hidden meanwhile)
  rowboat(def, t) {
    const b = def.boat;
    if (!b) return;
    if (!this.boat) this.boat = this.buildRowboat();
    const u = clamp01((t - b.t[0]) / (b.t[1] - b.t[0])), k = u < 0.85 ? u / 0.85 * 0.92 : 0.92 + EASE.out((u - 0.85) / 0.15) * 0.08;
    const g = this.boat.group, stroke = t * 2.6;
    g.visible = true;
    g.position.set(b.from[0] + (b.to[0] - b.from[0]) * k, b.y + 0.04 * Math.sin(stroke), b.from[1] + (b.to[1] - b.from[1]) * k);
    g.rotation.set(0.03 * Math.sin(stroke + 1), Math.atan2(b.from[0] - b.to[0], b.from[1] - b.to[1]), 0);
    const pull = u < 0.95 ? Math.sin(stroke) : 0; // oars rest once alongside
    for (const r of this.boat.rowers) {
      r.torso.rotation.x = 0.28 * pull;
      for (const { ua, fa } of r.arms) { ua.rotation.x = -1.15 + 0.45 * pull; fa.rotation.x = -0.35; }
    }
    if (b.entity) this.w.setEntityState(b.entity, { visible: false });
  }

  buildRowboat() {
    const M = this.w.M, group = new THREE.Group(), rowers = [];
    group.add(ISLAND_MODELS.boat(M).obj);
    // two sailors on the thwarts, facing aft as rowers do (the model faces +z, the boat moves towards −z)
    for (const [z, look] of [[-0.6, NPC_LOOK.sailor_1], [0.7, NPC_LOOK.sailor_2]]) {
      const rig = person(M.person, look);
      pose(rig, 'sit');
      rig.root.position.set(0, -0.3, z);
      group.add(rig.root);
      rowers.push(rig);
    }
    group.visible = false;
    this.w.scene.add(group);
    return { group, rowers };
  }

  // deterministic in t: every player sees the same drops
  anchor(def, t) {
    const a = def.anchor, tau = a ? t - a.at : -1;
    this.splash.visible = tau >= 0 && tau < 1.6;
    if (!this.splash.visible) return;
    const ship = this.w.env.fleet[a.ship];
    const bow = this.v.set(2.6, -2.2, -10.5).applyMatrix4(ship.matrixWorld); // off the starboard bow, at the waterline
    for (const s of this.splash.children) {
      const { a: ang, up, out, size } = s.userData, k = tau * (0.9 + 0.1 * (up % 1));
      s.position.set(bow.x + Math.cos(ang) * out * k, Math.max(0, up * k - 4.9 * k * k) + 0.1, bow.z + Math.sin(ang) * out * k);
      s.scale.setScalar(size * (1 + tau * 1.4));
      s.material.opacity = 0.85 * (1 - tau / 1.6);
    }
  }

  // The scene is over, but the game moves the player to the spawn only when the server's next scene arrives.
  // Until the camera the game sets lands next to the last shot (or 2.5 s pass), keep showing that last frame —
  // otherwise one frame from the old position (at sea, far from the island) flashes by and the shadows jump.
  handOver() {
    const c = this.cur, cam = this.w.camera, last = c.shots.at(-1);
    if (!c.ended) {
      c.ended = performance.now();
      // the fleet as the game expects it: at anchor in the bay, or under sail at sea (setZone placed those)
      const env = this.w.env, f = c.def.furl;
      if (this.w.zone === 'canary') for (const m of c.def.fleet ?? []) if (m.run != null) { const b = env.fleet[m.ship].userData.bay; env.placeShip(m.ship, b[0], b[1], b[2]); }
      if (f) for (const ship of env.fleet) furlSails(ship.userData.sails, typeof f[0] === 'number' ? 1 : f.at(-1)[1]);
      c.done();
    }
    const near = c.def.blend ? 10 : 4; // with a blend the game camera only has to be close to the shot's end
    if (cam.position.distanceTo(last.end) < near || performance.now() - c.ended > 2500) { this.stop(); return; }
    if (this.w.chunks.focus) this.w.chunks.update(this.w.chunks.focus, 1 / 60);
    cam.position.copy(last.end);
    cam.lookAt(last.look.getPoint(1, this.look));
    this.shadowFocus = last.end;
  }

  // drop everything without resolving (a new cutscene, or the scene moved on)
  stop() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const w = this.w;
    w.chunks.focus = null;
    this.shadowFocus = null;
    if (this.boat) this.boat.group.visible = false;
    if (c.def.boat?.entity) w.setEntityState(c.def.boat.entity, { visible: true });
    w.env.lampScale = null;
    if (w.camera.fov !== c.fov) { w.camera.fov = c.fov; w.camera.updateProjectionMatrix(); }
    w.players.group.visible = true;
    this.splash.visible = false;
    this.overlay().root.style.display = 'none';
    document.body.classList.remove('cinematic');
  }

  // letterbox bars, the dip to black and the title card, over the canvas
  overlay() {
    if (this.dom) return this.dom;
    const el = (css, parent) => { const d = document.createElement('div'); d.style.cssText = css; parent?.appendChild(d); return d; };
    const root = el('position:fixed;inset:0;pointer-events:none;z-index:40;display:none;overflow:hidden');
    const bar = 'position:absolute;left:0;right:0;height:11.5vh;background:#000;transform:translateY(-100%);';
    const top = el(bar + 'top:0', root), bottom = el(bar + 'bottom:0;transform:translateY(100%)', root);
    const fade = el('position:absolute;inset:0;background:#000;opacity:0', root);
    const title = el("position:absolute;left:0;right:0;bottom:15vh;text-align:center;color:#f1e7cf;opacity:0;font-family:'Chronicle','Iowan Old Style',Georgia,serif;text-shadow:0 2px 14px rgba(0,0,0,0.55)", root);
    document.body.appendChild(root);
    this.dom = { root, top, bottom, fade, title };
    return this.dom;
  }

  setTitle(def) {
    const t = def.title, o = this.overlay();
    o.title.innerHTML = '';
    if (!t) return;
    const line = (text, css) => { const d = document.createElement('div'); d.textContent = text; d.style.cssText = css; o.title.appendChild(d); };
    line(t.text, 'font-size:clamp(22px,3.2vw,44px);letter-spacing:0.06em');
    if (t.sub) line(t.sub, 'font-size:clamp(14px,1.6vw,22px);letter-spacing:0.32em;text-transform:uppercase;margin-top:0.5em;opacity:0.85');
  }
}
