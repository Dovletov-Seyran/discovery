// Игровой сервер внутри страницы (одиночная сборка для itch.io). Тот же код, что в server/:
// мир строится при загрузке, такты идут таймерами страницы, а вместо WebSocket — LocalSocket
// (client/src/net/socket.js получает его как WebSocketImpl и не знает, что сети нет).
import './polyfill.js';
import { C2S, S2C, CLOSE } from '../../../shared/protocol.js';
import { getSession, getUserByLogin, createUser, createSession, resetProgress, listUsers, loadPlayer } from './shims/db.js';
import { seedWorld, worldIsStale } from '../../../server/world/generate.js';
import { initAi } from '../../../server/game/ai-bridge.js';
import * as game from '../../../server/game/index.js';

let started = false;
export function startHost() {
  if (started) return;
  started = true;
  if (worldIsStale()) seedWorld();
  initAi();
  game.start();
}

// Имя — слот сохранения; пароля нет. → токен для SocketClient
export function soloLogin(name) {
  const id = getUserByLogin(name)?.id ?? createUser(name, '');
  return createSession(id);
}
export const hasAnyProgress = () => listUsers().some((u) => loadPlayer(u.id));
export function newGame() {
  resetProgress();
  if (started) game.resetAll();
}

// Серверная сторона соединения: то, что видит игровой код вместо ws-сокета
class ServerEnd {
  readyState = 1;
  constructor(client) { this.client = client; }
  send(data) { if (this.readyState === 1) this.client._deliver(String(data)); }
  close(code = 1000, reason = '') { if (this.readyState !== 1) return; this.readyState = 3; this.client._closed(code, reason); }
}

// Клиентская сторона: интерфейс браузерного WebSocket, который нужен SocketClient
export class LocalSocket {
  readyState = 0;
  onopen = null; onmessage = null; onclose = null; onerror = null;
  #server = new ServerEnd(this);
  #player = null;
  constructor() {
    startHost();
    setTimeout(() => { if (this.readyState !== 0) return; this.readyState = 1; this.onopen?.({}); });
  }
  send(data) {
    if (this.readyState !== 1) return;
    const text = String(data);
    queueMicrotask(() => this.#receive(text));
  }
  close() {
    if (this.readyState >= 2) return;
    this.#server.readyState = 3;
    this.readyState = 3;
    if (this.#player) game.leave(this.#player, this.#server);
    this.onclose?.({ code: 1000, reason: '' });
  }
  // как server/ws.js onConnection: первое сообщение — auth
  #receive(text) {
    if (this.#server.readyState !== 1) return;
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (!this.#player) {
      const session = msg.t === C2S.AUTH ? getSession(msg.token) : null;
      if (!session) {
        this.#server.send(JSON.stringify({ t: S2C.AUTH_FAIL, reason: 'bad_token' }));
        this.#server.close(CLOSE.AUTH_FAIL, 'bad_token');
        return;
      }
      this.#player = game.join(session, this.#server);
      return;
    }
    try {
      const r = game.handle(this.#player, msg);
      if (r instanceof Promise) r.catch((e) => console.error(`[solo] ${msg.t}`, e));
    } catch (e) {
      console.error(`[solo] ${msg.t}`, e);
    }
  }
  _deliver(data) { queueMicrotask(() => { if (this.readyState === 1) this.onmessage?.({ data }); }); }
  _closed(code, reason) {
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = 3;
      if (this.#player) game.leave(this.#player, this.#server);
      this.onclose?.({ code, reason });
    });
  }
}
