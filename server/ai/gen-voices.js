// Озвучка всех готовых реплик из content/lines.json → client/public/audio/vo/<id>.wav (+ .ogg, если есть ffmpeg)
// и манифест с длительностями для субтитров: client/public/audio/vo/manifest.json
// npm run voices            — только новые и изменённые реплики
// npm run voices -- --force — переозвучить всё
// npm run voices -- intro_1 story_4 — только указанные
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { speak } from './tts.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const OUT = root('client/public/audio/vo');
const MANIFEST = join(OUT, 'manifest.json');

const lines = JSON.parse(readFileSync(root('content/lines.json'), 'utf8'));
const npcs = Object.fromEntries(JSON.parse(readFileSync(root('content/npcs.json'), 'utf8')).map((n) => [n.id, n]));

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

let manifest = {};
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {}

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const hash = (l, npc) => createHash('md5').update(`${l.en}|${npc.voice}|${npc.speed ?? 1}`).digest('hex').slice(0, 8);

let done = 0;
const started = performance.now();
for (const line of lines) {
  if (only.length && !only.includes(line.id)) continue;
  const npc = npcs[line.npc];
  if (!npc) {
    console.warn(`! ${line.id}: нет NPC «${line.npc}» в npcs.json`);
    continue;
  }
  const h = hash(line, npc);
  if (!force && !only.length && manifest[line.id]?.hash === h && existsSync(join(OUT, manifest[line.id].file))) continue;

  const wav = `${line.id}.wav`;
  const { ms, duration } = await speak(line.en, npc.voice, { file: wav, dir: OUT, url: '', speed: npc.speed ?? 1, keep: true });
  let file = wav;
  if (hasFfmpeg) {
    const ogg = `${line.id}.ogg`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(OUT, wav), '-c:a', 'libvorbis', '-q:a', '4', join(OUT, ogg)]);
    unlinkSync(join(OUT, wav));
    file = ogg;
  }
  manifest[line.id] = { file, npc: line.npc, duration: Math.round(duration * 100) / 100, ru: line.ru, en: line.en, hash: h };
  done++;
  console.log(`${line.id.padEnd(24)} ${npc.voice.padEnd(11)} ${duration.toFixed(1)} с  (${ms} ms)`);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`\nОзвучено ${done} реплик за ${Math.round((performance.now() - started) / 1000)} с${hasFfmpeg ? ' (ogg)' : ' (wav — поставьте ffmpeg, файлы будут в ~10 раз меньше)'}`);
