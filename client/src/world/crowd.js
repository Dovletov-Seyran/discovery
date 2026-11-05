// Зрители поединка (docs/tz-combat.md): как только начинается бой — с воином касика или с испанцем, — жители
// деревни сходятся к кругу и болеют. Таино болеют за своего (игрока), на бой с испанцем приходят и двое
// матросов — они болеют за товарища. Всё на клиенте и одинаково у всех: места и лица — от id поединка,
// реакции — по `hit` и итогу боя. Зрители не мешают ходить (без столкновений).
//   walk — идут к кругу, watch — хлопают и покачиваются, cheer — прыгают с поднятыми руками (наш попал),
//   groan — хватаются за голову (попали по нашему), ooh — подались вперёд (отбил / увернулся), leave — расходятся.
import * as THREE from 'three';
import { person, pose, makeLabel, taino, NPC_LOOK } from './people.js';

const TAINO_LOOKS = [
  taino({ loincloth: 0xe6dfcb, bodyPaint: 0x9a2a1c }), taino({ nagua: 0xece5d2, bands: 0xece5d2 }),
  taino({ loincloth: 0xd9cfb8, bodyPaint: 0x1e1814, hat: 'band', hatColor: 0x9a2a1c }), taino({ nagua: 0xe0d8c4 }),
  taino({ loincloth: 0xe0d8c4, gold: true }), taino({ loincloth: 0xcfc4ab, hair: 0x9a948c }),
  taino({ nagua: 0xe6dfcb, bands: 0xe6dfcb, bodyPaint: 0x9a2a1c }), taino({ loincloth: 0xd9cfb8, bands: 0xd9cfb8 }),
];
const SAILORS = ['sailor_2', 'musician'];
// Что кричат: таино — по-русски (игрок их понимает), матросы — по-испански
const SHOUTS = {
  taino: { idle: ['Давай!', 'Хай-хай!', 'Бей!', 'Держись!', 'Смелее!'], cheer: ['Ай да удар!', 'Хай!', 'Так его!', 'Ещё!'], groan: ['Ох!', 'Отступай!', 'Берегись!'] },
  sailor: { idle: ['¡Vamos!', '¡Dale!', '¡Ánimo!'], cheer: ['¡Bravo!', '¡Eso es!', '¡Olé!'], groan: ['¡Ay!', '¡Cuidado!', '¡Madre mía!'] },
};
const SPOTS = 10, FAR = 15, WALK = 1.6;
// где стоять нельзя: костёр, сиденье старейшины, стойки с оружием
const BLOCKED = [[171, 257, 1.8], [158, 251, 1.3], [156.9, 245.5, 2.4], [165, 259.5, 1.0], [174, 238, 1.5]];

// одинаковый у всех клиентов «случай» по строке
function seeded(key) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

export class Crowd {
  constructor(scene, M, { labelFactory = makeLabel, heightAt = () => null } = {}) {
    this.M = M; this.labelFactory = labelFactory; this.heightAt = heightAt;
    this.group = new THREE.Group(); scene.add(this.group);
    this.bouts = new Map(); // ключ поединка → { id, kind, ring, people: [...], over }
    this.zone = null;
  }

  ground(x, z) { return this.heightAt(x, z) ?? 2; }

  // `duel`: начались ли поединки, кончились ли
  apply(duelists = [], me = null) {
    const live = new Set();
    for (const d of duelists) {
      if (!d.player || !d.ring) continue;
      const key = `${d.id}:${d.player}`;
      live.add(key);
      if (!this.bouts.has(key)) this.gather(key, d, duelists);
      const bout = this.bouts.get(key);
      bout.mine = d.player === me; bout.name = d.name;
    }
    for (const [key, bout] of this.bouts) {
      if (live.has(key) || bout.over) continue;
      // поединок кончился: итог — у соперника в списке
      const d = duelists.find((x) => x.id === bout.id);
      this.finish(bout, d?.result ?? 'draw');
    }
  }

