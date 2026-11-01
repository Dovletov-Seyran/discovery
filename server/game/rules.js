// Действия игрока в мире: подбор, взаимодействие, передача предметов, мини-игры, торговля, «Бу!», разговор с NPC.
// Сервер решает всё сам; клиент присылает только намерения.
import {equipForUse,performAction} from './player-actions.js';
import {actionForEffect} from '../../shared/player-presentation.js';
import {emitWorldEvent} from './world-events.js';
import {toggle,canPickup} from './objects.js';
import {applyItemUse,advanceStamina} from './item-actions.js';
import {ITEM_RULES} from '../../shared/item-actions.js';
import {SONGS,activePerformance} from '../../shared/npc-performance.js';
import { CONFIG } from '../../shared/config.js';
import { ASTROLABE, latitude } from '../../shared/astrolabe.js';
import { S2C } from '../../shared/protocol.js';
import { loadContent } from '../content.js';
import { players } from './players.js';
import * as director from './director.js';
import * as entities from './entities.js';
import * as quests from './quests.js';
import { worldEvent, ITEM_EVENT } from './world-events.js';
import * as ai from './ai-bridge.js';

const NPCS = new Map(loadContent('npcs.json', []).map((n) => [n.id, n]));
const ROUTINES = loadContent('npc-routines.json', {});
const ITEM_NAMES = new Map(loadContent('items.json', []).map((i) => [i.id, i.name]));

const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });
const sceneId = () => director.scene().id;
const playable = () => director.acceptsMove() && !director.isTransitioning();
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
  if(!p.inventory.includes(item)&&p.itemUses)delete p.itemUses[item];
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
  if(!canPickup(p,id))return notice(p,'Предмет за препятствием или слишком далеко.');
  if(p.inventory.includes(d.item))return notice(p,'Такой предмет уже есть в снаряжении.');
  entities.setState(id, { holder: p.id });
  p.inventory.push(d.item);
  if(st?.uses!==undefined){p.itemUses??={};p.itemUses[d.item]=st.uses;}
  players.sendInventory(p);
  broadcastEntity(id);
  players.save(p, { now: true });
  event(p, { type: 'pickup', item: d.item });
  performAction(p,'pickup',d.item);
}

// Отдать предмет NPC/объекту, если этого ждёт задание. → true, если отдали
function deliver(p, item, target) {
  if (!p.inventory.includes(item) || !entities.isNear(p, target)) return false;
  if (!quests.wantsDelivery(p, sceneId(), item, target)) return false;
  removeItem(p, item);
  players.sendInventory(p);
  players.save(p, { now: true });
  event(p, { type: 'deliver', item, target });
  performAction(p,'give',item,{target});
  return true;
}

export function use(p, msg) {
  const item=msg.item,rule=ITEM_RULES[item];
  if(!playable()||typeof item!=='string'||!p.inventory.includes(item))return;
  if(msg.target){
    if(rule?.target!==msg.target)return notice(p,'Этот предмет здесь не нужен.');
    if(!entities.isNear(p,msg.target))return notice(p,'Подойди ближе.');
    return interact(p,{id:msg.target});
  }
  const result=applyItemUse(p,item);
  if(result.error)return notice(p,result.error);
  if(!p.inventory.includes(item)){
    const source=entities.allDefs().find(d=>d.item===item&&entities.stateOf(d.id)?.holder===p.id);
    if(source){if(source.dynamic)entities.remove(source.id);else entities.setState(source.id,{holder:'consumed'});}
  }
  players.send(p,{t:S2C.ITEM_USED,...result});
  equipForUse(p,item);players.sendInventory(p);
  performAction(p,actionForEffect(result.effect),item);players.save(p,{now:true});
  worldEvent(p,ITEM_EVENT[result.effect],{item});
  if(item==='wine')event(p,{type:'interact',target:'wine_barrel'});
  event(p,{type:'use',item});
}
export function tickVitals(now=Date.now()){
  syncNpcDialogues(now);
  for(const p of players.connected()){
    const before=JSON.stringify(p.vitals);
    advanceStamina(p,(now-(p.lastVitalsAt??now))/1000,now);p.lastVitalsAt=now;
    if(JSON.stringify(p.vitals)!==before){players.send(p,{t:S2C.VITALS,...p.vitals,serverNow:now});players.save(p);}
  }
}

// --- Взаимодействие (E) ---

