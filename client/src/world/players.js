import * as THREE from 'three';
import { person, pose, makeLabel, ROLE_LOOK, ROLE_NAME, TAINO_ROLE_LOOK, TAINO_ROLE_NAME } from './people.js';

// part 1: the crew; part 2: villagers of Guanahani (world.setZone switches it)
const LOOKS = { crew: [ROLE_LOOK, ROLE_NAME], taino: [TAINO_ROLE_LOOK, TAINO_ROLE_NAME] };

const DELAY = 100; // ms: render remote players this far in the past and interpolate (F1.6)

// Remote players: upsert / snapshot / remove / say. Positions come from `snapshot` 15 times a second.
export class Players {
  constructor(scene, M) {
    this.M = M;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.map = new Map();
    this.kind = 'crew';
  }

  // 'crew' | 'taino': rebuilds everybody's figure, keeping where they are
  setLooks(kind) {
    if (kind === this.kind || !LOOKS[kind]) return;
    this.kind = kind;
    for (const p of this.map.values()) {
      const old = p.rig.root, rig = person(this.M.person, LOOKS[kind][0][p.role] ?? LOOKS[kind][0].grumete);
      rig.root.position.copy(old.position); rig.root.rotation.copy(old.rotation); rig.root.userData = old.userData;
      rig.root.add(p.label);
      old.removeFromParent(); old.traverse((o) => { if (o !== p.label && !o.isSprite) o.geometry?.dispose(); });
      this.group.add(rig.root);
      p.rig = rig;
      p.label.draw(p.name, LOOKS[kind][1][p.role] ?? '');
    }
  }

  upsert(id, { name, role }) {
    let p = this.map.get(id);
    if (!p) {
      const [looks] = LOOKS[this.kind], rig = person(this.M.person, looks[role] ?? looks.grumete);
      const label = makeLabel(); label.position.y = 2.3; rig.root.add(label);
      rig.root.userData = { id, kind: 'player' };
      this.group.add(rig.root);
      p = { rig, label, buf: [], phase: 0, a: 'idle', bubbleUntil: 0 };
      this.map.set(id, p);
    }
    p.name = name; p.role = role;
    p.label.draw(name, LOOKS[this.kind][1][role] ?? '');
    return p.rig.root;
  }

  remove(id) {
    const p = this.map.get(id);
    if (!p) return;
    p.rig.root.removeFromParent();
    p.rig.root.traverse((o) => { o.geometry?.dispose(); if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
    this.map.delete(id);
  }

  // list: [{ id, p: [x,y,z], r, a }] — players that were not upserted yet are ignored
  snapshot(list, time) {
    const now = performance.now();
    for (const s of list) {
      const p = this.map.get(s.id);
      if (!p) continue;
      p.buf.push({ at: now, p: s.p, r: s.r, a: s.a });
      if (p.buf.length > 20) p.buf.shift();
    }
  }

  say(id, text, seconds = 6) {
    const p = this.map.get(id);
    if (!p) return;
    p.label.draw(p.name, ROLE_NAME[p.role] ?? '', text);
    p.bubbleUntil = performance.now() + seconds * 1000;
  }

  update(dt) {
    const t = performance.now() - DELAY;
    for (const p of this.map.values()) {
      const b = p.buf;
      if (!b.length) continue;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].at > t) i--;
      const s1 = b[i], s0 = b[Math.max(0, i - 1)];
      const f = s1.at === s0.at ? 1 : THREE.MathUtils.clamp((t - s0.at) / (s1.at - s0.at), 0, 1);
      const root = p.rig.root;
      root.position.set(
        THREE.MathUtils.lerp(s0.p[0], s1.p[0], f), THREE.MathUtils.lerp(s0.p[1], s1.p[1], f), THREE.MathUtils.lerp(s0.p[2], s1.p[2], f));
      let dr = s1.r - s0.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      root.rotation.y = s0.r + dr * f + Math.PI; // r = camera-style yaw, the model faces +z
      p.a = s1.a;
      p.phase += dt * (p.a === 'run' ? 11 : 7);
      pose(p.rig, p.a === 'idle' ? 'stand' : p.a, p.phase);
      if (p.bubbleUntil && performance.now() > p.bubbleUntil) { p.bubbleUntil = 0; p.label.draw(p.name, ROLE_NAME[p.role] ?? ''); }
    }
  }
}
