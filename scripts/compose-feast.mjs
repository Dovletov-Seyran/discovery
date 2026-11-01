// Музыка праздничного вечера: «Ла Фолия», синтез без сэмплов.
// Фолия — иберийская тема конца XV века: её гармонию (i–V–i–VII–III–VII–i–V) слышали современники Колумба.
// Мелодия и вариации — свои. Струна — модель Карплуса — Стронга, корпус — резонансные фильтры, зал — Freeverb.
//   node scripts/compose-feast.mjs                    → виуэла + бубен пандеро: client/public/audio/amb/amb_feast_folia.mp3 + sounds-manifest.json
//   node scripts/compose-feast.mjs --strings guitar   — нейлоновая гитара вместо виуэлы (парные струны)
//   node scripts/compose-feast.mjs --no-pandero       — без бубна; --pipe — дудочка (flauta de tamboril) ведёт мелодию
//   node scripts/compose-feast.mjs --out файл.mp3     — только файл, манифест не трогать (пробные варианты)
// Файл собран под петлю WorldAudio (loopStart 1.6 с, loopEnd = длительность − 2.1 с): окно между ними — бесшовный круг.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SR, rng, gaussOf, hz, noise, mixIn, biquad, freeverb, frameDrum, encode, levelDb } from './synth.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);

const ID = 'amb_feast_folia';
const OUT = option('out', root(`client/public/audio/amb/${ID}.mp3`));
const MANIFEST = root('client/public/audio/sounds-manifest.json');
const STRINGS = option('strings', 'vihuela');   // vihuela — парные струны (хоры), guitar — одиночные
const PANDERO = !flag('no-pandero');
const PIPE = flag('pipe');
const PRE = 1.6, POST = 2.1;       // поля петли WorldAudio
const TARGET_LUFS = -21;           // чуть громче шумовых фонов (−22), музыка должна читаться под голосами

const BAR = 2.5;                  // 3/4, четверть = 72
const BEAT = BAR / 3, EIGHTH = BEAT / 2;
const BARS = 64;                   // тема 16 тактов × 4 вариации
const LOOP = BARS * BAR;           // 160 с
const TAIL = 6;                    // хвост струн и реверберации, заворачивается в начало
const BRIGHT = 0.12;               // мягкость щипка: подушечка пальца, не медиатор
const LOWPASS = 3500;              // жильные и нейлоновые струны глухие: выше 2 кГц ≈ −19 дБ, как у живой записи

// У каждого инструмента свой поток случайных чисел, чтобы добавление бубна не меняло игру струн
const rnd = rng(1492), gauss = gaussOf(rnd);

// Аккорды: бас + три верхних голоса (струны: 0 — шестая … 5 — первая)
const CHORDS = {
  Dm: { bass: [50, 2], up: [[57, 3], [62, 4], [65, 5]] },
  A: { bass: [45, 1], up: [[57, 3], [61, 4], [64, 5]] },
  C: { bass: [48, 1], up: [[55, 3], [60, 4], [64, 5]] },
  F: { bass: [41, 0], up: [[57, 3], [60, 4], [65, 5]] },
};
// Гармония фолии: такт 15 — Dm, на третью долю A
const HARMONY = ['Dm', 'A', 'Dm', 'C', 'F', 'C', 'Dm', 'A', 'Dm', 'A', 'Dm', 'C', 'F', 'C', 'Dm', 'Dm'];
const MELODY = [74, 73, 74, 76, 77, 76, 74, 73, 74, 76, 77, 79, 81, 79, 77, 74];
const D_MINOR = [62, 64, 65, 67, 69, 70, 72, 73, 74, 76, 77, 79, 81, 82, 84];

// Проходящая нота от main к next — шаг гаммы; при соседних нотах повторяем main (опережение next дало бы
// до-диез над ре-минором), при одинаковых — верхняя вспомогательная
function passing(main, next) {
  const i = D_MINOR.indexOf(main);
  if (next === main || i < 0) return D_MINOR[i + 1] ?? main;
  const step = D_MINOR[i + Math.sign(next - main)];
  return step === next ? main : step;
}

