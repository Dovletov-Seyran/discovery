// Intro cutscene «Книга Марко Поло» (scene `intro`): picture only — voice and music are Бэк 2's.
// Six panels (content-part1.md §4.1), each a slow camera move in the world's own graphics:
//   1 the book opens on Cipangu's golden roofs · 2 the Silk Road · 3 Constantinople, 1453 ·
//   4 Columbus over his chart · 5 the chart: the ocean, and an unknown land with a question mark ·
//   6 the three ships at sea in the low sun.
//
//   const intro = createIntro(world);           // after `await world.init(...)`
//   intro.onPanel = (i) => { … };               // 0..5, e.g. to start that panel's voice line and subtitle
//   await intro.play({ startAt, duration });    // startAt from the server's `scene` message; duration 90 (45 in demo)
//   intro.stop();                               // skip: fades out and resolves play()
// While it plays the intro owns the canvas: do not call world.frame().
import * as THREE from 'three';
import { Pipeline } from '../world/pipeline.js';
import { Study, TABLE } from './study.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V = (a) => new THREE.Vector3(...a);
const FADE = 0.9; // seconds of fade at a cut

// Camera moves. p — position, l — look-at point; study space for panels 1–5, the world's ship space for 6.
const SHOTS = [
  { scene: 'study', from: { p: [-0.42, 1.66, 0.84], l: [-0.45, TABLE, 0.1] }, to: { p: [-0.43, 1.34, 0.47], l: [-0.45, TABLE, 0.09] }, cutIn: true },
  { scene: 'study', from: { p: [-0.38, 1.32, 0.44], l: [-0.36, TABLE, 0.1] }, to: { p: [-0.3, 1.25, 0.37], l: [-0.32, TABLE, 0.07] } },
  { scene: 'study', from: { p: [-0.29, 1.27, 0.4], l: [-0.33, TABLE, 0.09] }, to: { p: [-0.36, 1.21, 0.33], l: [-0.34, TABLE, 0.07] }, cutOut: true },
  { scene: 'study', from: { p: [0.95, 1.86, 1.12], l: [0.1, 1.2, -0.28] }, to: { p: [0.3, 1.3, 0.3], l: [0.15, 1.58, -0.33] }, cutIn: true, cutOut: true },
  { scene: 'study', from: { p: [0.26, 1.78, 0.5], l: [0.23, TABLE, 0.02] }, to: { p: [0.2, 1.42, 0.3], l: [0.21, TABLE, 0.0] }, cutIn: true, cutOut: true },
  { scene: 'sea', from: { p: [-34, 4.2, 42], l: [0, 4.5, -28] }, to: { p: [-26, 3.4, 31], l: [3, 5, -32] }, cutIn: true, cutOut: true },
];

