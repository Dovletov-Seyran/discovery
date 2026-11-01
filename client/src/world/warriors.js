// Воины таино на Гуанахани (docs/tz-combat.md). Где они и что делают, решает сервер, здесь — как у других
// игроков: рисуем на 120 мс в прошлом и сглаживаем, поза — по state.
//   стража деревни (server/game/combat.js, `combat`): копьё; guard (на посту, копьё вверх), chase / return
//     (бег / шаг), windup (замах — копьё над плечом, видно заранее), strike (выпад), down (лежит);
//   воины касика на батее (server/game/duel.js, `duel`): макана; idle (дубинка на плече), ready (стойка),
//     approach / circle (подходит / кружит), windup, strike (рубящий удар), recover (открыт после удара),
//     block (отбил), stagger (пропустил удар), return (идёт на место).
// Воины — цели для E и ЛКМ (world.interactables).
import * as THREE from 'three';
import { person, pose, makeLabel, taino } from './people.js';
import { cylGeo, mesh } from './geom.js';
import { macana } from './macana.js';

const DELAY = 120;
const LOOKS = [
  taino({ loincloth: 0xd9cfb8, bodyPaint: 0x9a2a1c, hat: 'band', hatColor: 0x9a2a1c }),
  taino({ loincloth: 0xcfc4ab, bodyPaint: 0x1e1814 }),
  taino({ loincloth: 0xd9cfb8, bodyPaint: 0x1e1814, bands: 0xd9cfb8 }),
  taino({ loincloth: 0xcfc4ab, bodyPaint: 0x9a2a1c, hat: 'band', hatColor: 0x1e1814 }),
];

// Оружие в кулаке: остриё / клинок — по −Y предплечья (туда, куда смотрит кулак)
function spear(M) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.022, 0.026, 2.1, 6).translate(0, 0.45, 0), M.get('wood')));
  g.add(mesh(new THREE.ConeGeometry(0.04, 0.2, 5).translate(0, 1.6, 0), M.get('limestone')));
  return g;
}
function inFist(obj) { obj.rotation.x = Math.PI; obj.position.y = -0.3; return obj; }

// Подпись и подсказка воина на батее: свободен — вызвать, бьётся с тобой — бить, с другим — счёт
function duelLabel(d, me) {
  if (d.player && d.player === me) return { mine: true, prompt: `${d.name} · ЛКМ — удар`, sub: `${d.score[0]} : ${d.score[1]}` };
  if (d.player) return { mine: false, prompt: `${d.name} · бьётся`, sub: `поединок ${d.score[0]} : ${d.score[1]}` };
  return { mine: false, prompt: d.state === 'idle' ? `${d.name} · E — вызвать на поединок` : d.name, sub: 'воин касика' };
}

export class Warriors {
  // kind: 'warrior' — стража деревни с копьём, 'duelist' — воины касика на батее с маканой
  constructor(scene, M, { labelFactory = makeLabel, kind = 'warrior' } = {}) {
    this.M = M; this.labelFactory = labelFactory; this.kind = kind;
    this.group = new THREE.Group(); scene.add(this.group);
    this.map = new Map(); this.level = 'calm'; this.zone = null;
  }

  // `combat`: стража деревни
  apply(msg) { this.level = msg.level; this.applyList(msg.warriors ?? []); }

  // `duel`: воины на батее; me — id этого игрока (кому подсказка «ЛКМ — удар»)
  applyDuel(msg, me) {
    this.applyList(msg.duelists ?? []);
    for (const d of msg.duelists ?? []) {
      const x = this.map.get(d.id), l = duelLabel(d, me);
      Object.assign(x.rig.root.userData, { label: l.prompt, mine: l.mine });
      if (x.sub !== l.sub) { x.sub = l.sub; x.label.draw(d.name, l.sub); }
    }
  }

  applyList(list) {
    const now = performance.now(), seen = new Set();
    for (const w of list) {
      seen.add(w.id);
      const x = this.map.get(w.id) ?? this.create(w);
      x.buf.push({ at: now, p: w.p, r: w.r, state: w.state });
      if (x.buf.length > 12) x.buf.shift();
    }
    for (const id of this.map.keys()) if (!seen.has(id)) this.remove(id);
  }

  create(w) {
    const i = Number(w.id.split('_').at(-1)) || (w.id.includes('veteran') ? 3 : 1), rig = person(this.M.person, LOOKS[i % LOOKS.length]);
    const arm = rig.arms.find((a) => a.s === 1) ?? rig.arms[1];
    arm.fa.add(inFist(this.kind === 'duelist' ? macana().obj : spear(this.M)));
    const name = w.name ?? 'Воин таино', label = this.labelFactory();
    label.position.y = 2.25; label.draw(name, this.kind === 'duelist' ? 'воин касика' : ''); rig.root.add(label);
    rig.root.rotation.order = 'YXZ'; // курс, потом наклон — так лежащий падает навзничь по ходу
    rig.root.userData = { id: w.id, kind: this.kind, label: `${name} · ЛКМ — ударить` };
    rig.root.position.fromArray(w.p);
    rig.root.visible = this.zone === 'guanahani';
    this.group.add(rig.root);
    const x = { rig, arm, label, buf: [], phase: Math.random() * 6, state: w.state, since: performance.now() };
    this.map.set(w.id, x);
    return x;
  }

