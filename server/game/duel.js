// Тренировочные поединки на Гуанахани (docs/tz-combat.md, «Поединки»). Во второй части игроки — таино,
// поэтому основной бой — тренировка: очки до трёх, здоровье не тратится, деревня не тревожится.
//   воины касика (kind 'warrior') — днём и вечером ждут на краю батея: юный с маканой, опытный с копьём;
//   испанцы с «Санта-Марии» (kind 'spaniard', server/game/spaniards.js) — 12 октября ходят по деревне;
//     вызванный кивает и ведёт игрока на батей, бьётся мечом или прикладом эспингарды, потом идёт дальше.
// Игрок бьётся тем, что держит: макана, копьё (дальше достаёт, встречает на подходе) или лук (стреляет
// издалека, но вдали соперник уворачивается). С пустыми руками дают макану и после забирают.
// Всё решает сервер: соперники двигаются здесь, клиенты рисуют их по `duel` (10 раз в секунду, пока кто-то
// бьётся или идёт, раз в секунду иначе), очко — `hit { kind: 'duel' }`. Вызов — E, удар — `attack`.
import { S2C } from '../../shared/protocol.js';
import { heldItem } from '../../shared/player-presentation.js';
import { WEAPONS, isDuelWeapon } from '../../shared/weapons.js';
import { players } from './players.js';
import * as director from './director.js';
import * as quests from './quests.js';
import * as combat from './combat.js';
import { performAction, equipForUse } from './player-actions.js';
import { worldEvent } from './world-events.js';
import * as objects from './objects.js';
import { SPANIARDS, GREETINGS, SP, pathToBatey } from './spaniards.js';

const ZONE = 'guanahani';
const LOAN = 'macana';
export const RING = { c: [168, 255], rx: 13.6, rz: 9.6 }; // внутри камней батея
// Испанцы бьются на двух половинах батея — два поединка сразу
export const ARENAS = [
  { id: 'west', c: [161.6, 255], rx: 6.2, rz: 8.4 },
  { id: 'east', c: [174.4, 255], rx: 6.2, rz: 8.4 },
];
export const D = {
  WIN: 3, READY_MS: 3000, LIMIT_MS: 120000, RESULT_MS: 4000,
  LAG: 0.5, CHALLENGE_R: 3.5, EXIT: 1.5, START: 1.6,
  CIRCLE: 2.4, CLOSE: 1.6, STRIKE_MS: 350, BLOCK_MS: 350, STAGGER_MS: 600, FLANK: 1.2,
  DODGE_MS: 2600, // от стрелы спереди уворачивается не чаще
  FIRE_MS: 300, SHOT_RANGE: 16, SHOT_WIDTH: 0.75, // выстрел: вспышка, дальность, насколько надо уйти с линии ствола
};
const OPEN = new Set(['windup', 'recover', 'aim', 'fire', 'reload']); // тут любой удар засчитывается
// Воины касика не стоят столбом: ходят по краю батея, отрабатывают удары, разминаются, обжигают остриё
// копья. Маршрут — как у испанцев (server/game/spaniards.js), первая точка — их место у батея
export const DUELISTS = [
  { id: 'duelist_young', kind: 'warrior', name: 'Юный воин', log: 'duel_young', weapon: 'macana', scenes: ['p2_day', 'p2_evening'],
    home: [160.5, 255], r: -Math.PI / 2, windup: 850, recover: 1100, speed: 2.4, think: [900, 1800], feint: 0, walk: 1.2, greet: false,
    route: [
      { p: [160.5, 255], batey: true, act: 'practice', wait: 14, face: [168, 255], doing: 'отрабатывает удары маканой' },
      { p: [161.6, 260.6] },
      { p: [166.2, 262.6], act: 'stretch', wait: 9, face: [166.2, 256], doing: 'разминается' },
      { p: [161.6, 260.6] },
      { p: [160.8, 255.6], act: 'watch', wait: 7, face: [175.5, 255], doing: 'смотрит, как тренируется опытный' },
    ] },
  { id: 'duelist_veteran', kind: 'warrior', name: 'Опытный воин', log: 'duel_veteran', weapon: 'war_spear', scenes: ['p2_day', 'p2_evening'],
    home: [175.5, 255], r: Math.PI / 2, windup: 650, recover: 800, speed: 3.0, think: [600, 1300], feint: 0.3, walk: 1.1, greet: false,
    route: [
      { p: [175.5, 255], batey: true, act: 'practice', wait: 12, face: [168, 255], doing: 'отрабатывает выпады копьём' },
      { p: [176.6, 249.6] },
      { p: [172.6, 247.6], act: 'sharpen', wait: 15, face: [172.6, 245], doing: 'обжигает остриё копья' },
      { p: [176.6, 249.6] },
      { p: [178.6, 258.2], act: 'stretch', wait: 8, face: [172, 258.2], doing: 'разминается' },
    ] },
  ...SPANIARDS.map((s) => ({ ...s, kind: 'spaniard', scenes: ['p2_landing'], home: s.route[0].p, r: 0 })),
];
const FIGHT = new Set(['approach', 'circle', 'close', 'back', 'windup', 'strike', 'recover', 'block', 'dodge', 'stagger', 'aim', 'fire', 'reload']);
const FREE = new Set(['walk', 'act', 'greet']); // испанец свободен — можно вызвать

