// npm run smoke:part2 — часть 2 (Гуанахани) тремя ботами: день, ареито, сон, тревога, высадка, обмен, финал.
// Сервер должен быть запущен с DEV=1. Внимание: делает /reset — сбрасывает прогресс всех игроков на этом сервере.
// SERVER=http://localhost:3000 по умолчанию.
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { resolveLayout } from '../world/terrain.js';

// Координаты — как их считает генератор острова
const ISLE = resolveLayout(JSON.parse(readFileSync(new URL('../../content/guanahani_layout.json', import.meta.url), 'utf8'))).layout;
const at = (id) => { const o = [...ISLE.interact, ...ISLE.npcs].find((x) => x.id === id); return [o.p[0], o.p[2]]; };

const BASE = process.env.SERVER || 'http://localhost:3000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const suffix = Math.random().toString(36).slice(2, 7);

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

class Bot {
  constructor(name) { this.name = name; this.msgs = []; }
  open() {
    this.ws = new WebSocket(WS_URL);
    this.ws.on('message', (d) => { const m = JSON.parse(d); this.msgs.push(m); if (m.t === 'pos_correct') this.pos = m.p; });
    return new Promise((r) => this.ws.on('open', r));
  }
  send(t, payload = {}) { this.ws.send(JSON.stringify({ t, ...payload })); }
  async wait(t, pred = () => true, ms = 3000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const m = this.msgs.find((x) => x.t === t && pred(x));
      if (m) return m;
      await sleep(20);
    }
    return null;
  }
  clear() { this.msgs = []; }
  items() { return this.msgs.findLast((m) => m.t === 'inventory')?.items ?? []; }
  async walkTo(x, z) {
    for (;;) {
      const dx = x - this.pos[0], dz = z - this.pos[2], d = Math.hypot(dx, dz);
      if (d < 0.5) return;
      const k = Math.min(0.9, d) / d;
      this.pos = [this.pos[0] + dx * k, this.pos[1], this.pos[2] + dz * k];
      this.send('move', { p: this.pos, r: 0, a: 'run' });
      await sleep(67);
    }
  }
  // подойти и нажать E; → следующее сообщение-ответ нужного типа
  async use(id, t = 'quest', pred = () => true) {
    await this.walkTo(...at(id));
    this.clear();
    this.send('interact', { id });
    return this.wait(t, pred);
  }
  quest(id, pred = () => true) { return this.wait('quest', (m) => m.id === id && pred(m)); }
}

// --- три жителя ---
const bots = [];
for (const role of ['grumete', 'piloto', 'lengua']) {
  const login = `${role.slice(0, 4)}2_${suffix}`;
  const r = await api('/api/register', { login, password: 'test1234' });
  const b = new Bot(login);
  await b.open();
  b.send('auth', { token: r.body.token });
  check(!!(await b.wait('auth_ok')), `${login}: вход`);
  b.role = role;
  bots.push(b);
}
const [g, p, l] = bots;
g.send('chat', { text: '/reset' });
await g.wait('scene', (m) => m.id === 'lobby');
for (const b of bots) b.send('interact', { id: `role:${b.role}` });
await g.wait('lobby', (m) => m.players.filter((x) => x.role).length === 3);

// jump: перейти командой /scene; иначе ждать, пока сервер сам сменит сцену (сообщение могло уже прийти)
async function scene(id, { jump = true, ms = 4000 } = {}) {
  if (jump) { for (const b of bots) b.clear(); g.send('chat', { text: `/scene ${id}` }); }
  const msgs = await Promise.all(bots.map((b) => b.wait('scene', (m) => m.id === id, ms)));
  msgs.forEach((m, i) => { if (m?.spawn) bots[i].pos = m.spawn; });
  await sleep(1600); // startAt
  return msgs[0];
}

