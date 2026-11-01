// Module `world` (Фронт 1): rendering, sea and sky, the ship, NPCs, remote players, colliders.
// API as agreed in docs/front-1-world.md, plus:
//   world.frame(dt)              — update and draw one frame (call from the game loop)
//   world.loadLayout(layout)     — props, interactables and NPCs of the ship (chunk `ship 0,0`)
//   world.entity(id) / world.setEntityState(id, { visible, fill })
//   world.applyEntity(id, state) — server `entity` state: { holder } hides an item, { emptyAt } drives the hourglass
//   world.layout                 — spawn points and night seats from the current layout
//   world.stats()                — numbers for the F3 overlay
// Chunk wiring for Фронт 2 is described at the top of chunks.js.
import * as THREE from 'three';
import { generateTextures, Materials } from './materials.js';
import { buildShip } from './ship.js';
import {WorldObjects} from './objects.js';
import { buildLayout, applyState, animateProp } from './props.js';
import { Island } from './island.js';
import { Environment } from './environment.js';
import { Pipeline } from './pipeline.js';
import { Players } from './players.js';
import { Collider } from './collision.js';
import { Chunks } from './chunks.js';
import {paths as canaryPaths} from '../../../content/canary_layout.json';
import { Cutscenes } from './cutscene.js';
import { npcActivity } from '../../../shared/npc-activity.js';
import { prepareNpc, animateNpc, collideNpcs } from './npc-animation.js';
import islandLod from 'virtual:island-lod';

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

    this.island = new Island(this.scene, this.M);
    this.island.setPaths(canaryPaths); // static town plan; the terrain itself comes in chunks
    this.island.setLod(islandLod);
    this.chunks.setStaticData('island-lod',islandLod.byteLength);
    this.chunks.setStaticData('paths',new TextEncoder().encode(JSON.stringify(canaryPaths)).length);
    this.chunks.setBuilder('ship', { add: (key, data) => this.loadLayout(data), remove: () => this.unloadLayout(), setVisible: () => {} });
    this.chunks.setBuilder('canary', this.island);

    this.objects = new WorldObjects(this);
    this.players = new Players(this.scene, this.M);
    this.env.mirrorHide.push(this.zoneRoot, this.smoke, this.players.group);
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
      for (const field of ['paused','speaker','behavior']) npc.userData[field] = npc.userData.definition.state?.[field] ?? null;
    }
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
  },

  unloadLayout() {
    this.zoneRoot.clear();
    this.smoke.clear();
    this.shipInteractables = [];
    this.npcs = [];
    this.env.lamps = [];
    this.collider = new Collider(this.shipCollider);
  },

  // what the player can use right now: the ship's or the island's visible chunks'
  get interactables() { return [...(this.zone === 'ship' ? this.shipInteractables : this.island.interactables),...(this.objects?.selectable??[])]; },

  applyPatch(message) { this.objects?.applyPatch(message); },

  entity(id) {
    return this.shipInteractables.find((o) => o.userData.id === id) ?? this.island.interactables.find((o) => o.userData.id === id) ?? this.objects?.records.get(id)?.obj ?? null;
  },

  applyEntity(id, state) {
    const o = this.entity(id);
    if (o) applyState(o, state);
    this.objects?.applyEntity(id,state);
  },

  setEntityState(id, state) {
    const o = this.entity(id);
    if (!o) return;
    if ('visible' in state) o.visible = state.visible;
    for (const field of ['paused','speaker','behavior']) if (field in state) o.userData[field] = state[field];
    if ('fill' in state) o.userData.setFill?.(state.fill);
  },

  setZone(zone) {
    this.zone = zone;
    this.objects?.setZone(zone);
    const ship = zone === 'ship';
    this.ship.visible = ship; this.zoneRoot.visible = ship; this.smoke.visible = ship;
    this.island.group.visible = zone === 'canary';
    this.env.setZone(zone);
    this.chunks.setZone(zone);
  },

  setTimeOfDay(t, immediate = false) { this.env.setTimeOfDay(t, immediate); },

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.env.setQuality(q);
    this.pipeline.build(q);
  },

  collide(capsule) {
    if (this.zone === 'canary') { const result=this.island.collide(capsule);const delta=this.objects?.collide(capsule);if(delta)result.delta.add(delta);return result; }
    const start = capsule.start.clone();
    collideNpcs(this.npcs, capsule);
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
    if (this.zone === 'ship') {
      for (const npc of this.npcs) animateNpc(npc, dt, seconds, this.env.t >= 0.82, this.npcScene);
    } else {
      for (const npc of this.island?.interactables ?? []) if(npc.userData.kind==='npc') {
        const state=npcActivity(npc.userData.definition,seconds,this.npcScene,npc.userData.paused);
        npc.rotation.y=state.r+Math.PI;
      }
    }
  },
  groundHeight(x, z, fromY) { return this.zone === 'canary' ? this.island.groundHeight(x, z, fromY) : this.collider.groundHeight(x, z, fromY); },

  frame(dt) {
    dt = Math.min(dt, 0.1);
    this.cutscene.update?.(dt); // takes the camera while a cutscene runs
    this.env.update(dt, this.cutscene.shadowFocus ?? this.camera.position);
    this.island.refresh();
    this.players.update(dt);
    this.updateNpcs(dt);
    this.objects?.update();
    for(const o of this.interactables)if(!this.objects?.records.has(o.userData.id))animateProp(o,Date.now()+(this.objects?.clockOffset??0));
    this.updateSmoke(dt);
    this.renderer.info.reset();
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

  // F1.1: measure FPS between seconds 1 and 4; below 45 → drop to low
  measure(dt) {
    const f = this.fps;
    f.frames++; f.time += dt; f.clock += dt;
    if (f.time >= 0.5) { f.value = f.frames / f.time; f.frames = 0; f.time = 0; }
    const pr = f.probe;
    if (f.auto && pr && f.clock > pr.from) {
      pr.frames++; pr.time += dt;
      if (f.clock > pr.to) {
        const avg = pr.frames / pr.time;
        if (avg < 45 && this.quality !== 'low') { console.info(`[world] ${avg.toFixed(0)} FPS → low`); this.setQuality('low'); }
        f.probe = null;
      }
    }
  },

  stats() {
    const i = this.renderer.info.render;
    return { fps: this.fps.value, calls: i.calls, triangles: i.triangles, quality: this.quality, tod: this.env.t, chunks: this.chunks.stats() };
  },
};