let rnd = Math.random;
export const setRandom = (f) => { rnd = f; };

const ground = (x, z) => Math.max(director.groundAt(ZONE, x, z) ?? 0, 0);
const at = (xz) => [xz[0], ground(xz[0], xz[1]), xz[1]];
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const round = (x) => Math.round(x * 100) / 100;
const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });
const sceneOn = (def) => def.scenes.includes(director.scene().id) && director.scene().zone === ZONE && !director.isTransitioning();
const inRing = (ring, p, margin = 0) => ((p[0] - ring.c[0]) / (ring.rx + margin)) ** 2 + ((p[2] - ring.c[1]) / (ring.rz + margin)) ** 2 <= 1;
// чем бьётся игрок: оружие в руке; копьё метнул и ещё не подобрал — кулаками
const weaponOf = (p) => { const item = heldItem(p); return isDuelWeapon(item) ? item : 'fist'; };

const duels = new Map();
let sentAt = 0, shown = ''; // когда рассылали `duel`; кого показали клиентам (id через запятую)
function fresh(def) {
  const d = { def, p: at(def.home), r: def.r, state: def.route ? 'walk' : 'idle', player: null, score: [0, 0], t: 0,
    startsAt: 0, until: 0, nextMove: 0, result: null, lastPlayer: null, resultAt: 0, blocks: 0, side: 1, feinting: false,
    ring: def.kind === 'spaniard' ? null : RING, arena: null, i: 0, path: [], greeted: new Map(), say: null, sayUntil: 0, gave: false, playerWeapon: null };
  return d;
}
export function reset() { duels.clear(); for (const def of DUELISTS) duels.set(def.id, fresh(def)); sentAt = 0; shown = ''; }
reset();

export const isDuelist = (id) => typeof id === 'string' && duels.has(id);
export const duelOf = (p) => [...duels.values()].find((d) => d.player === p.id) ?? null;

// --- вызов ---

export function challenge(p, id, now = Date.now()) {
  const d = duels.get(id);
  if (!d || p.zone !== ZONE || !p.p) return false;
  const spaniard = d.def.kind === 'spaniard';
  if (!sceneOn(d.def)) return notice(p, spaniard ? 'Чужаки сейчас не на острове' : 'Воины касика тренируются днём и вечером'), false;
  if (combat.level() !== 'calm') return notice(p, 'В деревне тревога — сейчас не до поединков'), false;
  if (d.player) return notice(p, spaniard ? `${d.def.name} уже занят поединком` : 'Этот воин уже бьётся'), false;
  if (d.def.route ? !FREE.has(d.state) : d.state !== 'idle') return notice(p, spaniard ? `${d.def.name} ещё не вернулся с батея` : 'Воин ещё не вернулся на место'), false;
  if (flat(p.p, d.p) > D.CHALLENGE_R) return notice(p, 'Подойди ближе'), false;
  if (duelOf(p)) return notice(p, 'Ты уже в поединке'), false;
  if (!spaniard) { begin(d, p, now); return true; }
  // испанец: свободная половина батея, ближняя к нему
  const busy = new Set([...duels.values()].filter((x) => x.arena && x.player).map((x) => x.arena.id));
  const free = ARENAS.filter((a) => !busy.has(a.id)).sort((a, b) => Math.hypot(a.c[0] - d.p[0], a.c[1] - d.p[2]) - Math.hypot(b.c[0] - d.p[0], b.c[1] - d.p[2]));
  if (!free.length) return notice(p, 'На батее уже бьются двое — подожди, пока освободится'), false;
  const { path } = pathToBatey(d.def, d.p, d.i);
  Object.assign(d, { player: p.id, arena: free[0], ring: free[0], path: [...path, free[0].c], state: 'lead', t: now, until: now + 120000,
    score: [0, 0], result: null, lastPlayer: p.id, resultAt: 0, say: '¡Vamos! ¡Al batey!', sayUntil: now + 3000 });
  notice(p, `${d.def.name} кивает и идёт на батей — иди за ним. Тренировочный бой до ${D.WIN} очков`);
  console.log(`[duel] ${p.name} вызвал ${d.def.name}`);
  broadcast(now);
  return true;
}

