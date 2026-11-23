// Минимальный process для серверного кода в браузере (одиночная сборка). Подключается до сервера.
const started = performance.now();
globalThis.process ??= {
  env: {},
  argv: [],
  version: 'browser',
  platform: 'browser',
  uptime: () => (performance.now() - started) / 1000,
  cpuUsage: () => ({ user: 0, system: 0 }),
  memoryUsage: () => ({ rss: 0, heapUsed: performance.memory?.usedJSHeapSize ?? 0, heapTotal: performance.memory?.totalJSHeapSize ?? 0, external: 0 }),
  nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
  on: () => {},
  exit: () => {},
};