export function interact(p, msg) {
  if (!playable()) return;
  const id = msg.id;
  const d = entities.def(id);
  if (!d || d.zone !== p.zone || !present(d)) return;
  if (d.kind === 'item') return pickup(p, msg);
  if (d.kind === 'toggle') return toggle(p,msg);
  if (!entities.isNear(p, id)) return notice(p, 'Подойди ближе');
  if (d.kind === 'npc' && npcOwner(id) && npcOwner(id) !== p) return claimNpc(p, id);
  if (d.kind === 'dance') { worldEvent(p, 'dance'); performAction(p, 'dance'); sayLine('feast_dance', p); }
  // Карты на празднике: E у стола — партия с матросом. Сервер сдаёт сам: выиграл или проиграл,
  // засчитывается сама игра (задание «Праздник»: сыграть в карты)
  if (d.kind === 'cards') {
    const win = Math.random() < 0.5;
    sayLine(win ? 'feast_cards_lose' : 'feast_cards_win', p);
    notice(p, win ? 'Партия в карты: ты выиграл!' : 'Партия в карты: матрос выиграл. Ещё партию?');
    event(p, { type: 'minigame', game: 'cards', success: true });
  }

  let gained = []; // предметы, которые игрок получил этим нажатием (→ события pickup / trade_complete)
  switch (d.kind) {
    case 'hourglass': {
      const now = Date.now();
      const st = entities.stateOf(id);
      if (st?.emptyAt && now < st.emptyAt) return notice(p, `Песок ещё сыплется: ${Math.ceil((st.emptyAt - now) / 1000)} с`);
      entities.setState(id, { startedAt: now, duration: hourglassPeriod(d) * 1000, emptyAt: now + hourglassPeriod(d) * 1000, turnedBy: p.id });
      broadcastEntity(id);
      sayLine('grumete_song');
      performAction(p,'toggle',null,{target:id});
      break;
    }
    case 'well':
      if (!p.inventory.includes('barrel')) return notice(p, 'Нужен пустой бочонок');
      p.inventory[p.inventory.indexOf('barrel')] = 'barrel_full';
      p.itemUses??={};p.itemUses.barrel_full=3;
      if(p.equipped==='barrel')equipForUse(p,'barrel_full');
      players.sendInventory(p);
      players.save(p, { now: true });
      performAction(p,'fill','barrel_full',{target:id});
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
    // вариант (дата, склонение, высота Солнца) выбирает клиент, ответ считаем здесь
    const v = ASTROLABE.find((x) => x.id === msg.result?.variant), angle = Number(msg.result?.angle);
    success = !!v && Number(msg.result?.answer) === latitude(v) && Number.isFinite(angle) && Math.abs(angle - v.sun) <= 2;
    if (!success) notice(p, 'Неверно. Широта = 90° − высота Солнца + склонение');
  }
  event(p, { type: 'minigame', game: msg.game, success });
  if(success&&msg.game==='dance')performAction(p,'dance');
}

// --- Разговор с NPC ---

export function context(p, npc) {
  const performance=entities.stateOf(npc)?.performance;
  const performing=activePerformance(performance,{id:sceneId(),startAt:director.startAt()});
  const behavior = entities.stateOf(npc)?.behavior;
  const job = behavior?.scene === `${sceneId()}@${director.startAt()}`
    ? ROUTINES[npc]?.scenes?.[sceneId()]?.jobs.find(j => j.id === behavior.job) : null;
  return {
    ...(performing ? {activity:`Playing ${SONGS[performance.song].description} on my guitar. The music is already audible to the crew.`,performing:true} : job ? { activity: job.title } : {}),
    role: p.role, name: p.name, scene: sceneId(), inventory: p.inventory,
    questsDone: Object.keys(p.quests).filter((id) => p.quests[id]?.status === 'done'), log: p.log,
    // для ИИ: подсказка по текущему шагу задания и кто ещё в экипаже
    quests: { ...p.quests, ...Object.fromEntries(Object.entries(entities.shared()).map(([id,state])=>[id,{...state,shared:true}])) }, party: players.party().map((x) => ({ name: x.name, role: x.role })),
  };
}

// Разговор живёт, пока окно открыто. Потерянная вкладка не держит всю команду навсегда.
export function syncNpcDialogues(now = Date.now()) {
  for (const patch of entities.syncNpcDialogues(players.connected(), { id: sceneId(), startAt: director.startAt() }, now)) {
    players.broadcast({ t: S2C.ENTITY, ...patch });
  }
}