// Встают лицом друг к другу в середине круга, отсчёт; игрок бьётся тем, что в руке, или берёт макану
function begin(d, p, now) {
  const c = d.ring.c, side = Math.sign(p.p[0] - c[0]) || 1;
  const me = at([c[0] + side * D.START, c[1]]), him = at([c[0] - side * D.START, c[1]]);
  p.p = me; p.r = side > 0 ? Math.PI / 2 : -Math.PI / 2; p.lastCorrectAt = now; p.lastMoveAt = now;
  players.send(p, { t: S2C.POS_CORRECT, p: p.p, r: p.r });
  let gave = false;
  if (!isDuelWeapon(heldItem(p))) {
    const own = p.inventory.find(isDuelWeapon);
    if (own) equipForUse(p, own);
    else { p.inventory.push(LOAN); p.duelLoan = true; gave = true; players.sendInventory(p); equipForUse(p, LOAN); }
  }
  const weapon = weaponOf(p);
  Object.assign(d, { p: him, r: side > 0 ? -Math.PI / 2 : Math.PI / 2, state: 'ready', player: p.id, score: [0, 0], t: now,
    startsAt: now + D.READY_MS, until: now + D.READY_MS + D.LIMIT_MS, result: null, lastPlayer: p.id, resultAt: 0, blocks: 0, side: 1, gave, playerWeapon: weapon });
  const tip = { macana: 'Отступай на его замахе и бей, пока он открыт', war_spear: 'Копьё достаёт дальше: встречай его на подходе и бей на замахе',
    bow: 'От первой стрелы спереди он увернётся, от второй подряд — уже нет; на замахе и когда он открыт попадёшь всегда' }[weapon];
  const his = d.def.weapon === 'espingarda' ? ' Он стреляет: целится — шагни вбок, перезаряжает — беги к нему.' : '';
  notice(p, `Поединок с ${d.def.kind === 'spaniard' ? 'чужаком' : 'воином'}: до ${D.WIN} очков.${his} ${tip}`);
  console.log(`[duel] ${p.name} — ${d.def.name} (${weapon})`);
  broadcast(now);
}

// --- удар игрока ---

