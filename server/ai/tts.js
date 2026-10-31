import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { AI } from './config.js';

// Синтез идёт в tts-worker.js: в основном потоке он блокировал бы сервер на время каждой реплики
let workerPromise = null;
let voices = [];
let ready = false;
let nextId = 0;
const pending = new Map();

export function loadTTS() {
  if (!AI.TTS_ENABLED) return Promise.resolve(null);
  workerPromise ??= new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./tts-worker.js', import.meta.url), {
      execArgv: [], // флаги процесса (--input-type, --watch…) потоку не нужны и ломают его запуск
      workerData: { model: AI.TTS_MODEL, dtype: AI.TTS_DTYPE, cacheDir: AI.MODELS_DIR, offline: process.env.OFFLINE === '1' },
    });
    // Поток держит процесс, только пока есть работа: скрипты (agent-cli, voices) завершаются сами
    const idle = () => pending.size === 0 && worker.unref();
    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        voices = msg.voices;
        ready = true;
        idle();
        resolve(worker);
      } else if (msg.type === 'fatal') {
        reject(new Error(msg.error));
      } else {
        const job = pending.get(msg.id);
        if (!job) return;
        pending.delete(msg.id);
        idle();
        if (msg.type === 'done') job.resolve(msg.duration);
        else job.reject(new Error(msg.error));
      }
    });
    worker.on('error', (err) => {
      ready = false;
      workerPromise = null;
      for (const job of pending.values()) job.reject(err);
      pending.clear();
      reject(err);
    });
  });
  return workerPromise;
}

export const ttsReady = () => ready;

// Синтез в WAV-файл. Возвращает URL для клиента или null, если голос выключен.
export async function speak(text, voice, { name = 'line', file, dir = AI.AUDIO_DIR, url = AI.AUDIO_URL, speed = 1, keep = false } = {}) {
  const worker = await loadTTS();
  if (!worker) return { url: null, ms: 0, duration: 0 };
  const started = performance.now();
  mkdirSync(dir, { recursive: true });
  file ??= `${name}_${Date.now()}.wav`;
  const id = nextId++;
  const duration = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.ref();
    worker.postMessage({ id, text, voice, speed, dir, file });
  });
  if (!keep) cleanup(dir);
  return { url: `${url}/${file}`, ms: Math.round(performance.now() - started), duration };
}

export async function listVoices() {
  const worker = await loadTTS();
  return worker ? voices : [];
}

let lastCleanup = 0;
function cleanup(dir) {
  if (Date.now() - lastCleanup < 60_000) return;
  lastCleanup = Date.now();
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (Date.now() - statSync(p).mtimeMs > AI.AUDIO_TTL_MS) unlinkSync(p);
  }
}
