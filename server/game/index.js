// Игровая логика: вход/выход игрока, обработчики сообщений, циклы.
import { statSync } from 'node:fs';
import { CONFIG } from '../../shared/config.js';
import { C2S, S2C, ANIMS, CLOSE } from '../../shared/protocol.js';
import { worldMeta, resetProgress } from '../db.js';
import { players } from './players.js';
import * as director from './director.js';
import * as entities from './entities.js';
import * as quests from './quests.js';
import * as rules from './rules.js';
import { onChunkReq, onChunkDrop } from '../world/chunks.js';

director.setHooks({
  onSceneStart: rules.onSceneStart,
  isSceneComplete: quests.isSceneComplete,
  forceComplete: quests.forceComplete,
  playerDone: quests.playerDone,
});

const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });

// Номер сборки клиента (время сборки client/dist). Вкладка, открытая до перезапуска сервера с новой
// сборкой, переподключается со старым кодом — по несовпадению build клиент перезагружает страницу.
const BUILD = (() => {
  try { return String(Math.round(statSync(new URL('../../client/dist/index.html', import.meta.url)).mtimeMs)); } catch { return 'dev'; }
})();

const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// --- Вход и выход ---

// Мест столько, сколько ролей. Свои (уже в партии, в т.ч. отключённые в пределах grace) возвращаются всегда
export function canJoin(userId) {
  const party = players.party();
  return party.some((p) => p.id === userId) || party.length < CONFIG.MAX_PLAYERS;
}

export function join(session, ws) {
  const p = players.getOrCreate(session.userId, session.login);
  const old = p.ws;
  const wasConnected = p.connected;
  if (old && old !== ws) {
    players.send(p, { t: S2C.NOTICE, text: 'Вы вошли с другой вкладки' });
    old.close(CLOSE.REPLACED, 'replaced');
  }
  p.dialogue = null;
  p.npcRequest = null;
  p.ws = ws;
  p.connected = true;
  p.disconnectedAt = null;
  p.lastMoveAt = Date.now();

  // Роль могли занять, пока игрока не было
  if (p.role && players.roleOwner(p.role, p.id)) p.role = null;
  director.placeOnJoin(p);
  director.seatOnJoin(p);

  const scene = director.scene();
  players.send(p, {
    t: S2C.AUTH_OK,
    you: players.publicInfo(p),
    state: {
      role: p.role, scene: scene.id, zone: p.zone, p: p.p, r: p.r,
      inventory: p.inventory, money: p.money, quests: p.quests, log: p.log,
    },
    world: worldMeta(),
    scene: director.sceneMessage(p),
    build: BUILD,
  });

  for (const other of players.connected()) {
    if (other !== p) players.send(p, { t: S2C.PLAYER_JOIN, ...players.publicInfo(other) });
  }
  if (!wasConnected) players.broadcast({ t: S2C.PLAYER_JOIN, ...players.publicInfo(p) }, (x) => x !== p);
  players.send(p, director.lobbyMessage());
  quests.refreshParty(scene,players.party());
  quests.sendAll(p, scene.id);
  director.onPartyChanged();
  players.save(p, { now: true });
  console.log(`[game] ${p.name} вошёл (${players.connectedCount()} онлайн)`);
  return p;
}

export function leave(p, ws) {
  if (p.ws !== ws) return; // это старая вкладка, игрок уже переподключился
  p.dialogue = null;
  p.npcRequest = null;
  p.ws = null;
  p.connected = false;
  p.disconnectedAt = Date.now(); // готовность сохраняем: 60 с игрок остаётся в партии
  players.save(p, { now: true });
  players.broadcast({ t: S2C.PLAYER_LEAVE, ...players.publicInfo(p) });
  director.onPartyChanged();
  console.log(`[game] ${p.name} отключился (${players.connectedCount()} онлайн)`);
}

// --- Обработчики ---

function onMove(p, msg) {
  const locked = director.isLocked();
  if (!director.acceptsMove() && !locked) return;
  if (Number.isFinite(msg.r)) p.r = msg.r;
  if (ANIMS.includes(msg.a)) p.a = locked ? 'sit' : msg.a;
  if (locked || !isVec3(msg.p)) return; // в night_story можно только крутить головой

  const now = Date.now();
  if (director.restoreGround(p)) {
    p.lastMoveAt=now;
    players.save(p,{now:true});
    players.send(p,{t:S2C.POS_CORRECT,p:p.p,r:p.r});
    return;
  }
  const dt = Math.min(Math.max((now - p.lastMoveAt) / 1000, 0), 1);
  const maxStep = CONFIG.MAX_SPEED * dt * 1.5 + 0.5;
  if (!p.p) p.p = msg.p;
  if (dist(p.p, msg.p) > maxStep) {
    if (now - p.lastCorrectAt > 500) {
      p.lastCorrectAt = now;
      players.send(p, { t: S2C.POS_CORRECT, p: p.p, r: p.r });
    }
    return;
  }
  p.p = msg.p;
  p.lastMoveAt = now;
  // Выпрыгнул за борт или ушёл под воду у острова — обратно на точку появления своей роли
  if (msg.p[1] < (FALL_Y[p.zone] ?? -Infinity)) {
    const spawn = director.spawnFor(director.scene(), p.role);
    if (spawn) {
      p.p = spawn.p;
      p.r = spawn.r;
      p.lastCorrectAt = now;
      players.send(p, { t: S2C.POS_CORRECT, p: p.p, r: p.r });
      notice(p, p.zone === 'ship' ? 'Человек за бортом! Матросы вытащили тебя на палубу' : 'Тебя вытащили на берег');
    }
  }
  players.save(p);
}