  remove(id) {
    const x = this.map.get(id);
    if (!x) return;
    x.rig.root.removeFromParent();
    x.rig.root.traverse((o) => {
      o.geometry?.dispose();
      if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
      else if (o.material?.userData?.equipmentOwned) o.material.dispose();
    });
    this.map.delete(id);
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); this.level = 'calm'; }

  setZone(zone) { this.zone = zone; for (const x of this.map.values()) x.rig.root.visible = zone === 'guanahani'; }

  // цели для E и ЛКМ (кроме лежащих)
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
    const root = rig.root, duel = this.kind === 'duelist';
    root.rotation.x = 0; rig.hip.position.y = 0.95;
    const stance = () => { // боевая стойка: ноги шире, оружие перед собой, левая рука прикрывает
      rig.legs[0].th.rotation.x = -0.25; rig.legs[1].th.rotation.x = 0.25; rig.hip.position.y = 0.92;
      arm.ua.rotation.set(-0.9, 0, -arm.s * 0.15); arm.fa.rotation.set(-0.9, 0, 0);
      left.ua.rotation.set(-0.7, 0, left.s * 0.25); left.fa.rotation.set(-1.1, 0, 0);
    };
    switch (x.state) {
      case 'chase': case 'return': case 'approach':
        x.phase += dt * (x.state === 'chase' ? 11 : 7);
        pose(rig, x.state === 'chase' ? 'run' : 'walk', x.phase);
        if (duel) { arm.ua.rotation.set(-0.9, 0, -arm.s * 0.15); arm.fa.rotation.set(-0.9, 0, 0); }
        else { arm.ua.rotation.set(-1.15, 0, 0); arm.fa.rotation.set(-0.45, 0, 0); } // копьё наперевес, остриём вперёд
        break;
      case 'circle': // кружит приставным шагом в стойке
        x.phase += dt * 5;
        pose(rig, 'walk', x.phase); stance();
        rig.legs[0].th.rotation.x += Math.sin(x.phase) * 0.25; rig.legs[1].th.rotation.x -= Math.sin(x.phase) * 0.25;
        break;
      case 'ready':
        pose(rig, 'stand'); stance();
        break;
      case 'windup': // замах: оружие над плечом, корпус назад — видно, что сейчас ударит
        pose(rig, 'stand');
        arm.ua.rotation.set(-2.5 * Math.min(1, k / 0.25), 0, -arm.s * 0.2); arm.fa.rotation.set(-0.5, 0, 0);
        rig.torso.rotation.set(-0.12, -arm.s * 0.35, 0);
        left.ua.rotation.set(-0.9, 0, left.s * 0.3);
        break;
      case 'strike': // копьё — выпад вперёд, макана — рубящий удар сверху
        pose(rig, 'stand');
        if (duel) { arm.ua.rotation.set(-2.4 + 1.6 * Math.min(1, k / 0.15), 0, -arm.s * 0.1); arm.fa.rotation.set(-0.15, 0, 0); }
        else { arm.ua.rotation.set(-1.5, 0, 0); arm.fa.rotation.set(0, 0, 0); }
        rig.torso.rotation.set(0.35, arm.s * 0.2, 0);
        rig.legs[0].th.rotation.x = -0.5; rig.legs[1].th.rotation.x = 0.35;
        break;
      case 'recover': // открыт: согнулся после удара, оружие внизу, медленно выпрямляется
        pose(rig, 'stand');
        rig.torso.rotation.x = 0.55 * Math.max(0.3, 1 - k);
        arm.ua.rotation.set(-0.5, 0, 0); arm.fa.rotation.set(-0.2, 0, 0);
        left.ua.rotation.set(-0.2, 0, left.s * 0.3);
        rig.legs[0].th.rotation.x = -0.45; rig.legs[1].th.rotation.x = 0.3;
        break;
      case 'block': // отбил: макана поперёк, на уровне груди
        pose(rig, 'stand'); stance();
        arm.ua.rotation.set(-1.3, 0, -arm.s * 0.25); arm.fa.rotation.set(0, 0, -arm.s * 1.45);
        break;
      case 'stagger': // пропустил удар: отшатнулся назад
        pose(rig, 'stand');
        rig.torso.rotation.x = -0.3 * Math.max(0, 1 - k * 1.5);
        for (const a of rig.arms) { a.ua.rotation.set(-0.4, 0, a.s * 0.6); a.fa.rotation.set(-0.5, 0, 0); }
        break;
      case 'down': // лежит навзничь
        pose(rig, 'stand');
        root.rotation.x = -Math.PI / 2 * Math.min(1, k / 0.35);
        root.position.y += 0.18;
        for (const a of rig.arms) a.ua.rotation.z = a.s * 1.1;
        break;
      case 'idle': // ждёт на краю батея, макана на плече
        pose(rig, 'stand');
        arm.ua.rotation.set(-0.35, 0, arm.s * 0.2); arm.fa.rotation.set(-2.3, 0, 0);
        rig.torso.rotation.y = Math.sin(performance.now() / 1100 + x.phase) * 0.05;
        break;
      default: // guard: на посту, копьё вверх, переминается
        pose(rig, 'stand');
        arm.ua.rotation.set(-0.25, 0, arm.s * 0.15); arm.fa.rotation.set(-2.0, 0, 0);
        rig.torso.rotation.y = Math.sin(performance.now() / 900 + x.phase) * 0.06;
    }
  }
}
