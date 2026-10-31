// Режиссёр сцен: content/scenes.json, условия перехода, страховочные таймеры, время суток.
import { CONFIG } from '../../shared/config.js';
import { S2C, ROLES, ROLE_NAMES } from '../../shared/protocol.js';
import { loadContent } from '../content.js';
import { loadGameState, saveGameState } from '../db.js';
import { players } from './players.js';
import * as ai from './ai-bridge.js';
import * as entities from './entities.js';

const scenes = new Map(loadContent('scenes.json', []).map((s) => [s.id, s]));
const FIRST = 'lobby';
const DEFAULT_POS = [0, 1.6, 0];

// Точку можно задать как [x, y, z] или { p: [x, y, z], r } (r — поворот как у камеры: 0 — лицом к носу)
const point = (v) => (Array.isArray(v) ? { p: v, r: 0 } : v?.p ? { p: v.p, r: v.r ?? 0 } : null);
const isRoleMap = (m) => m && ROLES.some((r) => r in m);

// На корабле точки появления и места у фонаря берём из content/ship_layout.json (его ведёт Фронт 1):
//   spawns: { grumete: P, piloto: P, lengua: P }            — для всех игровых сцен на корабле
//   spawns: { ship_day: { grumete: P, ... }, ship_evening: … } — по сценам
//   seats:  [P, P, P]                                        — места у фонаря в night_story
// Если в layout их нет — остаются точки из scenes.json.
const shipLayout = loadContent('ship_layout.json', {});
for (const s of scenes.values()) {
  if (s.zone !== 'ship') continue;
  const sp = shipLayout.spawns?.[s.id] ?? (isRoleMap(shipLayout.spawns) ? shipLayout.spawns : null);
  if (sp && s.spawns) s.spawns = sp;
  if (Array.isArray(shipLayout.seats) && shipLayout.seats.length && s.seats) s.seats = shipLayout.seats;
}

const state = {
  id: FIRST,
  startAt: 0,
  zone: 'ship',
  tod: 0.4,
  transitioning: false,
  skip: new Set(),
};

// Правила и задания подключает game/index.js (чтобы не было циклических импортов)
let hooks = {
  onSceneStart: () => {},                // (scene, party)
  isSceneComplete: () => false,          // (scene, party)
  forceComplete: () => {},               // (scene, party)
  playerDone: () => false,               // (player, sceneId)
};
export const setHooks = (h) => { hooks = { ...hooks, ...h }; };

export const scene = () => scenes.get(state.id) ?? { id: state.id, type: 'end' };
export const getScene = (id) => scenes.get(id);
export const zone = () => state.zone;
// Конкретный запуск сцены: та же сцена, запущенная заново, — уже другая
const sceneKey = () => `${state.id}@${state.startAt}`;
export const startAt = () => state.startAt;

const sceneType = () => scene().type;
export const acceptsMove = () => sceneType() === 'play';
export const isLocked = () => sceneType() === 'locked';

// Секунды или null (сцена без таймера)
export function sceneDuration(s = scene()) {
  const d = CONFIG.DEMO_MODE ? (s.demoDuration ?? s.duration) : s.duration;
  return d ?? null;
}

function currentTod(now = Date.now()) {
  const s = scene();
  if (s.tod == null) return state.tod;
  const dur = sceneDuration(s);
  if (s.todTo == null || !dur) return s.tod;
  const k = Math.min(Math.max((now - state.startAt) / 1000 / dur, 0), 1);
  return s.tod + (s.todTo - s.tod) * k;
}

// → { p, r } или null
export function spawnFor(s, role) {
  const sp = s.spawns;
  if (!sp) return null;
  return point(sp[role] ?? Object.values(sp)[0]);
}

const seatAt = (s, i) => point(s.seats[i % s.seats.length]);

export function sceneMessage(p, { withSpawn = false } = {}) {
  const s = scene();
  const msg = {
    t: S2C.SCENE, id: s.id, type: s.type, startAt: state.startAt,
    tod: currentTod(), zone: state.zone, duration: sceneDuration(s),
  };
  if (withSpawn && p.p && s.spawns) msg.spawn = p.p;
  if (p.seat) msg.seat = p.seat;
  if (msg.spawn || msg.seat) msg.r = p.r; // куда смотреть после появления
  return msg;
}

