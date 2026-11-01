// npm run smoke — проверка сервера тремя ботами. Сервер должен быть запущен с DEV=1.
// Внимание: делает /reset — сбрасывает прогресс всех игроков на этом сервере.
// SERVER=http://localhost:3000 по умолчанию; SERVER=https://localhost:3000 — сервер с HTTPS=1.
import WebSocket from 'ws';
import {CONFIG} from '../../shared/config.js';
import { resolveLayout } from '../world/terrain.js';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Координаты объектов корабля — из раскладки Фронта 1, чтобы тест не ломался при перестановке
const LAYOUT = JSON.parse(readFileSync(new URL('../../content/ship_layout.json', import.meta.url), 'utf8'));
const at = (id) => { const o = [...LAYOUT.interact,...LAYOUT.npcs].find((x) => x.id === id); return [o.p[0], o.p[2]]; };
// Остров — с координатами, которые считает генератор.
const ISLE = resolveLayout(JSON.parse(readFileSync(new URL('../../content/canary_layout.json', import.meta.url), 'utf8'))).layout;
const isle = (id) => { const o = [...ISLE.interact, ...ISLE.npcs].find((x) => x.id === id); return [o.p[0], o.p[2]]; };


const BASE = process.env.SERVER || 'http://localhost:3000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

// По https сертификат проверяется по-настоящему: доверяем нашему CA. Node читает NODE_EXTRA_CA_CERTS
// только при старте процесса, поэтому перезапускаем себя с ним.
if (BASE.startsWith('https') && !process.env.NODE_EXTRA_CA_CERTS) {
  const ca = fileURLToPath(new URL('../../data/certs/ca.crt', import.meta.url));
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_EXTRA_CA_CERTS: ca } });
  process.exit(r.status ?? 1);
}
const suffix = Math.random().toString(36).slice(2, 7);

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Ответ NPC на LLM: с заглушками мгновенно, с настоящим ИИ 4–7 с → AI_WAIT_MS=20000 npm run smoke
const AI_MS = Number(process.env.AI_WAIT_MS) || 3000;

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.closeCode = null; }
  open() {
    this.ws = new WebSocket(WS_URL);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d);
      this.msgs.push(m);
      if (m.t === 'scene' && (m.spawn || m.seat)) this.pos = m.spawn || m.seat;
      if (m.t === 'pos_correct') { this.pos = m.p; this.corrections = (this.corrections ?? 0) + 1; } // как обязан делать клиент
    });
    this.ws.on('close', (code) => { this.closeCode = code; });
    return new Promise((r) => this.ws.on('open', r));
  }
  waitClosed(ms=3000){
    if(this.closeCode!==null)return Promise.resolve(this.closeCode);
    return new Promise(resolve=>{
      const onClose=code=>{clearTimeout(timer);resolve(code);};
      const timer=setTimeout(()=>{this.ws.off('close',onClose);resolve(null);},ms);
      this.ws.once('close',onClose);
    });
  }
  send(t, payload = {}) { this.ws.send(JSON.stringify({ t, ...payload })); }
  last(t) { return this.msgs.findLast((m) => m.t === t); }
  // Ждать НОВОЕ сообщение — пришедшее после отметки mark (длина буфера до отправки), а не старое из буфера
  async waitNew(mark, t, pred = () => true, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const m = this.msgs.slice(mark).find((x) => x.t === t && pred(x));
      if (m) return m;
      await sleep(20);
    }
    return null;
  }
  async wait(t, pred = () => true, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const m = this.msgs.find((x) => x.t === t && pred(x));
      if (m) return m;
      await sleep(20);
    }
    return null;
  }
  clear() { this.msgs = []; }
  // Идти с реальной скоростью клиента (≈6 м/с), применяя pos_correct.
  async walkTo(x, z) {
    for (;;) {
      const dx = x - this.pos[0], dz = z - this.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < 0.5) return;
      const k = Math.min(0.4, d) / d;
      this.pos = [this.pos[0] + dx * k, this.pos[1], this.pos[2] + dz * k];
      this.send('move', { p: this.pos, r: 0, a: 'run' });
      await sleep(67);
    }
  }
  quest(id) { return this.last('quest') && this.msgs.findLast((m) => m.t === 'quest' && m.id === id); }
}

