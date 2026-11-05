// Звуки боя (docs/tz-combat.md), синтез Web Audio — без файлов: свист замаха, стук дерева о дерево, звон
// стали, глухой удар по телу, тетива и свист стрелы, выстрел эспингарды (вспышка на полке — и грохот с эхом),
// шомпол, барабан отсчёта и победы. play(kind, { gain, pan }) — громкость и сторона считает WorldAudio по
// расстоянию до слушателя.
export class CombatSounds {
  // ctx() — AudioContext, out() — шина эффектов (громкость из настроек)
  constructor(ctx, out) { this.ctx = ctx; this.out = out; }

  noise() {
    const ctx = this.ctx();
    if (!this.noiseBuffer) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = b;
    }
    return this.noiseBuffer;
  }

  // Узел выхода звука: громкость и панорама, сам отключается
  bus(gain = 1, pan = 0, life = 2) {
    const ctx = this.ctx(), g = ctx.createGain(), p = ctx.createStereoPanner();
    g.gain.value = gain; p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.out());
    setTimeout(() => { g.disconnect(); p.disconnect(); }, life * 1000 + 200);
    return g;
  }

  // шум через фильтр с огибающей: { type, f, f1, q, attack, decay, level, at }
  burst(to, { type = 'bandpass', f = 1000, f1 = f, q = 1, attack = 0.005, decay = 0.2, level = 1, at = 0, rate = 1 } = {}) {
    const ctx = this.ctx(), t = ctx.currentTime + at, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise(); src.playbackRate.value = rate; src.loop = true;
    flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(flt).connect(g).connect(to);
    src.start(t, Math.random()); src.stop(t + attack + decay + 0.05);
  }

  // тон с падением высоты: { type, f, f1, attack, decay, level, at }
  tone(to, { type = 'sine', f = 200, f1 = f, attack = 0.003, decay = 0.2, level = 1, at = 0 } = {}) {
    const ctx = this.ctx(), t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(to); o.start(t); o.stop(t + attack + decay + 0.05);
  }

  play(kind, { gain = 1, pan = 0 } = {}) {
    const ctx = this.ctx?.();
    if (!ctx || ctx.state !== 'running' || gain < 0.02) return false;
    const fn = SOUNDS[kind];
    if (!fn) return false;
    fn(this, this.bus(gain, pan, 3));
    return true;
  }
}