// yaw — куда игрок смотрел в момент удара (клиент шлёт вместе с attack: последний move мог уйти раньше
// поворота мыши); нет — берём из move
// mode 'throw' — метнуть копьё: летит как стрела, потом лежит на земле, пока его не подберут (E)
export function attack(p, id, now = Date.now(), yaw = null, mode = null) {
  const d = duels.get(id);
  if (!d) return false;
  if (d.player !== p.id) return notice(p, d.def.kind === 'spaniard' ? `Вызови ${d.def.name} на бой: подойди и нажми E` : 'Вызови воина на поединок: подойди и нажми E'), false;
  if (!FIGHT.has(d.state)) return false;
  const thrown = mode === 'throw';
  if (thrown && heldItem(p) !== 'war_spear') return notice(p, 'Метнуть можно копьё'), false;
  const item = thrown ? 'war_spear' : weaponOf(p), w = thrown ? WEAPONS.war_spear.throw : WEAPONS[item];
  if (now - (p.lastDuelAttackAt ?? 0) < w.cooldown) return false;
  p.lastDuelAttackAt = now;
  if (Number.isFinite(yaw)) p.r = yaw;
  const dist = flat(p.p, d.p), aim = Math.abs(aimOff(p, d.p)), ranged = w.kind === 'ranged';
  const missed = dist > w.reach + D.LAG || aim > w.aim + (ranged ? 0.6 / Math.max(dist, 1) : 0);
  const stagger = !missed && d.state === 'stagger';
  if (thrown) {
    performAction(p, 'throw', 'war_spear');
    throwSpear(p, d, now, missed || stagger ? 'miss' : null); // исход уточняется ниже, копьё уже в полёте
  } else performAction(p, w.action, heldItem(p));
  if (missed) {
    if (ranged) toZone({ t: S2C.HIT, by: p.id, target: d.def.id, kind: 'duel', weapon: item, missed: true, ...spearFlight(d), score: [...d.score] });
    return false; // промах: удар, стрела или копьё мимо
  }
  if (stagger) return false;
  // засчитывается: сбил замах или прицел, ударил, пока он открыт (после удара, перезаряжает), сбоку / сзади;
  // копьё ещё и встречает его на подходе. Стрелу спереди он видит и уворачивается — но не чаще раза в
  // DODGE_MS и не тогда, когда сам бросился в атаку: следующая стрела попадёт
  const open = OPEN.has(d.state), flank = Math.abs(bearing(d, p.p)) > D.FLANK;
  const spear = w.kind === 'thrust' && d.state === 'close' && dist > 1.9;
  const dodge = ranged && d.state !== 'close' && now - (d.dodgedAt ?? -Infinity) > D.DODGE_MS;
  if (open || flank || spear || (ranged && !dodge)) {
    d.score[0]++; d.blocks = 0;
    setState(d, 'stagger', now);
    shove(d, p.p, ranged ? 0.3 : 0.6);
    if (thrown) d.spear.at = [d.p[0] + (d.p[0] - p.p[0]) / dist * 0.5, 0, d.p[2] + (d.p[2] - p.p[2]) / dist * 0.5]; // упало к его ногам
    toZone({ t: S2C.HIT, by: p.id, target: d.def.id, kind: 'duel', weapon: item, ...spearFlight(d), score: [...d.score] });
    if (d.score[0] >= D.WIN) end(d, 'player', now);
  } else {
    if (dodge) d.dodgedAt = now; else d.blocks++;
    setState(d, dodge ? 'dodge' : 'block', now);
    if (dodge) sidestep(d, p.p);
    toZone({ t: S2C.HIT, by: p.id, target: d.def.id, kind: 'duel', weapon: item, blocked: true, ...(dodge ? { dodged: true } : {}), against: d.def.weapon, ...spearFlight(d), score: [...d.score] });
  }
  broadcast(now);
  return true;
}

// Метнутое копьё: из рук сразу, на землю — когда долетит (за ним надо сходить и поднять E). Летит туда, куда
// смотрел игрок, втыкается за соперником (мимо — дальше, до 15 м), но не за кругом поединка
function throwSpear(p, d, now, miss) {
  const i = p.inventory.indexOf('war_spear');
  if (i < 0) return;
  p.inventory.splice(i, 1); players.sendInventory(p);
  const dist = flat(p.p, d.p), far = miss ? Math.min(dist + 4, WEAPONS.war_spear.throw.reach) : dist + 1.6;
  const dir = [-Math.sin(p.r ?? 0), -Math.cos(p.r ?? 0)];
  let to = [p.p[0] + dir[0] * far, 0, p.p[2] + dir[1] * far];
  for (let k = 0; k < 20 && !inRing(d.ring, to, -0.4); k++) to = [to[0] + (d.ring.c[0] - to[0]) * 0.15, 0, to[2] + (d.ring.c[1] - to[2]) * 0.15];
  const ms = Math.max(150, (flat(p.p, to) / WEAPONS.war_spear.throw.speed) * 1000);
  d.spear = { from: [p.p[0], p.p[1] + 1.5, p.p[2]], at: to, ms, r: p.r ?? 0 };
  const zone = p.zone, scene = director.scene().id;
  setTimeout(() => { // упало: лежит у круга, его видно и можно подобрать
    if (director.scene().id !== scene) { if (!p.inventory.includes('war_spear')) { p.inventory.push('war_spear'); players.sendInventory(p); } return; }
    const where = d.spear?.at ?? to, landed = at([where[0], where[2]]);
    objects.spawnWorldItem({ id: `drop:spear:${p.id}:${now}`, zone, item: 'war_spear', p: landed, r: d.spear?.r ?? 0, dynamic: true });
  }, ms);
}
// поля `hit` для полёта копья у всех клиентов
function spearFlight(d) {
  if (!d.spear || d.spear.shown) return {};
  d.spear.shown = true;
  return { thrown: { from: d.spear.from, to: at([d.spear.at[0], d.spear.at[2]]), ms: Math.round(d.spear.ms) } };
}

