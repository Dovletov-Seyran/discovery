// Точка входа сервера: HTTP + WebSocket на одном порту, слушаем 0.0.0.0 (LAN).
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { CONFIG } from '../shared/config.js';
import { closeDb, worldMeta } from './db.js';
import { handleHttp } from './http.js';
import { attachWs } from './ws.js';
import * as game from './game/index.js';
import { players } from './game/players.js';
import { seedWorld } from './world/generate.js';

if (!worldMeta().totalChunks) {
  console.log('[server] мир пуст — генерируем (npm run seed)');
  seedWorld();
}

const server = createServer(handleHttp);
const wss = attachWs(server);
const stopGame = game.start();

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

server.listen(CONFIG.PORT, '0.0.0.0', () => {
  const flags = [CONFIG.DEMO_MODE && 'DEMO', CONFIG.DEV && 'DEV'].filter(Boolean).join(' ');
  console.log(`[server] 1492 запущен${flags ? ` (${flags})` : ''}`);
  console.log(`  http://localhost:${CONFIG.PORT}`);
  for (const ip of lanAddresses()) console.log(`  http://${ip}:${CONFIG.PORT}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[server] остановка, сохраняем…');
  stopGame();
  players.saveAll();
  for (const ws of wss.clients) ws.close(1001, 'server_shutdown');
  closeDb();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