// --- HTTP ---
const health = await api('/api/health');
check(health.status === 200 && health.body.ok, `health: ${JSON.stringify(health.body)}`);
check(health.body.dev, 'сервер запущен с DEV=1');

const names = ['grum', 'pilo', 'leng'].map((n) => `${n}_${suffix}`);
const tokens = [];
for (const login of names) {
  const r = await api('/api/register', { login, password: 'test1234' });
  check(r.status === 200 && r.body.token, `register ${login}`);
  tokens.push(r.body.token);
}
check((await api('/api/register', { login: names[0], password: 'xxxx' })).status === 409, 'повторная регистрация → 409');
check((await api('/api/register', { login: 'ab', password: 'xxxx' })).status === 400, 'короткий логин → 400');
check((await api('/api/login', { login: names[0], password: 'wrong' })).status === 401, 'неверный пароль → 401');
const relogin = await api('/api/login', { login: names[0].toUpperCase(), password: 'test1234' });
check(relogin.status === 200 && relogin.body.token !== tokens[0], 'повторный вход → новый токен (логин без учёта регистра)');

// --- WS без авторизации ---
const anon = new Bot('anon');
await anon.open();
anon.send('move', { p: [0, 0, 0] });
check(!!(await anon.wait('auth_fail')), 'сообщение до auth → auth_fail');
await anon.waitClosed();
check(anon.closeCode === 4001, `закрыто с 4001 (${anon.closeCode})`);

const silent = new Bot('silent');
await silent.open();
check(!!(await silent.wait('auth_fail', (m) => m.reason === 'timeout', 4000)), 'нет auth за 3 с → timeout');

const badTok = new Bot('bad');
await badTok.open();
badTok.send('auth', { token: 'nope' });
check(!!(await badTok.wait('auth_fail', (m) => m.reason === 'bad_token')), 'неверный токен → auth_fail');

// --- Три игрока ---
const bots = names.map((n) => new Bot(n));
for (const [i, b] of bots.entries()) {
  await b.open();
  b.send('auth', { token: tokens[i] });
  const ok = await b.wait('auth_ok');
  check(!!ok && ok.you.name === names[i] && ok.world && ok.scene, `${b.name}: auth_ok`);
  b.id = ok?.you.id;
}
const [g, p, l] = bots;
g.send('chat', { text: '/reset' }); // убрать отключённых с прошлого прогона, сцена → lobby
await g.wait('scene', (m) => m.id === 'lobby');

g.send('interact', { id: 'role:grumete' });
p.send('interact', { id: 'role:piloto' });
await sleep(200);
l.send('interact', { id: 'role:piloto' });
check(!!(await l.wait('notice', (m) => m.text.includes('занята'))), 'занятая роль → notice');
l.send('interact', { id: 'role:lengua' });
const lobby = await g.wait('lobby', (m) => m.players.filter((x) => x.role).length === 3);
check(!!lobby, 'лобби: у всех роли');

for (const b of bots) b.clear();
for (const b of bots) b.send('ready', { value: true });
const intro = await g.wait('scene', (m) => m.id === 'intro');
check(!!intro && intro.startAt > Date.now() - 2000, `все готовы → intro (startAt ${intro?.startAt})`);

for (const b of bots) b.send('skip_vote');
const day = await g.wait('scene', (m) => m.id === 'ship_day', 4000);
check(!!day && Array.isArray(day.spawn), `все за пропуск → ship_day, spawn ${JSON.stringify(day?.spawn)}`);
await sleep(1600); // startAt

// --- Движение и снимки ---
for (const b of bots) b.clear();
const start = day.spawn;
for (let i = 1; i <= 10; i++) {
  g.send('move', { p: [start[0] + i * 0.3, start[1], start[2]], r: 0.5, a: 'walk' });
  await sleep(67);
}
const snap = await p.wait('snapshot', (m) => m.players.some((x) => x.id === g.id && x.p[0] > start[0] + 2));
check(!!snap, `штурман видит юнгу в snapshot: ${JSON.stringify(snap?.players.find((x) => x.id === g.id))}`);
check(!!snap && !snap.players.some((x) => x.id === p.id), 'в snapshot нет самого себя');