  // сходятся к кругу: места по эллипсу за линией, кроме занятых костром, стойками и чужим кругом
  gather(key, d, duelists) {
    const rnd = seeded(key), ring = d.ring, others = duelists.filter((x) => x !== d && x.ring).map((x) => x.ring);
    const spots = [];
    for (let i = 0; i < SPOTS * 2 && spots.length < SPOTS; i++) {
      const a = (i / (SPOTS * 2)) * Math.PI * 2 + rnd() * 0.25, gap = 0.9 + rnd() * 0.8;
      const x = ring.c[0] + Math.cos(a) * (ring.rx + gap), z = ring.c[1] + Math.sin(a) * (ring.rz + gap);
      if (BLOCKED.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r)) continue;
      if (others.some((o) => ((x - o.c[0]) / (o.rx + 0.5)) ** 2 + ((z - o.c[1]) / (o.rz + 0.5)) ** 2 < 1)) continue;
      if (rnd() < 0.42) continue; // не сплошной стеной
      spots.push({ x, z, a });
    }
    const sailors = d.kind === 'spaniard' ? SAILORS : [];
    const people = spots.map((s, i) => {
      const side = i < sailors.length ? 'sailor' : 'taino';
      const look = side === 'sailor' ? NPC_LOOK[sailors[i]] ?? NPC_LOOK.sailor_2 : TAINO_LOOKS[Math.floor(rnd() * TAINO_LOOKS.length)];
      const rig = person(this.M.person, look);
      const from = [s.x + Math.cos(s.a) * FAR, s.z + Math.sin(s.a) * FAR];
      rig.root.position.set(from[0], this.ground(from[0], from[1]), from[1]);
      rig.root.visible = this.zone === 'guanahani';
      this.group.add(rig.root);
      return { rig, side, spot: [s.x, s.z], from, state: 'walk', delay: rnd() * 2.5, phase: rnd() * 6, speed: WALK * (0.85 + rnd() * 0.4), until: 0, label: null, shoutUntil: 0, nextShout: 3 + rnd() * 6, rnd };
    });
    this.bouts.set(key, { id: d.id, kind: d.kind, ring, people, over: false });
  }

  // `hit` поединка: попал наш — таино ликуют, матросы охают; попали по нашему — наоборот
  hit(m) {
    if (m.kind !== 'duel' || m.missed) return;
    for (const bout of this.bouts.values()) {
      if (bout.over || (m.by !== bout.id && m.target !== bout.id)) continue;
      const tainoScored = m.target === bout.id && !m.blocked;
      const spaniardScored = m.by === bout.id;
      for (const p of bout.people) {
        if (p.state === 'walk') continue;
        if (m.blocked) { this.react(p, 'ooh', 0.7); continue; }
        const ours = p.side === 'taino' ? tainoScored : spaniardScored;
        this.react(p, ours ? 'cheer' : 'groan', ours ? 1.4 : 1.1);
      }
      const shouters = bout.people.filter((p) => p.state !== 'walk' && p.state !== 'leave');
      for (let i = 0; i < 2 && shouters.length; i++) {
        const p = shouters[Math.floor(Math.random() * shouters.length)];
        this.shout(p, m.blocked ? 'idle' : p.state === 'cheer' ? 'cheer' : 'groan', bout);
      }
    }
  }
  react(p, state, seconds) { p.state = state; p.until = performance.now() + seconds * 1000 * (0.85 + Math.random() * 0.3); }

  finish(bout, result) {
    bout.over = true;
    for (const p of bout.people) {
      const won = (p.side === 'taino') === (result === 'player');
      this.react(p, result === 'draw' ? 'watch' : won ? 'cheer' : 'groan', 2.2);
      p.leaveAt = performance.now() + 2600 + Math.random() * 1500;
    }
    const p = bout.people.find((x) => x.side === 'taino');
    if (p && result === 'player') this.shout(p, 'cheer', bout);
  }

  shout(p, kind, bout) {
    const list = SHOUTS[p.side][kind] ?? SHOUTS[p.side].idle;
    let text = list[Math.floor(Math.random() * list.length)];
    if (p.side === 'sailor' && kind === 'idle' && bout.name && Math.random() < 0.5) text = `¡Vamos, ${bout.name}!`;
    if (!p.label) { p.label = this.labelFactory(); p.label.position.y = 2.2; p.rig.root.add(p.label); }
    p.label.draw(text, ''); p.label.visible = true; p.shoutUntil = performance.now() + 1700;
  }

  setZone(zone) { this.zone = zone; for (const b of this.bouts.values()) for (const p of b.people) p.rig.root.visible = zone === 'guanahani'; }

  clear() { for (const key of [...this.bouts.keys()]) this.drop(key); }
  drop(key) {
    const bout = this.bouts.get(key);
    for (const p of bout?.people ?? []) {
      p.rig.root.removeFromParent();
      p.rig.root.traverse((o) => { o.geometry?.dispose(); if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } });
    }
    this.bouts.delete(key);
  }

  update(dt) {
    const now = performance.now();
    for (const [key, bout] of this.bouts) {
      let gone = 0;
      for (const p of bout.people) {
        const root = p.rig.root, c = bout.ring.c;
        if (p.label && now > p.shoutUntil) p.label.visible = false;
        if (p.leaveAt && now > p.leaveAt && p.state !== 'leave') p.state = 'leave';
        if (p.state === 'walk' || p.state === 'leave') {
          if ((p.delay -= dt) > 0) { pose(p.rig, 'stand'); continue; }
          const to = p.state === 'walk' ? p.spot : p.from;
          const dx = to[0] - root.position.x, dz = to[1] - root.position.z, d = Math.hypot(dx, dz);
          if (d < 0.1) {
            if (p.state === 'leave') { gone++; root.visible = false; continue; }
            p.state = 'watch';
          } else {
            const k = Math.min(1, (p.speed * dt) / d);
            root.position.x += dx * k; root.position.z += dz * k; root.position.y = this.ground(root.position.x, root.position.z);
            root.rotation.y = Math.atan2(dx, dz);
            p.phase += dt * 6.5; pose(p.rig, 'walk', p.phase);
            continue;
          }
        }
        // на месте: лицом в круг
        root.rotation.y = Math.atan2(c[0] - root.position.x, c[1] - root.position.z);
        if ((p.state === 'cheer' || p.state === 'groan' || p.state === 'ooh') && now > p.until) p.state = 'watch';
        if (p.state === 'watch' && !bout.over && (p.nextShout -= dt) < 0) { p.nextShout = 4 + Math.random() * 7; if (Math.random() < 0.5) this.shout(p, 'idle', bout); }
        this.animate(p, now / 1000);
      }
      if (bout.over && gone === bout.people.length) this.drop(key);
    }
  }

  animate(p, t) {
    const { rig } = p, [l, r] = rig.arms, ph = t + p.phase;
    pose(rig, 'stand');
    switch (p.state) {
      case 'cheer': { // прыгает, руки вверх
        const j = Math.abs(Math.sin(ph * 7));
        rig.hip.position.y = 0.95 + j * 0.16;
        for (const a of rig.arms) { a.ua.rotation.set(-2.8 + Math.sin(ph * 7 + a.s) * 0.2, 0, a.s * 0.3); a.fa.rotation.set(-0.3, 0, 0); }
        rig.head.rotation.x = -0.25;
        break;
      }
      case 'groan': // руки на голову
        for (const a of rig.arms) { a.ua.rotation.set(-2.2, 0, a.s * 0.9); a.fa.rotation.set(-2.2, 0, 0); }
        rig.torso.rotation.x = 0.12; rig.head.rotation.x = 0.2;
        break;
      case 'ooh': // подался вперёд
        rig.torso.rotation.x = 0.28; rig.head.rotation.x = -0.15;
        for (const a of rig.arms) { a.ua.rotation.set(-0.9, 0, -a.s * 0.2); a.fa.rotation.set(-0.8, 0, 0); }
        break;
      default: { // хлопает в ладоши, покачивается, иногда вскидывает кулак
        const clap = Math.sin(ph * 6.2) > 0.6;
        l.ua.rotation.set(-1.05, 0, clap ? 0.05 : -l.s * 0.32); l.fa.rotation.set(-0.85, 0, clap ? 0 : l.s * 0.3);
        r.ua.rotation.set(-1.05, 0, clap ? 0.05 : -r.s * 0.32); r.fa.rotation.set(-0.85, 0, clap ? 0 : r.s * 0.3);
        if (Math.sin(ph * 0.9) > 0.92) { r.ua.rotation.set(-2.9, 0, r.s * 0.2); r.fa.rotation.set(-0.4, 0, 0); }
        rig.torso.rotation.z = Math.sin(ph * 2.1) * 0.06;
        rig.hip.position.y = 0.95 - Math.abs(Math.sin(ph * 3.1)) * 0.02;
      }
    }
  }
}
