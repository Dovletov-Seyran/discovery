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

const FIGHT = new Set(['ready', 'approach', 'circle', 'windup', 'strike', 'recover', 'block', 'dodge', 'stagger', 'aim', 'fire', 'reload']);
// где стрелок держит эспингарду наготове (ствол вперёд-вниз); приклад вперёд — только удар прикладом и защита
const LOW_READY = new Set(['ready', 'await', 'approach', 'circle', 'recover', 'dodge', 'stagger', 'lead', 'return']);
const glow = (color, opacity = 1) => { const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); m.userData.equipmentOwned = true; return m; };
const own =(color, roughness = 0.8, metalness = 0) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); m.userData.equipmentOwned = true; return m; };

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
      // фитиль в курке тлеет, пока целится; вспышка у дула — при выстреле
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), glow(0xff6a1a)); ember.position.set(0.045, 0.06, 0); ember.visible = false; x.gun.add(ember); x.ember = ember;
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow(0xffd27a, 0.95)); flash.position.fromArray(x.gun.userData.muzzle ?? [0, 1.18, 0]); flash.position.y += 0.08; flash.visible = false; x.gun.add(flash); x.flash = flash;
      // шомпол — в другой руке, только пока перезаряжает
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.85, 5), own(0x5a3a22, 0.8)); rod.position.y = -0.62; rod.visible = false;
      rig.arms.find((a) => a !== arm).fa.add(rod); x.rod = rod;
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

  // эспингарда в бою: прицел и выстрел — дулом на соперника, перезарядка — стоймя, удар прикладом — прикладом
  // вперёд; фитиль тлеет при прицеле, вспышка и дым — при выстреле
  gunner(x, k, t) {
    if (!x.armed) { x.ember.visible = x.flash.visible = x.rod.visible = false; return; }
    const aiming = x.state === 'aim' || x.state === 'fire', reloading = x.state === 'reload';
    if (aiming) x.gun.rotation.set(Math.PI, 0, 0);
    else if (reloading) x.gun.rotation.set(Math.PI / 2, 0, 0);
    else x.gun.rotation.set(0, 0, 0);
    x.ember.visible = x.state === 'aim' && Math.sin(t * 18) > -0.3;
    x.flash.visible = x.state === 'fire' && k < 0.12;
    x.flash.scale.setScalar(1 + k * 6);
    x.rod.visible = reloading && k > 0.4 && k < 2.8;
    if (x.state === 'fire' && !x.smoked) { x.smoked = true; this.smoke(x.gun); }
    if (x.state !== 'fire') x.smoked = false;
  }

  // Наготове: приклад у бедра, правая рука на шейке приклада, левая — под стволом, ствол вперёд и вниз
  lowReady(x) {
    const { arm, rig } = x, left = rig.arms.find((a) => a !== arm);
    arm.ua.rotation.set(-0.35, 0, -arm.s * 0.2); arm.fa.rotation.set(-1.0, 0, arm.s * 0.15);
    left.ua.rotation.set(-1.0, 0, -left.s * 0.45); left.fa.rotation.set(-0.55, 0, 0);
    this.aimGun(x, 1, -0.42);
  }

  // ствол точно туда, куда он смотрит (то есть на соперника), что бы ни делали руки; lift — пока поднимает
  // ружьё к плечу, up — подброс ствола отдачей
  aimGun(x, lift = 1, up = 0) {
    const root = x.rig.root, parent = x.gun.parent;
    root.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, Math.sin(up), Math.cos(up)).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    const want = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fwd.normalize());
    const local = parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want);
    x.gun.quaternion.slerp(local, lift);
  }

  // клуб порохового дыма у дула: несколько шаров расходятся, поднимаются и тают
  smoke(gun) {
    gun.updateMatrixWorld(true);
    const at = gun.localToWorld(new THREE.Vector3().fromArray(gun.userData.muzzle ?? [0, 1.18, 0]));
    const dir = gun.localToWorld(new THREE.Vector3(0, 2, 0)).sub(at).normalize();
    this.puffs ??= [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.MeshBasicMaterial({ color: i < 3 ? 0xd8d2c4 : 0xbab4a8, transparent: true, opacity: 0.55, depthWrite: false });
      m.userData.equipmentOwned = true;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), m);
      puff.position.copy(at);
      const v = dir.clone().multiplyScalar(0.5 + i * 0.18).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5));
      this.group.add(puff);
      this.puffs.push({ puff, v, age: 0, life: 1.6 + Math.random() * 0.9 });
    }
  }

  update(dt) {
    super.update(dt);
    if (!this.puffs?.length) return;
    dt = Math.min(dt, 0.1); // вкладка была в фоне — дым не исчезает рывком
    for (const s of this.puffs) {
      s.age += dt; s.v.multiplyScalar(Math.max(0, 1 - dt * 2.2)); s.v.y += dt * 0.25;
      s.puff.position.addScaledVector(s.v, dt);
      s.puff.scale.setScalar(1 + s.age * 4.5);
      s.puff.material.opacity = 0.55 * Math.max(0, 1 - s.age / s.life);
    }
    for (const s of this.puffs.filter((x) => x.age >= x.life)) { s.puff.removeFromParent(); s.puff.geometry.dispose(); s.puff.material.dispose(); }
    this.puffs = this.puffs.filter((x) => x.age < x.life);
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
    if (x.gun) this.gunner(x, k, t);
    if (x.state === 'walk') { x.phase += dt * 6.2; pose(rig, 'walk', x.phase); this.carry(x); return; }
    if (x.gun && x.armed && x.state === 'aim') { // целится: приклад к плечу, ствол на соперника, левая рука под цевьём
      pose(rig, 'stand');
      const lift = Math.min(1, k / 0.35);
      arm.ua.rotation.set(-1.5 * lift, 0, -arm.s * 0.2 * lift); arm.fa.rotation.set(-0.05, 0, arm.s * 0.1 * lift);
      left.ua.rotation.set(-1.55 * lift, 0, -left.s * 0.45 * lift); left.fa.rotation.set(-0.1, 0, 0);
      rig.head.rotation.set(0.12 * lift, -arm.s * 0.2 * lift, 0); rig.torso.rotation.set(0, arm.s * 0.1 * lift, 0);
      rig.legs[0].th.rotation.x = -0.25; rig.legs[1].th.rotation.x = 0.2;
      this.aimGun(x, lift);
      return;
    }
    if (x.gun && x.armed && x.state === 'fire') { // отдача: ствол вверх, корпус назад
      pose(rig, 'stand');
      const kick = Math.max(0, 1 - k / 0.3);
      arm.ua.rotation.set(-1.5 - 0.35 * kick, 0, -arm.s * 0.2); arm.fa.rotation.set(-0.05, 0, arm.s * 0.25);
      left.ua.rotation.set(-1.55 - 0.3 * kick, 0, -left.s * 0.45); left.fa.rotation.set(-0.1, 0, 0);
      rig.torso.rotation.set(-0.18 * kick, arm.s * 0.1, 0); rig.head.rotation.set(0.12, -arm.s * 0.2, 0);
      this.aimGun(x, 1, 0.35 * kick);
      return;
    }
    if (x.gun && x.armed && x.state === 'reload') { // перезаряжает: ружьё стоймя, забивает заряд шомполом
      pose(rig, 'stand');
      arm.ua.rotation.set(-0.55, 0, -arm.s * 0.2); arm.fa.rotation.set(-0.75, 0, 0);
      const ram = k > 0.6 && k < 2.6 ? Math.abs(Math.sin((k - 0.6) * 4.2)) : 0;
      left.ua.rotation.set(-2.45 + ram * 0.35, 0, -left.s * 0.35); left.fa.rotation.set(-0.35 + ram * 0.2, 0, 0);
      rig.torso.rotation.set(0.12, 0, 0); rig.head.rotation.set(0.35, 0, 0);
      return;
    }
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
    if (this.fightPose(x, dt, k)) {
      if (x.gun && x.armed && LOW_READY.has(x.state)) this.lowReady(x); // эспингарда наготове: ствол вперёд и вниз, двумя руками
      return;
    }
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