g.send('move', { p: [start[0] + 100, start[1], start[2]], r: 0, a: 'run' });
check(!!(await g.wait('pos_correct')), 'телепорт на 100 м → pos_correct');

g.send('chat', { text: 'Земля!' });
check(!!(await l.wait('chat', (m) => m.text === 'Земля!' && m.from === g.id)), 'чат доходит до других');

await l.walkTo(...at('columbus'));
l.send('npc_talk', { npc: 'columbus', text: 'Куда мы плывём?' });
check(!!(await l.wait('npc_thinking')), 'npc_talk → npc_thinking');
check(!!(await l.wait('npc_say', () => true, AI_MS)), 'npc_talk → npc_say');
await sleep(2100);
l.clear();
l.send('npc_talk', { npc: 'boatswain', text: 'Эй' });
await sleep(300);
check(!l.msgs.some((m) => m.t === 'npc_thinking'), 'боцман не на LLM → npc_talk игнорируется');

// --- Вторая вкладка и переподключение ---
const g2 = new Bot('grum-2');
await g2.open();
g2.send('auth', { token: tokens[0] });
const ok2 = await g2.wait('auth_ok');
await g.waitClosed();
check(g.closeCode === 4002, `вторая вкладка закрыла первую (код ${g.closeCode})`);
check(!!ok2 && ok2.state.role === 'grumete' && ok2.state.p[0] > start[0] + 2, `состояние сохранилось: роль ${ok2?.state.role}, p ${JSON.stringify(ok2?.state.p)}`);
check(!p.msgs.some((m) => m.t === 'player_leave' && m.id === g.id), 'смена вкладки не рассылает player_leave');

// --- Чанки ---
check(ok2?.world.totalChunks === 257 && ok2?.world.cacheLimit === 25, `мета мира: ${JSON.stringify(ok2?.world)}`);
p.clear();
p.send('chunk_req', { zone: 'ship', keys: ['0,0'] });
const shipChunk = await p.wait('chunk', (m) => m.zone === 'ship');
check(!!shipChunk && shipChunk.data.npcs.some((n) => n.id === 'columbus'), 'чанк корабля с Колумбом');
p.send('chunk_req', { zone: 'canary', keys: ['8,10'] });
check(!!(await p.wait('chunk_denied', (m) => m.reason === 'wrong_zone')), 'чанк чужой зоны → wrong_zone');

g2.send('chat', { text: '/scene canary' });
const canary = await p.wait('scene', (m) => m.id === 'canary');
await sleep(1600);
const [scx, scz] = canary.spawn.map((v) => Math.floor(v / 32)).filter((_, i) => i !== 1);
const near = [];
for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) near.push(`${scx + dx},${scz + dz}`);
p.clear();
p.send('chunk_req', { zone: 'canary', keys: near });
await p.wait('chunk',()=>p.msgs.filter(m=>m.t==='chunk').length>=25,8000);
const got = p.msgs.filter((m) => m.t === 'chunk');
check(got.length === 25, `25 чанков вокруг спавна (${got.length}), spawn ${JSON.stringify(canary.spawn)}`);
check(got.every((m) => m.data.h.length === 33 * 33), 'в каждом чанке 33×33 высот');
check(got.some((m) => m.data.interact.some((o) => o.id === 'well')), 'колодец есть в соседних чанках');
p.send('chunk_req', { zone: 'canary', keys: [`${scx + 3},${scz}`, `${scx + 4},${scz}`, '0,0'] });
await p.wait('chunk_denied',()=>p.msgs.filter(m=>m.t==='chunk_denied'&&m.reason==='too_far').length>=2,8000);
check(p.msgs.some((m) => m.t === 'chunk' && m.key === `${scx + 3},${scz}`), 'чанк на расстоянии 3 → выдан');
check(p.msgs.filter((m) => m.t === 'chunk_denied' && m.reason === 'too_far').length === 2, 'чанки дальше 3 → too_far');
const health2 = await api('/api/health');
check(health2.body.chunksServed >= 27, `health: отдано чанков ${health2.body.chunksServed}`);

