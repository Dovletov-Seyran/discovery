// Скачивает звуки мира из content/sounds.json с Freesound — только лицензия CC0.
// Выбранный звук закрепляется в sounds.json (freesoundId), чтобы повторный запуск давал то же самое.
//   node scripts/fetch-sounds.mjs               — скачать недостающие
//   node scripts/fetch-sounds.mjs --force amb_gulls sfx_coins — перекачать указанные
// Другой звук: удалить freesoundId у записи (и, если надо, добавить отвергнутый номер в "skip": [...]) и запустить с --force <id>.
// Результат: client/public/audio/{amb,sfx}/<id>.mp3, client/public/audio/sounds-manifest.json, docs/credits-audio.md
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const SOUNDS = root('content/sounds.json');
const OUT = root('client/public/audio');
const MANIFEST = join(OUT, 'sounds-manifest.json');
const CREDITS = root('docs/credits-audio.md');
const UA = { 'User-Agent': 'Mozilla/5.0 (discovery-1492 student project)' };

const KIND = {
  amb: { dir: 'amb', duration: [20, 300], maxLen: 90, filter: (len) => `loudnorm=I=-22:TP=-2:LRA=11,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, len - 2)}:d=2`, args: ['-ac', '2', '-b:a', '128k'] },
  sfx: { dir: 'sfx', duration: [0.3, 15], maxLen: 10, filter: () => 'silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5:LRA=11', args: ['-ac', '1', '-b:a', '96k'] },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const list = JSON.parse(readFileSync(SOUNDS, 'utf8'));
let manifest = {};
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const attr = (block, name) => block.match(new RegExp(`data-${name}="([^"]*)"`))?.[1];
const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: UA, redirect: 'follow' });
      if (res.ok) return res;
      if (res.status === 404) throw new Error(`404 ${url}`);
    } catch (err) {
      if (i === 2 || String(err.message).startsWith('404')) throw err;
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`не скачалось: ${url}`);
}

// Разбор карточек звуков из HTML поиска или страницы звука
function parseSounds(html) {
  return html.split('data-sound-id="').slice(1).map((chunk) => {
    const block = `data-sound-id="${chunk.slice(0, 4000)}`;
    return {
      id: Number(attr(block, 'sound-id')),
      title: decode(attr(block, 'title')),
      author: decode(attr(block, 'username')),
      mp3: attr(block, 'mp3'),
    };
  }).filter((s) => s.id && s.mp3);
}

async function search(q, [min, max]) {
  const f = `license:"Creative Commons 0" duration:[${min} TO ${max}]`;
  const url = `https://freesound.org/search/?q=${encodeURIComponent(q)}&f=${encodeURIComponent(f)}&s=${encodeURIComponent('Downloads (most first)')}`;
  const html = await (await get(url)).text();
  const seen = new Set();
  return parseSounds(html).filter((s) => !seen.has(s.id) && seen.add(s.id));
}

async function soundById(id) {
  const res = await get(`https://freesound.org/s/${id}/`);
  const html = await res.text();
  if (!/creativecommons\.org\/publicdomain\/zero/.test(html)) throw new Error(`звук ${id} не CC0`);
  const s = parseSounds(html).find((x) => x.id === id);
  if (!s) throw new Error(`не разобрал страницу звука ${id}`);
  return { ...s, page: res.url };
}

const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

let done = 0;
for (const kind of ['amb', 'sfx']) {
  const k = KIND[kind];
  mkdirSync(join(OUT, k.dir), { recursive: true });
  for (const entry of list[kind]) {
    if (only.length && !only.includes(entry.id)) continue;
    const out = join(OUT, k.dir, `${entry.id}.mp3`);
    if (!force && existsSync(out) && manifest[entry.id]) continue;

    try {
      let sound;
      if (entry.freesoundId) {
        sound = await soundById(entry.freesoundId);
      } else {
        // q — строка или список запасных запросов: берём первый, по которому что-то нашлось
        const skip = new Set(entry.skip || []);
        let found = [];
        let q;
        for (q of [].concat(entry.q)) {
          found = (await search(q, k.duration)).filter((s) => !skip.has(s.id));
          if (found.length) break;
          await sleep(800);
        }
        if (!found.length) throw new Error(`ничего не найдено по «${[].concat(entry.q).join('», «')}»`);
        const pick = found[0];
        console.log(`  кандидаты «${q}»: ${found.slice(0, 3).map((s) => `${s.id} ${s.title}`).join(' | ')}`);
        sound = { ...pick, page: `https://freesound.org/people/${pick.author}/sounds/${pick.id}/` };
        await sleep(800);
      }

      const raw = join(OUT, k.dir, `${entry.id}.raw.mp3`);
      const buf = Buffer.from(await (await get(sound.mp3.replace('-lq.mp3', '-hq.mp3'))).arrayBuffer());
      writeFileSync(raw, buf);
      const len = Math.min(probe(raw), k.maxLen);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-t', String(len), '-af', k.filter(len), '-ar', '44100', ...k.args, out]);
      unlinkSync(raw);

      const duration = Math.round(probe(out) * 100) / 100;
      entry.freesoundId = sound.id;
      manifest[entry.id] = { file: `${k.dir}/${entry.id}.mp3`, kind, duration, title: sound.title, author: sound.author, freesoundId: sound.id, url: sound.page, license: 'CC0 1.0' };
      done++;
      console.log(`${entry.id.padEnd(20)} ${String(duration).padStart(6)} с  ← ${sound.id} «${sound.title}» (${sound.author})`);
      await sleep(800);
    } catch (err) {
      console.warn(`! ${entry.id}: ${err.message}`);
    }
  }
}

writeFileSync(SOUNDS, JSON.stringify(list, null, 2) + '\n');
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));

const rows = Object.entries(manifest).sort().map(([id, m]) => `| \`${id}\` | [${m.title.replace(/\|/g, '/')}](${m.url}) | ${m.author} | ${m.license} |`);
writeFileSync(CREDITS, `# Звуки мира — источники\n\nВсе звуки — с [Freesound](https://freesound.org), лицензия **CC0 1.0** (общественное достояние, указание автора не обязательно, но мы указываем). Обработаны: обрезка, нормализация громкости, MP3.\n\nСписок и поисковые запросы — \`content/sounds.json\`, скачивание — \`node scripts/fetch-sounds.mjs\`.\n\n| Звук | Оригинал | Автор | Лицензия |\n|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(`\nГотово: ${done} новых, всего в манифесте ${Object.keys(manifest).length}`);
