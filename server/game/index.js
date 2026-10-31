// Игровая логика: вход/выход игрока, обработчики сообщений, циклы.
import { CONFIG } from '../../shared/config.js';
import { C2S, S2C, ANIMS, CLOSE } from '../../shared/protocol.js';
import { worldMeta, resetProgress } from '../db.js';
import { players } from './players.js';
import * as director from './director.js';
import * as ai from './ai-bridge.js';
import { onChunkReq, onChunkDrop } from '../world/chunks.js';

const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });

const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// --- Вход и выход ---

export function join(session, ws) {
  const p = players.getOrCreate(session.userId, session.login);
  const old = p.ws;
  const wasConnected = p.connected;
  if (old && old !== ws) {
    players.send(p, { t: S2C.NOTICE, text: 'Вы вошли с другой вкладки' });
    old.close(CLOSE.REPLACED, 'replaced');
  }
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
      inventory: p.inventory, quests: p.quests, log: p.log,
    },
    world: worldMeta(),
    scene: director.sceneMessage(p),
  });

  for (const other of players.connected()) {
    if (other !== p) players.send(p, { t: S2C.PLAYER_JOIN, ...players.publicInfo(other) });
  }
  if (!wasConnected) players.broadcast({ t: S2C.PLAYER_JOIN, ...players.publicInfo(p) }, (x) => x !== p);
  players.send(p, director.lobbyMessage());
  director.onPartyChanged();
  players.save(p, { now: true });
  console.log(`[game] ${p.name} вошёл (${players.connectedCount()} онлайн)`);
  return p;
}

export function leave(p, ws) {
  if (p.ws !== ws) return; // это старая вкладка, игрок уже переподключился
  p.ws = null;
  p.connected = false;
  p.disconnectedAt = Date.now();
  p.ready = false;
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
  players.save(p);
}

function onInteract(p, msg) {
  const id = typeof msg.id === 'string' ? msg.id : '';
  if (id.startsWith('role:')) return director.pickRole(p, id.slice(5));
  if (director.onReadyAt(p, id)) return;
  // Остальные объекты — B1.9 (entities)
}

function onChat(p, msg) {
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (!text) return;
  if (text.length > CONFIG.CHAT_MAX_LEN) return notice(p, `Сообщение длиннее ${CONFIG.CHAT_MAX_LEN} символов`);
  if (text.startsWith('/') && CONFIG.DEV) return devCommand(p, text);
  players.broadcast({ t: S2C.CHAT, from: p.id, name: p.name, text });
}

async function npcRequest(p, msg, { text, hintId }) {
  const npc = typeof msg.npc === 'string' ? msg.npc : '';
  if (!npc) return;
  const now = Date.now();
  if (now - p.lastNpcTalkAt < CONFIG.NPC_TALK_COOLDOWN_MS) return;
  p.lastNpcTalkAt = now;

  players.send(p, { t: S2C.NPC_THINKING, npc });
  const context = {
    role: p.role, name: p.name, scene: director.scene().id, inventory: p.inventory,
    questsDone: Object.keys(p.quests).filter((id) => p.quests[id]?.status === 'done'), log: p.log,
  };
  try {
    const res = await ai.talk({ userId: p.id, npc, text, hintId, context });
    players.send(p, { t: S2C.NPC_SAY, npc, en: res.en, ru: res.ru, audio: res.audio ?? null, hints: res.hints ?? [] });
    // res.topicsTold → движок заданий (B1.10)
  } catch (e) {
    console.error('[ai] talk', e);
    players.send(p, { t: S2C.NPC_SAY, npc, en: '...', ru: '…', audio: null, hints: [] });
  }
}

function onNpcTalk(p, msg) {
  const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, CONFIG.CHAT_MAX_LEN) : '';
  if (text) return npcRequest(p, msg, { text });
}

function onNpcHint(p, msg) {
  if (typeof msg.hint === 'string' && msg.hint) return npcRequest(p, msg, { hintId: msg.hint });
}

const handlers = {
  [C2S.MOVE]: onMove,
  [C2S.INTERACT]: onInteract,
  [C2S.CHAT]: onChat,
  [C2S.NPC_TALK]: onNpcTalk,
  [C2S.NPC_HINT]: onNpcHint,
  [C2S.READY]: (p, msg) => director.onReadyMessage(p, msg.value !== false),
  [C2S.SKIP_VOTE]: (p) => director.onSkipVote(p),
  [C2S.CHUNK_REQ]: (p, msg) => onChunkReq(p, msg, {
    send: (m) => players.send(p, m),
    entityState: (id) => director.entities()[id],
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
        x.inventory = []; x.quests = {}; x.log = []; x.ready = false; x.seat = null;
      }
      director.resetToStart();
      break;
    case '/give':
      if (!arg) return notice(p, '/give <item>');
      p.inventory.push(arg);
      players.send(p, { t: S2C.INVENTORY, items: p.inventory });
      players.save(p);
      break;
    case '/done':
      notice(p, 'Задания ещё не подключены'); // B1.10
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
      if (gone.length) director.onPartyChanged();
    }, 5000),
  ];
  return () => timers.forEach(clearInterval);
}