// --- День на корабле: задания ---
for (const b of [g2, p, l]) b.clear();
g2.send('chat', { text: '/scene ship_day' });
for (const b of [g2, p, l]) b.pos = (await b.wait('scene', (m) => m.id === 'ship_day')).spawn;
await sleep(1600);
check(!!g2.quest('q_hourglass') && !!p.quest('q_latitude') && !!l.quest('q_ask_columbus'), 'каждому пришло задание его роли');
check(!!g2.quest('q_items')?.optional, 'общее необязательное задание «Осмотреться»');

await g2.walkTo(...at('hourglass'));
g2.send('interact', { id: 'hourglass' });
check(!!(await g2.wait('notice', (m) => m.text.includes('Песок'))), 'часы ещё не пусты → notice');

p.send('pickup', { id: 'astrolabe' });
check(!!(await p.wait('inventory', (m) => m.items.includes('astrolabe'))), 'штурман взял астролябию');
check(!!(await g2.wait('entity', (m) => m.id === 'astrolabe' && m.state.holder === p.id)), 'остальные видят entity: астролябия взята');
await g2.walkTo(...at('astrolabe'));
g2.send('pickup', { id: 'astrolabe' });
check(!!(await g2.wait('notice', (m) => m.text.includes('уже взял'))), 'второй раз взять нельзя');
g2.send('pickup',{id:'rum'});
check(!!(await g2.wait('inventory',m=>m.items.includes('rum'))),'ром можно подобрать на корабле');
g2.send('use',{item:'rum'});
const rumUse=await g2.wait('item_used',m=>m.item==='rum');
check(!!rumUse&&rumUse.vitals.drunkUntil>rumUse.serverNow&&rumUse.uses===1,'ром: сервер подтвердил опьянение и расход глотка');
p.send('minigame', { game: 'astrolabe', result: { answer: 17 } });
check(!!(await p.wait('notice', (m) => m.text.includes('Неверно'))), 'астролябия: неверная широта → подсказка');
p.send('minigame', { game: 'astrolabe', result: { angle: 73, answer: 33 } });
check(!!(await p.wait('quest', (m) => m.id === 'q_latitude' && m.status === 'done')), 'астролябия: 33° → задание выполнено');

await l.walkTo(...at('columbus'));
let askMark = l.msgs.length;
l.send('npc_talk', { npc: 'columbus', text: 'Зачем мы плывём на запад?' });
check(!!(await l.wait('quest', (m) => m.id === 'q_ask_columbus' && m.count === 1, AI_MS)), 'Колумб: тема 1 из 2');
// Колумб должен договорить: пока NPC отвечает, сервер не принимает следующий вопрос (с настоящим ИИ это 5–7 с)
await l.waitNew(askMark, 'npc_say', (m) => m.npc === 'columbus', AI_MS);
await sleep(2100);
l.send('npc_hint', { npc: 'columbus', hint: 'reward' });
check(!!(await l.wait('quest', (m) => m.id === 'q_ask_columbus' && m.status === 'done', AI_MS)), 'Колумб: подсказка → тема 2, задание выполнено');

g2.send('chat', { text: '/done' });
const pinta = await l.wait('npc_say', (m) => m.line === 'rudder_alarm', 4000);
check(!!pinta, `все задания дня → событие «Руль Пинты»: ${pinta?.ru}`);
check(!!(await l.wait('npc_say', (m) => m.line === 'columbus_rudder', 5000)), 'Колумб: идём на Канары');

// --- Канары ---
for (const b of [g2, p, l]) b.clear();
g2.send('chat', { text: '/scene canary' });
for (const b of [g2, p, l]) b.pos = (await b.wait('scene', (m) => m.id === 'canary')).spawn;
await sleep(1600);
check(!!(await l.wait('inventory', (m) => m.items.includes('purse') && m.money === 100)), 'переводчику выдан кошель, 100 мараведи');