export function npcOwner(npc, now = Date.now()) {
  return players.connected().find(other => other.dialogue?.npc === npc
    && other.scene === `${sceneId()}@${director.startAt()}`
    && (other.dialogue.until > now || !!other.npcRequest));
}

function claimNpc(p, npc, req = {}) {
  const owner = npcOwner(npc);
  if (owner && owner !== p) {
    replyError(p, npc, req, `Сейчас разговаривает с ${owner.name}. Подожди, пока они закончат.`, { busy: true });
    return false;
  }
  if (p.dialogue?.npc !== npc || p.dialogue.until <= Date.now()) {
    p.npcRequest = null;
    // Без открытого окна (dialogueId) NPC держится только на время ответа: npcOwner учитывает npcRequest,
    // а 30 с аренды окна задержали бы смену сцены у всей партии
    p.dialogue = { id: req.dialogueId ?? `auto:${p.id}:${npc}`, npc, until: Date.now() + (req.dialogueId ? 30000 : 3000) };
  }
  syncNpcDialogues();
  return true;
}

export function dialogue(p, msg) {
  if (msg.active === false) {
    if (p.dialogue?.id === msg.dialogueId) { p.dialogue = null; p.npcRequest = null; syncNpcDialogues(); }
    return;
  }
  if (!playable() || !NPCS.has(msg.npc) || !entities.isNear(p, msg.npc, 3)) return;
  if (typeof msg.dialogueId !== 'string' || !msg.dialogueId || msg.dialogueId.length > 80) return;
  if (!claimNpc(p, msg.npc, msg)) return;
  if(p.dialogue?.id!==msg.dialogueId)p.npcRequest=null;
  p.dialogue = { id: msg.dialogueId, npc: msg.npc, until: Date.now() + 30000 };
  syncNpcDialogues();
}

function replyError(p, npc, req, text, extra = {}) {
  players.send(p, { t: S2C.NPC_SAY, npc, requestId: req.requestId, dialogueId: req.dialogueId,
    error: true, ru: text, en: '', hints: [], audio: null, ...extra });
}

async function askAi(p, npc, req) {
  const token = {}, started = director.startAt(), socket = p.ws;
  p.npcRequest = token;
  const tags = { npc, requestId: req.requestId, dialogueId: req.dialogueId };
  const current = () => p.npcRequest === token && p.connected && p.ws === socket && director.startAt() === started
    && (!req.dialogueId || p.dialogue?.id === req.dialogueId);
  players.send(p, { t: S2C.NPC_THINKING, ...tags });
  let timer;
  try {
    const {requestId, dialogueId, ...payload} = req;
    const res = await Promise.race([
      ai.talk({ userId: p.id, npc, context: context(p, npc), isCurrent: current, ...payload }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('NPC timeout')), 45000); }),
    ]);
    if (!current()) return null;
    players.send(p, { t: S2C.NPC_SAY, ...tags, en: res.en, ru: res.ru, audio: res.audio ?? null, hints: res.hints ?? [] });
    return res;
  } catch (e) {
    console.error('[ai] talk', e.message);
    if (current()) replyError(p, npc, req, 'Не удалось расслышать. Спроси ещё раз.');
    return null;
  } finally { clearTimeout(timer); if (p.npcRequest === token) p.npcRequest = null; syncNpcDialogues(); }
}

async function npcRequest(p, npc, req) {
  if (typeof npc !== 'string' || NPCS.get(npc)?.type !== 'llm' || !playable()) return;
  if (director.isTransitioning() || !entities.isNear(p, npc, 3)) return replyError(p, npc, req, 'Подойди ближе к собеседнику.');
  if (npcOwner(npc) && npcOwner(npc) !== p) return claimNpc(p, npc, req);
  if (req.dialogueId && (p.dialogue?.id !== req.dialogueId || p.dialogue.npc !== npc)) return replyError(p, npc, req, 'Открой разговор заново.');
  const now = Date.now();
  if (p.npcRequest || now - p.lastNpcTalkAt < CONFIG.NPC_TALK_COOLDOWN_MS) return replyError(p, npc, req, 'Подожди немного и повтори вопрос.');
  if (!claimNpc(p, npc, req)) return;
  p.lastNpcTalkAt = now;
  worldEvent(p, 'talk');
  const started = director.startAt();
  const res = await askAi(p, npc, req);
  if (!res || started !== director.startAt()) return;
  event(p, { type: 'talk', npc });
  const topics=res.topicsDiscussed??res.topicsTold??[];
  if (topics.length) event(p, { type: 'topics', npc, topics });
}

