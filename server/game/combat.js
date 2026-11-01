// Бой на Гуанахани, вариант B (docs/tz-combat.md): деревня calm → alert → fight и обратно, обидчики,
// удары по таино и воинам, здоровье игроков, воины на сервере. Клиенты только рисуют: `combat` 10 раз в секунду,
// `hit` на каждое попадание, `hp` в vitals, `down` в состоянии таино. Состояние живёт в памяти: перезапуск
// сервера или смена сцены — деревня снова спокойна.
import { S2C } from '../../shared/protocol.js';
import { heldItem } from '../../shared/player-presentation.js';
import { loadContent } from '../content.js';
import { players } from './players.js';
import * as director from './director.js';
import * as entities from './entities.js';
import { performAction } from './player-actions.js';
import { worldEvent } from './world-events.js';

export const ZONE = 'guanahani';
const SCENES = new Set(['p2_day', 'p2_evening', 'p2_night', 'p2_landing']);
const TAINO = new Set(['cacique', 'elder', 'villager_1', 'villager_2', 'villager_3']);
const GIFTS = ['fish', 'conch', 'casabe', 'cotton', 'gift_cotton', 'parrot'];
export const C = {
  REACH: 2.2, LAG: 0.5, ATTACK_MS: 600,             // удар игрока: дальность (+ запас на задержку), перезарядка
  HITS: 3, DOWN_MS: 10000,                          // таино и воин падают после 3 ударов и лежат 10 с
  WARRIORS: 4, GUARD_R: 9, CORE_R: 10, WARN_R: 16,  // пост в 9 м от центра; деревня — 10 м; «Уходи!» — с 16 м
  WARN_MS: 6000, LEASH_R: 38, ESCAPE_MS: 20000, CALM_MS: 90000,
  SPEED: 4.2, WALK: 2, CLOSE: 1.3,                  // бег воина, шаг к посту, с какого расстояния замах
  WINDUP_MS: 600, STRIKE_MS: 350, STRIKE_R: 1.9, STRIKE_CD_MS: 1300, DAMAGE: 20, HP: 100,
  ATTACKERS: 2, STAGGER_MS: 700, RING: 2.3,         // на одного — не больше двоих сразу и не чаще раза в 0,7 с; остальные окружают
};

const layout = loadContent('guanahani_layout.json', {});
const CENTER = layout.town?.center ?? [172, 255];

let v = fresh();
function fresh(now = Date.now()) {
  return { key: null, level: 'calm', changedAt: now, incidentAt: 0, offenders: new Map(), npcs: new Map(), warriors: [], sentAt: 0 };
}

const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const round = (x) => Math.round(x * 100) / 100;
const ground = (x, z) => Math.max(director.groundAt(ZONE, x, z) ?? 0, 0);
const sceneKey = () => `${director.scene().id}@${director.startAt()}`;
const active = () => SCENES.has(director.scene().id) && !director.isTransitioning();
const inZone = (p) => p.connected && p.zone === ZONE && Array.isArray(p.p);
const toZone = (msg) => players.broadcast(msg, (x) => x.zone === ZONE);
const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });

export const level = () => v.level;
export const isOffender = (p) => v.level !== 'calm' && v.offenders.has(p.id);
export const hpOf = (p) => p.vitals?.hp ?? C.HP;
export const npcDown = (id, now = Date.now()) => (v.npcs.get(id)?.downUntil ?? 0) > now;
// Таино не разговаривают с тем, кто их бил, пока деревня не успокоится
export const refuses = (p, npc) => TAINO.has(npc) && isOffender(p);

export function reset(now = Date.now()) {
  const had = v.level !== 'calm' || v.warriors.length;
  for (const id of v.npcs.keys()) entities.setState(id, { down: 0 });
  v = fresh(now);
  if (had) broadcastState(now, true);
}

function setLevel(next, now) {
  if (v.level === next) return;
  v.level = next; v.changedAt = now;
  if (next === 'alert' && !v.warriors.length) spawnWarriors(now);
  if (next === 'alert' || next === 'fight') toZone({ t: S2C.WORLD_EVENT, type: 'alarm', who: null, p: [CENTER[0], ground(...CENTER), CENTER[1]], zone: ZONE, serverNow: now });
  if (next === 'calm') {
    v.warriors = []; v.offenders.clear();
    for (const p of players.connected()) if (p.zone === ZONE) notice(p, 'Деревня успокоилась');
  }
  console.log(`[combat] деревня: ${next}`);
  broadcastState(now, true);
}

function spawnWarriors(now) {
  v.warriors = Array.from({ length: C.WARRIORS }, (_, i) => {
    const a = (i / C.WARRIORS) * Math.PI * 2, x = CENTER[0] + Math.cos(a) * 4, z = CENTER[1] + Math.sin(a) * 4;
    return { id: `warrior_${i}`, p: [x, ground(x, z), z], r: 0, state: 'guard', hits: 0, downUntil: 0, target: null, t: now, lastStrike: 0 };
  });
}

// --- удар игрока ---

