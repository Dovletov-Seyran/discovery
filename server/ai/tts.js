import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AI } from './config.js';

let ttsPromise = null;
let ready = false;

export function loadTTS() {
  if (!AI.TTS_ENABLED) return Promise.resolve(null);
  ttsPromise ??= (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    const tts = await KokoroTTS.from_pretrained(AI.TTS_MODEL, { dtype: AI.TTS_DTYPE, device: 'cpu' });
    ready = true;
    return tts;
  })();
  return ttsPromise;
}

export const ttsReady = () => ready;

// Синтез в WAV-файл. Возвращает URL для клиента или null, если голос выключен.
export async function speak(text, voice, { name = 'line', file, dir = AI.AUDIO_DIR, url = AI.AUDIO_URL, speed = 1, keep = false } = {}) {
  const tts = await loadTTS();
  if (!tts) return { url: null, ms: 0, duration: 0 };
  const started = performance.now();
  mkdirSync(dir, { recursive: true });
  file ??= `${name}_${Date.now()}.wav`;
  const audio = await tts.generate(text, { voice, speed });
  await audio.save(join(dir, file));
  if (!keep) cleanup(dir);
  return {
    url: `${url}/${file}`,
    ms: Math.round(performance.now() - started),
    duration: audio.audio && audio.sampling_rate ? audio.audio.length / audio.sampling_rate : 0,
  };
}

export async function listVoices() {
  const tts = await loadTTS();
  return tts ? Object.keys(tts.voices) : [];
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
