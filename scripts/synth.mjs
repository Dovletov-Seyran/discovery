// Общий инструментарий синтеза музыки (compose-feast.mjs): шум, фильтры, зал, бубен, сборка MP3.
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

export const SR = 44100;

// Детерминированный шум: одинаковый файл при каждом запуске
export const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
export const gaussOf = (r) => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const noise = (len, r) => Float32Array.from({ length: len }, () => r() * 2 - 1);

export function mixIn(target, data, start, gain) {
  for (let i = 0; i < data.length && start + i < target.length; i++) if (start + i >= 0) target[start + i] += data[i] * gain;
}

// Фильтр второго порядка (RBJ)
export function biquad(data, { type, f, q = 0.707, gain = 0 }) {
  const w = (2 * Math.PI * f) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), A = 10 ** (gain / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') { b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; }
  else if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }   // highpass
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[i] = y;
  }
  return data;
}

// Freeverb. circular — два прохода по кругу: для петли хвост зала на стыке уже установившийся
export function freeverb(input, spread, { circular = false, feedback = 0.84, damp = 0.35 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ buf: new Float32Array(d + spread), i: 0, store: 0 }));
  const aps = [556, 441, 341, 225].map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
  const out = new Float32Array(input.length);
  const passes = circular ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * feedback;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of aps) {
        const o = a.buf[a.i];
        a.buf[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = o - y;
      }
      if (pass === passes - 1) out[n] = y;
    }
  }
  return out;
}

// Рамочный бубен: низкий удар ладонью в центр (dum), щелчок пальцами у обода (tak), бубенцы (jingle)
export function frameDrum(kind, r) {
  if (kind === 'dum') {
    const len = Math.round(0.6 * SR), out = new Float32Array(len);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const s = i / SR, f = 82 + 70 * Math.exp(-s / 0.035);   // натяжение кожи: тон проседает после удара
      phase += (2 * Math.PI * f) / SR;
      out[i] = Math.sin(phase) * Math.exp(-s / 0.17);
    }
    const thump = biquad(noise(Math.round(0.05 * SR), r), { type: 'lowpass', f: 450 });
    thump.forEach((v, i) => { out[i] += v * 0.5 * Math.exp(-i / SR / 0.012); });
    return { data: out, gain: 0.9 };
  }
  if (kind === 'tak') {
    const len = Math.round(0.2 * SR);
    const out = biquad(noise(len, r), { type: 'bandpass', f: 1700, q: 1.2 });
    for (let i = 0; i < len; i++) out[i] = out[i] * 2.2 * Math.exp(-i / SR / 0.03) + Math.sin((2 * Math.PI * 320 * i) / SR) * 0.35 * Math.exp(-i / SR / 0.05);
    return { data: out, gain: 0.7 };
  }
  // Бубенцы: несколько металлических тарелочек звенят негармонично, дребезг — серия микроударов
  const len = Math.round(0.35 * SR), out = new Float32Array(len);
  for (let k = 0; k < 4; k++) {
    const offset = Math.round((k * 0.009 + r() * 0.006) * SR), amp = k ? 0.55 : 1;
    const partials = [5200, 6300, 7400, 8600].map((f) => f * (0.97 + r() * 0.06));
    const shimmer = biquad(noise(len, r), { type: 'bandpass', f: 7000, q: 0.8 });
    for (let i = offset; i < len; i++) {
      const s = (i - offset) / SR;
      let v = shimmer[i] * 0.6 * Math.exp(-s / 0.05);
      for (const f of partials) v += Math.sin(2 * Math.PI * f * s) * 0.12 * Math.exp(-s / 0.11);
      out[i] += v * amp;
    }
  }
  return { data: out, gain: 0.32 };
}

// Стерео → MP3 с постоянным усилением до targetLufs (loudnorm в динамическом режиме сломал бы стык петли
// и задуманную динамику), пик не выше −1.5 dBFS. Возвращает замеры.
export function encode(left, right, out, targetLufs) {
  const frames = left.length;
  const pcm = Buffer.alloc(frames * 8);
  for (let i = 0; i < frames; i++) { pcm.writeFloatLE(left[i], i * 8); pcm.writeFloatLE(right[i], i * 8 + 4); }
  const raw = join(tmpdir(), `synth-${process.pid}.f32`);
  writeFileSync(raw, pcm);
  const input = ['-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', raw];
  const measured = spawnSync('ffmpeg', ['-hide_banner', ...input, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
  const summary = measured.slice(measured.lastIndexOf('Summary:'));
  const lufs = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)[1]);
  const truePeak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]);
  const gain = Math.min(targetLufs - lufs, -1.5 - truePeak);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'libmp3lame', '-b:a', '128k', out]);
  unlinkSync(raw);
  return { lufs, gain, peak: truePeak + gain, duration: Math.round((frames / SR) * 100) / 100 };
}

// Средний уровень партии там, где она звучит (дБ) — проверить баланс, не слушая
export const levelDb = (data, gain = 1) => {
  let e = 0, k = 0;
  for (const v of data) if (v) { e += (v * gain) ** 2; k++; }
  return k ? (10 * Math.log10(e / k)).toFixed(1) : '—';
};
