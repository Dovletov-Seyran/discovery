// Игроки в памяти: Map<userId, player>. Отключённый игрок остаётся в партии DISCONNECT_GRACE_MS.
import { WebSocket } from 'ws';
import { CONFIG } from '../../shared/config.js';
import { S2C } from '../../shared/protocol.js';
import { loadPlayer, savePlayer } from '../db.js';

const map = new Map();

function create(userId, name) {
  const saved = loadPlayer(userId);
  const p = {
    id: userId,
    name,
    ws: null,
    connected: false,
    disconnectedAt: null,
    role: saved?.role ?? null,
    scene: saved?.scene ?? null, // запуск сцены 'id@startAt', в которой игрок был последний раз
    zone: saved?.zone ?? null,
    p: saved?.p ?? null,
    r: saved?.r ?? 0,
    a: 'idle',
    inventory: saved?.inventory ?? [],
    money: saved?.money ?? 0,
    itemUses:saved?.itemUses??{},vitals:saved?.vitals??{stamina:100,drunkUntil:0,drunkStrength:0},
    lastItemUse:{},lastVitalsAt:Date.now(),
    quests: saved?.quests ?? {},
    log: saved?.log ?? [],
    trade: saved?.trade??{}, // переговоры и покупки сохраняются между входами
    ready: false,
    seat: null,
    lastMoveAt: 0,
    lastCorrectAt: 0,
    lastNpcTalkAt: 0,
    lastTradeAt: 0,
    lastScareAt: 0,
  };
  map.set(userId, p);
  return p;
}

const serialize = (p) => ({
  role: p.role, scene: p.scene, zone: p.zone, p: p.p, r: p.r, inventory: p.inventory, money: p.money,trade:p.trade,itemUses:p.itemUses,vitals:p.vitals, quests: p.quests, log: p.log,
});

export const players = {
  get: (id) => map.get(id),
  getOrCreate: (id, name) => map.get(id) ?? create(id, name),
  remove: (id) => map.delete(id),
  all: () => [...map.values()],
  connected: () => [...map.values()].filter((p) => p.connected),
  // Партия: подключённые + отключённые, у которых ещё не вышел grace (expire убирает остальных)
  party: () => [...map.values()],
  connectedCount: () => { let n = 0; for (const p of map.values()) if (p.connected) n++; return n; },

  roleOwner(role, exceptId) {
    for (const p of map.values()) if (p.role === role && p.id !== exceptId) return p;
    return null;
  },

  publicInfo: (p) => ({ id: p.id, name: p.name, role: p.role }),

  sendInventory(p) { players.send(p, { t: S2C.INVENTORY, items: p.inventory, money: p.money,itemUses:p.itemUses,vitals:p.vitals }); },

  addLog(p, code) {
    if (code && !p.log.includes(code)) p.log.push(code);
  },

  send(p, msg) {
    if (p.ws?.readyState === WebSocket.OPEN) p.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  },

  broadcast(msg, filter) {
    const json = JSON.stringify(msg);
    for (const p of map.values()) if (p.connected && (!filter || filter(p))) players.send(p, json);
  },

  save(p, opts) { savePlayer(p.id, serialize(p), opts); },
  saveAll() { for (const p of map.values()) savePlayer(p.id, serialize(p)); },

  // Удаляет тех, кто отключён дольше grace. → массив удалённых
  expire(now = Date.now()) {
    const gone = [];
    for (const p of map.values()) {
      if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > CONFIG.DISCONNECT_GRACE_MS) {
        map.delete(p.id);
        gone.push(p);
      }
    }
    return gone;
  },
};