const notes = [];   // струны: { t, midi, string, vel }
const hits = [];    // пандеро: { t, kind: dum|tak|jingle, vel }
const tune = [];    // дудочка: { t, midi, dur, vel }
const add = (t, midi, string, vel) => notes.push({ t: t + gauss() * 0.006, midi, string, vel: vel * (1 + gauss() * 0.06) });
const prnd = rng(7), pgauss = gaussOf(prnd);
const hit = (t, kind, vel) => hits.push({ t: t + pgauss() * 0.005, kind, vel: vel * (1 + pgauss() * 0.08) });

function bar(index, variation) {
  const t0 = index * BAR, n = index % 16;
  const chord = CHORDS[HARMONY[n]];
  // Фраза: подъём к пятому такту восьмитактовой фразы, спад к каденции
  const phrase = 0.82 + 0.18 * Math.sin(Math.PI * Math.min(1, (n % 8) / 6));
  const level = [0.62, 0.74, 0.5, 0.7][variation] * phrase;
  const [b, s] = chord.bass;
  const lastBeatA = n === 14 ? CHORDS.A : null;   // каденция i–V
  const at = (beat) => (lastBeatA && beat >= 2 ? lastBeatA : chord);
  const cadence = n === 7 || n === 15;

  // Пандеро: вступает во второй вариации, в третьей молчит, в четвёртой — полнее
  if (PANDERO && (variation === 1 || variation === 3)) {
    const v = variation === 3 ? 1 : 0.8;
    hit(t0, 'dum', 0.9 * v);
    if (!cadence) {
      hit(t0 + BEAT, 'tak', 0.55 * v);
      hit(t0 + 2 * BEAT, 'jingle', 0.5 * v);
      if (variation === 3) { hit(t0 + EIGHTH, 'jingle', 0.3); hit(t0 + 2 * BEAT, 'tak', 0.45); hit(t0 + 5 * EIGHTH, 'jingle', 0.35); }
    } else hit(t0 + 2 * BEAT, 'jingle', 0.35 * v);
  }

  // Дудочка ведёт мелодию во второй и четвёртой вариациях (струны тогда только аккомпанируют)
  const pipeHere = PIPE && (variation === 1 || variation === 3);
  if (pipeHere) {
    const mel = MELODY[n], next = MELODY[(n + 1) % 16];
    const pv = 0.8 * phrase;
    if (cadence) tune.push({ t: t0, midi: mel, dur: 2.7 * BEAT, vel: pv });
    else if (variation === 1) {
      tune.push({ t: t0, midi: mel, dur: 1.9 * BEAT, vel: pv });
      tune.push({ t: t0 + 2 * BEAT, midi: passing(mel, next), dur: 0.9 * BEAT, vel: pv * 0.85 });
    } else {
      // Четвёртая: сарабанда с украшением — основная, вспомогательная сверху, основная, проходящая
      tune.push({ t: t0, midi: mel, dur: 0.95 * BEAT, vel: pv });
      tune.push({ t: t0 + BEAT, midi: D_MINOR[D_MINOR.indexOf(mel) + 1] ?? mel, dur: 0.45 * BEAT, vel: pv * 0.8 });
      tune.push({ t: t0 + 1.5 * BEAT, midi: mel, dur: 0.45 * BEAT, vel: pv * 0.85 });
      tune.push({ t: t0 + 2 * BEAT, midi: passing(mel, next), dur: 0.9 * BEAT, vel: pv * 0.85 });
    }
  }

  if (variation === 2) {
    // Третья вариация: мягкое арпеджато аккорда на первую долю, две лёгкие ноты следом
    [chord.bass, ...chord.up].forEach(([m, st], i) => add(t0 + i * 0.045, m, st, level * (i ? 0.7 : 1)));
    add(t0 + BEAT, at(1).up[1][0], at(1).up[1][1], level * 0.55);
    add(t0 + 2 * BEAT, at(2).up[2][0], at(2).up[2][1], level * 0.6);
    if (lastBeatA) add(t0 + 2 * BEAT, CHORDS.A.bass[0], CHORDS.A.bass[1], level * 0.8);
    return;
  }
  // Перебор восьмыми: бас, затем p-i-m-a-m-i по верхним голосам
  add(t0, b, s, level);
  const pattern = [null, 0, 1, 2, 1, 0];
  for (let k = 1; k < 6; k++) {
    const c = at(Math.floor(k / 2));
    if (k === 4 && c !== chord) add(t0 + k * EIGHTH, c.bass[0], c.bass[1], level * 0.8);
    const [m, st] = c.up[pattern[k]];
    add(t0 + k * EIGHTH, m, st, level * (k === 3 ? 0.62 : 0.55));
  }
  if (variation === 0 || pipeHere) return;
  // Мелодия сверху (вторая и четвёртая вариации) — на первую долю вместе с басом
  const mel = MELODY[n];
  add(t0 + 0.012, mel, 5, level * 1.15);
  if (variation === 3 && n !== 15) add(t0 + 2 * BEAT + 0.01, passing(mel, MELODY[(n + 1) % 16]), 5, level * 0.85);
  if (n === 14) add(t0 + 2 * BEAT + 0.012, 76, 5, level);   // E над A в каденции
}

