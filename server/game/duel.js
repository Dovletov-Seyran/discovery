// Поединки с воинами касика на батее (docs/tz-combat.md, «Поединки»). Во второй части игроки — таино,
// поэтому основной бой — тренировка: очки до трёх, здоровье не тратится, деревня не тревожится.
// Всё решает сервер: воины двигаются здесь, клиенты рисуют их по `duel` (10 раз в секунду в поединке,
// раз в секунду без него), очко — `hit { kind: 'duel' }`. Вызов — E у воина, удар — `attack`.
import { S2C } from '../../shared/protocol.js';
import { heldItem } from '../../shared/player-presentation.js';
import { players } from './players.js';
import * as director from './director.js';
import * as quests from './quests.js';
import * as combat from './combat.js';
import { performAction, equipForUse } from './player-actions.js';

const ZONE = 'guanahani';
const SCENES = new Set(['p2_day', 'p2_evening']);
const WEAPON = 'macana';
export const RING = { c: [168, 255], rx: 13.6, rz: 9.6 }; // внутри камней батея (овал 15 × 11 м)
export const D = {
  WIN: 3, READY_MS: 3000, LIMIT_MS: 120000, RESULT_MS: 4000,
  REACH: 2.4, LAG: 0.5, ATTACK_MS: 550, CHALLENGE_R: 3.5, EXIT: 1.5, START: 1.6,
  CIRCLE: 2.4, CLOSE: 1.6, STRIKE_R: 1.95, STRIKE_MS: 350, BLOCK_MS: 350, STAGGER_MS: 600, FLANK: 1.2,
};
export const DUELISTS = [
  { id: 'duelist_young', name: 'Юный воин', log: 'duel_young', home: [160.5, 255], r: -Math.PI / 2, windup: 850, recover: 1100, speed: 2.4, think: [900, 1800], feint: 0 },
  { id: 'duelist_veteran', name: 'Опытный воин', log: 'duel_veteran', home: [175.5, 255], r: Math.PI / 2, windup: 600, recover: 750, speed: 3.1, think: [500, 1200], feint: 0.3 },
];

let rnd = Math.random;
export const setRandom = (f) => { rnd = f; };

const ground = (x, z) => Math.max(director.groundAt(ZONE, x, z) ?? 0, 0);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const round = (x) => Math.round(x * 100) / 100;
const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });
const active = () => SCENES.has(director.scene().id) && director.scene().zone === ZONE && !director.isTransitioning();
const inRing = (p, margin = 0) => ((p[0] - RING.c[0]) / (RING.rx + margin)) ** 2 + ((p[2] - RING.c[1]) / (RING.rz + margin)) ** 2 <= 1;

const duels = new Map();
let sentAt = 0, shown = null; // когда рассылали `duel`; показаны ли воины клиентам (вне сцен поединков — нет)
function fresh(def) {
  return { def, p: [def.home[0], ground(...def.home), def.home[1]], r: def.r, state: 'idle', player: null, score: [0, 0], t: 0, startsAt: 0, until: 0, nextMove: 0, result: null, lastPlayer: null, resultAt: 0, blocks: 0, side: 1, feinting: false };
}
export function reset() { duels.clear(); for (const def of DUELISTS) duels.set(def.id, fresh(def)); sentAt = 0; shown = null; }
reset();

export const isDuelist = (id) => typeof id === 'string' && duels.has(id);
export const duelOf = (p) => [...duels.values()].find((d) => d.player === p.id) ?? null;

// --- вызов ---

export function challenge(p, id, now = Date.now()) {
  const d = duels.get(id);
  if (!d || p.zone !== ZONE || !p.p) return false;
  if (!active()) return notice(p, 'Воины касика тренируются днём и вечером'), false;
  if (combat.level() !== 'calm') return notice(p, 'В деревне тревога — сейчас не до поединков'), false;
  if (d.state !== 'idle') return notice(p, d.player ? 'Этот воин уже бьётся' : 'Воин ещё не вернулся на место'), false;
  if (flat(p.p, d.p) > D.CHALLENGE_R) return notice(p, 'Подойди ближе'), false;
  if (duelOf(p)) return notice(p, 'Ты уже в поединке'), false;
  // встают в центре батея лицом друг к другу: игрок — со своей стороны
  const side = Math.sign(p.p[0] - RING.c[0]) || 1, c = RING.c;
  const me = [c[0] + side * D.START, 0, c[1]], him = [c[0] - side * D.START, 0, c[1]];
  me[1] = ground(me[0], me[2]); him[1] = ground(him[0], him[2]);
  p.p = me; p.r = side > 0 ? Math.PI / 2 : -Math.PI / 2; p.lastCorrectAt = now; p.lastMoveAt = now;
  players.send(p, { t: S2C.POS_CORRECT, p: p.p, r: p.r });
  if (!p.inventory.includes(WEAPON)) p.inventory.push(WEAPON);
  players.sendInventory(p); equipForUse(p, WEAPON);
  Object.assign(d, { p: him, r: side > 0 ? -Math.PI / 2 : Math.PI / 2, state: 'ready', player: p.id, score: [0, 0], t: now,
    startsAt: now + D.READY_MS, until: now + D.READY_MS + D.LIMIT_MS, result: null, lastPlayer: p.id, resultAt: 0, blocks: 0, side: 1 });
  notice(p, `Поединок с воином: до ${D.WIN} очков. Отступай на его замахе и бей, пока он открыт`);
  console.log(`[duel] ${p.name} — ${d.def.name}`);
  broadcast(now, true);
  return true;
}