// Ниже этой высоты игрок «утонул»: море у корабля на -2,25 м (WATER_Y Фронта 1), у острова — на 0
const FALL_Y = { ship: -3, canary: -2.5 };

function onInteract(p, msg) {
  const id = typeof msg.id === 'string' ? msg.id : '';
  if (id.startsWith('role:')) return director.pickRole(p, id.slice(5));
  rules.interact(p, msg);
}

function onChat(p, msg) {
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (!text) return;
  if (text.length > CONFIG.CHAT_MAX_LEN) return notice(p, `Сообщение длиннее ${CONFIG.CHAT_MAX_LEN} символов`);
  if (text.startsWith('/') && CONFIG.DEV) return devCommand(p, text);
  players.broadcast({ t: S2C.CHAT, from: p.id, name: p.name, text });
}

const handlers = {
  [C2S.MOVE]: onMove,
  [C2S.INTERACT]: onInteract,
  [C2S.CHAT]: onChat,
  [C2S.DIALOGUE]: rules.dialogue,
  [C2S.NPC_TALK]: rules.npcTalk,
  [C2S.NPC_HINT]: rules.npcHint,
  [C2S.PICKUP]: rules.pickup,
  [C2S.USE]: rules.use,
  [C2S.MINIGAME]: rules.minigame,
  [C2S.TRADE]: rules.trade,
  [C2S.SCARE]: rules.scare,
  [C2S.READY]: (p, msg) => director.onReadyMessage(p, msg.value !== false),
  [C2S.SKIP_VOTE]: (p) => director.onSkipVote(p),
  [C2S.CHUNK_REQ]: (p, msg) => onChunkReq(p, msg, {
    send: (m) => players.send(p, m),
    entityState: entities.stateOf,
  }),
  [C2S.CHUNK_DROP]: onChunkDrop,
};

export function handle(p, msg) {
  const h = handlers[msg.t];
  if (h) return h(p, msg);
  if (CONFIG.DEV) console.log(`[game] необработанное сообщение ${msg.t}`);
}

// --- Dev-команды (только DEV=1) ---

function devCommand(p, text) {
  const [cmd, arg] = text.split(/\s+/);
  switch (cmd) {
    case '/scene':
      if (!director.setScene(arg)) notice(p, `Нет сцены ${arg}`);
      break;
    case '/reset':
      resetProgress();
      for (const x of players.all()) {
        if (!x.connected) { players.remove(x.id); continue; } // без ожидания grace
        x.inventory = []; x.money = 0; x.quests = {}; x.log = []; x.trade = {}; x.ready = false; x.seat = null;
        players.sendInventory(x);
      }
      director.resetToStart();
      break;
    case '/give':
      if (!arg) return notice(p, '/give <item>');
      p.inventory.push(arg);
      players.sendInventory(p);
      players.save(p);
      break;
    case '/done':
      quests.completeFor(p, director.scene().id);
      director.onPartyChanged();
      break;
    default:
      notice(p, 'Команды: /scene <id>, /reset, /give <item>, /done');
  }
}

// --- Циклы ---

let tick = 0;
function sendSnapshots() {
  if (!director.acceptsMove() && !director.isLocked()) return;
  tick++;
  const byZone = new Map();
  for (const p of players.connected()) {
    if (!p.p) continue;
    if (!byZone.has(p.zone)) byZone.set(p.zone, []);
    byZone.get(p.zone).push(p);
  }
  for (const list of byZone.values()) {
    const entries = list.map((p) => ({ id: p.id, p: p.p.map((v) => Math.round(v * 100) / 100), r: Math.round(p.r * 1000) / 1000, a: p.a }));
    list.forEach((p, i) => {
      if (list.length < 2) return;
      players.send(p, { t: S2C.SNAPSHOT, tick, players: entries.filter((_, j) => j !== i) });
    });
  }
}

export function start() {
  director.init();
  const timers = [
    setInterval(sendSnapshots, 1000 / CONFIG.TICK_HZ),
    setInterval(() => director.tick(), 250),
    setInterval(() => director.broadcastTod(), CONFIG.TOD_INTERVAL_MS),
    setInterval(() => players.saveAll(), CONFIG.SAVE_INTERVAL_MS),
    setInterval(() => {
      const gone = players.expire();
      if (gone.length) {
        quests.refreshParty(director.scene(),players.party(),gone);
        director.onPartyChanged();
      }
    }, 5000),
  ];
  return () => timers.forEach(clearInterval);
}
