// Module `world` (Фронт 1): rendering, sea and sky, the ship, NPCs, remote players, colliders.
// API as agreed in docs/front-1-world.md, plus:
//   world.frame(dt)              — update and draw one frame (call from the game loop)
//   world.loadLayout(layout)     — props, interactables and NPCs of the ship (chunk `ship 0,0`)
//   world.entity(id) / world.setEntityState(id, { visible, fill, paused })
//   world.applyEntity(id, state) — server `entity` state: { holder } hides an item, { emptyAt } drives the hourglass
//   world.layout                 — spawn points and night seats from the current layout
//   world.setScene(id)           — the server's scene: Guanahani shows some things only in some scenes
//   world.setFleet(zone, present) — the three ships at anchor off Guanahani (part 2, from 12 October)
//   world.stats()                — numbers for the F3 overlay
// Chunk wiring for Фронт 2 is described at the top of chunks.js.
import * as THREE from 'three';
import { Warriors } from './warriors.js';
import { generateTextures, Materials } from './materials.js';
import { buildShip } from './ship.js';
import {WorldObjects} from './objects.js';
import { buildLayout, applyState, animateProp, MODELS } from './props.js';
import { Island } from './island.js';
import { Environment } from './environment.js';
import { Pipeline } from './pipeline.js';
import { Players } from './players.js';
import { Collider } from './collision.js';
import { Chunks } from './chunks.js';
import { Cutscenes } from './cutscene.js';
import { npcActivity } from '../../../shared/npc-activity.js';
import { prepareNpc, animateNpc, collideNpcs, giveChart } from './npc-animation.js';
import { WorldPatches } from './world-patches.js';
import { Fauna } from './fauna.js';
import { strum } from './people.js';
import canaryLayout from '../../../content/canary_layout.json';
import guanahaniLayout from '../../../content/guanahani_layout.json';
import canaryLod from 'virtual:island-lod';
import guanahaniLod from 'virtual:island-lod/guanahani';

const SMOKE_PUFFS = 8;

