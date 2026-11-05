// Испанцы в деревне 12 октября (server/game/spaniards.js, `duel` с kind 'spaniard'). Это люди с «Санта-Марии»:
// облик — тот же, что на корабле (NPC_LOOK по crew), имя — как их зовут товарищи. Ходят по тропам,
// останавливаются у таино (act: guard, listen, greet, offer, look, kneel, point, drink), здороваются с
// игроками (greet), по вызову ведут на батей (lead, await) и бьются: меч или приклад эспингарды.
// Вне боя меч в ножнах на поясе, эспингарда на плече.
import * as THREE from 'three';
import { person, pose, NPC_LOOK } from './people.js';
import { Warriors, inFist } from './warriors.js';
import { sword } from '../game/held-models.js';
import { espingarda } from './espingarda.js';

const FIGHT = new Set(['ready', 'approach', 'circle', 'windup', 'strike', 'recover', 'block', 'dodge', 'stagger']);
const own = (color, roughness = 0.8, metalness = 0) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); m.userData.equipmentOwned = true; return m; };

// Подпись: свободен — вызвать, ведёт / бьётся с тобой — идти / бить, с другим — счёт; ниже — что он делает
// или что говорит
export function spaniardLabel(d, me) {
  const said = d.say ? `«${d.say}»` : null;
  if (d.player && d.player === me) {
    if (d.state === 'lead' || d.state === 'await') return { mine: true, fighting: false, prompt: `${d.name} · иди за ним на батей`, sub: said ?? 'тренировочный бой' };
    return { mine: true, fighting: true, prompt: `${d.name} · ЛКМ — удар`, sub: `${d.score[0]} : ${d.score[1]}` };
  }
  if (d.player) return { mine: false, prompt: `${d.name} · бьётся`, sub: `тренировочный бой ${d.score[0]} : ${d.score[1]}` };
  const free = ['walk', 'act', 'greet'].includes(d.state);
  return { mine: false, prompt: free ? `${d.name} · E — вызвать на тренировочный бой` : d.name, sub: said ?? d.doing ?? 'чужак с большой лодки' };
}

// Ножны с мечом: кожа, латунные оковки, рукоять торчит вперёд
function scabbard() {
  const g = new THREE.Group(), leather = own(0x2e2018, 0.85), brass = own(0xb69352, 0.35, 0.7);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.9, 8), leather); body.scale.z = 0.45; body.position.y = -0.45; g.add(body);
  for (const y of [-0.02, -0.88]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 8), brass); b.scale.z = 0.5; b.position.y = y; g.add(b); }
  const hilt = sword().obj; hilt.scale.setScalar(0.85); hilt.rotation.x = Math.PI; // клинок — в ножнах, вниз, рукоять вверх
  hilt.traverse((o) => { // видна только рукоять с гардой
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox.min.y + o.position.y > 0.17) o.visible = false;
  });
  g.add(hilt);
  return g;
}

export class Spaniards extends Warriors {
  constructor(scene, M, opts = {}) { super(scene, M, { ...opts, kind: 'spaniard' }); }

  label(d, me) { return spaniardLabel(d, me); }