// --- удар игрока ---

export function attack(p, id, now = Date.now()) {
  const d = duels.get(id);
  if (!d) return false;
  if (d.player !== p.id) return notice(p, 'Вызови воина на поединок: подойди и нажми E'), false;
  if (d.state === 'ready' || now - (p.lastDuelAttackAt ?? 0) < D.ATTACK_MS) return false;
  p.lastDuelAttackAt = now;
  performAction(p, 'swing', heldItem(p));
  if (flat(p.p, d.p) > D.REACH + D.LAG) return false; // промах: взмах в воздух
  // засчитывается: сбил замах, ударил, пока он открыт после своего удара, или сбоку / сзади
  const open = d.state === 'windup' || d.state === 'recover', flank = Math.abs(bearing(d, p.p)) > D.FLANK;
  if (d.state === 'stagger') return false;
  if (open || flank) {
    d.score[0]++; d.blocks = 0;
    setState(d, 'stagger', now);
    shove(d, p.p, 0.6);
    toZone({ t: S2C.HIT, by: p.id, target: d.def.id, kind: 'duel', score: [...d.score] });
    if (d.score[0] >= D.WIN) end(d, 'player', now);
  } else {
    d.blocks++;
    setState(d, 'block', now);
    toZone({ t: S2C.HIT, by: p.id, target: d.def.id, kind: 'duel', blocked: true, score: [...d.score] });
  }
  broadcast(now, true);
  return true;
}

// --- такт ---

export function tick(now = Date.now()) {
  const on = active();
  for (const d of duels.values()) {
    if (!on) { if (d.player) end(d, 'draw', now, 'Поединок прерван'); Object.assign(d, fresh(d.def)); continue; }
    if (d.player) {
      const p = players.get(d.player);
      if (!p || !p.connected || p.zone !== ZONE || !p.p) { end(d, 'draw', now); continue; }
      if (combat.level() !== 'calm') { end(d, 'draw', now, 'В деревне тревога — поединок прерван'); continue; }
      if (!inRing(p.p, D.EXIT)) { end(d, 'warrior', now, 'Ты вышел из круга — поединок проигран'); continue; }
      if (now > d.until) { end(d, 'draw', now, 'Время вышло — ничья'); continue; }
      fight(d, p, now);
    } else if (d.state === 'return') {
      const home = [d.def.home[0], 0, d.def.home[1]], dt = Math.min((now - (d.movedAt ?? now)) / 1000, 0.25);
      d.movedAt = now;
      if (step(d, home, d.def.speed * 0.7, dt, 0.1)) { d.state = 'idle'; d.r = d.def.r; }
    }
  }
  const busy = [...duels.values()].some((d) => d.state !== 'idle');
  if (!on) { if (shown !== false) { shown = false; toZone({ t: S2C.DUEL, duelists: [], serverNow: now }); } return; }
  if (now - sentAt >= (busy ? 100 : 1000) || shown !== true) broadcast(now, true);
}

function fight(d, p, now) {
  const def = d.def, dist = flat(d.p, p.p);
  const dt = Math.min((now - (d.movedAt ?? now)) / 1000, 0.25);
  d.movedAt = now;
  switch (d.state) {
    case 'ready':
      face(d, p.p);
      if (now >= d.startsAt) { setState(d, 'circle', now); d.nextMove = now + think(def); }
      return;
    case 'windup':
      face(d, p.p);
      if (d.feinting && now - d.t >= def.windup * 0.5) { d.feinting = false; setState(d, 'circle', now); d.nextMove = now + 350; return; }
      if (now - d.t < def.windup) return;
      setState(d, 'strike', now);
      if (dist <= D.STRIKE_R && Math.abs(bearing(d, p.p)) < 1.0) {
        d.score[1]++;
        toZone({ t: S2C.HIT, by: def.id, target: p.id, kind: 'duel', score: [...d.score] });
        if (d.score[1] >= D.WIN) end(d, 'warrior', now);
      }
      return;
    case 'strike':
      if (now - d.t >= D.STRIKE_MS) setState(d, 'recover', now);
      return;
    case 'recover':
      if (now - d.t >= def.recover) { setState(d, 'circle', now); d.nextMove = now + think(def); }
      return;
    case 'block':
      face(d, p.p);
      if (now - d.t < D.BLOCK_MS) return;
      // два отбитых подряд — сразу ответный замах
      if (d.blocks >= 2) { d.blocks = 0; startWindup(d, now); } else setState(d, 'circle', now);
      return;
    case 'stagger':
      if (now - d.t >= D.STAGGER_MS) { setState(d, 'circle', now); d.nextMove = now + think(def); }
      return;
    default: { // approach / circle / close: держит дистанцию, кружит, по сигналу идёт в атаку
      if (now >= d.nextMove) {
        d.state = 'close';
        if (dist <= D.CLOSE + 0.05) { startWindup(d, now); return; }
        step(d, p.p, def.speed, dt, D.CLOSE); face(d, p.p);
        return;
      }
      if (dist > D.CIRCLE + 0.5) { d.state = 'approach'; step(d, p.p, def.speed, dt, D.CIRCLE); face(d, p.p); return; }
      d.state = 'circle';
      // по кругу вокруг игрока, лицом к нему; у края батея — в другую сторону
      const a = Math.atan2(d.p[2] - p.p[2], d.p[0] - p.p[0]) + d.side * def.speed * 0.45 * dt / D.CIRCLE;
      const to = [p.p[0] + Math.cos(a) * D.CIRCLE, 0, p.p[2] + Math.sin(a) * D.CIRCLE];
      if (!inRing(to, -0.8)) d.side = -d.side;
      else step(d, to, def.speed, dt, 0.02);
      face(d, p.p);
    }
  }
}

