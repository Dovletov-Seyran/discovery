// Действия игрока в мире: подбор, взаимодействие, передача предметов, мини-игры, торговля, «Бу!», разговор с NPC.
// Сервер решает всё сам; клиент присылает только намерения.
import { CONFIG } from '../../shared/config.js';
import { S2C } from '../../shared/protocol.js';
import { loadContent } from '../content.js';
import { players } from './players.js';
import * as director from './director.js';
import * as entities from './entities.js';
import * as quests from './quests.js';
import * as ai from './ai-bridge.js';

const NPCS = new Map(loadContent('npcs.json', []).map((n) => [n.id, n]));
const ITEM_NAMES = new Map(loadContent('items.json', []).map((i) => [i.id, i.name]));
const ASTROLABE_ANSWER = 33; // 90 − 73 + 16

const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });
const sceneId = () => director.scene().id;
const playable = () => director.acceptsMove();
const itemName = (id) => ITEM_NAMES.get(id) ?? id;
const countOf = (p, item) => p.inventory.filter((x) => x === item).length;
// Объект только для некоторых сцен (scenes: [...]): шлюпки и люди Колумба на Гуанахани есть только 12 октября
const present = (d) => !d.scenes || d.scenes.includes(sceneId());

function event(p, ev) {
  const boatScene = !!director.scene().readyAt;
  const wasDone = boatScene && quests.playerDone(p, sceneId());
  if (quests.onEvent(p, ev, sceneId())) director.onPartyChanged();
  // Канары: своё задание выполнено — подсказать, как вернуться на корабль
  if (boatScene && !wasDone && !p.ready && quests.playerDone(p, sceneId())) {
    notice(p, 'Готово! Иди к шлюпке у причала и нажми E — вернёмся на корабль');
  }
}

// Объект изменился: сразу в БД (вместе с инвентарём игрока) и всем клиентам
function broadcastEntity(id) {
  director.persistNow();
  players.broadcast({ t: S2C.ENTITY, id, state: entities.stateOf(id) ?? {} });
}

function sayLine(lineId, to) {
  const msg = { t: S2C.NPC_SAY, line: lineId, hints: [], ...ai.playLine(lineId) };
  if (to) players.send(to, msg);
  else players.broadcast(msg);
}

const hourglassPeriod = (d) => (CONFIG.DEMO_MODE ? d.demoPeriod ?? d.period : d.period) ?? 60;

function removeItem(p, item) {
  const i = p.inventory.indexOf(item);
  if (i < 0) return false;
  p.inventory.splice(i, 1);
  return true;
}

// --- Подбор и передача ---

export function pickup(p, msg) {
  if (!playable()) return;
  const id = msg.id;
  const d = entities.def(id);
  if (d?.kind !== 'item' || !present(d)) return;
  if (!entities.isNear(p, id)) return notice(p, 'Подойди ближе');
  const st = entities.stateOf(id);
  if (st?.holder) return notice(p, st.holder === p.id ? 'Это уже у тебя' : 'Кто-то уже взял это');
  entities.setState(id, { holder: p.id });
  p.inventory.push(d.item);
  players.sendInventory(p);
  broadcastEntity(id);
  players.save(p, { now: true });
  event(p, { type: 'pickup', item: d.item });
}

// Отдать предмет NPC/объекту, если этого ждёт задание. → true, если отдали
function deliver(p, item, target) {
  if (!p.inventory.includes(item) || !entities.isNear(p, target)) return false;
  if (!quests.wantsDelivery(p, sceneId(), item, target)) return false;
  removeItem(p, item);
  players.sendInventory(p);
  players.save(p, { now: true });
  event(p, { type: 'deliver', item, target });
  return true;
}

export function use(p, msg) {
  const item = msg.item;
  if (!playable() || typeof item !== 'string' || !p.inventory.includes(item)) return;
  if (msg.target) {
    if (!deliver(p, item, msg.target)) notice(p, 'Это здесь не нужно');
    return;
  }
  if (item === 'wine') event(p, { type: 'interact', target: 'wine_barrel' }); // глоток из бурдюка = выпить с командой
  event(p, { type: 'use', item });
}

