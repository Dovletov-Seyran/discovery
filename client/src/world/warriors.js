// Воины таино в бою на Гуанахани (docs/tz-combat.md). Где они и что делают, решает сервер
// (server/game/combat.js) и шлёт `combat` 10 раз в секунду: { level, warriors: [{ id, p, r, state, hp }] }.
// Здесь — как у других игроков: рисуем на 120 мс в прошлом и сглаживаем, поза — по state:
// guard (на посту, копьё вверх), chase / return (бег / шаг), windup (замах — копьё над плечом, видно
// заранее), strike (выпад), down (лежит). Воины — цели для удара игрока (world.interactables).
import * as THREE from 'three';
import { person, pose, makeLabel, taino } from './people.js';
import { cylGeo, mesh } from './geom.js';

const DELAY = 120;
const LOOKS = [
  taino({ loincloth: 0xd9cfb8, bodyPaint: 0x9a2a1c, hat: 'band', hatColor: 0x9a2a1c }),
  taino({ loincloth: 0xcfc4ab, bodyPaint: 0x1e1814 }),
  taino({ loincloth: 0xd9cfb8, bodyPaint: 0x1e1814, bands: 0xd9cfb8 }),
  taino({ loincloth: 0xcfc4ab, bodyPaint: 0x9a2a1c, hat: 'band', hatColor: 0x1e1814 }),
];

// Копьё: древко твёрдого дерева и каменный наконечник. Острие — по −Y предплечья (туда, куда смотрит кулак)
function spear(M) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.022, 0.026, 2.1, 6).translate(0, 0.45, 0), M.get('wood')));
  g.add(mesh(new THREE.ConeGeometry(0.04, 0.2, 5).translate(0, 1.6, 0), M.get('limestone')));
  g.rotation.x = Math.PI;
  g.position.y = -0.3; // в кулаке
  return g;
}

export class Warriors {
  constructor(scene, M, { labelFactory = makeLabel } = {}) {
    this.M = M; this.labelFactory = labelFactory;
    this.group = new THREE.Group(); scene.add(this.group);
    this.map = new Map(); this.level = 'calm'; this.zone = null;
  }

  // сообщение `combat`
  apply(msg) {
    this.level = msg.level;
    const now = performance.now(), seen = new Set();
    for (const w of msg.warriors ?? []) {
      seen.add(w.id);
      let x = this.map.get(w.id);
      if (!x) x = this.create(w);
      x.buf.push({ at: now, p: w.p, r: w.r, state: w.state, hp: w.hp });
      if (x.buf.length > 12) x.buf.shift();
    }
    for (const id of this.map.keys()) if (!seen.has(id)) this.remove(id);
  }

  create(w) {
    const i = Number(w.id.split('_').at(-1)) || 0, rig = person(this.M.person, LOOKS[i % LOOKS.length]);
    const arm = rig.arms.find((a) => a.s === 1) ?? rig.arms[1];
    arm.fa.add(spear(this.M));
    const label = this.labelFactory(); label.position.y = 2.25; label.draw('Воин таино', ''); rig.root.add(label);
    rig.root.rotation.order = 'YXZ'; // курс, потом наклон — так лежащий падает навзничь по ходу
    rig.root.userData = { id: w.id, kind: 'warrior', label: 'Воин таино · ЛКМ — ударить' };
    rig.root.position.fromArray(w.p);
    rig.root.visible = this.zone === 'guanahani';
    this.group.add(rig.root);
    const x = { rig, arm, label, buf: [], phase: Math.random() * 6, state: w.state, downSince: 0 };
    this.map.set(w.id, x);
    return x;
  }

  remove(id) {
    const x = this.map.get(id);
    if (!x) return;
    x.rig.root.removeFromParent();
    x.rig.root.traverse((o) => { o.geometry?.dispose(); if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } });
    this.map.delete(id);
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); this.level = 'calm'; }

  setZone(zone) { this.zone = zone; for (const x of this.map.values()) x.rig.root.visible = zone === 'guanahani'; }

  // цели для ЛКМ (кроме лежащих)
  get targets() { return [...this.map.values()].filter((x) => x.state !== 'down' && x.rig.root.visible).map((x) => x.rig.root); }

  update(dt) {
    const t = performance.now() - DELAY;
    for (const x of this.map.values()) {
      const b = x.buf, root = x.rig.root;
      if (!b.length || !root.visible) continue;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].at > t) i--;
      const s1 = b[i], s0 = b[Math.max(0, i - 1)];
      const f = s1.at === s0.at ? 1 : THREE.MathUtils.clamp((t - s0.at) / (s1.at - s0.at), 0, 1);
      root.position.set(THREE.MathUtils.lerp(s0.p[0], s1.p[0], f), THREE.MathUtils.lerp(s0.p[1], s1.p[1], f), THREE.MathUtils.lerp(s0.p[2], s1.p[2], f));
      let dr = s1.r - s0.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      root.rotation.y = s0.r + dr * f + Math.PI; // r — как у камеры, модель смотрит в +z
      if (s1.state !== x.state) { x.state = s1.state; x.since = performance.now(); }
      this.animate(x, dt);
    }
  }

  animate(x, dt) {
    const { rig, arm } = x, left = rig.arms.find((a) => a !== arm), k = (performance.now() - (x.since ?? 0)) / 1000;
    const root = rig.root;
    root.rotation.x = 0; rig.hip.position.y = 0.95;
    switch (x.state) {
      case 'chase': case 'return':
        x.phase += dt * (x.state === 'chase' ? 11 : 7);
        pose(rig, x.state === 'chase' ? 'run' : 'walk', x.phase);
        arm.ua.rotation.set(-1.15, 0, 0); arm.fa.rotation.set(-0.45, 0, 0); // копьё наперевес, остриём вперёд
        break;
      case 'windup': // замах: копьё над плечом, корпус назад — видно, что сейчас ударит
        pose(rig, 'stand');
        arm.ua.rotation.set(-2.5 * Math.min(1, k / 0.25), 0, -arm.s * 0.2); arm.fa.rotation.set(-0.5, 0, 0);
        rig.torso.rotation.set(-0.12, -arm.s * 0.35, 0);
        left.ua.rotation.set(-0.9, 0, left.s * 0.3);
        break;
      case 'strike': // выпад вперёд
        pose(rig, 'stand');
        arm.ua.rotation.set(-1.5, 0, 0); arm.fa.rotation.set(0, 0, 0);
        rig.torso.rotation.set(0.35, arm.s * 0.2, 0);
        rig.legs[0].th.rotation.x = -0.5; rig.legs[1].th.rotation.x = 0.35;
        break;
      case 'down': // лежит навзничь
        pose(rig, 'stand');
        root.rotation.x = -Math.PI / 2 * Math.min(1, k / 0.35);
        root.position.y += 0.18;
        for (const a of rig.arms) a.ua.rotation.z = a.s * 1.1;
        break;
      default: // guard: на посту, копьё вверх, переминается
        pose(rig, 'stand');
        arm.ua.rotation.set(-0.25, 0, arm.s * 0.15); arm.fa.rotation.set(-2.0, 0, 0);
        rig.torso.rotation.y = Math.sin(performance.now() / 900 + x.phase) * 0.06;
    }
  }
}
