// Задержка и метрики клиента (ТЗ: админ-панель). Раз в 2 с: ping { ts } — сервер сразу отвечает pong
// с тем же ts, задержка туда и обратно = сейчас − ts; и client_stats { fps, ping, calls, chunks, pct, mem }.
// FPS — нарисованные кадры мира (world.stats; кадры ограничены, frame-limit.js), до загрузки мира —
// по requestAnimationFrame: в свёрнутой вкладке кадров нет, и отчёты почти не идут.
const EVERY_MS = 2000;
const round = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export class Telemetry {
  constructor(getWorld) {
    this.getWorld = getWorld;
    this.client = null; this.off = null;
    this.ping = null; this.fps = null;
    this.frames = 0; this.since = performance.now();
    const count = () => { this.frames++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
    setInterval(() => this.tick(), EVERY_MS);
  }

  attach(client) {
    this.off?.();
    this.client = client; this.ping = null;
    this.off = client.on('pong', (m) => { if (Number.isFinite(m.ts)) this.ping = Math.round(performance.now() - m.ts); });
  }

  tick() {
    const now = performance.now();
    this.fps = this.frames / ((now - this.since) / 1000);
    this.frames = 0; this.since = now;
    if (!this.client?.send('ping', { ts: now })) return; // не в игре — и отчитываться не о чем
    const stats = this.getWorld()?.stats?.(), mem = performance.memory?.usedJSHeapSize; // memory есть только в Chrome
    this.client.send('client_stats', {
      fps: round(Number.isFinite(stats?.fps) && stats.fps > 0 ? stats.fps : this.fps), ping: this.ping, calls: stats?.calls ?? null,
      chunks: stats?.chunks?.loaded ?? null, pct: round(stats?.chunks?.pct), mem: mem ? round(mem / 1048576) : null,
    });
  }
}
