// Воины таино на Гуанахани (docs/tz-combat.md). Где они и что делают, решает сервер, здесь — как у других
// игроков: рисуем на 120 мс в прошлом и сглаживаем, поза — по state.
//   стража деревни (server/game/combat.js, `combat`): копьё; guard (на посту, копьё вверх), chase / return
//     (бег / шаг), windup (замах — копьё над плечом, видно заранее), strike (выпад), down (лежит);
//   воины касика на батее (server/game/duel.js, `duel`): юный с маканой, опытный с копьём; idle (оружие на
//     плече), ready (стойка), approach / circle (подходит / кружит), windup, strike (макана — рубит сверху,
//     копьё — выпад), recover (открыт после удара), block (отбил), dodge (увернулся от стрелы),
//     stagger (пропустил удар), return (идёт на место).
// Воины — цели для E и ЛКМ (world.interactables). Испанцы в деревне — world/spaniards.js, тот же каркас.
import * as THREE from 'three';
import { person, pose, makeLabel, taino } from './people.js';
import { macana } from './macana.js';
import { warSpear } from './weapons.js';

export const DELAY = 120;
const LOOKS = [
  taino({ loincloth: 0xd9cfb8, bodyPaint: 0x9a2a1c, hat: 'band', hatColor: 0x9a2a1c }),
  taino({ loincloth: 0xcfc4ab, bodyPaint: 0x1e1814 }),
  taino({ loincloth: 0xd9cfb8, bodyPaint: 0x1e1814, bands: 0xd9cfb8 }),
  taino({ loincloth: 0xcfc4ab, bodyPaint: 0x9a2a1c, hat: 'band', hatColor: 0x1e1814 }),
];

// Оружие в кулаке: остриё / клинок — по −Y предплечья (туда, куда смотрит кулак)
export function inFist(obj) { obj.rotation.x = Math.PI; obj.position.y = -0.3; return obj; }
// копьё держат на трети длины: кулак — у хвата, остриё вперёд
const WEAPON = { macana: () => macana().obj, war_spear: () => warSpear().obj };

// Подпись и подсказка воина на батее: свободен — вызвать, бьётся с тобой — бить, с другим — счёт
function duelLabel(d, me) {
  if (d.player && d.player === me) return { mine: true, prompt: `${d.name} · ЛКМ — удар`, sub: `${d.score[0]} : ${d.score[1]}` };
  if (d.player) return { mine: false, prompt: `${d.name} · бьётся`, sub: `поединок ${d.score[0]} : ${d.score[1]}` };
  return { mine: false, prompt: d.state === 'idle' ? `${d.name} · E — вызвать на поединок` : d.name, sub: 'воин касика' };
}

export class Warriors {
  // kind: 'warrior' — стража деревни с копьём, 'duelist' — воины касика на батее
  constructor(scene, M, { labelFactory = makeLabel, kind = 'warrior' } = {}) {
    this.M = M; this.labelFactory = labelFactory; this.kind = kind;
    this.group = new THREE.Group(); scene.add(this.group);
    this.map = new Map(); this.level = 'calm'; this.zone = null;
  }

  // `combat`: стража деревни
  apply(msg) { this.level = msg.level; this.applyList(msg.warriors ?? []); }

  label(d, me) { return duelLabel(d, me); }

  // `duel`: воины на батее (или испанцы — у них свой label); me — id этого игрока
  applyDuel(msg, me) {
    const list = msg.duelists ?? [];
    this.applyList(list);
    for (const d of list) {
      const x = this.map.get(d.id), l = this.label(d, me);
      Object.assign(x.rig.root.userData, { label: l.prompt, mine: l.mine, fighting: !!(l.mine && l.fighting) });
      x.data = d;
      if (x.sub !== l.sub) { x.sub = l.sub; x.label.draw(d.name, l.sub); }
    }
  }

  applyList(list) {
    const now = performance.now(), seen = new Set();
    for (const w of list) {
      seen.add(w.id);
      const x = this.map.get(w.id) ?? this.create(w);
      x.buf.push({ at: now, p: w.p, r: w.r, state: w.state, act: w.act });
      if (x.buf.length > 12) x.buf.shift();
    }
    for (const id of this.map.keys()) if (!seen.has(id)) this.remove(id);
  }

