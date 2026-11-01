// Звуки мира (Бэк 2): фоны по сценам и эффекты по событиям игры, Web Audio.
// Файлы — client/public/audio/{amb,sfx}, список и длительности — /audio/sounds-manifest.json
// (скачивает scripts/fetch-sounds.mjs, авторы — docs/credits-audio.md).
import {SONGS} from '../../../shared/npc-performance.js';
// Голоса NPC и рассказчика сюда не входят: их играет Фронт 2, фон под них приглушается.

// Громкость слоёв фона по сценам (0..1). Сцены, которых нет, — тишина.
const SCENE_AMBIENCE = {
  intro: { amb_intro_lute: 0.3 },
  ship_day: { amb_sea_ship: 0.5, amb_ship_creak: 0.3, amb_wind_sails: 0.28, amb_gulls: 0.16 },
  cut_canary: { amb_sea_ship: 0.45, amb_gulls: 0.3 },
  canary: { amb_shore: 0.4, amb_island_birds: 0.3, amb_market: 0.2, amb_harbour: 0.22, amb_gulls: 0.14 },
  cut_evening: { amb_sea_ship: 0.45, amb_wind_sails: 0.3 },
  // Праздник: «Ла Фолия» на виуэле с бубном (scripts/compose-feast.mjs), гул команды — тише, чтобы вечер был спокойным
  ship_evening: { amb_sea_ship: 0.28, amb_feast_folia: 0.5, amb_tavern_crowd: 0.16, amb_ship_creak: 0.15 },
  cut_night: { amb_night_calm: 0.4, amb_night_drone: 0.25 },
  night_story: { amb_night_calm: 0.32, amb_night_drone: 0.28, amb_ship_creak: 0.1 },
};

// Звук по сюжету сцены: не зациклен, идёт от startAt сцены вместе с рассказом
const SCENE_MUSIC = {};

// Разовые звуки при входе в сцену: [id, задержка с, громкость]
const SCENE_CUES = {
  ship_day: [['sfx_ship_bell', 1.5, 0.45]],
  cut_canary: [['sfx_anchor_chain', 14, 0.6]],
  cut_evening: [['sfx_sail_flap', 2, 0.6], ['sfx_sail_flap', 3.2, 0.5]],
  sleep: [['sfx_heartbeat', 0.5, 0.8], ['sfx_heartbeat', 4.2, 0.6]],
};

// Готовые реплики сервера (npc_say.line), под которые нужен звук мира
const LINE_CUES = {
  rudder_alarm: [['sfx_cannon_far', 0, 0.8], ['sfx_ship_bell', 1.2, 0.5]],
  carpenter_done: [['sfx_hammer_wood', 0, 0.7]],
  feast_toast_1: [['sfx_cup_clink', 0, 0.7]],
  feast_toast_2: [['sfx_cup_clink', 0, 0.7]],
  feast_dance: [['sfx_clapping', 0, 0.6], ['sfx_clapping', 0.5, 0.6]],
  feast_cards_win: [['sfx_cards_shuffle', 0, 0.7]],
  feast_cards_lose: [['sfx_cards_shuffle', 0, 0.7]],
  scare_laugh_1: [['sfx_sailors_laugh', 0, 0.7]],
  scare_laugh_2: [['sfx_sailors_laugh', 0, 0.7]],
  boat_wait: [['sfx_rowing', 0, 0.5]],
};

const FADE = 2;          // с, смена фона
const DUCK = 0.45;       // фон под голосом
const PROVISIONS = new Set(['cheese', 'meat', 'biscuit']);

export class WorldAudio {
  constructor(events, { manifestUrl = '/audio/sounds-manifest.json', volume = 0.8 } = {}) {
    this.manifestUrl = manifestUrl;
    this.volume = volume;
    this.buffers = new Map();   // id → Promise<AudioBuffer>
    this.layers = new Map();    // id → { src, gain }
    this.timers = new Set();
    this.inventory = null;
    this.doneQuests = new Set();
    this.hourglass = new Map(); // id → emptyAt

    const unlock = () => this.ctx?.resume?.();
    events.on('audio_unlock', unlock);
    for (const type of ['pointerdown', 'keydown']) addEventListener(type, unlock, { passive: true });

    this.quietUntil = 0;
    events.on('auth_ok', () => { this.quietUntil = Date.now() + 2500; this.inventory = null; this.hourglass.clear(); });
    events.on('scene', (scene) => this.onScene(scene));
    events.on('narrative_event', (event) => this.onNarrative(event));
    events.on('voice', ({ playing }) => this.duck(playing));
    events.on('inventory', (message) => this.onInventory(message.items ?? []));
    events.on('quest', (message) => this.onQuest(message));
    events.on('npc_say', (message) => this.cues(LINE_CUES[message.line]));
    events.on('entity', (message) => this.onEntity(message));
    events.on('chunk',message=>{for(const npc of message.data?.npcs??[])if(npc.id==='musician'&&npc.state&&'performance' in npc.state)this.onPerformance(npc.state.performance);});
    events.on('scared', () => this.play('sfx_scream', { volume: 1 }));
    // бой на Гуанахани: глухой удар на каждое попадание, крик — когда деревня поднимает тревогу
    events.on('hit', (m) => this.play('sfx_hull_thud', { volume: m.kind === 'player' ? 1 : 0.6 }));
    events.on('world_event', (m) => { if (m.type === 'alarm') this.play('sfx_scream', { volume: 0.55 }); });
    events.on('logout', () => { clearTimeout(this.performanceEnd);this.performanceKey=null;this.setAmbience({}); this.setMusic(null); this.inventory = null; this.doneQuests.clear(); });
  }