const SOUNDS = {
  // свист замаха: макана тяжелее и ниже, меч тоньше, копьё — короткий выпад
  swing: (s, o) => s.burst(o, { f: 380, f1: 1500, q: 1.6, attack: 0.09, decay: 0.2, level: 0.55 }),
  swing_sword: (s, o) => s.burst(o, { f: 900, f1: 3200, q: 2.2, attack: 0.07, decay: 0.18, level: 0.45 }),
  thrust: (s, o) => s.burst(o, { f: 600, f1: 2200, q: 1.8, attack: 0.04, decay: 0.13, level: 0.5 }),
  // отбил: дерево о дерево — сухой стук с призвуком
  block_wood: (s, o) => {
    s.burst(o, { f: 1700, q: 7, attack: 0.002, decay: 0.06, level: 0.9 });
    s.tone(o, { type: 'triangle', f: 560, f1: 470, decay: 0.11, level: 0.55 });
    s.tone(o, { type: 'sine', f: 1180, f1: 1020, decay: 0.07, level: 0.25 });
  },
  // отбил мечом: звон стали — негармоничные обертоны
  block_steel: (s, o) => {
    s.burst(o, { type: 'highpass', f: 3000, attack: 0.001, decay: 0.03, level: 0.6 });
    for (const [f, d, l] of [[1460, 0.55, 0.22], [2380, 0.42, 0.16], [3910, 0.3, 0.11], [5170, 0.22, 0.07]]) s.tone(o, { f, f1: f * 0.995, decay: d, level: l });
    s.tone(o, { type: 'triangle', f: 520, f1: 470, decay: 0.08, level: 0.35 });
  },
  // попал по телу: глухой удар
  body: (s, o) => {
    s.tone(o, { f: 150, f1: 52, decay: 0.2, level: 1 });
    s.burst(o, { type: 'lowpass', f: 900, f1: 300, attack: 0.002, decay: 0.08, level: 0.7 });
  },
  // по мне попали — тяжелее, с треском
  hurt: (s, o) => {
    s.tone(o, { f: 120, f1: 40, decay: 0.28, level: 1 });
    s.burst(o, { type: 'lowpass', f: 1400, f1: 250, attack: 0.002, decay: 0.12, level: 0.9 });
    s.burst(o, { f: 2400, q: 3, attack: 0.001, decay: 0.03, level: 0.3 });
  },
  // тетива: щелчок и гудящая струна; стрела уходит со свистом
  bow: (s, o) => {
    s.burst(o, { f: 2600, q: 4, attack: 0.001, decay: 0.025, level: 0.5 });
    s.tone(o, { type: 'triangle', f: 132, f1: 104, decay: 0.32, level: 0.6 });
    s.tone(o, { type: 'sine', f: 264, f1: 210, decay: 0.18, level: 0.25 });
    s.burst(o, { f: 2200, f1: 4200, q: 3, attack: 0.03, decay: 0.22, level: 0.3, at: 0.02 });
  },
  // тупая стрела попала / увернулся — свист мимо
  arrow_hit: (s, o) => { s.burst(o, { f: 650, q: 3, attack: 0.002, decay: 0.07, level: 0.8 }); s.tone(o, { f: 210, f1: 120, decay: 0.1, level: 0.6 }); },
  dodge: (s, o) => s.burst(o, { f: 1800, f1: 600, q: 2, attack: 0.04, decay: 0.2, level: 0.35 }),
  // фитиль: тихое шипение, пока целится
  match: (s, o) => s.burst(o, { type: 'highpass', f: 4500, attack: 0.05, decay: 0.45, level: 0.12 }),
  // выстрел: вспышка пороха на полке — и через миг грохот; потом эхо от леса
  gunshot: (s, o) => {
    s.burst(o, { type: 'highpass', f: 2600, attack: 0.005, decay: 0.09, level: 0.35 });
    s.burst(o, { type: 'lowpass', f: 4200, f1: 380, attack: 0.002, decay: 0.75, level: 1, at: 0.07 });
    s.tone(o, { f: 85, f1: 34, decay: 0.32, level: 1, at: 0.07 });
    s.burst(o, { type: 'lowpass', f: 900, f1: 200, attack: 0.04, decay: 1.4, level: 0.35, at: 0.3 });
    s.burst(o, { type: 'lowpass', f: 700, f1: 180, attack: 0.05, decay: 1.1, level: 0.18, at: 0.75 });
  },
  // шомпол: звякает о ствол
  ramrod: (s, o) => { for (const at of [0, 0.32, 0.6]) s.tone(o, { f: 2900, f1: 2800, decay: 0.09, level: 0.12, at }); },
  // метнул копьё: долгий свист; упало — глухо воткнулось в песок
  spear_throw: (s, o) => s.burst(o, { f: 500, f1: 1900, q: 1.4, attack: 0.12, decay: 0.35, level: 0.6 }),
  spear_land: (s, o) => { s.tone(o, { f: 180, f1: 90, decay: 0.12, level: 0.7 }); s.burst(o, { type: 'lowpass', f: 1200, f1: 300, attack: 0.002, decay: 0.09, level: 0.6 }); },
  // зрители: гул одобрения (несколько полос шума нарастают и спадают) и «ох!» — ниже и короче
  cheer: (s, o) => {
    for (const [f, l, at] of [[520, 0.5, 0], [900, 0.45, 0.04], [1500, 0.3, 0.08], [2400, 0.15, 0.06]]) s.burst(o, { f, f1: f * 1.15, q: 0.9, attack: 0.18, decay: 1.2, level: l, at });
    for (const at of [0.1, 0.22, 0.31]) s.burst(o, { f: 1700 + at * 900, q: 5, attack: 0.03, decay: 0.12, level: 0.18, at }); // отдельные выкрики
  },
  ooh: (s, o) => { for (const [f, l] of [[330, 0.45], [520, 0.3]]) s.burst(o, { f, f1: f * 0.8, q: 2.5, attack: 0.12, decay: 0.55, level: l }); },
  // барабан-маяуакан: отсчёт и начало боя
  drum: (s, o) => { s.tone(o, { f: 120, f1: 68, decay: 0.32, level: 0.9 }); s.burst(o, { type: 'lowpass', f: 700, attack: 0.002, decay: 0.05, level: 0.4 }); },
  drum_go: (s, o) => { for (const at of [0, 0.14]) { s.tone(o, { f: 150, f1: 80, decay: 0.3, level: 0.9, at }); s.burst(o, { type: 'lowpass', f: 900, attack: 0.002, decay: 0.05, level: 0.4, at }); } },
  win: (s, o) => { for (const [at, f] of [[0, 120], [0.18, 120], [0.36, 165]]) s.tone(o, { f, f1: f * 0.6, decay: 0.38, level: 0.85, at }); },
  lose: (s, o) => { s.tone(o, { f: 95, f1: 45, decay: 0.7, level: 0.85 }); },
};
export const COMBAT_SOUNDS = Object.keys(SOUNDS);