export function createIntro(world) {
  const r = world.renderer, M = world.M;
  const study = new Study(M, r);
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.02, 40);
  const pipe = new Pipeline(r, study.scene, cam);
  let fadeEl = null, raf = 0, last = 0, playing = null, panel = -1, saved = null;

  const intro = {
    onPanel: null,
    durations: null,

    // Draw one moment: panel i at progress k (0..1), dt for animated things (candle, sea).
    render(i, k, dt = 1 / 60) {
      const s = SHOTS[i], e = sm(0, 1, k), el = r.domElement;
      // follow the canvas size (window resize, devtools, a phone turned sideways)
      if (el.clientWidth !== this.w || el.clientHeight !== this.h) {
        this.w = el.clientWidth; this.h = el.clientHeight;
        pipe.resize(); world.pipeline.resize();
      }
      if (s.scene === 'study') {
        this.studyState(i, k);
        study.update(dt);
        cam.position.lerpVectors(V(s.from.p), V(s.to.p), e);
        cam.lookAt(V(s.from.l).lerp(V(s.to.l), e));
        r.toneMappingExposure = 0.95;
        if (pipe.quality !== world.quality) pipe.build(world.quality);
        pipe.render(0);
      } else {
        this.seaState();
        const c = world.camera;
        c.position.lerpVectors(V(s.from.p), V(s.to.p), e);
        c.lookAt(V(s.from.l).lerp(V(s.to.l), e));
        world.env.update(dt, c.position);
        world.pipeline.render(world.env.bloom);
      }
    },

    studyState(i, k) {
      const { book, columbus, unknown, dividers } = study;
      if (i === 0) { book.setSpread(0); book.open(sm(0.1, 0.55, k)); }
      if (i === 1) { book.open(1); book.flip(0, sm(0.04, 0.32, k)); }
      if (i === 2) { book.open(1); book.flip(1, sm(0.04, 0.32, k)); }
      if (i >= 3) { book.open(1); book.setSpread(2); }
      columbus.root.visible = i >= 3;
      unknown.material.opacity = i === 4 ? 0.95 * sm(0.3, 0.75, k) : 0;
      // the dividers step from the Canaries towards Cipangu
      const walk = i === 4 ? sm(0.05, 0.6, k) : 0, steps = walk * 4;
      // standing on their points, hinge up, turning about the vertical with each step
      dividers.position.set(0.41 - walk * 0.32, TABLE + 0.162, 0.004);
      dividers.rotation.set(0, Math.PI / 2 + steps * Math.PI, 0);
      dividers.userData.spread(0.24 + 0.05 * Math.sin(steps * Math.PI));
      columbus.face.userData.lookAt(new THREE.Vector3(0.2, TABLE, 0.02));
    },

    // The world's sea in the low warm sun, the other two ships brought into the frame.
    seaState() {
      const env = world.env;
      if (!saved) {
        saved = { zone: world.zone, tod: env.target, fleet: env.fleet.map((f) => ({ visible: f.visible, p: f.position.clone(), r: f.rotation.y, base: f.userData.base?.clone() })) };
        world.setZone('ship');
        env.setTimeOfDay(0.71, true);
        const spots = [[14, -56, 0.05], [-16, -92, -0.04]];
        env.fleet.forEach((f, j) => {
          const at = spots[j];
          f.visible = !!at;
          if (!at) return;
          f.position.set(at[0], f.position.y, at[1]); f.rotation.y = at[2];
          f.userData.base = f.position.clone();
        });
      }
    },

    restoreWorld() {
      if (!saved) return;
      const env = world.env;
      world.setZone(saved.zone); // puts the fleet back where the zone keeps it
      env.setTimeOfDay(saved.tod, true);
      saved = null;
    },

    fade(a) {
      if (!fadeEl) {
        fadeEl = document.createElement('div');
        Object.assign(fadeEl.style, { position: 'fixed', inset: '0', background: '#0b0806', pointerEvents: 'none', zIndex: 50, opacity: '1' });
        document.body.appendChild(fadeEl);
      }
      fadeEl.style.opacity = String(a);
    },

    // Where in the intro we are at `t` seconds after startAt → { i, k, local, dur } or null after the end.
    locate(t, durs) {
      let acc = 0;
      for (let i = 0; i < durs.length; i++) {
        if (t < acc + durs[i]) return { i, k: (t - acc) / durs[i], local: t - acc, dur: durs[i] };
        acc += durs[i];
      }
      return null;
    },

    play({ startAt = Date.now(), duration = 90, durations = null } = {}) {
      this.stop(true);
      const durs = durations ?? this.durations ?? SHOTS.map(() => duration / SHOTS.length);
      pipe.build(world.quality);
      this.fade(1);
      panel = -1;
      return (playing = new Promise((resolve) => {
        const finish = () => {
          cancelAnimationFrame(raf); raf = 0;
          this.restoreWorld();
          world.pipeline.resize();
          fadeEl?.remove(); fadeEl = null;
          playing = null; this.stopping = null;
          resolve();
        };
        this._finish = finish;
        last = performance.now();
        const tick = (now) => {
          const dt = Math.min(0.1, (now - last) / 1000); last = now;
          const t = (Date.now() - startAt) / 1000;
          if (t < 0) { this.fade(1); raf = requestAnimationFrame(tick); return; } // waiting for the common start
          const at = this.locate(t, durs);
          if (!at) { finish(); return; }
          if (at.i !== panel) { panel = at.i; this.onPanel?.(panel); }
          const s = SHOTS[at.i];
          // fade in after a cut, fade out before one; the very end fades to black
          let a = 0;
          if (s.cutIn) a = Math.max(a, 1 - at.local / FADE);
          if (s.cutOut) a = Math.max(a, 1 - (at.dur - at.local) / FADE);
          if (this.stopping === 'fading') a = Math.max(a, (now - this.stopAt) / 600);
          this.fade(Math.min(1, a));
          this.render(at.i, at.k, dt);
          if (this.stopping === 'fading' && now - this.stopAt > 650) { finish(); return; }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }));
    },

    // Skip: a short fade, then play() resolves. stop(true) — at once, no fade.
    stop(now = false) {
      if (!playing) return Promise.resolve();
      if (now) { this._finish?.(); return Promise.resolve(); }
      if (!this.stopping) { this.stopping = 'fading'; this.stopAt = performance.now(); }
      return playing;
    },

    get panels() { return SHOTS.length; },
    study,
    camera: cam,
  };
  return intro;
}