for (let i = 0; i < BARS; i++) bar(i, Math.floor(i / 16));
notes.sort((a, b) => a.t - b.t);

// Новая нота на той же струне глушит предыдущую
const lastOnString = [];
for (const note of notes) {
  const prev = lastOnString[note.string];
  if (prev) prev.end = Math.min(prev.end, note.t);
  note.end = note.t + 4.5;
  lastOnString[note.string] = note;
}

const total = Math.ceil((LOOP + TAIL) * SR);

// Струна Карплуса — Стронга с дробной задержкой (allpass) и позицией щипка
const strings = new Float32Array(total);
function pluck({ t, midi, vel, end }, { cents = 0, gain = 1 } = {}) {
  const f = hz(midi) * 2 ** (cents / 1200);
  const period = SR / f;
  const N = Math.floor(period - 0.5);
  const frac = period - 0.5 - N;
  const ap = (1 - frac) / (1 + frac);
  const t60 = 1.6 + 3.4 * Math.max(0, Math.min(1, (76 - midi) / 35));   // басы звенят дольше
  const g = 0.001 ** (1 / (t60 * f));
  // Возбуждение: шум через два однополюсных ФНЧ (мягкий щипок подушечкой пальца) и гребёнка позиции щипка
  const buf = new Float32Array(N);
  const bright = BRIGHT * (0.6 + 0.4 * Math.min(1, vel));
  let lp = 0, lp2 = 0;
  for (let i = 0; i < N; i++) { lp += bright * (rnd() * 2 - 1 - lp); lp2 += bright * (lp - lp2); buf[i] = lp2; }
  const pickAt = Math.max(1, Math.round(N * 0.18));
  const shaped = buf.map((v, i) => v - 0.9 * buf[(i - pickAt + N) % N]);
  let mean = 0, energy = 0;
  for (const v of shaped) mean += v / N;
  for (let i = 0; i < N; i++) { buf[i] = shaped[i] - mean; energy += buf[i] ** 2; }
  // Одинаковая сила щипка на любой высоте: иначе тёмный шум в коротком буфере высоких нот почти беззвучен
  const norm = 1 / Math.sqrt(energy / N + 1e-9);
  for (let i = 0; i < N; i++) buf[i] *= norm;

  const start = Math.round(t * SR), stop = Math.min(total, Math.round((end + 0.12) * SR));
  const muteAt = Math.round(end * SR);
  let idx = 0, prev = 0, apX = 0, apY = 0;
  for (let n = start; n < stop; n++) {
    const cur = buf[idx];
    const avg = 0.5 * (cur + prev);
    prev = cur;
    const y = ap * avg + apX - ap * apY;   // allpass подстраивает высоту тона
    apX = avg; apY = y;
    const muted = n >= muteAt;
    buf[idx] = y * (muted ? g * 0.7 : g);   // пальцем глушим струну перед следующей нотой
    idx = (idx + 1) % N;
    const env = muted ? 1 - (n - muteAt) / (stop - muteAt) : 1;   // без щелчка на обрыве
    if (n >= 0) strings[n] += cur * vel * 0.32 * gain * env;
  }
}
// Виуэла: каждый хор — две жильные струны, чуть расстроенные между собой и задетые с разницей в миллисекунды
const COURSE_CENTS = [2.6, -2.2, 1.8, -2.4, 2.0, -1.6];
for (const note of notes) {
  if (STRINGS === 'guitar') { pluck(note); continue; }
  const c = COURSE_CENTS[note.string];
  pluck(note, { cents: c / 2, gain: 0.62 });
  pluck({ ...note, t: note.t + 0.003 + rnd() * 0.004 }, { cents: -c / 2, gain: 0.58 });
}
// Корпус: у виуэлы он меньше и мельче гитарного — резонансы выше
const body = STRINGS === 'guitar' ? [105, 215] : [125, 250];
biquad(strings, { type: 'highpass', f: 70 });
biquad(strings, { type: 'peak', f: body[0], q: 1.4, gain: 4 });
biquad(strings, { type: 'peak', f: body[1], q: 1.2, gain: 2.5 });
biquad(strings, { type: 'peak', f: 2600, q: 0.7, gain: -5 });
biquad(strings, { type: 'lowpass', f: LOWPASS });