export const persistNow = () => persist();

function persist() {
  saveGameState({ scene: state.id, startAt: state.startAt, entities: entities.snapshot() });
}

export function init() {
  const saved = loadGameState();
  if (saved && scenes.has(saved.scene)) {
    state.id = saved.scene;
    state.startAt = saved.startAt ?? Date.now();
    entities.load(saved.entities);
    console.log(`[director] продолжаем со сцены ${state.id}`);
  } else {
    state.id = FIRST;
    state.startAt = Date.now();
    persist();
  }
  const s = scene();
  if (s.zone) state.zone = s.zone;
  else {
    // катсцена: зона — от последней сцены, у которой она есть
    const list = [...scenes.values()];
    for (let i = list.findIndex((x) => x.id === s.id); i >= 0; i--) if (list[i].zone) { state.zone = list[i].zone; break; }
  }
  state.tod = currentTod();
}

export function setScene(id) {
  const s = scenes.get(id);
  if (!s) return false;
  state.id = id;
  state.startAt = Date.now() + CONFIG.SCENE_START_DELAY_MS;
  state.transitioning = false;
  state.skip.clear();
  if (s.zone) state.zone = s.zone;
  if (s.tod != null) state.tod = s.tod;

  // Места у фонаря — по порядку ролей, чтобы не зависеть от порядка входа
  const party = players.party().sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  party.forEach((p, i) => {
    p.ready = false;
    p.scene = sceneKey();
    if (p.zone !== state.zone) p.chunks?.clear();
    p.zone = state.zone;
    const pos = s.seats ? seatAt(s, i) : spawnFor(s, p.role);
    p.seat = s.seats ? [...pos.p] : null;
    p.a = s.seats ? 'sit' : 'idle';
    if (pos) {
      p.p = [...pos.p];
      p.r = pos.r;
      p.lastMoveAt = state.startAt;
    }
    players.save(p, { now: true });
    players.send(p, sceneMessage(p, { withSpawn: true }));
  });

  hooks.onSceneStart(s, party);
  persist();
  console.log(`[director] сцена ${id}`);
  broadcastParty();
  if (s.type === 'lobby') broadcastLobby();
  return true;
}

// Переход дальше: onComplete → next
async function complete(s, { forced }) {
  state.transitioning = true;
  const key = sceneKey();
  if (forced) hooks.forceComplete(s, players.party());
  for (const action of s.onComplete ?? []) {
    if (sceneKey() !== key) return; // сцену сменили вручную (/scene)
    if (action.say) players.broadcast({ t: S2C.NPC_SAY, line: action.say, hints: [], ...ai.playLine(action.say) });
    if (action.notice) players.broadcast({ t: S2C.NOTICE, text: action.notice });
    if (action.wait) await new Promise((r) => setTimeout(r, action.wait));
  }
  if (sceneKey() !== key) return;
  if (!setScene(s.next)) state.transitioning = false;
}

function allReady(party, s) {
  return party.every((p) => p.ready && (s.type !== 'lobby' || p.role));
}

// Вызывается часто (раз в 250 мс)
export function tick(now = Date.now()) {
  if (entities.takeDirty()) persist();
  const s = scene();
  if (state.transitioning || !s.next || now < state.startAt) return;
  const party = players.party();
  if (!party.some((p) => p.connected)) return; // никого нет — сцена ждёт

  const dur = sceneDuration(s);
  const timeUp = dur != null && now - state.startAt >= dur * 1000;
  let done = false;
  switch (s.advance ?? 'timer') {
    case 'all_ready': done = allReady(party, s); break;
    case 'quests': done = hooks.isSceneComplete(s, party); break;
    case 'quests_and_ready': done = hooks.isSceneComplete(s, party) && allReady(party, s); break;
    case 'timer': done = timeUp; break;
    case 'timer_or_skip': done = timeUp || party.every((p) => state.skip.has(p.id)); break;
  }
  if (done || timeUp) complete(s, { forced: !done }).catch((e) => console.error('[director]', e));
}