// --- пролог: руки пустые, все у своих гамаков ---
g.send('chat', { text: '/give astrolabe' });
await g.wait('inventory', (m) => m.items.includes('astrolabe'));
const prologue = await scene('p2_prologue');
check(prologue?.zone === 'guanahani' && prologue.fleet === false, `пролог: зона ${prologue?.zone}, корабли ${prologue?.fleet}`);
check(g.items().length === 0, 'пролог: инвентарь из части 1 очищен');
const hammock = ISLE.spawns.grumete.p.filter((_, i) => i !== 1);
check(Math.hypot(g.pos[0] - hammock[0], g.pos[2] - hammock[1]) < 3, `рыбак появился в своём бохио ${JSON.stringify(g.pos)}`);

// чанки острова: зона guanahani, объекты деревни на месте
const [cx, cz] = [Math.floor(g.pos[0] / 32), Math.floor(g.pos[2] / 32)];
g.clear();
g.send('chunk_req', { zone: 'guanahani', keys: [`${cx},${cz}`, `${cx},${cz - 1}`, `${cx - 1},${cz}`, `${cx - 1},${cz - 1}`] });
await sleep(400);
const ids = g.msgs.filter((m) => m.t === 'chunk').flatMap((m) => [...m.data.interact, ...m.data.npcs].map((o) => o.id));
check(['buren', 'cacique', 'fire', 'grater'].every((id) => ids.includes(id)), `чанки Гуанахани: ${ids.length} объектов рядом`);

// --- день ---
await scene('p2_day');
check(!!(await g.quest('q_p2_fish')) && !!(await p.quest('q_p2_casabe')) && !!(await l.quest('q_p2_hammock')), 'день: у каждого своё задание');

async function fisher() {
  const miss = await g.use('fish_shoal', 'notice');
  check(miss?.text.includes('остроги'), `без остроги рыбу не взять: «${miss?.text}»`);
  await g.walkTo(...at('spear'));
  g.send('pickup', { id: 'spear' });
  await g.wait('inventory', (m) => m.items.includes('spear'));
  let hit = await g.use('fish_shoal', 'notice');
  check(hit?.text.includes('1 из 3'), `удар острогой: «${hit?.text}»`);
  g.send('interact', { id: 'fish_shoal' });
  g.send('interact', { id: 'fish_shoal' });
  check(!!(await g.wait('inventory', (m) => m.items.includes('fish'))), 'с третьего удара — улов');
  await g.use('conch_bed', 'inventory');
  check(g.items().includes('conch'), 'раковина-лямби собрана');
  await g.use('cacique', 'quest', (m) => m.id === 'q_p2_fish' && m.status === 'done');
  check(!!g.msgs.find((m) => m.t === 'quest' && m.id === 'q_p2_fish' && m.status === 'done'), 'улов отдан касику → «Утренний улов» выполнено');
  check(!!(await g.wait('npc_say', (m) => m.line === 'cacique_done')), 'касик благодарит');
}

async function hostess() {
  const early = await p.use('grater', 'notice');
  check(early?.text.includes('маниок'), `тёрка без клубней: «${early?.text}»`);
  for (const [id, item] of [['cassava_dig', 'cassava'], ['grater', 'cassava_grated'], ['cibucan', 'cassava_pulp'], ['buren', 'casabe']]) {
    await p.use(id, 'inventory');
    check(p.items().includes(item) && p.items().length === 1, `${id} → ${item} (${p.items().join(', ')})`);
  }
  await p.use('cacique', 'quest', (m) => m.id === 'q_p2_casabe' && m.status === 'done');
  check(!!p.msgs.find((m) => m.t === 'quest' && m.id === 'q_p2_casabe' && m.status === 'done'), 'касабе у касика → «Касабе» выполнено');
}

async function apprentice() {
  await l.use('cotton_1', 'inventory');
  await l.use('cotton_2', 'inventory');
  const short = await l.use('loom', 'notice');
  check(short?.text.includes('три'), `двух горстей хлопка мало: «${short?.text}»`);
  await l.use('cotton_3', 'inventory');
  check(l.items().filter((x) => x === 'cotton').length === 3, 'три горсти хлопка');
  await l.use('loom', 'inventory');
  check(l.items().join() === 'hammock_gift', 'гамак сплетён');
  await l.use('cacique', 'quest', (m) => m.id === 'q_p2_hammock' && m.status === 'done');
  check(!!l.msgs.find((m) => m.t === 'quest' && m.id === 'q_p2_hammock' && m.status === 'done'), 'гамак у касика → задание выполнено');
}