async function grumeteFlow() {
  await g2.walkTo(...isle('barrel'));
  g2.send('pickup', { id: 'barrel' });
  await g2.wait('inventory', (m) => m.items.includes('barrel'));
  // Переподключение с бочонком в руках
  g2.ws.close();
  await sleep(300);
  const g3 = new Bot('grum-3');
  await g3.open();
  g3.send('auth', { token: tokens[0] });
  const ok3 = await g3.wait('auth_ok');
  check(ok3?.state.inventory.includes('barrel') && Math.abs(ok3.state.p[2] - isle('barrel')[1]) < 1, `переподключение: бочонок и позиция на месте ${JSON.stringify(ok3?.state.p)}`);
  check(!!(await g3.wait('quest', (m) => m.id === 'q_water' && m.progress === 1)), 'переподключение: задание на том же шаге');
  g3.pos = ok3.state.p;
  g3.id = ok3.you.id;
  await g3.walkTo(...isle('well'));
  g3.send('interact', { id: 'well' });
  check(!!(await g3.wait('inventory', (m) => m.items.includes('barrel_full'))), 'колодец: бочонок наполнен');
  await g3.walkTo(...isle('boat'));
  g3.send('interact', { id: 'boat' });
  check(!!(await g3.wait('quest', (m) => m.id === 'q_water' && m.status === 'done')), 'вода в шлюпке → «Вода для Америки» выполнено');
  return g3;
}

async function pilotFlow() {
  await p.walkTo(...isle('trader'));
  p.send('interact', { id: 'carpenter' });
  check(!!(await p.wait('notice', (m) => m.text.includes('ближе'))), 'плотник далеко → «Подойди ближе»');
  await p.walkTo(...isle('carpenter'));
  p.send('interact', { id: 'carpenter' });
  check(!!(await p.wait('npc_say', (m) => m.line === 'carpenter_task')), 'плотник просит доски и смолу');
  await p.walkTo(...isle('planks'));
  p.send('pickup', { id: 'planks' });
  await p.walkTo(...isle('tar'));
  p.send('pickup', { id: 'tar' });
  const supplies=await p.wait('inventory', (m) => m.items.includes('tar') && m.items.includes('planks'));
  check(!!supplies,`доски и смола подобраны${supplies?'':': '+JSON.stringify({pos:p.pos,inventory:p.last('inventory'),notices:p.msgs.filter(m=>m.t==='notice')})}`);
  await p.walkTo(...isle('carpenter'));
  p.send('interact', { id: 'boat' }); // далеко — ничего
  p.send('interact', { id: 'carpenter' });
  check(!!(await p.wait('quest', (m) => m.id === 'q_rudder' && m.status === 'done')), 'доски и смола у плотника → руль починен');
  await p.walkTo(...isle('boat'));
  p.send('interact', { id: 'boat' });
}

async function traderFlow() {
  await l.walkTo(...isle('trader'));
  l.send('interact', { id: 'trader' });
  const ts = await l.wait('trade_state');
  check(ts?.goods.length === 3 && ts.money === 100, `торговец: ${JSON.stringify(ts?.goods)}`);
  l.clear();
  l.send('trade', { npc: 'trader', item: 'cheese', offer: 20 });
  const counter = await l.wait('trade_state');
  check(counter?.goods.find((g) => g.item === 'cheese').price === 30, 'сыр за 20 → встречная цена 30');
  check(!!(await l.wait('npc_say', (m) => m.npc === 'trader', AI_MS)), 'торговец отвечает на предложение');
  // после каждой сделки торговец говорит — дождаться его реплики, иначе следующий торг сервер отклонит
  const buy = async (item, offer) => {
    await sleep(2100);
    const mark = l.msgs.length;
    l.send('trade', { npc: 'trader', item, offer });
    const st = await l.wait('trade_state', (m) => m.goods.find((g) => g.item === item).sold);
    await l.waitNew(mark, 'npc_say', (m) => m.npc === 'trader', AI_MS);
    return st;
  };
  await buy('cheese', 30);
  await buy('meat', 30);
  const last = await buy('biscuit', 25);
  check(last?.money === 15, `всё куплено, осталось ${last?.money} мараведи`);
  check(!!(await l.wait('quest', (m) => m.id === 'q_trade' && m.status === 'done')), '«Провизия» выполнено');
  l.send('use',{item:'cheese'});
  check(!!(await l.wait('item_used',m=>m.item==='cheese'&&m.effect==='food')),'еду можно съесть, сервер подтвердил восстановление сил');
  check(!!(await l.wait('inventory',m=>m.items.includes('meat')&&!m.items.includes('cheese'))),'съеденный сыр удалён из инвентаря');
  await l.walkTo(...isle('boat'));
  l.send('interact', { id: 'boat' });
}

