// Счётчики для /api/health и админки (server/admin): чанки по игрокам, сообщения в секунду,
// отчёты клиентов (client_stats) и снимки самого сервера. Истории — по 60 точек, раз в 2 с (≈ 2 минуты).
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { CONFIG } from '../../shared/config.js';

const HISTORY = 60;
const SAMPLE_MS = 2000;
const push = (list, v) => { list.push(v); if (list.length > HISTORY) list.shift(); };

const served = new Map(); // userId → число отданных чанков

export const chunkStats = {
  add(userId, n = 1) { served.set(userId, (served.get(userId) ?? 0) + n); },
  of(userId) { return served.get(userId) ?? 0; },
  total() { let s = 0; for (const n of served.values()) s += n; return s; },
};

// --- сообщения WebSocket (считает server/ws.js) и такт (снимки движения, game/index.js) ---
const traffic = { in: 0, out: 0, bytesIn: 0, bytesOut: 0, ticks: 0 };
export const countIn = (bytes) => { traffic.in++; traffic.bytesIn += bytes; };
export const countOut = (bytes) => { traffic.out++; traffic.bytesOut += bytes; };
export const countTick = () => { traffic.ticks++; };

// --- клиенты: последние отчёты client_stats каждого игрока ---
const clients = new Map(); // userId → [{ at, fps, ping, calls, chunks, pct, mem }]
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(Math.max(v, 0), max) * 10) / 10 : null);

export function clientReport(userId, msg) {
  const list = clients.get(userId) ?? [];
  push(list, {
    at: Date.now(), fps: num(msg.fps, 1000), ping: num(msg.ping, 60000), calls: num(msg.calls, 1e6),
    chunks: num(msg.chunks, 1e5), pct: num(msg.pct, 100), mem: num(msg.mem, 1e5),
  });
  clients.set(userId, list);
}
export const clientHistory = (userId) => clients.get(userId) ?? [];
export const forgetClient = (userId) => { clients.delete(userId); };

// --- сервер: процессор, память, задержка цикла событий, сообщения и чанки в секунду ---
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
const samples = [];
let last = { at: Date.now(), cpu: process.cpuUsage(), traffic: { ...traffic }, chunks: 0 };

function sample() {
  const now = Date.now(), dt = (now - last.at) / 1000 || 1, cpu = process.cpuUsage(last.cpu), mem = process.memoryUsage();
  const chunks = chunkStats.total(), rate = (k) => Math.round(((traffic[k] - last.traffic[k]) / dt) * 10) / 10;
  push(samples, {
    at: now,
    cpu: Math.round(((cpu.user + cpu.system) / 1000 / (dt * 1000)) * 1000) / 10, // % одного ядра
    rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576),
    lag: Math.round(loop.percentile(99) / 1e5) / 10, // мс, p99 задержки цикла событий
    tick: rate('ticks'), msgIn: rate('in'), msgOut: rate('out'),
    kbIn: Math.round(((traffic.bytesIn - last.traffic.bytesIn) / dt / 1024) * 10) / 10,
    kbOut: Math.round(((traffic.bytesOut - last.traffic.bytesOut) / dt / 1024) * 10) / 10,
    chunks: Math.round(((chunks - last.chunks) / dt) * 10) / 10,
  });
  loop.reset();
  last = { at: now, cpu: process.cpuUsage(), traffic: { ...traffic }, chunks };
}
setInterval(sample, SAMPLE_MS).unref();

export const serverStats = () => ({
  history: samples, uptime: Math.round(process.uptime()), tickTarget: CONFIG.TICK_HZ,
  chunksServed: chunkStats.total(), node: process.version,
});
