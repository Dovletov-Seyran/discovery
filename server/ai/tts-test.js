// Проверка Kokoro: список голосов и пробные фразы в data/audio/test/.
// npm run tts-test -- [голос ...]
import { fileURLToPath } from 'node:url';
import { listVoices, speak } from './tts.js';

const dir = fileURLToPath(new URL('../../data/audio/test', import.meta.url));
const TEXT = 'They call this the Sea of Darkness, boy. Those who sailed west never came back.';

const t = performance.now();
const voices = await listVoices();
console.log(`модель загружена за ${Math.round(performance.now() - t)} ms`);
console.log(`голоса (${voices.length}): ${voices.join(', ')}`);

const wanted = process.argv.slice(2);
const sample = wanted.length ? wanted : ['am_michael', 'bm_george', 'bm_lewis', 'am_adam', 'bm_daniel', 'bf_emma'].filter((v) => voices.includes(v));
for (const voice of sample) {
  const { url, ms } = await speak(TEXT, voice, { name: voice, dir, url: dir });
  console.log(`${voice}: ${ms} ms → ${url}`);
}