  create(w) {
    const rig = person(this.M.person, NPC_LOOK[w.crew] ?? NPC_LOOK.sailor_1);
    const arm = rig.arms.find((a) => a.s === 1) ?? rig.arms[1];
    const x = this.track(w, rig, arm, this.labelFactory(), { weapon: w.weapon });
    x.label.position.y = 2.3; x.label.draw(w.name, 'чужак с большой лодки'); rig.root.add(x.label);
    if (w.weapon === 'espingarda') {
      x.gun = espingarda().obj; x.gun.name = 'espingarda'; x.gun.scale.setScalar(0.95);
    } else {
      x.blade = inFist(sword().obj); x.blade.name = 'sword';
      x.sheath = scabbard(); x.sheath.position.set(-arm.s * 0.21, 0.02, 0.04); x.sheath.rotation.set(0.85, 0, -arm.s * 0.15); rig.hip.add(x.sheath); // наискосок, концом назад
      // пустые ножны, когда меч в руке
      x.sheathHilt = x.sheath.children.at(-1);
    }
    // в руке — бусы или колокольчик для обмена, у Диего — нет
    const beads = new THREE.Group(); beads.name = 'trinket';
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), own(i % 2 ? 0x3a7bd5 : 0xd8f0ff, 0.15, 0.1)); b.position.set(Math.cos(a) * 0.05, -0.32 - Math.sin(a) * 0.05 - 0.05, 0.02); beads.add(b); }
    beads.visible = false; arm.fa.add(beads); x.trinket = beads;
    this.arm(x, false);
    return x;
  }

  // оружие — в руке (бой) или на месте (ножны, плечо)
  arm(x, fighting) {
    if (x.armed === fighting) return;
    x.armed = fighting;
    if (x.gun) {
      x.gun.removeFromParent();
      if (fighting) { x.gun.position.set(0, -0.3, 0.03); x.gun.rotation.set(0, 0, 0); x.arm.fa.add(x.gun); } // вдоль руки, прикладом к сопернику
      else { x.gun.position.set(-x.arm.s * 0.05, 0.3, -0.17); x.gun.rotation.set(0, 0, x.arm.s * 0.55); x.rig.torso.add(x.gun); } // на ремне за спиной, стволом вверх через плечо
    } else {
      x.blade.removeFromParent();
      if (fighting) x.arm.fa.add(x.blade);
      if (x.sheathHilt) x.sheathHilt.visible = !fighting;
    }
  }

  carry(x) {
    const { arm, rig } = x, left = rig.arms.find((a) => a !== arm);
    if (x.gun && !x.armed && x.state !== 'walk' && x.state !== 'return' && x.state !== 'lead') { arm.ua.rotation.set(0.15, 0, arm.s * 0.5); arm.fa.rotation.set(0, 0, -arm.s * 1.6); } // стоит, рука на поясе
    else if (x.armed) { arm.ua.rotation.set(-0.8, 0, -arm.s * 0.1); arm.fa.rotation.set(-0.8, 0, 0); }
    if (!x.armed && !x.gun) left.ua.rotation.x *= 0.6; // левая рука на эфесе — машет меньше
  }

  stance(x) {
    super.stance(x);
    if (x.gun) { // эспингарда обеими руками, прикладом к сопернику
      const { arm, rig } = x, left = rig.arms.find((a) => a !== arm);
      arm.ua.rotation.set(-0.5, 0, -arm.s * 0.35); arm.fa.rotation.set(-1.2, 0, 0);
      left.ua.rotation.set(-0.9, 0, -left.s * 0.3); left.fa.rotation.set(-0.7, 0, 0);
    }
  }

  animate(x, dt) {
    const { rig, arm } = x, left = rig.arms.find((a) => a !== arm), k = (performance.now() - (x.since ?? 0)) / 1000, t = performance.now() / 1000;
    rig.root.rotation.x = 0; rig.hip.position.y = 0.95;
    this.arm(x, FIGHT.has(x.state) || x.state === 'await');
    x.trinket.visible = false;
    if (x.state === 'walk') { x.phase += dt * 6.2; pose(rig, 'walk', x.phase); this.carry(x); return; }
    if (x.gun && x.armed && x.state === 'strike') { // удар прикладом: выпад обеими руками
      pose(rig, 'stand');
      arm.ua.rotation.set(-1.3, 0, -arm.s * 0.3); arm.fa.rotation.set(-0.3, 0, 0); left.ua.rotation.set(-1.4, 0, -left.s * 0.2); left.fa.rotation.set(-0.2, 0, 0);
      rig.torso.rotation.set(0.3, arm.s * 0.2, 0); rig.legs[0].th.rotation.x = -0.5; rig.legs[1].th.rotation.x = 0.35;
      return;
    }
    if (x.gun && x.armed && x.state === 'windup') { // замах прикладом: эспингарда отведена назад
      pose(rig, 'stand'); this.stance(x);
      rig.torso.rotation.set(-0.1, -arm.s * 0.6 * Math.min(1, k / 0.3), 0);
      return;
    }
    if (this.fightPose(x, dt, k)) return;
    pose(rig, 'stand');
    switch (x.state === 'act' ? x.act : x.state) {
      case 'greet': { // здоровается: машет поднятой рукой (на остановке у касика — кланяется)
        if (x.state === 'act') { rig.torso.rotation.x = 0.45 * Math.min(1, (Math.sin(t * 0.8) + 1) / 1.2); rig.head.rotation.x = 0.2; arm.ua.rotation.set(-0.6, 0, -arm.s * 0.5); arm.fa.rotation.set(-1.4, 0, 0); break; }
        arm.ua.rotation.set(-0.3, 0, arm.s * 2.3); arm.fa.rotation.set(0, 0, arm.s * 0.4 * Math.sin(t * 9));
        break;
      }
      case 'offer': // протягивает бусы
        arm.ua.rotation.set(-1.2, 0, -arm.s * 0.1); arm.fa.rotation.set(-0.25, 0, 0); rig.torso.rotation.x = 0.12;
        x.trinket.visible = true; x.trinket.rotation.y = Math.sin(t * 2) * 0.3;
        break;
      case 'look': // разглядывает: наклонился, руки за спиной
        rig.torso.rotation.x = 0.35; rig.head.rotation.x = 0.25;
        for (const a of rig.arms) { a.ua.rotation.set(0.45, 0, a.s * 0.15); a.fa.rotation.set(-0.9, 0, 0); }
        break;
      case 'kneel':
        pose(rig, 'kneel'); arm.ua.rotation.x = -0.9; arm.fa.rotation.x = -0.6;
        break;
      case 'point': // показывает рукой через площадь
        arm.ua.rotation.set(-1.55, 0, -arm.s * 0.15 + Math.sin(t * 0.7) * 0.25); arm.fa.rotation.set(-0.05, 0, 0);
        break;
      case 'drink': // пьёт из ладоней
        rig.torso.rotation.x = 0.15; rig.head.rotation.x = -0.25;
        for (const a of rig.arms) { a.ua.rotation.set(-0.95, 0, -a.s * 0.25); a.fa.rotation.set(-1.75 + Math.sin(t * 2) * 0.1, 0, 0); }
        break;
      case 'listen': // слушает, скрестив руки, кивает
        for (const a of rig.arms) { a.ua.rotation.set(-0.5, 0, -a.s * 0.3); a.fa.rotation.set(-1.6, 0, a.s * 0.9); }
        rig.head.rotation.set(0.12 + Math.max(0, Math.sin(t * 1.3)) * 0.12, 0, 0.1);
        break;
      case 'guard': // стережёт лодки: эспингарда на плече, переминается
      default:
        this.carry(x);
        rig.torso.rotation.y = Math.sin(t / 1.1 + x.phase) * 0.06;
    }
  }
}
