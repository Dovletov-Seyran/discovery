// Точка входа сервера: HTTP + WebSocket на одном порту, слушаем 0.0.0.0 (LAN).
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { CONFIG } from '../shared/config.js';
import { closeDb, worldMeta } from './db.js';
import { handleHttp } from './http.js';
import { attachWs } from './ws.js';
import * as game from './game/index.js';
import { players } from './game/players.js';
import { seedWorld, worldIsStale } from './world/generate.js';
import { initAi } from './game/ai-bridge.js';
import { loadTls } from './tls.js';

if (worldIsStale()) {
  console.log(worldMeta().totalChunks ? '[server] раскладка мира изменилась — перегенерируем' : '[server] мир пуст — генерируем (npm run seed)');
  seedWorld();
}

initAi(); // прогрев LLM и Kokoro в фоне, сервер стартует сразу

// HTTPS (HTTPS=1): на том же порту TLS для https/wss, а обычный http:// перенаправляется на https://.
// Первый байт соединения решает, кому его отдать: 0x16 — начало TLS-рукопожатия.
const tls = CONFIG.HTTPS ? await loadTls() : null;
const server = tls ? createHttpsServer({ key: tls.key, cert: tls.cert }, handleHttp) : createServer(handleHttp);
let front = server;
if (tls) {
  const redirect = createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host ?? `localhost:${CONFIG.PORT}`}${req.url}` });
    res.end();
  });
  front = createTcpServer((socket) => {
    socket.once('data', (head) => {
      socket.pause();
      socket.unshift(head);
      (head[0] === 0x16 ? server : redirect).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
    socket.on('error', () => socket.destroy());
  });
}
const proto = tls ? 'https' : 'http';
const wss = attachWs(server);
const stopGame = game.start();

// Реальный Wi-Fi/Ethernet — первым, VPN и виртуальные адаптеры (WSL, VirtualBox, Docker…) — в конец
const REAL_IF = /^(en\d|eth\d|wlan\d|wlp|enp)|Wi-?Fi|Wireless|WLAN|Беспроводн|Ethernet/i;
const VIRTUAL_IF = /vEthernet|WSL|VirtualBox|VMware|docker|br-|veth|Hyper-V|utun|tun|tap|bridge|vpn|xray|happ|tailscale|zerotier|wg/i;

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const virtual = VIRTUAL_IF.test(name) || a.address.startsWith('192.168.56.'); // 192.168.56.x — VirtualBox
      out.push({ name, ip: a.address, virtual, rank: virtual ? 2 : REAL_IF.test(name) ? 0 : 1 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

front.listen(CONFIG.PORT, '0.0.0.0', () => {
  const flags = [CONFIG.DEMO_MODE && 'DEMO', CONFIG.DEV && 'DEV', tls && 'HTTPS'].filter(Boolean).join(' ');
  console.log(`[server] 1492 запущен${flags ? ` (${flags})` : ''}`);
  console.log(`  ${proto}://localhost:${CONFIG.PORT}`);
  lanAddresses().forEach(({ name, ip, virtual }, i) => {
    const hint = i === 0 && !virtual ? '  ← скорее всего этот, открыть на других ноутбуках' : virtual ? '  (VPN/виртуальный)' : '';
    console.log(`  ${proto}://${ip}:${CONFIG.PORT}  [${name}]${hint}`);
  });
  if (tls) console.log(`  сертификат CA для ноутбуков: ${proto}://<IP>:${CONFIG.PORT}/ca.crt · отпечаток ${tls.fingerprint.slice(0, 23)}…`);
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
  if (front !== server) front.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
