// Озвучка всех готовых реплик из content/lines.json и заготовленных ответов NPC (content/agents/*.json → script,
// ключи agent.<npc>.<что>) → client/public/audio/vo/<id>.wav (+ .mp3, если есть ffmpeg)
// и манифест с длительностями для субтитров: client/public/audio/vo/manifest.json
// npm run voices            — только новые и изменённые реплики
// npm run voices -- --force — переозвучить всё
// npm run voices -- intro_1 story_4 — только указанные
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { speak } from './tts.js';
import { AI } from './config.js';

AI.TTS_ENABLED = true; // озвучка заранее — Kokoro нужен здесь, даже когда в игре модель выключена

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const OUT = root('client/public/audio/vo');
const MANIFEST = join(OUT, 'manifest.json');

const npcs = Object.fromEntries(JSON.parse(readFileSync(root('content/npcs.json'), 'utf8')).map((n) => [n.id, n]));
const lines = JSON.parse(readFileSync(root('content/lines.json'), 'utf8'));
// Заготовленные ответы агентов (без ИИ): приветствие, темы, «о себе», прощание, «не знаю такого», запасные фразы,
// ответы на приказы и торг. Ответ про задание меняется от задания — его не озвучиваем
for (const file of readdirSync(root('content/agents')).filter((f) => f.endsWith('.json'))) {
  const a = JSON.parse(readFileSync(join(root('content/agents'), file), 'utf8')), s = a.script;
  if (!s || !npcs[a.id]) continue;
  const add = (key, l) => l?.en && lines.push({ id: `agent.${a.id}.${key}`, npc: a.id, en: l.en, ru: l.ru ?? '' });
  add('greeting', a.greeting);
  for (const [id, l] of Object.entries(s.cards ?? {})) add(`card_${id}`, l);
  for (const k of ['about', 'farewell', 'stranger']) add(k, s[k]);
  (a.fallbacks ?? []).forEach((l, i) => add(`fallback_${i}`, l));
  for (const act of a.actions ?? []) if (act.reply) add(`action_${act.id}`, { en: act.reply, ru: act.replyRu });
  for (const [k, l] of Object.entries(s.trade ?? {})) add(`trade_${k}`, l);
}

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
    const mp3 = `${line.id}.mp3`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(OUT, wav), '-c:a', 'libmp3lame', '-q:a', '4', join(OUT, mp3)]);
    unlinkSync(join(OUT, wav));
    file = mp3;
  }
  manifest[line.id] = { file, npc: line.npc, duration: Math.round(duration * 100) / 100, ru: line.ru, en: line.en, hash: h };
  done++;
  console.log(`${line.id.padEnd(24)} ${npc.voice.padEnd(11)} ${duration.toFixed(1)} с  (${ms} ms)`);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`\nОзвучено ${done} реплик за ${Math.round((performance.now() - started) / 1000)} с${hasFfmpeg ? ' (mp3)' : ' (wav — поставьте ffmpeg, файлы будут в ~10 раз меньше)'}`);