export function attack(p, msg, now = Date.now()) {
  if (!active() || !inZone(p) || typeof msg?.target !== 'string') return false;
  if (now - (p.lastAttackAt ?? 0) < C.ATTACK_MS) return false;
  if (v.key !== sceneKey()) { reset(now); v.key = sceneKey(); }
  const warrior = v.warriors.find((w) => w.id === msg.target);
  const def = !warrior && TAINO.has(msg.target) ? entities.def(msg.target) : null;
  if (!warrior && (!def || def.zone !== ZONE)) return false;
  const at = warrior ? warrior.p : [def.x, def.p?.[1] ?? 0, def.z];
  if (flat(p.p, at) > C.REACH + C.LAG) return notice(p, 'Слишком далеко'), false;
  p.lastAttackAt = now;
  performAction(p, 'swing', heldItem(p));
  worldEvent(p, 'swing');
  // кто бьёт таино — обидчик; повторный удар, удар по воину — бой
  const o = v.offenders.get(p.id) ?? { hits: 0, warnedAt: 0, nearSince: 0 };
  o.hits++; v.offenders.set(p.id, o); v.incidentAt = now;
  if (warrior) hitWarrior(p, warrior, now);
  else hitNpc(p, msg.target, now);
  if (v.level === 'calm') setLevel('alert', now);
  else if (v.level === 'alert' && (o.hits > 1 || warrior)) setLevel('fight', now);
  else broadcastState(now, true);
  return true;
}

function hitNpc(p, id, now) {
  const s = v.npcs.get(id) ?? { hits: 0, downUntil: 0 };
  if (s.downUntil > now) return;
  s.hits++;
  const down = s.hits >= C.HITS;
  if (down) { s.hits = 0; s.downUntil = now + C.DOWN_MS; players.broadcast({ t: S2C.ENTITY, id, state: entities.setState(id, { down: s.downUntil }) }); }
  v.npcs.set(id, s);
  toZone({ t: S2C.HIT, by: p.id, target: id, kind: 'npc', hp: C.HITS - s.hits, down });
}

function hitWarrior(p, w, now) {
  if (w.downUntil > now) return;
  w.hits++;
  const down = w.hits >= C.HITS;
  if (down) { w.hits = 1; w.downUntil = now + C.DOWN_MS; w.state = 'down'; w.target = null; }
  toZone({ t: S2C.HIT, by: p.id, target: w.id, kind: 'warrior', hp: C.HITS - (down ? C.HITS : w.hits), down });
}

// Дар касику — мир (rules.interact зовёт перед обычным разговором). → true, если дар принят
export function offerPeace(p, now = Date.now()) {
  if (!isOffender(p) || !inZone(p)) return false;
  const gift = GIFTS.find((g) => p.inventory?.includes(g));
  if (!gift) return notice(p, 'Касик молчит. С пустыми руками мира не просят'), true;
  p.inventory.splice(p.inventory.indexOf(gift), 1);
  players.sendInventory(p); players.save(p, { now: true });
  performAction(p, 'give', gift, { target: 'cacique' });
  setLevel('calm', now);
  return true;
}

// --- такт: ступени деревни и воины ---

export function tick(now = Date.now()) {
  if (v.level === 'calm' && !v.warriors.length) return;
  if (!active() || v.key !== sceneKey()) return reset(now);
  const offenders = [...v.offenders.keys()].map((id) => players.get(id)).filter((p) => p && inZone(p));
  for (const id of v.offenders.keys()) if (!offenders.some((p) => p.id === id)) v.offenders.delete(id);
  const fromCenter = (p) => Math.hypot(p.p[0] - CENTER[0], p.p[2] - CENTER[1]);
  if (v.level === 'alert') {
    for (const p of offenders) {
      const o = v.offenders.get(p.id), d = fromCenter(p);
      if (d < C.WARN_R) {
        o.nearSince ||= now;
        if (now - o.warnedAt > 5000) { o.warnedAt = now; notice(p, 'Воины преграждают путь: «Уходи!»'); }
        if (d < C.CORE_R || now - o.nearSince > C.WARN_MS) { setLevel('fight', now); break; }
      } else o.nearSince = 0;
    }
    if (v.level === 'alert' && now - v.incidentAt > C.CALM_MS && offenders.every((p) => fromCenter(p) > C.WARN_R)) setLevel('calm', now);
  } else if (v.level === 'fight') {
    const near = offenders.filter((p) => fromCenter(p) < C.LEASH_R && hpOf(p) > 0);
    if (near.length) v.incidentAt = now;
    if (!offenders.length || now - v.incidentAt > C.ESCAPE_MS) setLevel('alert', now);
  }
  moveWarriors(offenders, now);
  if (now - v.sentAt >= 100) broadcastState(now);
}