// Пандеро (рамочный бубен с бубенцами)
const perc = new Float32Array(total);
for (const { t, kind, vel } of hits) {
  const { data, gain } = frameDrum(kind, prnd);
  mixIn(perc, data, Math.round(t * SR), vel * gain);
}

// Дудочка: почти чистый тон с лёгкими гармониками, дыхание, атака языком, вибрато на долгих нотах
const pipe = new Float32Array(total);
function blow({ t, midi, dur, vel }) {
  const f = hz(midi), start = Math.round(t * SR), len = Math.round((dur + 0.12) * SR);
  const breath = biquad(noise(len, rnd), { type: 'bandpass', f: Math.min(6000, f * 2), q: 1.5 });
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    const vib = s > 0.35 ? 1 + 0.006 * Math.min(1, (s - 0.35) / 0.3) * Math.sin(2 * Math.PI * 5.2 * s) : 1;
    phase += (2 * Math.PI * f * vib) / SR;
    const env = Math.min(1, s / 0.045) * (s < dur ? 1 : Math.max(0, 1 - (s - dur) / 0.1));
    const tongue = Math.exp(-s / 0.015);
    out[i] = env * (Math.sin(phase) + 0.28 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase) + 0.04 * Math.sin(4 * phase))
      + breath[i] * (0.07 * env + 0.4 * tongue);
  }
  mixIn(pipe, out, start, vel * 0.16);
}
for (const n of tune) blow(n);
biquad(pipe, { type: 'lowpass', f: 5000 });

// Сведение: дудочка чуть тише струн, бубен — фоном (≈ −9 дБ к струнам)
const PERC_GAIN = 0.4;
const dry = new Float32Array(total);
for (let i = 0; i < total; i++) dry[i] = strings[i] + perc[i] * PERC_GAIN + pipe[i];

// Хвост после конца петли ложится на её начало: звенящие струны продолжаются по кругу
const loopLen = Math.round(LOOP * SR);
const loop = dry.slice(0, loopLen);
for (let i = loopLen; i < total; i++) loop[i - loopLen] += dry[i];

// Зал тоже по кругу, чтобы на стыке хвост был уже установившимся
const wetL = freeverb(loop, 0, { circular: true }), wetR = freeverb(loop, 23, { circular: true });
const WET = 0.55;
// Поля под петлю WorldAudio: [конец круга | круг | начало круга]
const pre = Math.round(PRE * SR), post = Math.round(POST * SR);
const frames = pre + loopLen + post;
const left = new Float32Array(frames), right = new Float32Array(frames);
for (let i = 0; i < frames; i++) {
  const j = (i - pre + loopLen) % loopLen;
  left[i] = loop[j] + WET * wetL[j];
  right[i] = loop[j] + WET * wetR[j];
}
const { lufs, gain, peak, duration } = encode(left, right, OUT, TARGET_LUFS);

if (!args.includes('--out')) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const band = [STRINGS === 'guitar' ? 'nylon guitar' : 'vihuela', PANDERO && 'pandero', PIPE && 'pipe'].filter(Boolean).join(', ');
  manifest[ID] = {
    file: `amb/${ID}.mp3`, kind: 'amb', duration,
    title: `La Folía, ${band} (synthesized)`, author: 'команда «Открытие 1492»',
    url: '../scripts/compose-feast.mjs', license: 'своя (синтез)',
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
}
const parts = [`струны ${levelDb(strings)}`, PANDERO && `пандеро ${levelDb(perc, PERC_GAIN)}`, PIPE && `дудочка ${levelDb(pipe)}`].filter(Boolean);
console.log(`${OUT.split('/').pop()}: ${notes.length} нот, ${hits.length} ударов, ${tune.length} нот дудочки; ${lufs.toFixed(1)} → ${(lufs + gain).toFixed(1)} LUFS, пик ${peak.toFixed(1)} dBFS; партии (дБ, где звучат): ${parts.join(', ')}`);
