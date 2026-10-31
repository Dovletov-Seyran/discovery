// Типы сообщений WebSocket (docs/README.md §6). Меняем только договорившись.
// Все сообщения — JSON { t: '<тип>', ... }.

// Клиент → Сервер
export const C2S = {
  AUTH: 'auth',             // { token }
  MOVE: 'move',             // { p, r, a }
  CHUNK_REQ: 'chunk_req',   // { zone, keys: ['3,5', ...] }
  CHUNK_DROP: 'chunk_drop', // { zone, keys }
  INTERACT: 'interact',     // { id }  — в лобби id: 'role:piloto'
  PICKUP: 'pickup',         // { id }
  USE: 'use',               // { item, target? }
  MINIGAME: 'minigame',     // { game, result }
  CHAT: 'chat',             // { text }
  DIALOGUE: 'dialogue',       // { npc, dialogueId, active } — открытие/heartbeat/закрытие, lease 30 с
  NPC_TALK: 'npc_talk',     // { npc, text, dialogueId?, requestId? }
  NPC_HINT: 'npc_hint',     // { npc, hint, dialogueId?, requestId? }
  TRADE: 'trade',           // { npc, item, offer }
  READY: 'ready',           // { value: true/false }
  SKIP_VOTE: 'skip_vote',   // —
  SCARE: 'scare',           // { target }
};

// Сервер → Клиент
export const S2C = {
  AUTH_OK: 'auth_ok',           // { you: {id, name, role}, state, world, scene }
  AUTH_FAIL: 'auth_fail',       // { reason }
  LOBBY: 'lobby',               // { players: [{id, name, role, ready, connected}] }
  SNAPSHOT: 'snapshot',         // { tick, players: [{id, p, r, a}] }
  PLAYER_JOIN: 'player_join',   // { id, name, role }
  PLAYER_LEAVE: 'player_leave', // { id, name, role }
  SCENE: 'scene',               // { id, type, startAt, tod, zone, duration, spawn?, seat? }
  TOD: 'tod',                   // { value }
  CHUNK: 'chunk',               // { zone, key, data }
  CHUNK_DENIED: 'chunk_denied', // { zone, key, reason }
  ENTITY: 'entity',             // { id, state }
  INVENTORY: 'inventory',       // { items: [...] }
  QUEST: 'quest',               // { id, status, progress, total }
  PARTY: 'party',               // { ready: {id: bool}, waitingFor: [{id, name, role}], skip: {votes, total} }
  CHAT: 'chat',                 // { from, name, text }
  NPC_THINKING: 'npc_thinking', // { npc }
  NPC_SAY: 'npc_say',           // { npc, en, ru, audio, hints: [{id, ru}] }
  SCARED: 'scared',             // { by }
  NOTICE: 'notice',             // { text }
  POS_CORRECT: 'pos_correct',   // { p, r } — сервер отклонил move (слишком быстро), вернуть игрока сюда
  TRADE_STATE: 'trade_state',   // { npc, money, goods: [{item, price, sold}] } — при E у торговца и после каждого trade
};

// Коды закрытия WebSocket
export const CLOSE = {
  AUTH_FAIL: 4001,  // не авторизован — переподключаться без нового входа бессмысленно
  REPLACED: 4002,   // вошли с другой вкладки — НЕ переподключаться автоматически
  FULL: 4003,       // экипаж собран (CONFIG.MAX_PLAYERS) — НЕ переподключаться автоматически
};

export const ROLES = ['grumete', 'piloto', 'lengua'];

export const ROLE_NAMES = { grumete: 'Юнга', piloto: 'Штурман', lengua: 'Переводчик' };

export const ANIMS = ['idle', 'walk', 'run', 'sit'];