export function broadcastTod() {
  if (scene().tod == null) return;
  state.tod = currentTod();
  players.broadcast({ t: S2C.TOD, value: Math.round(state.tod * 1000) / 1000 });
}

// --- Партия, готовность, лобби ---

export function partyMessage() {
  const party = players.party();
  const ready = {};
  const done = {}; // свои обязательные задания сцены выполнены
  for (const p of party) {
    ready[p.id] = p.ready;
    done[p.id] = hooks.playerDone(p, state.id);
  }
  return {
    t: S2C.PARTY,
    scene: state.id,
    ready,
    done,
    waitingFor: party.filter((p) => !p.ready).map((p) => ({ ...players.publicInfo(p), connected: p.connected })),
    skip: { votes: party.filter((p) => state.skip.has(p.id)).length, total: party.length },
  };
}

export const broadcastParty = () => players.broadcast(partyMessage());

export function lobbyMessage() {
  return {
    t: S2C.LOBBY,
    players: players.party().map((p) => ({ ...players.publicInfo(p), ready: p.ready, connected: p.connected })),
  };
}

export const broadcastLobby = () => players.broadcast(lobbyMessage());

export function onPartyChanged() {
  broadcastParty();
  if (sceneType() === 'lobby') broadcastLobby();
}

export function setReady(p, value) {
  const s = scene();
  if (value && s.type === 'lobby' && !p.role) {
    players.send(p, { t: S2C.NOTICE, text: 'Сначала выберите роль' });
    return;
  }
  p.ready = !!value;
  onPartyChanged();
}

// ready в обычной сцене; там, где задан readyAt, готовность ставит interact с этим объектом
export function onReadyMessage(p, value) {
  const s = scene();
  if (s.readyAt && value) {
    players.send(p, { t: S2C.NOTICE, text: 'Подойдите к шлюпке и нажмите E' });
    return;
  }
  setReady(p, value);
}

export function onReadyAt(p, target) {
  const s = scene();
  if (s.readyAt !== target) return false;
  setReady(p, true);
  const waiting = players.party().filter((x) => !x.ready).map((x) => ROLE_NAMES[x.role] ?? x.name);
  if (waiting.length) players.send(p, { t: S2C.NOTICE, text: `Ждём остальных: ${waiting.join(', ')}` });
  return true;
}

export function onSkipVote(p) {
  if (scene().advance !== 'timer_or_skip') return;
  state.skip.add(p.id);
  broadcastParty();
}

export function pickRole(p, role) {
  if (sceneType() !== 'lobby') return;
  if (!ROLES.includes(role) || p.role === role) return;
  const owner = players.roleOwner(role, p.id);
  if (owner) {
    players.send(p, { t: S2C.NOTICE, text: `Роль «${ROLE_NAMES[role]}» уже занята: ${owner.name}` });
    return;
  }
  p.role = role;
  p.ready = false;
  players.save(p, { now: true });
  onPartyChanged();
}

// Позиция при входе: сцена сменилась, пока игрока не было, — ставим в spawn текущей сцены
export function placeOnJoin(p) {
  if (p.scene === sceneKey() && p.zone === state.zone && p.p) return;
  const spawn = spawnFor(scene(), p.role);
  p.r = spawn?.r ?? 0;
  if (spawn) p.p = [...spawn.p];
  else if (p.zone !== state.zone || !p.p) p.p = [...DEFAULT_POS];
  p.zone = state.zone;
  p.scene = sceneKey();
}

// Место у фонаря для того, кто вошёл посреди night_story
export function seatOnJoin(p) {
  const s = scene();
  if (!s.seats) { p.seat = null; return; }
  if (p.seat) return;
  const taken = new Set(players.party().filter((x) => x.seat && x !== p).map((x) => x.seat.join()));
  const seats = s.seats.map(point);
  const free = seats.find((seat) => !taken.has(seat.p.join())) ?? seats[0];
  p.seat = [...free.p];
  p.p = [...free.p];
  p.r = free.r;
  p.a = 'sit';
}

export function resetToStart() {
  entities.reset();
  setScene(FIRST);
}