const [g3] = await Promise.all([grumeteFlow(), pilotFlow(), traderFlow()]);
const leavingCanary=await l.wait('scene_progress',m=>m.scene==='canary'&&m.phase==='departing');
check(!!leavingCanary&&leavingCanary.endsAt>leavingCanary.serverNow,'Канары: сервер прислал отсчёт перед сменой локации');
const evening = await l.wait('scene', (m) => m.id === 'cut_evening', CONFIG.TRANSITION_COUNTDOWN_MS+3000);
check(!!evening, 'все сели в шлюпку → cut_evening');

// --- Вечер и ночь ---
for (const b of [g3, p, l]) b.clear();
g3.send('chat', { text: '/scene ship_evening' });
for (const b of [g3, p, l]) b.pos = (await b.wait('scene', (m) => m.id === 'ship_evening')).spawn;
await sleep(1600);
await g3.walkTo(...at('wine_barrel'));
g3.send('interact', { id: 'wine_barrel' });
await g3.walkTo(...at('dance'));
g3.send('interact', { id: 'dance' });
g3.send('minigame', { game: 'cards', result: { success: true } });
check(!!(await g3.wait('quest', (m) => m.id === 'q_feast' && m.status === 'done')), 'праздник: 3 из 4 → выполнено');
p.send('chat', { text: '/done' });
l.send('chat', { text: '/done' });
const leavingEvening=await l.wait('scene_progress',m=>m.scene==='ship_evening'&&m.phase==='departing');
check(!!leavingEvening&&leavingEvening.endsAt-leavingEvening.serverNow>=CONFIG.TRANSITION_COUNTDOWN_MS-100,'вечер: серверный отсчёт не меньше 5 с');
check(!!(await l.wait('scene', (m) => m.id === 'cut_night', CONFIG.TRANSITION_COUNTDOWN_MS+3000)), 'задания праздника завершены → cut_night без ready');

for (const b of [g3, p, l]) b.clear();
g3.send('chat', { text: '/scene night_story' });
const seat = await p.wait('scene', (m) => m.id === 'night_story');
check(Array.isArray(seat?.seat), `ночь: место у фонаря ${JSON.stringify(seat?.seat)}`);
const sitSnap = await p.wait('snapshot', (m) => m.players.some((x) => x.id === g3.id));
check(sitSnap?.players.every((x) => x.a === 'sit'), 'ночью все сидят (a: sit)');
g3.send('move', { p: [50, 1.6, 50], r: 1.2, a: 'run' });
await sleep(200);
const turned = p.msgs.findLast((m) => m.t === 'snapshot')?.players.find((x) => x.id === g3.id);
check(turned?.r === 1.2 && turned.p[0] !== 50 && turned.a === 'sit', 'ночью можно только крутить головой');
g3.send('scare', { target: p.id });
check(!!(await p.wait('scared', (m) => m.by === g3.id && m.target === p.id)), '«Бу!» дошло');
p.clear();
g3.send('scare', { target: p.id });
await sleep(300);
check(!p.msgs.some((m) => m.t === 'scared'), '«Бу!» чаще раза в 20 с не проходит');

const health3 = await api('/api/health');
check(health3.status === 200, 'сервер жив после полного прогона');

for (const b of [g3, p, l]) b.ws.close();
await sleep(200);
console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
