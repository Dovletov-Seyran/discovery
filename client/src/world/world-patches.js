import * as THREE from 'three';
import { buildInteract, MODELS } from './props.js';
import { HELD_MODELS } from '../game/held-models.js';
import { Collider } from './collision.js';
import { furlSails } from './ship.js';

// Серверное состояние хранится до загрузки раскладки и восстанавливается при смене зоны.
export class WorldPatches {
  constructor(world) {
    this.world = world; this.states = new Map(); this.spawned = new Map(); this.originals = new Map();
    this.group = new THREE.Group(); world.scene.add(this.group);
  }

  apply({ ops = [], full = false }) {
    if (full) this.clear();
    for (const op of ops) {
      const old = this.states.get(op.id);
      if (op.op === 'remove') {
        this.remove(op.id); this.states.set(op.id, { ...old, ...op });
        if (op.id === 'sails') furlSails(this.world.env.sails, 0);
        if (op.id === 'flag_castile' && this.flag) this.flag.visible = false;
        continue;
      }
      const next = { ...old, ...op, op: old?.op === 'spawn' && op.op === 'set' ? 'spawn' : op.op, state: { ...old?.state, ...op.state } };
      this.states.set(op.id, next);
      if (next.op === 'spawn') { this.remove(op.id); this.spawn(next); }
    }
    this.world.chunks?.setStaticData('world-patches', new TextEncoder().encode(JSON.stringify([...this.states.values()])).length);
    this.update();
  }

  spawn(op) {
    const make = MODELS[op.model] ?? HELD_MODELS[op.model];
    if (!make || !op.p) { console.warn('[world_patch] неизвестная модель', op.model); return; }
    const item = { id: op.id, m: op.model, p: op.p, r: op.r ?? 0, kind: op.kind, item: op.state?.item, label: op.state?.label };
    const built = buildInteract(this.world.M, item, { [op.model]: make });
    if (!built) return;
    const { obj } = built;
    // Декор и товар на прилавке не перехватывают E; выдаваемый паёк — обычный предмет.
    obj.userData.dynamic = true; this.group.add(obj);
    const col = built.col?.length ? new Collider(built.col) : null;
    this.spawned.set(op.id, { obj, zone: op.zone ?? 'ship', col });
  }

  remove(id) {
    const entry = this.spawned.get(id);
    if (!entry) return;
    entry.obj.removeFromParent();
    entry.obj.traverse(o => {
      o.geometry?.dispose();
      if (o.material?.userData.equipmentOwned) o.material.dispose();
    });
    entry.col?.geometry.dispose(); this.spawned.delete(id);
  }

  clear() {
    for (const id of this.spawned.keys()) this.remove(id);
    for (const [obj, original] of this.originals) {
      obj.visible = original.visible; obj.position.copy(original.p); obj.rotation.y = original.r;
    }
    this.originals.clear(); this.states.clear();
    furlSails(this.world.env.sails, 0);
    if (this.flag) this.flag.visible = false;
  }

  get interactables() {
    return [...this.spawned.values()].filter(e => e.obj.visible && e.obj.userData.kind === 'item').map(e => e.obj);
  }

  makeFlag() {
    const mat = this.world.M.canvas('castile-banner', 256, (ctx, size) => {
      ctx.fillStyle = '#f1ead6'; ctx.fillRect(0, 0, size, size);
      for (const [x,y] of [[0,0],[size/2,size/2]]) {
        ctx.fillStyle = '#9d2526'; ctx.fillRect(x,y,size/2,size/2);
        ctx.fillStyle = '#ddb850'; ctx.fillRect(x+size*.12,y+size*.2,size*.26,size*.2);
        for (let i=0;i<3;i++) ctx.fillRect(x+size*(.11+i*.1),y+size*.13,size*.08,size*.13);
        ctx.fillStyle = '#5a3022'; ctx.fillRect(x+size*.22,y+size*.29,size*.06,size*.11);
      }
    }, { side: THREE.DoubleSide });
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), mat);
    this.flag.position.set(0.65, 11.8, 10); this.flag.castShadow = true;
    this.world.ship.add(this.flag); return this.flag;
  }

  update() {
    const w = this.world;
    for (const entry of this.spawned.values()) entry.obj.visible = entry.zone === w.zone;
    for (const op of this.states.values()) {
      if (op.zone && op.zone !== w.zone) continue;
      const state = op.state ?? {};
      if (op.op !== 'spawn') {
        const obj = w.entity(op.id);
        if (obj && !obj.userData.dynamic) {
          if (!this.originals.has(obj)) this.originals.set(obj, { visible: obj.visible, p: obj.position.clone(), r: obj.rotation.y });
          if (op.op === 'remove') obj.visible = false;
          else {
            if (op.p) obj.position.fromArray(op.p);
            if (op.r != null) obj.rotation.y = op.r;
            if ('visible' in state) obj.visible = state.visible;
          }
        }
      }
      if (op.op === 'remove') continue;
      if (op.id === 'sails' && 'furled' in state) furlSails(w.env.sails, state.furled ? 1 : 0);
      if (op.id === 'flag_castile') (this.flag ?? this.makeFlag()).visible = !!state.raised;
      if (op.id === 'fog' && Number.isFinite(state.density) && w.zone === 'ship') w.scene.fog.density = 0.005 + THREE.MathUtils.clamp(state.density,0,1)*0.055;
      if (op.kind === 'lantern' || op.id === 'lantern' || op.id === 'stern_lamp') {
        const definition = [...(w.layout?.interact ?? w.layout?.interactables ?? []), ...(w.layout?.objects ?? [])].find(e => e.id === op.id);
        if (!definition) continue;
        for (const light of w.env.lamps) {
          const p = light.getWorldPosition(new THREE.Vector3());
          if (Math.hypot(p.x-definition.p[0],p.z-definition.p[2]) > 0.4) continue;
          if ('lit' in state) { light.visible = !!state.lit; light.intensity = state.lit ? 4 : 0; }
          if (Number.isFinite(state.brightness)) light.intensity *= THREE.MathUtils.clamp(state.brightness,0,1);
        }
      }
    }
  }

  collide(capsule) {
    let onGround = false;
    for (const entry of this.spawned.values()) if (entry.obj.visible && entry.col) { const hit = entry.col.collide(capsule); onGround = hit.onGround || onGround; }
    return onGround;
  }
}