const requestTags = (msg) => ({
  requestId: typeof msg.requestId === 'string' ? msg.requestId.slice(0, 80) : undefined,
  dialogueId: typeof msg.dialogueId === 'string' ? msg.dialogueId.slice(0, 80) : undefined,
});
export function npcTalk(p, msg) {
  const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, CONFIG.CHAT_MAX_LEN) : '';
  return npcRequest(p, msg.npc, { text, ...requestTags(msg) });
}
export function npcHint(p, msg) {
  if (typeof msg.hint === 'string' && msg.hint) return npcRequest(p, msg.npc, { hintId: msg.hint, ...requestTags(msg) });
}

// --- Торговля ---
// Код решает цену, ИИ только озвучивает решение (tradeResult).

function tradeState(p, npc) {
  const goods = NPCS.get(npc)?.goods ?? [];
  return {
    t: S2C.TRADE_STATE, npc, money: p.money,
    goods: goods.map((g) => {
      const t = p.trade[`${npc}:${g.item}`];
      return { item: g.item, price: t?.price ?? g.basePrice, sold: !!t?.sold||p.inventory.includes(g.item) };
    }),
  };
}

export async function trade(p, msg) {
  const npc = msg.npc;
  const good = NPCS.get(npc)?.goods?.find((g) => g.item === msg.item);
  if (!good || !playable()) return;
  if (npcOwner(npc) && npcOwner(npc) !== p) return claimNpc(p, npc, requestTags(msg));
  if (msg.dialogueId && (p.dialogue?.id !== msg.dialogueId || p.dialogue.npc !== npc)) return replyError(p,npc,requestTags(msg),'Открой разговор заново.');
  if (p.npcRequest) return replyError(p, npc, requestTags(msg), 'Дождись ответа торговца.');
  if (!entities.isNear(p, npc, 2)) return notice(p, 'Подойди к торговцу');
  const now = Date.now();
  if (now - p.lastTradeAt < CONFIG.TRADE_COOLDOWN_MS) return replyError(p,npc,requestTags(msg),'Подожди немного.');
  const offer = Math.round(Number(msg.offer));
  if (!Number.isFinite(offer) || offer <= 0 || offer > 10000) return replyError(p,npc,requestTags(msg),'Укажи цену от 1 до 10000.');
  if (!claimNpc(p, npc, requestTags(msg))) return;
  p.lastTradeAt = now;

  const t = (p.trade[`${npc}:${good.item}`] ??= { price: good.basePrice, low: 0, sold: false });
  if (t.sold||p.inventory.includes(good.item)) return replyError(p,npc,requestTags(msg),'Это уже куплено');

  const task=quests.stateOf(p,sceneId(),'q_trade');
  if(task&&task.status!=='done'&&offer>=good.minPrice&&offer<=p.money){
    const reserve=NPCS.get(npc).goods.filter(g=>g.item!==good.item&&!p.inventory.includes(g.item)&&!p.trade[`${npc}:${g.item}`]?.sold).reduce((sum,g)=>sum+g.minPrice,0);
    if(p.money-offer<reserve)return replyError(p,npc,requestTags(msg),`Оставь деньги на остальные припасы. За этот товар — не больше ${p.money-reserve} м.`);
  }
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
  await askAi(p, npc, { ...requestTags(msg), text: '', tradeResult: { item: good.item, offer, outcome, price: t.price } });
}

// --- «Бу!» (только night_story) ---

export function scare(p, msg) {
  if (sceneId() !== 'night_story') return;
  const now = Date.now();
  if (now - p.lastScareAt < CONFIG.SCARE_COOLDOWN_MS) return;
  const target = players.get(Number(msg.target));
  if (!target || target === p || !target.connected || target.zone !== p.zone) return;
  p.lastScareAt = now;
  performAction(p,'scare');
  players.broadcast({ t: S2C.SCARED, by: p.id, target: target.id });
  worldEvent(p, 'scare');
}

// --- Начало сцены: объекты, выданные предметы, задания ---

export function onSceneStart(scene, party) {
  syncNpcDialogues();
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
      entities.setState('hourglass', { startedAt: director.startAt(), duration: hourglassPeriod(d) * 1000, emptyAt: director.startAt() + hourglassPeriod(d) * 1000 });
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