function moveWarriors(offenders, now) {
  const dt = Math.min((now - (v.movedAt ?? now)) / 1000, 0.25);
  v.movedAt = now;
  const fromCenter = (q) => Math.hypot(q[0] - CENTER[0], q[2] - CENTER[1]);
  // пост: дуга между деревней и ближайшим обидчиком, лицом к нему
  const watch = offenders.slice().sort((a, b) => fromCenter(a.p) - fromCenter(b.p))[0];
  const dir = watch ? Math.atan2(watch.p[2] - CENTER[1], watch.p[0] - CENTER[0]) : 0;
  v.warriors.forEach((w, i) => {
    if (w.downUntil > now) { w.state = 'down'; return; }
    if (w.state === 'down') w.state = 'return';
    const target = v.level === 'fight' ? offenders.filter((p) => hpOf(p) > 0 && fromCenter(p.p) < C.LEASH_R).sort((a, b) => flat(a.p, w.p) - flat(b.p, w.p))[0] : null;
    if (!target) {
      const a = dir + (i - (C.WARRIORS - 1) / 2) * 0.28, post = [CENTER[0] + Math.cos(a) * C.GUARD_R, 0, CENTER[1] + Math.sin(a) * C.GUARD_R];
      w.target = null;
      w.state = step(w, post, C.WALK, dt, 0.2) ? 'guard' : 'return';
      if (watch) face(w, watch.p);
      return;
    }
    w.target = target.id;
    if (w.state === 'windup') {
      face(w, target.p);
      if (now - w.t < C.WINDUP_MS) return;
      w.state = 'strike'; w.t = now; w.lastStrike = now;
      const ahead = Math.abs(angle(w, target.p)) < 1.2;
      if (flat(w.p, target.p) <= C.STRIKE_R && ahead) damage(target, w, now);
      return;
    }
    if (w.state === 'strike' && now - w.t < C.STRIKE_MS) return;
    const busy = v.warriors.filter((x) => x !== w && x.target === target.id && (x.state === 'windup' || x.state === 'strike')).length;
    const turn = busy < C.ATTACKERS && now - (target.windupAt ?? 0) > C.STAGGER_MS;
    if (turn && flat(w.p, target.p) <= C.CLOSE && now - w.lastStrike > C.STRIKE_CD_MS) { w.state = 'windup'; w.t = now; target.windupAt = now; face(w, target.p); return; }
    w.state = 'chase';
    step(w, target.p, C.SPEED, dt, turn ? C.CLOSE * 0.8 : C.RING);
    face(w, target.p);
  });
  // не сливаться в одну точку
  for (const a of v.warriors) for (const b of v.warriors) {
    if (a === b) continue;
    const dx = a.p[0] - b.p[0], dz = a.p[2] - b.p[2], d = Math.hypot(dx, dz);
    if (d > 0 && d < 0.9) { a.p[0] += (dx / d) * (0.9 - d) / 2; a.p[2] += (dz / d) * (0.9 - d) / 2; }
  }
}

// Шаг к цели; → true, если уже на месте. Поворот — по ходу (как r у камеры: 0 — к −z)
function step(w, to, speed, dt, stop) {
  const dx = to[0] - w.p[0], dz = to[2] - w.p[2], d = Math.hypot(dx, dz);
  if (d <= stop) return true;
  const k = Math.min(speed * dt, d - stop) / d;
  w.p[0] += dx * k; w.p[2] += dz * k; w.p[1] = ground(w.p[0], w.p[2]);
  w.r = Math.atan2(-dx, -dz);
  return false;
}
const face = (w, to) => { w.r = Math.atan2(w.p[0] - to[0], w.p[2] - to[2]); };
const angle = (w, to) => { const a = Math.atan2(w.p[0] - to[0], w.p[2] - to[2]) - w.r; return Math.atan2(Math.sin(a), Math.cos(a)); };

function damage(p, w, now) {
  p.vitals ??= {};
  p.vitals.hp = Math.max(0, hpOf(p) - C.DAMAGE);
  const out = p.vitals.hp <= 0;
  toZone({ t: S2C.HIT, by: w.id, target: p.id, kind: 'player', hp: p.vitals.hp, down: out });
  if (out) knockOut(p, now);
  players.send(p, { t: S2C.VITALS, ...p.vitals, serverNow: now });
}

// Оглушён: приходит в себя на точке появления своей роли, здоровье снова полное, удары прощены
function knockOut(p, now) {
  const spawn = director.spawnFor(director.scene(), p.role);
  if (spawn) { p.p = spawn.p; p.r = spawn.r; p.lastCorrectAt = now; p.lastMoveAt = now; players.send(p, { t: S2C.POS_CORRECT, p: p.p, r: p.r }); }
  p.vitals.hp = C.HP;
  v.offenders.delete(p.id);
  notice(p, 'Тебя оглушили. Ты очнулся на берегу');
  players.save(p, { now: true });
  if (!v.offenders.size && v.level === 'fight') setLevel('alert', now);
}

export function state(now = Date.now()) {
  return {
    t: S2C.COMBAT, level: v.level, offenders: [...v.offenders.keys()], serverNow: now,
    warriors: v.warriors.map((w) => ({ id: w.id, p: w.p.map(round), r: round(w.r), state: w.state, hp: C.HITS - w.hits })),
  };
}

function broadcastState(now, force = false) {
  if (!force && !v.warriors.length) return;
  v.sentAt = now;
  toZone(state(now));
}