// --- такт ---

export function tick(now = Date.now()) {
  for (const d of duels.values()) {
    const dt = Math.min((now - (d.movedAt ?? now)) / 1000, 0.25);
    d.movedAt = now;
    if (!sceneOn(d.def)) {
      if (d.player) end(d, 'draw', now, FIGHT.has(d.state) || d.state === 'ready' ? 'Поединок прерван' : null);
      if (d.state !== (d.def.route ? 'walk' : 'idle') || d.i) Object.assign(d, fresh(d.def));
      continue;
    }
    if (d.player) {
      const p = players.get(d.player);
      if (!p || !p.connected || p.zone !== ZONE || !p.p) { end(d, 'draw', now); continue; }
      if (combat.level() !== 'calm') { end(d, 'draw', now, 'В деревне тревога — поединок прерван'); continue; }
      if (d.state === 'lead' || d.state === 'await') { lead(d, p, now, dt); continue; }
      if (!inRing(d.ring, p.p, D.EXIT)) { end(d, 'warrior', now, 'Ты вышел из круга — поединок проигран'); continue; }
      if (now > d.until) { end(d, 'draw', now, 'Время вышло — ничья'); continue; }
      // подобрал метнутое копьё (или другое своё оружие) — сразу в руку
      if (!isDuelWeapon(heldItem(p))) { const own = p.inventory.find(isDuelWeapon); if (own) { equipForUse(p, own); d.playerWeapon = own; } else d.playerWeapon = 'fist'; }
      fight(d, p, now, dt);
    } else if (d.def.route) wander(d, now, dt);
    else if (d.state === 'return') {
      if (step(d, at(d.def.home), d.def.speed * 0.7, dt, 0.1)) { d.state = 'idle'; d.r = d.def.r; }
    }
  }
  const list = [...duels.values()].filter((d) => sceneOn(d.def)), ids = list.map((d) => d.def.id).join();
  const busy = list.some((d) => d.player || d.state === 'return' || d.state === 'walk');
  if (ids !== shown || (ids && now - sentAt >= (busy ? 100 : 1000))) broadcast(now);
}

function fight(d, p, now, dt) {
  const def = d.def, dist = flat(d.p, p.p), strikeR = WEAPONS[def.weapon].strikeR;
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
      if (dist <= strikeR && Math.abs(bearing(d, p.p)) < 1.0) {
        d.score[1]++;
        toZone({ t: S2C.HIT, by: def.id, target: p.id, kind: 'duel', weapon: def.weapon, score: [...d.score] });
        if (d.score[1] >= D.WIN) end(d, 'warrior', now);
      }
      return;
    case 'strike':
      if (now - d.t >= D.STRIKE_MS) setState(d, 'recover', now);
      return;
    case 'recover':
      if (now - d.t >= def.recover) { setState(d, 'circle', now); d.nextMove = now + think(def); }
      return;
    case 'block': case 'dodge':
      face(d, p.p);
      if (now - d.t < D.BLOCK_MS) return;
      // два отбитых подряд — сразу ответный замах; увернулся от стрелы — сразу идёт на лучника
      if (d.blocks >= 2 && dist <= D.CIRCLE + 0.5) { d.blocks = 0; startWindup(d, now); } else { setState(d, 'circle', now); d.nextMove = Math.min(d.nextMove, now + (d.state === 'dodge' ? 150 : 400)); }
      return;
    case 'stagger':
      if (now - d.t >= D.STAGGER_MS) { setState(d, 'circle', now); d.nextMove = now + think(def); }
      return;
    // стрелок: целится (сначала ведёт стволом за игроком, последние lockMs держит), выстрел, перезарядка
    case 'aim':
      if (now - d.t < def.aimMs - def.lockMs) { face(d, p.p); d.lockR = d.r; }
      if (now - d.t >= def.aimMs) fire(d, p, now);
      return;
    case 'fire':
      if (now - d.t >= D.FIRE_MS) setState(d, 'reload', now);
      return;
    case 'reload':
      if (now - d.t >= def.reloadMs) { setState(d, 'circle', now); d.nextMove = now + think(def); }
      return;
    default: if (def.weapon === 'espingarda') { keepRange(d, p, now, dt, dist); return; } { // approach / circle / close: держит дистанцию, кружит, по сигналу идёт в атаку
      const reach = Math.max(D.CLOSE, strikeR - 0.35);
      if (now >= d.nextMove) {
        d.state = 'close';
        if (dist <= reach + 0.05) { startWindup(d, now); return; }
        step(d, p.p, def.speed, dt, reach); face(d, p.p);
        return;
      }
      if (dist > D.CIRCLE + 0.5) { d.state = 'approach'; step(d, p.p, def.speed, dt, D.CIRCLE); face(d, p.p); return; }
      d.state = 'circle';
      // по кругу вокруг игрока, лицом к нему; у края круга — в другую сторону
      const a = Math.atan2(d.p[2] - p.p[2], d.p[0] - p.p[0]) + d.side * def.speed * 0.45 * dt / D.CIRCLE;
      const to = [p.p[0] + Math.cos(a) * D.CIRCLE, 0, p.p[2] + Math.sin(a) * D.CIRCLE];
      if (!inRing(d.ring, to, -0.8)) d.side = -d.side;
      else step(d, to, def.speed, dt, 0.02);
      face(d, p.p);
    }
  }
}