// --- Взаимодействие (E) ---

export function interact(p, msg) {
  if (!playable()) return;
  const id = msg.id;
  const d = entities.def(id);
  if (!d || d.zone !== p.zone || !present(d)) return;
  if (d.kind === 'item') return pickup(p, msg);
  if (!entities.isNear(p, id)) return notice(p, 'Подойди ближе');

  let gained = []; // предметы, которые игрок получил этим нажатием (→ события pickup / trade_complete)
  switch (d.kind) {
    case 'hourglass': {
      const now = Date.now();
      const st = entities.stateOf(id);
      if (st?.emptyAt && now < st.emptyAt) return notice(p, `Песок ещё сыплется: ${Math.ceil((st.emptyAt - now) / 1000)} с`);
      entities.setState(id, { emptyAt: now + hourglassPeriod(d) * 1000, turnedBy: p.id });
      broadcastEntity(id);
      sayLine('grumete_song');
      break;
    }
    case 'well':
      if (!p.inventory.includes('barrel')) return notice(p, 'Нужен пустой бочонок');
      p.inventory[p.inventory.indexOf('barrel')] = 'barrel_full';
      players.sendInventory(p);
      players.save(p, { now: true });
      break;
    case 'npc':
      if (id === 'trader') players.send(p, tradeState(p, id));
      if (d.swap) gained = swap(p, d);
      break;
    case 'source': {
      const got = takeFrom(p, id, d);
      if (got === null) return;
      gained = got;
      break;
    }
    case 'station':
      if (d.takes && !(gained = craft(p, d))) return;
      break;
  }
  if (gained.length) {
    players.sendInventory(p);
    players.save(p, { now: true });
  }
  if (d.say && (d.kind !== 'source' || gained.length)) notice(p, d.say);

  const rudderStep = quests.stateOf(p, sceneId(), 'q_rudder')?.step;
  event(p, { type: 'interact', target: id });
  for (const item of gained) event(p, { type: d.swap ? 'trade_complete' : 'pickup', item });

  // E у NPC или шлюпки — отдать всё, что ждут задания
  let delivered = 0;
  for (const item of [...p.inventory]) if (deliver(p, item, id)) delivered++;
  if (delivered && d.thanks) sayLine(d.thanks, p);
  if (id === 'carpenter') {
    const st = quests.stateOf(p, sceneId(), 'q_rudder');
    sayLine(st?.status === 'done' ? 'carpenter_done' : rudderStep ? 'carpenter_wait' : 'carpenter_task', p);
  }

  if (director.scene().readyAt === id) boardBoat(p, id);
}

// --- Часть 2: огород, кусты хлопка, лагуна, тёрка, бурен, обмен ---

// Источник: каждый раз даёт gives, пока у игрока их меньше max (по умолчанию 1).
// needs — без этого предмета не выйдет (острога); hits — сколько раз ударить, пока получится (рыба).
// → [предмет] или [] (удар мимо), null — ничего не произошло
function takeFrom(p, id, d) {
  if (d.needs && !p.inventory.includes(d.needs)) { notice(p, d.needText ?? `Нужно: ${itemName(d.needs)}`); return null; }
  if (countOf(p, d.gives) >= (d.max ?? 1)) { notice(p, `У тебя уже есть: ${itemName(d.gives)}`); return null; }
  if (d.hits > 1) {
    const hits = { ...entities.stateOf(id)?.hits };
    hits[p.id] = (hits[p.id] ?? 0) + 1;
    const done = hits[p.id] >= d.hits;
    if (done) delete hits[p.id];
    entities.setState(id, { hits });
    if (!done) { notice(p, `${d.hitText ?? 'Есть!'} (${hits[p.id]} из ${d.hits})`); return []; }
  }
  p.inventory.push(d.gives);
  return [d.gives];
}