  // Контекст создаётся при первом звуке; браузер запустит его после клика (audio_unlock)
  context() {
    if (this.ctx) return this.ctx;
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    return ctx;
  }

  manifest() {
    this.manifestPromise ??= fetch(this.manifestUrl).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return this.manifestPromise;
  }

  buffer(id) {
    if (!this.buffers.has(id)) {
      this.buffers.set(id, this.manifest().then(async (m) => {
        if (!m[id]) return null;
        const data = await (await fetch(`/audio/${m[id].file}`)).arrayBuffer();
        return this.context().decodeAudioData(data);
      }).catch(() => null));
    }
    return this.buffers.get(id);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  duck(on) {
    if (!this.ambBus) return;
    this.ambBus.gain.setTargetAtTime(on ? DUCK : 1, this.ctx.currentTime, 0.25);
  }

  onScene(scene) {
    clearTimeout(this.performanceEnd);
    this.scene=scene;this.performanceKey=null;
    if(Number.isFinite(scene.progress?.serverNow))this.clockOffset=scene.progress.serverNow-Date.now();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.setAmbience(SCENE_AMBIENCE[scene.id] ?? {});
    this.setMusic(SCENE_MUSIC[scene.id] ?? null, scene.startAt);
    this.cues(SCENE_CUES[scene.id]);
  }

  // Музыка сцены с её начала: вошедший посреди сцены слышит то же место, что и остальные
  async setMusic(music, startAt) {
    const ctx = this.context();
    if (this.music && this.music.id === music?.id && this.music.startAt===startAt) return;
    if (this.music) {
      const { src, gain } = this.music;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 3);
      src?.stop(ctx.currentTime + FADE + 0.1);
      this.music = null;
    }
    if (!music) return;
    const current = (this.music = { id: music.id,startAt, gain: ctx.createGain(), src: null });
    const buffer = await this.buffer(music.id);
    if (this.music !== current || !buffer) return;
    const offset = (Date.now()+(this.clockOffset??0) - (startAt ?? Date.now())) / 1000;
    const duration=Math.min(buffer.duration,music.duration??buffer.duration);
    if (offset >= duration) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // С середины — коротко вводим громкость, с начала — сразу (там тишина и тихий вход)
    current.gain.gain.setValueAtTime(offset > 0.5 ? 0 : music.volume, ctx.currentTime);
    if (offset > 0.5) current.gain.gain.linearRampToValueAtTime(music.volume, ctx.currentTime + 1);
    src.connect(current.gain).connect(this.ambBus);
    if (offset < 0) src.start(ctx.currentTime - offset);
    else src.start(ctx.currentTime, offset);
    if(music.duration){const end=ctx.currentTime+duration-offset;current.gain.gain.setValueAtTime(music.volume,Math.max(ctx.currentTime,end-1.5));current.gain.gain.linearRampToValueAtTime(0,end);src.stop(end+.02);}
    current.src = src;
  }

  onPerformance(performance){
    const scene=this.scene,key=scene&&`${scene.id}@${scene.startAt}`,song=SONGS[performance?.song];
    const now=Date.now()+(this.clockOffset??0);
    const valid=song&&performance.scene===key&&performance.until>now;
    const id=valid?`${performance.scene}:${performance.startAt}:${performance.song}`:null;
    if(id===this.performanceKey)return;
    this.performanceKey=id;
    this.setMusic(valid?{id:song.track,volume:.72,duration:(performance.until-performance.startAt)/1000}:null,performance?.startAt);
    // While Gil performs, avoid a second copy of the feast accompaniment underneath him.
    const ambience={...(SCENE_AMBIENCE[scene?.id]??{})};if(valid)delete ambience.amb_feast_folia;
    this.setAmbience(ambience);
    clearTimeout(this.performanceEnd);
    if(valid)this.performanceEnd=setTimeout(()=>{this.performanceKey=null;this.setMusic(null);this.setAmbience(SCENE_AMBIENCE[this.scene?.id]??{});},performance.until-now+30);
  }