function startWindup(d, now) {
  setState(d, 'windup', now);
  d.feinting = rnd() < d.def.feint;
}

// Стрелок держится на расстоянии: ближе keep[0] — пятится, дальше keep[1] — подходит, между — обходит
// по кругу. По сигналу целится; вплотную — бьёт прикладом
function keepRange(d, p, now, dt, dist) {
  const def = d.def, [near, far] = def.keep;
  if (now >= d.nextMove) {
    if (dist <= 2.3) { startWindup(d, now); return; }
    setState(d, 'aim', now); face(d, p.p); d.lockR = d.r; d.feinting = false;
    return;
  }
  if (dist < near) {
    d.state = 'back';
    const away = [d.p[0] + (d.p[0] - p.p[0]) / dist, 0, d.p[2] + (d.p[2] - p.p[2]) / dist];
    if (inRing(d.ring, away, -0.6)) step(d, away, def.speed * 0.75, dt, 0); else circleAround(d, p, dt, dist);
  } else if (dist > far) { d.state = 'approach'; step(d, p.p, def.speed, dt, (near + far) / 2); }
  else { d.state = 'circle'; circleAround(d, p, dt, dist); }
  face(d, p.p);
}
function circleAround(d, p, dt, radius) {
  const a = Math.atan2(d.p[2] - p.p[2], d.p[0] - p.p[0]) + d.side * d.def.speed * 0.4 * dt / Math.max(radius, 1);
  const to = [p.p[0] + Math.cos(a) * radius, 0, p.p[2] + Math.sin(a) * radius];
  if (!inRing(d.ring, to, -0.8)) d.side = -d.side;
  else step(d, to, d.def.speed, dt, 0.02);
}

// Выстрел холостым зарядом туда, куда держал ствол: попал, если игрок не ушёл с линии
function fire(d, p, now) {
  setState(d, 'fire', now);
  const dir = [-Math.sin(d.lockR), -Math.cos(d.lockR)], v = [p.p[0] - d.p[0], p.p[2] - d.p[2]];
  const along = v[0] * dir[0] + v[1] * dir[1], aside = Math.abs(v[0] * dir[1] - v[1] * dir[0]);
  const hit = along > 0 && along < D.SHOT_RANGE && aside < D.SHOT_WIDTH;
  worldEvent({ id: d.def.id, p: d.p, zone: ZONE, connected: true }, 'scare', { shot: true }, now); // грохот: птицы и звери разбегаются
  if (hit) d.score[1]++;
  toZone({ t: S2C.HIT, by: d.def.id, target: p.id, kind: 'duel', weapon: d.def.weapon, shot: true, ...(hit ? {} : { missed: true }), score: [...d.score] });
  if (hit && d.score[1] >= D.WIN) end(d, 'warrior', now);
}
// увернулся от стрелы — шаг вбок
function sidestep(d, from) {
  const dx = d.p[0] - from[0], dz = d.p[2] - from[2], dist = Math.hypot(dx, dz) || 1, s = rnd() < 0.5 ? -1 : 1;
  const to = [d.p[0] - (dz / dist) * 0.7 * s, 0, d.p[2] + (dx / dist) * 0.7 * s];
  if (inRing(d.ring, to)) { d.p = to; d.p[1] = ground(to[0], to[2]); }
}
const think = (def) => def.think[0] + rnd() * (def.think[1] - def.think[0]);
function setState(d, state, now) { d.state = state; d.t = now; }