// Станция: забирает takes (n штук) и даёт gives — тёрка, жгут, бурен, рама для гамака
function craft(p, d) {
  const n = d.n ?? 1;
  if (countOf(p, d.takes) < n) { notice(p, d.needText ?? `Нужно: ${itemName(d.takes)}${n > 1 ? ` × ${n}` : ''}`); return null; }
  for (let i = 0; i < n; i++) removeItem(p, d.takes);
  p.inventory.push(d.gives);
  return [d.gives];
}

// Обмен без слов (матрос со сундучком): swap { что отдаёшь: что получаешь }
function swap(p, d) {
  const got = [];
  for (const item of [...p.inventory]) {
    const back = d.swap[item];
    if (!back) continue;
    removeItem(p, item);
    p.inventory.push(back);
    got.push(back);
    notice(p, `${d.label ?? 'Чужак'} взял: ${itemName(item)} — и дал тебе: ${itemName(back)}`);
  }
  if (!got.length) notice(p, d.swapText ?? 'Он показывает на твои руки: ему нужно что-то взамен');
  return got;
}

function boardBoat(p, id) {
  if (!quests.playerDone(p, sceneId())) return notice(p, 'Сначала закончи своё задание');
  director.onReadyAt(p, id);
  if (players.party().some((x) => !x.ready)) sayLine('boat_wait', p);
}

// --- Мини-игры ---

export function minigame(p, msg) {
  if (!playable() || typeof msg.game !== 'string') return;
  let success = msg.result?.success === true;
  if (msg.game === 'astrolabe') {
    if (!p.inventory.includes('astrolabe')) return notice(p, 'Нужна астролябия');
    success = Number(msg.result?.answer) === ASTROLABE_ANSWER;
    if (!success) notice(p, 'Неверно. Широта = 90° − высота Солнца + склонение');
  }
  event(p, { type: 'minigame', game: msg.game, success });
}

// --- Разговор с NPC ---

export function context(p) {
  return {
    role: p.role, name: p.name, scene: sceneId(), inventory: p.inventory,
    questsDone: Object.keys(p.quests).filter((id) => p.quests[id]?.status === 'done'), log: p.log,
  };
}

async function askAi(p, npc, req) {
  players.send(p, { t: S2C.NPC_THINKING, npc });
  try {
    const res = await ai.talk({ userId: p.id, npc, context: context(p), ...req });
    players.send(p, { t: S2C.NPC_SAY, npc, en: res.en, ru: res.ru, audio: res.audio ?? null, hints: res.hints ?? [] });
    return res;
  } catch (e) {
    console.error('[ai] talk', e);
    players.send(p, { t: S2C.NPC_SAY, npc, en: '...', ru: '…', audio: null, hints: [] });
    return null;
  }
}

// На LLM говорят только Колумб, Старый Хуан и Торговец; остальные NPC — готовые реплики на клиенте
async function npcRequest(p, npc, req) {
  if (typeof npc !== 'string' || NPCS.get(npc)?.type !== 'llm' || !playable()) return;
  if (entities.def(npc)?.zone !== p.zone) return;
  const now = Date.now();
  if (now - p.lastNpcTalkAt < CONFIG.NPC_TALK_COOLDOWN_MS) return;
  p.lastNpcTalkAt = now;
  const res = await askAi(p, npc, req);
  if (!res) return;
  event(p, { type: 'talk', npc });
  if (res.topicsTold?.length) event(p, { type: 'topics', npc, topics: res.topicsTold });
}

export function npcTalk(p, msg) {
  // Пустой текст — игрок подошёл (E): агент здоровается с учётом прошлых разговоров
  const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, CONFIG.CHAT_MAX_LEN) : '';
  return npcRequest(p, msg.npc, { text });
}

export function npcHint(p, msg) {
  if (typeof msg.hint === 'string' && msg.hint) return npcRequest(p, msg.npc, { hintId: msg.hint });
}

