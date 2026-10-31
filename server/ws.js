// WebSocket /ws: первое сообщение — { t: 'auth', token }, иначе закрываем.
import { WebSocketServer } from 'ws';
import { CONFIG } from '../shared/config.js';
import { C2S, S2C, CLOSE } from '../shared/protocol.js';
import { getSession } from './db.js';
import * as game from './game/index.js';

export function attachWs(server) {
  // Жёсткий предел ws — с запасом; мягкий (MAX_MSG_BYTES) проверяем сами и просто игнорируем
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });

  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, CONFIG.PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(ping));
  return wss;
}

function onConnection(ws) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let player = null;
  // Защита от флуда: не больше MAX_MSG_PER_SEC сообщений в секунду, лишние игнорируем
  let windowStart = Date.now();
  let windowCount = 0;
  const fail = (reason) => {
    ws.send(JSON.stringify({ t: S2C.AUTH_FAIL, reason }));
    ws.close(CLOSE.AUTH_FAIL, reason);
  };
  const authTimer = setTimeout(() => fail('timeout'), CONFIG.AUTH_TIMEOUT_MS);

  ws.on('message', (data, isBinary) => {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; windowCount = 0; }
    if (++windowCount > CONFIG.MAX_MSG_PER_SEC) return;
    if (isBinary || data.length > CONFIG.MAX_MSG_BYTES) return player ? undefined : fail('bad_message');
    let msg;
    try { msg = JSON.parse(data.toString('utf8')); } catch { msg = null; }
    if (!msg || typeof msg.t !== 'string') return player ? undefined : fail('bad_message');

    if (!player) {
      if (msg.t !== C2S.AUTH) return fail('auth_required');
      const session = getSession(msg.token);
      if (!session) return fail('bad_token');
      clearTimeout(authTimer);
      player = game.join(session, ws);
      return;
    }

    try {
      const r = game.handle(player, msg);
      if (r instanceof Promise) r.catch((e) => console.error(`[ws] ${msg.t}`, e));
    } catch (e) {
      console.error(`[ws] ${msg.t}`, e);
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (player) game.leave(player, ws);
  });
  ws.on('error', (e) => console.error('[ws]', e.message));
}