// --- испанцы вне поединка ---

// Ведёт игрока на батей по тропе; ждёт, пока тот войдёт в круг
function lead(d, p, now, dt) {
  if (now > d.until) { cancel(d, now, `${d.def.name} не дождался и ушёл`); return; }
  if (d.state === 'lead') {
    const next = d.path[0];
    if (next) {
      if (step(d, at(next), d.def.walk * SP.LEAD, dt, 0.15)) d.path.shift();
      return;
    }
    d.state = 'await'; d.until = Math.min(d.until, now + SP.AWAIT_MS);
  }
  face(d, p.p);
  if (inRing(d.ring, p.p, -0.5)) begin(d, p, now);
}

function cancel(d, now, text) {
  const p = players.get(d.player);
  if (p && text) notice(p, text);
  Object.assign(d, { player: null, arena: null, state: 'return', result: null });
  backToRoute(d);
  broadcast(now);
}

// После поединка (или отмены) — на свою точку у батея и дальше по маршруту
function backToRoute(d) {
  const R = d.def.route, b = R.findIndex((s) => s.batey);
  d.path = [R[b].p]; d.i = b; d.arena = null;
}

function wander(d, now, dt) {
  const R = d.def.route, stop = R[d.i];
  if (d.say && now > d.sayUntil) d.say = null;
  switch (d.state) {
    case 'return': {
      const next = d.path[0];
      if (!next) { d.state = 'walk'; return; }
      if (step(d, at(next), d.def.walk, dt, 0.15)) d.path.shift();
      return;
    }
    case 'act':
      if (stop.face) faceXZ(d, stop.face);
      if (now >= d.until) { d.i = (d.i + 1) % R.length; d.state = 'walk'; }
      return;
    case 'greet':
      if (now >= d.until) { d.state = 'walk'; d.say = null; }
      return;
    default: { // walk
      const greet = d.def.greet !== false && players.connected().find((x) => x.zone === ZONE && x.p && flat(x.p, d.p) < SP.GREET_R && !duelOf(x) && now - (d.greeted.get(x.id) ?? -Infinity) > SP.GREET_AGAIN_MS);
      if (greet) {
        d.greeted.set(greet.id, now); face(d, greet.p);
        Object.assign(d, { state: 'greet', until: now + SP.GREET_MS, say: GREETINGS[Math.floor(rnd() * GREETINGS.length)], sayUntil: now + SP.GREET_MS });
        return;
      }
      if (!step(d, at(stop.p), d.def.walk, dt, 0.12)) return;
      if (stop.act) Object.assign(d, { state: 'act', until: now + stop.wait * 1000, say: stop.say ?? null, sayUntil: now + 4500 });
      else d.i = (d.i + 1) % R.length;
    }
  }
}

function end(d, result, now, text) {
  const p = players.get(d.player), def = d.def, spaniard = def.kind === 'spaniard';
  if (!FIGHT.has(d.state) && d.state !== 'ready') { cancel(d, now, text); return; } // ещё вёл на батей
  if (p) {
    if (d.gave) {
      const had = p.inventory.length;
      p.inventory = p.inventory.filter((x) => x !== LOAN); p.duelLoan = false;
      if (p.inventory.length !== had) players.sendInventory(p);
    }
    if (result === 'player') {
      players.addLog(p, def.log);
      if (quests.onEvent(p, { type: 'minigame', game: 'duel', success: true }, director.scene().id)) director.onPartyChanged();
      notice(p, `Победа ${d.score[0]} : ${d.score[1]}! ${spaniard ? `${def.name} смеётся и хлопает тебя по плечу` : `${def.name} кланяется — воины касика уважают тебя`}`);
    } else if (result === 'warrior') {
      notice(p, text ?? `${def.name} победил ${d.score[1]} : ${d.score[0]}. Отступай на его замахе и бей, пока он открыт`);
    } else notice(p, text ?? 'Поединок окончен вничью');
    players.save(p, { now: true });
  }
  console.log(`[duel] ${def.name}: ${result}`);
  Object.assign(d, { player: null, result, resultAt: now, state: 'return', feinting: false, gave: false,
    ...(spaniard ? { say: result === 'player' ? '¡Bravo! ¡Buen golpe!' : result === 'warrior' ? '¡Ja! Otra vez será.' : null, sayUntil: now + 4000 } : {}) });
  if (def.route) backToRoute(d);
  broadcast(now);
}

