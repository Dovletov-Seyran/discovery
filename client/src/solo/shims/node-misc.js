// Мелкие модули Node, которые подтягивает сервер, но в одиночной игре не использует по-настоящему:
// perf_hooks (замер такта), worker_threads (голос Kokoro — только с AI=1), ws (константа OPEN).
export const performance = globalThis.performance;
// Задержку цикла событий в браузере не измерить так же — админка просто увидит нули
export const monitorEventLoopDelay = () => ({ enable() {}, disable() {}, reset() {}, min: 0, max: 0, mean: 0, stddev: 0, percentile: () => 0 });

export class Worker {
  constructor() { throw new Error('В одиночной сборке нет потоков Node: живой голос недоступен'); }
}
export const parentPort = null;
export const isMainThread = true;
export const workerData = null;

export const WebSocket = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };
export class WebSocketServer {}

export default { performance, monitorEventLoopDelay, Worker, parentPort, workerData, isMainThread, WebSocket, WebSocketServer };