// --- Торговля ---
// Код решает цену, ИИ только озвучивает решение (tradeResult).

function tradeState(p, npc) {
  const goods = NPCS.get(npc)?.goods ?? [];
  return {
    t: S2C.TRADE_STATE, npc, money: p.money,
    goods: goods.map((g) => {
      const t = p.trade[`${npc}:${g.item}`];
      return { item: g.item, price: t?.price ?? g.basePrice, sold: !!t?.sold };
    }),
  };
}

export async function trade(p, msg) {
  const npc = msg.npc;
  const good = NPCS.get(npc)?.goods?.find((g) => g.item === msg.item);
  if (!good || !playable()) return;
  if (!entities.isNear(p, npc, 2)) return notice(p, 'Подойди к торговцу');
  const now = Date.now();
  if (now - p.lastTradeAt < CONFIG.TRADE_COOLDOWN_MS) return;
  const offer = Math.round(Number(msg.offer));
  if (!Number.isFinite(offer) || offer <= 0 || offer > 10000) return;
  p.lastTradeAt = now;

  const t = (p.trade[`${npc}:${good.item}`] ??= { price: good.basePrice, low: 0, sold: false });
  if (t.sold) return notice(p, 'Это уже куплено');

  let outcome;
  if (offer > p.money) {
    outcome = 'no_money';
  } else if (offer >= good.minPrice) {
    outcome = 'sold';
    t.sold = true;
    t.price = offer;
    p.money -= offer;
    p.inventory.push(good.item);
    if (offer < good.basePrice * 0.85) players.addLog(p, 'traded_hard');
  } else if (++t.low >= 3) {
    outcome = 'angry';
    t.low = 0;
    t.price += 5;
  } else {
    outcome = 'counter';
    t.price = Math.max(good.minPrice, Math.round((offer + t.price) / 2));
  }

  players.send(p, tradeState(p, npc));
  if (outcome === 'sold') {
    players.sendInventory(p);
    players.save(p, { now: true });
    event(p, { type: 'trade_complete', item: good.item });
  }
  p.lastNpcTalkAt = now;
  await askAi(p, npc, { text: '', tradeResult: { item: good.item, offer, outcome, price: t.price } });
}

// --- «Бу!» (только night_story) ---

export function scare(p, msg) {
  if (sceneId() !== 'night_story') return;
  const now = Date.now();
  if (now - p.lastScareAt < CONFIG.SCARE_COOLDOWN_MS) return;
  const target = players.get(Number(msg.target));
  if (!target || target === p || !target.connected || target.zone !== p.zone) return;
  p.lastScareAt = now;
  players.broadcast({ t: S2C.SCARED, by: p.id, target: target.id });
}

// --- Начало сцены: объекты, выданные предметы, задания ---

export function onSceneStart(scene, party) {
  // Часть 2 начинается с чистых рук: жители Гуанахани не носят астролябий
  if (scene.clearInventory) {
    for (const p of party) {
      p.inventory = [];
      p.money = 0;
      players.sendInventory(p);
      players.save(p, { now: true });
    }
  }
  if (scene.id === 'ship_day') {
    const d = entities.def('hourglass');
    if (d) {
      entities.setState('hourglass', { emptyAt: director.startAt() + hourglassPeriod(d) * 1000 });
      broadcastEntity('hourglass');
    }
  }
  for (const [role, list] of Object.entries(scene.give ?? {})) {
    // Роли нет — отдаём любому присутствующему
    const owner = party.find((p) => p.role === role) ?? party.find((p) => p.connected);
    if (!owner) continue;
    for (const g of list) {
      if (owner.inventory.includes(g.item)) continue;
      owner.inventory.push(g.item);
      owner.money += g.money ?? 0;
    }
    players.sendInventory(owner);
    players.save(owner, { now: true });
  }
  quests.onSceneStart(scene, party);
}