// Убрать выданную макану после перезапуска сервера посреди поединка (зовёт game/index.js при входе)
export function cleanup(p) {
  if (duelOf(p) || !p.duelLoan) return;
  p.inventory = p.inventory.filter((x) => x !== LOAN); p.duelLoan = false;
}

// --- движение ---

function step(d, to, speed, dt, stop) {
  const dx = to[0] - d.p[0], dz = to[2] - d.p[2], dist = Math.hypot(dx, dz);
  if (dist <= stop + 1e-3) return true;
  const arrive = dist - stop <= speed * dt, k = (arrive ? dist - stop : speed * dt) / dist;
  d.p = [d.p[0] + dx * k, 0, d.p[2] + dz * k];
  d.p[1] = ground(d.p[0], d.p[2]);
  d.r = Math.atan2(-dx, -dz);
  return arrive;
}
function shove(d, from, m) {
  const dx = d.p[0] - from[0], dz = d.p[2] - from[2], dist = Math.hypot(dx, dz) || 1;
  const to = [d.p[0] + (dx / dist) * m, 0, d.p[2] + (dz / dist) * m];
  if (inRing(d.ring, to)) { d.p = to; d.p[1] = ground(to[0], to[2]); }
}
const face = (d, to) => { d.r = Math.atan2(d.p[0] - to[0], d.p[2] - to[2]); };
const faceXZ = (d, to) => { d.r = Math.atan2(d.p[0] - to[0], d.p[2] - to[1]); };
// угол между тем, куда смотрит воин, и направлением на точку (0 — прямо перед ним)
function bearing(d, to) { const a = Math.atan2(d.p[0] - to[0], d.p[2] - to[2]) - d.r; return Math.atan2(Math.sin(a), Math.cos(a)); }
// насколько игрок отвернулся от соперника (r — как у камеры: вперёд = (−sin r, −cos r))
function aimOff(p, to) { const a = Math.atan2(p.p[0] - to[0], p.p[2] - to[2]) - (p.r ?? 0); return Math.atan2(Math.sin(a), Math.cos(a)); }

// --- рассылка ---

const toZone = (msg) => players.broadcast(msg, (x) => x.zone === ZONE);
const STATE_OUT = { close: 'approach', back: 'circle' }; // dodge — увернулся от стрелы
export function state(now = Date.now()) {
  return {
    t: S2C.DUEL, serverNow: now,
    duelists: [...duels.values()].filter((d) => sceneOn(d.def)).map((d) => ({
      id: d.def.id, kind: d.def.kind, name: d.def.name, weapon: d.def.weapon, p: d.p.map(round), r: round(d.r),
      state: STATE_OUT[d.state] ?? d.state,
      player: d.player, score: [...d.score], startsAt: d.startsAt,
      ...(d.def.crew ? { crew: d.def.crew } : {}),
      ...(d.state === 'act' && d.def.route[d.i]?.act ? { act: d.def.route[d.i].act, doing: d.def.route[d.i].doing } : {}),
      ...(d.say && now < d.sayUntil ? { say: d.say } : {}),
      ...(d.player && d.playerWeapon ? { playerWeapon: d.playerWeapon } : {}),
      ...(d.player && d.ring && d.state !== 'lead' ? { ring: { c: d.ring.c, rx: d.ring.rx + D.EXIT, rz: d.ring.rz + D.EXIT } } : {}), // за этой линией — проигрыш
      ...(d.result && now - d.resultAt < D.RESULT_MS ? { result: d.result, lastPlayer: d.lastPlayer } : {}),
    })),
  };
}
function broadcast(now) {
  const msg = state(now);
  sentAt = now; shown = msg.duelists.map((d) => d.id).join();
  toZone(msg);
}
