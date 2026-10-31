// npm run smoke — проверка сервера тремя ботами. Сервер должен быть запущен с DEV=1.
// SERVER=http://localhost:3000 по умолчанию.
import WebSocket from 'ws';

const BASE = process.env.SERVER || 'http://localhost:3000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const suffix = Math.random().toString(36).slice(2, 7);

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d)));
    this.ws.on('close', (code) => { this.closeCode = code; });
    return new Promise((r) => this.ws.on('open', r));
  }
  send(t, payload = {}) { this.ws.send(JSON.stringify({ t, ...payload })); }
  last(t) { return this.msgs.findLast((m) => m.t === t); }
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
await sleep(100);
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
g.send('chat', { text: '/scene lobby' });
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

l.send('npc_talk', { npc: 'columbus', text: 'Куда мы плывём?' });
check(!!(await l.wait('npc_thinking')), 'npc_talk → npc_thinking');
check(!!(await l.wait('npc_say')), 'npc_talk → npc_say');

// --- Вторая вкладка и переподключение ---
const g2 = new Bot('grum-2');
await g2.open();
g2.send('auth', { token: tokens[0] });
const ok2 = await g2.wait('auth_ok');
await sleep(200);
check(g.closeCode === 4002, `вторая вкладка закрыла первую (код ${g.closeCode})`);
check(!!ok2 && ok2.state.role === 'grumete' && ok2.state.p[0] > start[0] + 2, `состояние сохранилось: роль ${ok2?.state.role}, p ${JSON.stringify(ok2?.state.p)}`);
check(!p.msgs.some((m) => m.t === 'player_leave' && m.id === g.id), 'смена вкладки не рассылает player_leave');

for (const b of [g2, p, l]) b.ws.close();
await sleep(200);
console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