function startWindup(d, now) {
  setState(d, 'windup', now);
  d.feinting = rnd() < d.def.feint;
}
const think = (def) => def.think[0] + rnd() * (def.think[1] - def.think[0]);
function setState(d, state, now) { d.state = state; d.t = now; }

function end(d, result, now, text) {
  const p = players.get(d.player), def = d.def;
  if (p) {
    const had = p.inventory.length;
    p.inventory = p.inventory.filter((x) => x !== WEAPON);
    if (p.inventory.length !== had) players.sendInventory(p);
    if (result === 'player') {
      players.addLog(p, def.log);
      if (quests.onEvent(p, { type: 'minigame', game: 'duel', success: true }, director.scene().id)) director.onPartyChanged();
      notice(p, `Победа ${d.score[0]} : ${d.score[1]}! ${def.name} кланяется — воины касика уважают тебя`);
    } else if (result === 'warrior') {
      notice(p, text ?? `${def.name} победил ${d.score[1]} : ${d.score[0]}. Отступай на его замахе и бей, пока он открыт`);
    } else notice(p, text ?? 'Поединок окончен вничью');
    players.save(p, { now: true });
  }
  console.log(`[duel] ${def.name}: ${result}`);
  Object.assign(d, { player: null, result, resultAt: now, state: 'return', feinting: false });
  broadcast(now, true);
}

// Убрать макану после перезапуска сервера посреди поединка (зовёт game/index.js при входе)
export function cleanup(p) {
  if (duelOf(p) || !p.inventory?.includes(WEAPON)) return;
  p.inventory = p.inventory.filter((x) => x !== WEAPON);
}

// --- движение ---

function step(d, to, speed, dt, stop) {
  const dx = to[0] - d.p[0], dz = to[2] - d.p[2], dist = Math.hypot(dx, dz);
  if (dist <= stop) return true;
  const k = Math.min(speed * dt, dist - stop) / dist;
  d.p = [d.p[0] + dx * k, 0, d.p[2] + dz * k];
  d.p[1] = ground(d.p[0], d.p[2]);
  d.r = Math.atan2(-dx, -dz);
  return false;
}
function shove(d, from, m) {
  const dx = d.p[0] - from[0], dz = d.p[2] - from[2], dist = Math.hypot(dx, dz) || 1;
  const to = [d.p[0] + (dx / dist) * m, 0, d.p[2] + (dz / dist) * m];
  if (inRing(to)) { d.p = to; d.p[1] = ground(to[0], to[2]); }
}
const face = (d, to) => { d.r = Math.atan2(d.p[0] - to[0], d.p[2] - to[2]); };
// угол между тем, куда смотрит воин, и направлением на точку (0 — прямо перед ним)
function bearing(d, to) { const a = Math.atan2(d.p[0] - to[0], d.p[2] - to[2]) - d.r; return Math.atan2(Math.sin(a), Math.cos(a)); }

// --- рассылка ---

const toZone = (msg) => players.broadcast(msg, (x) => x.zone === ZONE);
export function state(now = Date.now()) {
  return {
    t: S2C.DUEL, serverNow: now,
    duelists: [...duels.values()].map((d) => ({
      id: d.def.id, name: d.def.name, p: d.p.map(round), r: round(d.r), state: d.state === 'close' ? 'approach' : d.state,
      player: d.player, score: [...d.score], startsAt: d.startsAt,
      ...(d.result && now - d.resultAt < D.RESULT_MS ? { result: d.result, lastPlayer: d.lastPlayer } : {}),
    })),
  };
}
function broadcast(now, force) {
  if (!force) return;
  sentAt = now; shown = true;
  toZone(state(now));
}
