import * as THREE from 'three';
import { furlSails } from './ship.js';

// Изменения корабля и неба по world_patch агентов: паруса, флаг Кастилии, фонари, туман, объекты раскладки.
// Предметы и декор из патчей (сухари, товар, бочки) рисует WorldObjects (objects.js) — здесь их нет.
// Пересчёт — только когда пришёл патч, загрузилась раскладка или сменилась зона, а не каждый кадр:
// окружение само каждый кадр учитывает поправки env.lampPatch и env.fogOverride.
export class WorldPatches {
  constructor(world) {
    this.world = world; this.states = new Map(); this.originals = new Map(); this.dirty = true;
  }

  apply({ ops = [], full = false }) {
    if (full) this.clear();
    for (const op of ops) {
      if (op.op === 'spawn') continue; // объекты — WorldObjects
      const old = this.states.get(op.id);
      if (op.op === 'remove') this.states.set(op.id, { ...old, ...op, state: {} });
      else this.states.set(op.id, { ...old, ...op, op: 'set', state: { ...old?.state, ...op.state } });
    }
    this.dirty = true;
  }

  // full: пришло полное состояние агентских объектов — забыть прежние изменения
  clear() {
    for (const [obj, original] of this.originals) {
      obj.visible = original.visible; obj.position.copy(original.p); obj.rotation.y = original.r;
    }
    this.originals.clear();
    this.states.clear();
    this.dirty = true;
  }

  makeFlag() {
    const mat = this.world.M.canvas('castile-banner', 256, (ctx, size) => {
      ctx.fillStyle = '#f1ead6'; ctx.fillRect(0, 0, size, size);
      for (const [x, y] of [[0, 0], [size / 2, size / 2]]) {
        ctx.fillStyle = '#9d2526'; ctx.fillRect(x, y, size / 2, size / 2);
        ctx.fillStyle = '#ddb850'; ctx.fillRect(x + size * .12, y + size * .2, size * .26, size * .2);
        for (let i = 0; i < 3; i++) ctx.fillRect(x + size * (.11 + i * .1), y + size * .13, size * .08, size * .13);
        ctx.fillStyle = '#5a3022'; ctx.fillRect(x + size * .22, y + size * .29, size * .06, size * .11);
      }
    }, { side: THREE.DoubleSide });
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8, 8, 4), mat);
    this.flagBase = Float32Array.from(this.flag.geometry.attributes.position.array);
    this.flag.position.set(0.65, 11.8, 10); this.flag.castShadow = true;
    this.world.ship.add(this.flag); return this.flag;
  }

  // Раскладка перезагрузилась или сменилась зона — фонари и объекты новые, применить заново
  invalidate() { this.dirty = true; }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const w = this.world, env = w.env;
    let furled = false, flag = false, fog = null;
    const lampPatch = new Map();
    const layout = [...(w.layout?.interact ?? w.layout?.interactables ?? []), ...(w.layout?.objects ?? [])];
    for (const op of this.states.values()) {
      if (op.zone && op.zone !== w.zone) continue;
      const state = op.state ?? {};
      // объект раскладки убран или сдвинут
      const obj = w.entity(op.id);
      if (obj && !w.objects?.records.has(op.id)) {
        if (!this.originals.has(obj)) this.originals.set(obj, { visible: obj.visible, p: obj.position.clone(), r: obj.rotation.y });
        if (op.op === 'remove') obj.visible = false;
        else {
          if (op.p) obj.position.fromArray(op.p);
          if (op.r != null) obj.rotation.y = op.r;
          if ('visible' in state) obj.visible = state.visible;
        }
      }
      if (op.op === 'remove') continue;
      if (op.id === 'sails') furled = !!state.furled;
      if (op.id === 'flag_castile') flag = !!state.raised;
      if (op.id === 'fog' && Number.isFinite(state.density) && w.zone === 'ship') fog = 0.005 + THREE.MathUtils.clamp(state.density, 0, 1) * 0.055;
      if (op.kind === 'lantern' || op.id === 'lantern' || op.id === 'stern_lamp') {
        const definition = layout.find((e) => e.id === op.id);
        if (!definition) continue;
        for (const light of env.lamps) {
          const p = light.getWorldPosition(new THREE.Vector3());
          if (Math.hypot(p.x - definition.p[0], p.z - definition.p[2]) > 0.4) continue;
          lampPatch.set(light, { lit: 'lit' in state ? !!state.lit : undefined, brightness: Number.isFinite(state.brightness) ? THREE.MathUtils.clamp(state.brightness, 0, 1) : undefined });
        }
      }
    }
    furlSails(env.sails, furled ? 1 : 0);
    if (flag || this.flag) (this.flag ?? this.makeFlag()).visible = flag;
    env.lampPatch = lampPatch.size ? lampPatch : null;
    env.fogOverride = fog;
  }

  // Флаг колышется на ветру: волна бежит от древка к краю (дёшево: 45 вершин, только пока флаг виден)
  flutter(t) {
    const f = this.flag;
    if (!f?.visible) return;
    const a = f.geometry.attributes.position, base = this.flagBase;
    for (let i = 0; i < a.count; i++) {
      const x = base[i * 3] + 0.6; // 0 — у древка
      a.array[i * 3 + 2] = Math.sin(t * 5 - x * 6 + base[i * 3 + 1] * 2) * 0.09 * x;
    }
    a.needsUpdate = true; f.geometry.computeVertexNormals();
  }

  collide() { return false; }
}