  // Фон: новые слои плавно входят, лишние уходят, общие меняют громкость
  async setAmbience(target) {
    const ctx = this.context();
    const now = ctx.currentTime;
    for (const [id, layer] of this.layers) {
      if (id in target) continue;
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(0, now + FADE);
      layer.src.stop(now + FADE + 0.1);
      this.layers.delete(id);
    }
    for (const [id, volume] of Object.entries(target)) {
      const existing = this.layers.get(id);
      if (existing) { existing.gain.gain.setTargetAtTime(volume, now, FADE / 3); continue; }
      const placeholder = { src: { stop() {} }, gain: ctx.createGain() };
      this.layers.set(id, placeholder); // пока грузится — чтобы не запустить слой дважды
      const buffer = await this.buffer(id);
      if (this.layers.get(id) !== placeholder || !buffer) { if (this.layers.get(id) === placeholder) this.layers.delete(id); continue; }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      // у файлов затухание на краях (fetch-sounds): зацикливаем середину, без провала громкости
      if (buffer.duration > 8) { src.loopStart = 1.6; src.loopEnd = buffer.duration - 2.1; }
      const gain = placeholder.gain;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + FADE);
      src.connect(gain).connect(this.ambBus);
      const offset = src.loopEnd > src.loopStart ? src.loopStart + Math.random() * (src.loopEnd - src.loopStart) : 0;
      src.start(ctx.currentTime, offset);
      placeholder.src = src;
    }
  }

  // Разовый звук. pos: [x,y,z] — слева/справа от слушателя, 'under' — глухо снизу, 'behind' — сзади
  async play(id, { volume = 0.8, pos = null, maxSeconds = 12 } = {}) {
    const buffer = await this.buffer(id);
    if (!buffer) return;
    const ctx = this.context();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    let node = src;
    if (pos === 'under') {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 500;
      node = node.connect(lowpass);
      gain.gain.value = volume * 1.3;
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = Array.isArray(pos) ? Math.max(-0.8, Math.min(0.8, pos[0] / 20)) : pos === 'behind' ? (Math.random() < 0.5 ? -0.35 : 0.35) : 0;
    node.connect(gain).connect(pan).connect(this.sfxBus);
    const now = ctx.currentTime;
    src.start(now);
    // длинные файлы (фон в роли эффекта, например гавань в интро) — затухание и стоп
    if (buffer.duration > maxSeconds) {
      gain.gain.setValueAtTime(volume, now + maxSeconds - 1.5);
      gain.gain.linearRampToValueAtTime(0, now + maxSeconds);
      src.stop(now + maxSeconds + 0.05);
    }
  }

  cues(list) {
    for (const [id, delay, volume] of list ?? []) {
      const timer = setTimeout(() => { this.timers.delete(timer); this.play(id, { volume }); }, delay * 1000);
      this.timers.add(timer);
    }
  }

  // Ночная история и интро (content/night_story.json, intro.json): { type:'sfx', id, pos }
  onNarrative(event) {
    if (event.type !== 'sfx' || !event.id) return;
    this.play(event.id, { volume: 0.85, pos: event.pos ?? null });
  }

  // Звуки по изменению инвентаря: подобрал, набрал воды, купил, отдал доски и смолу плотнику
  onInventory(items) {
    const ids = items.map((item) => (typeof item === 'string' ? item : item.id));
    const before = this.inventory;
    this.inventory = new Set(ids);
    if (!before) return; // первое состояние после входа — без звуков
    const added = ids.filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !this.inventory.has(id));
    if (added.includes('barrel_full')) this.play('sfx_well_bucket', { volume: 0.7 });
    else if (added.some((id) => PROVISIONS.has(id))) this.play('sfx_coins', { volume: 0.8 });
    else if (added.includes('wine')) this.play('sfx_pour_wine', { volume: 0.6 });
    else if (added.length) this.play('sfx_pickup', { volume: 0.6 });
    if (removed.includes('planks') && removed.includes('tar')) this.play('sfx_hammer_wood', { volume: 0.7 });
  }

  // Колокол на выполненное задание. После входа сервер заново присылает уже выполненные — их молча запоминаем
  onQuest(message) {
    if (message.status !== 'done' || this.doneQuests.has(message.id)) return;
    this.doneQuests.add(message.id);
    if (Date.now() > this.quietUntil) this.play('sfx_ship_bell', { volume: 0.35 });
  }

  // Песочные часы перевёрнуты: сервер сдвинул emptyAt вперёд
  onEntity({ id, state, serverNow }) {
    if(Number.isFinite(serverNow))this.clockOffset=serverNow-Date.now();
    if(id==='musician'&&state&&'performance' in state)this.onPerformance(state.performance);
    if (!state?.emptyAt) return;
    const prev = this.hourglass.get(id);
    this.hourglass.set(id, state.emptyAt);
    if (prev && state.emptyAt > prev + 1000) this.play('sfx_hourglass', { volume: 0.7 });
  }
}
