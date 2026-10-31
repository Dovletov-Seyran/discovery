// Kokoro в отдельном потоке: синтез речи (фонемы + ONNX) не должен занимать цикл событий сервера,
// иначе на время каждой реплики подвисают снимки позиций и движение всех игроков.
// Заодно изолирует обработчики process.on(...) библиотеки фонем, которые иначе роняют сервер.
import { parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';

const { model, dtype, cacheDir, offline } = workerData;

const { KokoroTTS } = await import('kokoro-js');
const { env } = await import('@huggingface/transformers');
env.cacheDir = cacheDir;
if (offline) env.allowRemoteModels = false;

let tts;
try {
  tts = await KokoroTTS.from_pretrained(model, { dtype, device: 'cpu' });
  parentPort.postMessage({ type: 'ready', voices: Object.keys(tts.voices) });
} catch (err) {
  parentPort.postMessage({ type: 'fatal', error: err.message });
}

parentPort.on('message', async ({ id, text, voice, speed, dir, file }) => {
  try {
    const audio = await tts.generate(text, { voice, speed });
    await audio.save(join(dir, file));
    const duration = audio.audio && audio.sampling_rate ? audio.audio.length / audio.sampling_rate : 0;
    parentPort.postMessage({ type: 'done', id, duration });
  } catch (err) {
    parentPort.postMessage({ type: 'error', id, error: err.message });
  }
});