export const world = {
  camera: null, scene: null, renderer: null,
  npcs: [], layout: null, shipInteractables: [],
  players: null, chunks: new Chunks(),
  quality: 'high', zone: 'ship', npcScene: { id: 'ship_day' }, npcClockOffset: 0,

  // world.cutscene.play(id, startAt) → Promise (cutscene.js, shots in content/cutscenes.json); real after init()
  cutscene: { play: () => Promise.resolve(), stop() {}, active: false },

  async init(canvas, quality = 'high', { auto = true } = {}) {
    this.quality = quality;
    // the canvas' own MSAA is the cheap way to smooth edges; a context cannot change it later, so `low` at start means no AA
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // карта теней — ещё один проход по сцене: пересчитываем через кадр (frame), а не каждый
    r.shadowMap.autoUpdate = false;
    r.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 12000);
    this.camera.position.set(0.5, 3.6, 8);
    this.scene.add(this.camera);

    const tex = await generateTextures(quality, Math.min(4, r.capabilities.getMaxAnisotropy()));
    this.M = new Materials(tex);
    this.env = new Environment(this.scene, r, this.M, tex, quality);

    const ship = buildShip(this.M);
    this.ship = ship.group;
    this.shipCollider = ship.collider;
    this.env.addSails(ship.sails);
    this.scene.add(this.ship);
    this.zoneRoot = new THREE.Group();
    this.scene.add(this.zoneRoot);

    this.smoke = new THREE.Group();
    this.smokeMat = new THREE.SpriteMaterial({ map: tex.soft.map, color: 0xc9c4bc, transparent: true, depthWrite: false });
    this.scene.add(this.smoke);
    this.cutscene = new Cutscenes(this);

    // The islands, each its own chunk zone: La Gomera (part 1) and Guanahani (part 2). Paths are the static town
    // plan; the terrain itself comes in chunks, the far view from the LOD summary (both count in the 10% budget).
    this.islands = {
      canary: new Island(this.scene, this.M),
      guanahani: new Island(this.scene, this.M, { palette: 'guanahani', veg: ['palm_fan', 'gumbo_limbo', 'sea_grape', 'mangrove', 'rock_lime', 'bush'] }),
    };
    for (const [zone, isl, layout, lod] of [['canary', this.islands.canary, canaryLayout, canaryLod], ['guanahani', this.islands.guanahani, guanahaniLayout, guanahaniLod]]) {
      isl.setPaths(layout.paths);
      isl.setLod(lod);
      this.chunks.setBuilder(zone, isl);
      this.chunks.setStaticData(`island-lod:${zone}`, lod.byteLength ?? 0);
      this.chunks.setStaticData(`paths:${zone}`, new TextEncoder().encode(JSON.stringify(layout.paths ?? [])).length);
    }
    this.chunks.setBuilder('ship', { add: (key, data) => this.loadLayout(data), remove: () => this.unloadLayout(), setVisible: () => {} });

    this.objects = new WorldObjects(this);
    this.players = new Players(this.scene, this.M);
    this.warriors = new Warriors(this.scene, this.M); // бой на Гуанахани: воины таино (docs/tz-combat.md)
    this.fauna = new Fauna(this, { layouts: { canary: canaryLayout } }); // жители и животные (fauna.js): маршруты от общего времени, реакции на world_event
    this.chunks.deferBuild = true; // чанки острова строятся по нескольку за кадр (chunks.drain в frame)
    this.env.mirrorHide.push(this.zoneRoot, this.smoke, this.players.group);
    this.patches = new WorldPatches(this);
    this.pipeline = new Pipeline(r, this.scene, this.camera);
    this.pipeline.build(quality);
    this.collider = new Collider(this.shipCollider);
    addEventListener('resize', () => this.pipeline.resize());

    this.fps = { frames: 0, time: 0, value: 0, auto, probe: { from: 1, to: 4, frames: 0, time: 0 }, clock: 0 };
    this.setZone(this.zone);
    return this;
  },

  loadLayout(layout) {
    this.layout = layout;
    this.zoneRoot.clear();
    this.smoke.clear();
    const built = buildLayout(this.M, layout);
    this.zoneRoot.add(built.decor, ...built.interactables, ...built.npcs);
    this.shipInteractables = [...built.interactables, ...built.npcs];
    this.npcs = built.npcs;
    for (const npc of this.npcs) {
      prepareNpc(npc);
      for (const field of ['paused','speaker','behavior','performance']) npc.userData[field] = npc.userData.definition.state?.[field] ?? null;
    }
    // Columbus keeps a chart of his own: when a player takes the one from the table, he reads that one
    const columbus = this.npcs.find((n) => n.userData.id === 'columbus');
    if (columbus) giveChart(columbus, MODELS.map(this.M).obj);
    this.updateNpcs(0);
    this.env.lamps = [];
    this.env.addLamps(built.lamps);
    for (const p of built.smoke) for (let i = 0; i < SMOKE_PUFFS; i++) {
      const s = new THREE.Sprite(this.smokeMat.clone());
      s.userData = { base: p, phase: i / SMOKE_PUFFS };
      this.smoke.add(s);
    }
    this.collider = new Collider([...this.shipCollider, ...built.col]);
    this.objects?.loaded();
    this.patches?.invalidate();
  },

  unloadLayout() {
    this.zoneRoot.clear();
    this.smoke.clear();
    this.shipInteractables = [];
    this.npcs = [];
    this.env.lamps = [];
    this.collider = new Collider(this.shipCollider);
  },

  // the island of the current zone (null on the ship)
  get island() { return this.islands?.[this.zone] ?? null; },

  // what the player can use right now: the ship's or the island's visible chunks'
  get interactables() { return [...(this.island ? this.island.interactables : this.shipInteractables),...(this.objects?.selectable??[]),...(this.warriors?.targets??[])]; },

  // `combat` сервера: ступень деревни и воины
  applyCombat(message) { this.warriors?.apply(message); },

  // world_patch: предметы и декор (сухари, товар, бочки, брошенное игроками) — WorldObjects Санджара;
  // изменения корабля и неба (паруса, флаг, фонари, туман) — WorldPatches
  applyPatch(message) { this.objects?.applyPatch(message); this.patches?.apply(message); },

  entity(id) {
    return this.shipInteractables.find((o) => o.userData.id === id) ?? this.island?.interactables.find((o) => o.userData.id === id) ?? this.objects?.records.get(id)?.obj ?? null;
  },

  applyEntity(id, state) {
    const o = this.entity(id);
    if (o) applyState(o, state);
    this.objects?.applyEntity(id,state);
  },

  setEntityState(id, state) {
    const o = this.entity(id);
    if (!o) return;
    if ('visible' in state) { o.userData.held = !state.visible; o.visible = state.visible && !o.userData.offScene; }
    for (const field of ['paused','speaker','behavior','performance']) if (field in state) o.userData[field] = state[field];
    if ('down' in state) o.userData.downUntil = state.down; // житель таино лежит после ударов до этого времени (сервера)
    if ('fill' in state) o.userData.setFill?.(state.fill);
  },

  setZone(zone) {
    this.zone = zone;
    this.objects?.setZone(zone);
    this.players?.setZone(zone);
    this.warriors?.setZone(zone);
    this.patches?.invalidate();
    const ship = zone === 'ship';
    this.ship.visible = ship; this.zoneRoot.visible = ship; this.smoke.visible = ship;
    for (const [name, isl] of Object.entries(this.islands)) isl.group.visible = zone === name;
    this.env.setZone(zone);
    this.env.setShore({ canary: canaryLod, guanahani: guanahaniLod }[zone] ?? null);
    this.players.setLooks(zone === 'guanahani' ? 'taino' : 'crew'); // part 2: the players are villagers
    this.chunks.setZone(zone);
  },

  // the server's scene: on Guanahani some things are there only in some scenes (layout `scenes`)
  setScene(id) { for (const isl of Object.values(this.islands)) isl.setScene(id); },

  setTimeOfDay(t, immediate = false) { this.env.setTimeOfDay(t, immediate); },
  // the three ships at anchor off an island (Guanahani: from the morning of 12 October)
  setFleet(zone, present) { this.env.setFleet(zone, present); },

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.env.setQuality(q);
    this.pipeline.build(q);
  },

  collide(capsule) {
    // другие игроки — как NPC: круг 0.3 м, сквозь друг друга не пройти
    const others = this.players ? [...this.players.map.values()].map((p) => p.rig.root) : [];
    if (this.island) { const pushed=collideNpcs(others,capsule);const result=this.island.collide(capsule);result.delta.add(pushed);const delta=this.objects?.collide(capsule);if(delta)result.delta.add(delta);return result; }
    const start = capsule.start.clone();
    collideNpcs(this.npcs, capsule);
    collideNpcs(others, capsule);
    const result = this.collider.collide(capsule);
    this.objects?.collide(capsule);
    result.delta.copy(capsule.start).sub(start);
    return result;
  },

  setNpcScene(scene) {
    this.npcScene = { id: scene.id, startAt: scene.startAt };
    if (Number.isFinite(scene.progress?.serverNow)) this.npcClockOffset = scene.progress.serverNow - Date.now();
    this.updateNpcs(0);
  },

  updateNpcs(dt) {
    const seconds = (Date.now() + this.npcClockOffset) / 1000;
    const chartTaken = this.entity('map')?.visible === false;
    if (this.zone === 'ship') {
      for (const npc of this.npcs) animateNpc(npc, dt, seconds, this.env.t >= 0.82, this.npcScene, chartTaken, this.camera.position);
    } else {
      for (const npc of this.island?.interactables ?? []) if(npc.userData.kind==='npc'&&npc.userData.definition) {
        const state=npcActivity(npc.userData.definition,seconds,this.npcScene,npc.userData.paused);
        npc.rotation.y=state.r+Math.PI;
      }
    }
  },
  // Жители острова после трёх ударов лежат навзничь, потом встают (статичные фигуры — наклоном целиком)
  updateDowned() {
    const now = Date.now() + this.npcClockOffset;
    for (const o of this.island?.interactables ?? []) {
      const u = o.userData;
      if (u.kind !== 'npc' || (!u.downUntil && !u.lying)) continue;
      const lying = u.downUntil > now;
      if (lying === !!u.lying) continue;
      u.lying = lying;
      o.rotation.order = 'YXZ';
      o.rotation.x = lying ? -Math.PI / 2 : 0;
      o.position.y = (u.baseY ?? o.position.y) + (lying ? 0.18 : 0);
    }
  },
  groundHeight(x, z, fromY) { return this.island ? this.island.groundHeight(x, z, fromY) : this.collider.groundHeight(x, z, fromY); },

  frame(dt) {
    dt = Math.min(dt, 0.1);
    this.cutscene.update?.(dt); // takes the camera while a cutscene runs
    this.env.update(dt, this.cutscene.shadowFocus ?? this.camera.position);
    this.chunks.drain?.();
    this.island?.refresh();
    this.patches?.update();
    this.patches?.flutter(performance.now() / 1000);
    this.players.update(dt);
    this.warriors.update(dt);
    this.updateNpcs(dt);
    this.updateDowned();
    this.objects?.update();
    for(const o of this.interactables)if(!this.objects?.records.has(o.userData.id))animateProp(o,Date.now()+(this.objects?.clockOffset??0));
    this.updateSmoke(dt);
    if (!this.cutscene.active) this.fauna?.update(dt);
    this.renderer.info.reset();
    this.frameNo = (this.frameNo ?? 0) + 1;
    if (this.frameNo % 2 === 1) this.renderer.shadowMap.needsUpdate = true;
    this.pipeline.render(this.env.bloom);
    this.measure(dt);
  },

  updateSmoke(dt) {
    const light = 0.12 + 0.88 * this.env.daylight;
    for (const s of this.smoke.children) {
      const u = s.userData;
      u.phase = (u.phase + dt * 0.12) % 1;
      const t = u.phase;
      s.position.set(u.base.x + Math.sin(t * 9 + u.base.x) * 0.15 * t * 4, u.base.y + t * 4.5, u.base.z - t * 2.5);
      s.scale.setScalar(0.4 + t * 2.4);
      s.material.opacity = 0.5 * (1 - t) * Math.min(1, t * 6);
      s.material.color.setRGB(0.79 * light, 0.77 * light, 0.74 * light);
    }
  },

  // Автокачество (F1.1): кадры ограничены (fpsCap — сколько просили нарисовать, game/frame-limit.js).
  // Не успеваем нарисовать и 70% от просимого за окно в 4 с (первое — с 1-й по 4-ю секунду,
  // дальше — всю игру: ноут греется и сбрасывает частоту) → «низкое». Назад само не поднимается.
  measure(dt) {
    const f = this.fps;
    f.frames++; f.time += dt; f.clock += dt;
    if (f.time >= 0.5) { f.value = f.frames / f.time; f.frames = 0; f.time = 0; }
    const pr = f.probe;
    if (!f.auto || !pr || f.clock <= pr.from || this.quality === 'low') return;
    pr.frames++; pr.time += dt;
    if (pr.cap !== this.fpsCap) { pr.cap = this.fpsCap; pr.frames = 0; pr.time = 0; return; } // открыли меню — меряем заново
    if (pr.time < 4) return;
    const avg = pr.frames / pr.time, want = Math.min(this.fpsCap ?? 60, 60);
    if (avg < want * 0.7) { console.info(`[world] ${avg.toFixed(0)} из ${want} FPS → low`); this.setQuality('low'); }
    pr.frames = 0; pr.time = 0;
  },

  stats() {
    const i = this.renderer.info.render;
    return { fps: this.fps.value, calls: i.calls, triangles: i.triangles, quality: this.quality, tod: this.env.t, chunks: this.chunks.stats() };
  },
};