  create(w) {
    const i = Number(w.id.split('_').at(-1)) || (w.id.includes('veteran') ? 3 : 1), rig = person(this.M.person, LOOKS[i % LOOKS.length]);
    const arm = rig.arms.find((a) => a.s === 1) ?? rig.arms[1];
    const weapon = w.weapon ?? (this.kind === 'duelist' ? 'macana' : 'war_spear');
    arm.fa.add(inFist(WEAPON[weapon]?.() ?? WEAPON.war_spear()));
    const name = w.name ?? 'Воин таино', label = this.labelFactory();
    label.position.y = 2.25; label.draw(name, this.kind === 'duelist' ? 'воин касика' : ''); rig.root.add(label);
    return this.track(w, rig, arm, label, { weapon });
  }

  // общая часть create: в сцену, в таблицу, буфер позиций
  track(w, rig, arm, label, extra = {}) {
    rig.root.rotation.order = 'YXZ'; // курс, потом наклон — так лежащий падает навзничь по ходу
    rig.root.userData = { id: w.id, kind: this.kind, label: `${w.name ?? 'Воин таино'} · ЛКМ — ударить` };
    rig.root.position.fromArray(w.p);
    rig.root.visible = this.zone === 'guanahani';
    this.group.add(rig.root);
    const x = { rig, arm, label, buf: [], phase: Math.random() * 6, state: w.state, since: performance.now(), ...extra };
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
      if (s1.state !== x.state || s1.act !== x.act) { x.state = s1.state; x.act = s1.act; x.since = performance.now(); }
      this.animate(x, dt);
    }
  }

  // боевая стойка: ноги шире, оружие перед собой, левая рука прикрывает
  stance(x) {
    const { rig, arm } = x, left = rig.arms.find((a) => a !== arm);
    rig.legs[0].th.rotation.x = -0.25; rig.legs[1].th.rotation.x = 0.25; rig.hip.position.y = 0.92;
    arm.ua.rotation.set(-0.9, 0, -arm.s * 0.15); arm.fa.rotation.set(-0.9, 0, 0);
    left.ua.rotation.set(-0.7, 0, left.s * 0.25); left.fa.rotation.set(-1.1, 0, 0);
  }

  // общие позы боя (поединок и стража): true — поза поставлена
  fightPose(x, dt, k) {
    const { rig, arm } = x, left = rig.arms.find((a) => a !== arm), root = rig.root;
    const spear = x.weapon === 'war_spear';
    switch (x.state) {
      case 'chase': case 'return': case 'approach': case 'lead':
        x.phase += dt * (x.state === 'chase' ? 11 : x.state === 'lead' ? 8.5 : 7);
        pose(rig, x.state === 'chase' ? 'run' : 'walk', x.phase);
        this.carry(x, true);
        return true;
      case 'circle': // кружит приставным шагом в стойке
        x.phase += dt * 5;
        pose(rig, 'walk', x.phase); this.stance(x);
        rig.legs[0].th.rotation.x += Math.sin(x.phase) * 0.25; rig.legs[1].th.rotation.x -= Math.sin(x.phase) * 0.25;
        return true;
      case 'ready': case 'await':
        pose(rig, 'stand'); this.stance(x);
        return true;
      case 'windup': // замах: оружие над плечом, корпус назад — видно, что сейчас ударит
        pose(rig, 'stand');
        if (spear) { arm.ua.rotation.set(-1.0, 0, -arm.s * 0.1); arm.fa.rotation.set(-0.15, 0, 0); rig.torso.rotation.set(-0.08, -arm.s * 0.5 * Math.min(1, k / 0.25), 0); }
        else { arm.ua.rotation.set(-2.5 * Math.min(1, k / 0.25), 0, -arm.s * 0.2); arm.fa.rotation.set(-0.5, 0, 0); rig.torso.rotation.set(-0.12, -arm.s * 0.35, 0); }
        left.ua.rotation.set(-0.9, 0, left.s * 0.3);
        return true;
      case 'strike': // копьё — выпад вперёд, макана — рубящий удар сверху
        pose(rig, 'stand');
        if (spear || this.kind === 'warrior') { arm.ua.rotation.set(-1.5, 0, 0); arm.fa.rotation.set(0, 0, 0); rig.torso.rotation.set(0.3, arm.s * 0.25, 0); }
        else { arm.ua.rotation.set(-2.4 + 1.6 * Math.min(1, k / 0.15), 0, -arm.s * 0.1); arm.fa.rotation.set(-0.15, 0, 0); rig.torso.rotation.set(0.35, arm.s * 0.2, 0); }
        rig.legs[0].th.rotation.x = -0.5; rig.legs[1].th.rotation.x = 0.35;
        return true;
      case 'recover': // открыт: согнулся после удара, оружие внизу, медленно выпрямляется
        pose(rig, 'stand');
        rig.torso.rotation.x = 0.55 * Math.max(0.3, 1 - k);
        arm.ua.rotation.set(-0.5, 0, 0); arm.fa.rotation.set(-0.2, 0, 0);
        left.ua.rotation.set(-0.2, 0, left.s * 0.3);
        rig.legs[0].th.rotation.x = -0.45; rig.legs[1].th.rotation.x = 0.3;
        return true;
      case 'block': // отбил: оружие поперёк, на уровне груди
        pose(rig, 'stand'); this.stance(x);
        arm.ua.rotation.set(-1.3, 0, -arm.s * 0.25); arm.fa.rotation.set(0, 0, -arm.s * 1.45);
        return true;
      case 'dodge': { // увернулся от стрелы: шаг в сторону с наклоном
        pose(rig, 'stand'); this.stance(x);
        const w = Math.sin(Math.min(1, k / 0.35) * Math.PI);
        rig.torso.rotation.z = arm.s * 0.35 * w; rig.hip.position.y = 0.92 - 0.1 * w;
        rig.legs[0].th.rotation.z = -0.3 * w; rig.legs[1].th.rotation.z = 0.2 * w;
        return true;
      }
      case 'stagger': // пропустил удар: отшатнулся назад
        pose(rig, 'stand');
        rig.torso.rotation.x = -0.3 * Math.max(0, 1 - k * 1.5);
        for (const a of rig.arms) { a.ua.rotation.set(-0.4, 0, a.s * 0.6); a.fa.rotation.set(-0.5, 0, 0); }
        return true;
      case 'down': // лежит навзничь
        pose(rig, 'stand');
        root.rotation.x = -Math.PI / 2 * Math.min(1, k / 0.35);
        root.position.y += 0.18;
        for (const a of rig.arms) a.ua.rotation.z = a.s * 1.1;
        return true;
    }
    return false;
  }

  // руки на ходу: копьё наперевес, остриём вперёд; макана — перед собой
  carry(x) {
    const { arm } = x;
    if (this.kind === 'duelist' && x.weapon !== 'war_spear') { arm.ua.rotation.set(-0.9, 0, -arm.s * 0.15); arm.fa.rotation.set(-0.9, 0, 0); }
    else { arm.ua.rotation.set(-1.15, 0, 0); arm.fa.rotation.set(-0.45, 0, 0); }
  }

  animate(x, dt) {
    const { rig, arm } = x, k = (performance.now() - (x.since ?? 0)) / 1000;
    rig.root.rotation.x = 0; rig.hip.position.y = 0.95;
    if (this.fightPose(x, dt, k)) return;
    if (x.state === 'idle') { // ждёт на краю батея, оружие на плече
      pose(rig, 'stand');
      if (x.weapon === 'war_spear') { arm.ua.rotation.set(-0.2, 0, arm.s * 0.12); arm.fa.rotation.set(-1.75, 0, 0); }
      else { arm.ua.rotation.set(-0.35, 0, arm.s * 0.2); arm.fa.rotation.set(-2.3, 0, 0); }
      rig.torso.rotation.y = Math.sin(performance.now() / 1100 + x.phase) * 0.05;
      return;
    }
    // guard: на посту, копьё вверх, переминается
    pose(rig, 'stand');
    arm.ua.rotation.set(-0.25, 0, arm.s * 0.15); arm.fa.rotation.set(-2.0, 0, 0);
    rig.torso.rotation.y = Math.sin(performance.now() / 900 + x.phase) * 0.06;
  }
}