// людей Колумба 11 октября ещё нет
p.clear();
p.send('interact', { id: 'admiral' });
await sleep(300);
check(!p.msgs.some((m) => ['notice', 'inventory', 'npc_say'].includes(m.t)), 'днём чужаков на острове нет');

for (const b of bots) b.clear();
await Promise.all([fisher(), hostess(), apprentice()]);
check(!!(await l.wait('npc_say', (m) => m.line === 'cacique_evening_task', 4000)), 'все дары у касика → он зовёт на ареито');

// --- вечер ---
const evening = await scene('p2_evening', { jump: false, ms: 9000 });
check(!!evening, 'день закончился сам → p2_evening');
await Promise.all(bots.map(async (b) => {
  await b.use('wood_pile', 'inventory');
  await b.use('fire', 'quest', (m) => m.id === 'q_p2_areito' && m.progress === 2);
  await b.use('maracas', 'quest', (m) => m.id === 'q_p2_areito' && m.progress === 3);
  await b.use('elder', 'quest', (m) => m.id === 'q_p2_areito' && m.status === 'done');
}));
check(bots.every((b) => b.msgs.some((m) => m.t === 'quest' && m.id === 'q_p2_areito' && m.status === 'done')), 'ареито: хворост, танец, миф старейшины — у всех');

// --- после ареито — сразу спать: каждый в своём гамаке, глаза закрываются ---
const sleep2 = await scene('p2_sleep', { jump: false, ms: 6000 });
check(sleep2?.type === 'cutscene' && Math.hypot(g.pos[0] - hammock[0], g.pos[2] - hammock[1]) < 3, `ареито закончилось → все засыпают в гамаках ${JSON.stringify(g.pos)}`);
const alarm = await scene('p2_alarm', { jump: false, ms: 8000 });
check(alarm?.type === 'cutscene' && alarm.fleet === true, 'сон → тревога, корабли у острова');
const boats = await scene('p2_boats', { jump: false, ms: 15000 });
check(!!boats, 'тревога → утро, к берегу идёт шлюпка');

// --- встреча ---
const landing = await scene('p2_landing', { jump: false, ms: 14000 });
check(landing?.fleet === true && Math.abs(landing.spawn[0] - 117) < 1.5, `шлюпка у берега → p2_landing, все на дюне ${JSON.stringify(landing?.spawn)}`);
await Promise.all(bots.map(async (b) => {
  await b.use('banners', 'quest', (m) => m.id === 'q_p2_meet' && m.progress === 1);
  const gift = { grumete: null, piloto: 'parrots', lengua: 'skeins' }[b.role];
  if (gift) await b.use(gift, 'inventory');
  const back = await b.use('sailor_es', 'inventory');
  b.got = back?.items;
  if (b === l) b.cut = await l.use('steel', 'notice'); // до последнего шага: потом сцена уйдёт дальше
  await b.use('admiral', 'quest', (m) => m.id === 'q_p2_meet' && m.status === 'done');
}));
check(g.got?.includes('bell') && p.got?.includes('beads') && l.got?.includes('red_cap'), `обмен без слов: острога → ${g.got}, попугай → ${p.got}, хлопок → ${l.got}`);
check(l.cut?.text.includes('порезал'), 'блестящий нож режет ладонь');

// --- уход кораблей и финал ---
const departure = await scene('p2_departure', { jump: false, ms: 5000 });
check(!!departure, 'встреча → корабли уходят (p2_departure)');
check(!!(await g.wait('npc_say', (m) => m.line === 'p2_departure_1', 18000)), 'рассказчик: семерых увезли');
const after = await scene('p2_after', { jump: false, ms: 9000 });
check(after?.fleet === false, '«Что было дальше»');
for (const b of bots) b.send('skip_vote');
check(!!(await g.wait('scene', (m) => m.id === 'end', 3000)), 'все за «Дальше» → конец');

for (const b of bots) b.ws.close();
await sleep(200);
console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
