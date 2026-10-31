// Движок заданий: content/quests.json. Состояние — в player.quests, общие задания — в entities.shared().
// Типы шагов: pickup, interact (+count), deliver, minigame, talk, topics, trade_complete, any_of (need), all_of.
import { S2C } from '../../shared/protocol.js';
import { loadContent } from '../content.js';
import {loadScenePlayers} from '../db.js';
import { players } from './players.js';
import * as entities from './entities.js';

const QUESTS = loadContent('quests.json', []);

export const sceneQuests = (sceneId) => QUESTS.filter((q) => q.scene === sceneId);
const requiredQuests = (sceneId) => sceneQuests(sceneId).filter((q) => !q.optional);

const fresh = () => ({ status: 'active', step: 0, count: 0, sub: [], got: [] });
const isGroup = (step) => step.type === 'any_of' || step.type === 'all_of';
const need = (step) => (step.type === 'all_of' ? step.of.length : step.need ?? 1);

// Состояние задания для игрока → { st, shared } или null, если задание не его.
// Общее (роль никто не взял) — любому; своё по роли и 'all' — личное.
function ref(q, p) {
  const sh = entities.shared()[q.id];
  if (sh) return { st: sh, shared: true };
  if (q.role !== 'all' && q.role !== p.role) return null;
  p.quests[q.id] ??= fresh();
  return { st: p.quests[q.id], shared: false };
}

function matches(step, ev) {
  switch (step.type) {
    case 'pickup':
    case 'use':
    case 'trade_complete': return ev.type === step.type && ev.item === step.item;
    case 'interact': return ev.type === 'interact' && ev.target === step.target;
    case 'deliver': return ev.type === 'deliver' && ev.item === step.item && ev.target === step.target;
    case 'minigame': return ev.type === 'minigame' && ev.game === step.game && ev.success;
    case 'talk': return ev.type === 'talk' && ev.npc === step.npc;
    default: return false;
  }
}

// Шаг уже выполнен к моменту, когда стал текущим (предмет подобрали заранее)
const presatisfied = (step, p) =>
  (step.type === 'pickup' || step.type === 'trade_complete') && p.inventory.includes(step.item);

function completeStep(q, st, p) {
  players.addLog(p, q.steps[st.step].log);
  st.step++;
  st.count = 0;
  st.sub = [];
  st.got = [];
  if (st.step >= q.steps.length) {
    st.status = 'done';
    players.addLog(p, q.log);
  }
}

// Продвинуть, пока текущий шаг уже выполнен заранее
function settle(q, st, p) {
  while (st.status !== 'done') {
    const step = q.steps[st.step];
    if (isGroup(step)) {
      step.of.forEach((sub, i) => { if (!st.sub.includes(i) && presatisfied(sub, p)) st.sub.push(i); });
      if (st.sub.length < need(step)) return;
    } else if (!presatisfied(step, p)) return;
    completeStep(q, st, p);
  }
}

// → true, если состояние изменилось
function applyEvent(q, st, ev, p) {
  if (st.status === 'done') return false;
  const step = q.steps[st.step];
  let changed = false;
  let stepDone = false;
  if (isGroup(step)) {
    step.of.forEach((sub, i) => {
      if (!st.sub.includes(i) && matches(sub, ev)) { st.sub.push(i); changed = true; }
    });
    stepDone = st.sub.length >= need(step);
  } else if (step.type === 'topics') {
    if (ev.type === 'topics' && ev.npc === step.npc) {
      for (const t of ev.topics ?? []) {
        if (step.of.includes(t) && !st.got.includes(t)) { st.got.push(t); changed = true; }
      }
    }
    stepDone = st.got.length >= step.need;
  } else if (matches(step, ev)) {
    st.count++;
    changed = true;
    stepDone = st.count >= (step.count ?? 1);
  }
  if (stepDone) {
    completeStep(q, st, p);
    settle(q, st, p);
  }
  return changed;
}

function message(q, st, shared) {
  const done = st.status === 'done';
  const step = q.steps[Math.min(st.step, q.steps.length - 1)];
  const msg = {
    t: S2C.QUEST, id: q.id, title: q.title, status: st.status,
    progress: done ? q.steps.length : st.step, total: q.steps.length,
    text: done ? null : step.text, shared, optional: !!q.optional,
  };
  if (done) return msg;
  if (step.type === 'interact' && step.count > 1) Object.assign(msg, { count: st.count, need: step.count });
  if (step.type === 'topics') Object.assign(msg, { count: st.got.length, need: step.need, got: st.got });
  if (isGroup(step)) {
    Object.assign(msg, { count: st.sub.length, need: need(step), sub: st.sub, options: step.of.map((s) => s.text ?? s.item ?? s.target) });
  }
  return msg;
}

function notify(q, r, p) {
  if (r.shared) players.broadcast(message(q, r.st, true));
  else players.send(p, message(q, r.st, false));
}

// --- API для остальных модулей ---

// Событие игрока → продвинуть задания текущей сцены. → true, если что-то изменилось
export function onEvent(p, ev, sceneId) {
  let any = false;
  for (const q of sceneQuests(sceneId)) {
    const r = ref(q, p);
    if (!r || !applyEvent(q, r.st, ev, p)) continue;
    any = true;
    notify(q, r, p);
    if (r.shared) entities.markDirty();
  }
  if (any) players.save(p, { now: true });
  return any;
}

// Состояние задания для игрока (своё или общее) или null
export function stateOf(p, sceneId, questId) {
  const q = sceneQuests(sceneId).find((x) => x.id === questId);
  return q ? ref(q, p)?.st ?? null : null;
}

// Есть ли у игрока активный шаг «отдать item → target»
export function wantsDelivery(p, sceneId, item, target) {
  for (const q of sceneQuests(sceneId)) {
    const r = ref(q, p);
    if (!r || r.st.status === 'done') continue;
    const step = q.steps[r.st.step];
    const options = isGroup(step) ? step.of.filter((_, i) => !r.st.sub.includes(i)) : [step];
    if (options.some((s) => s.type === 'deliver' && s.item === item && s.target === target)) return true;
  }
  return false;
}

// Начало сцены: задания отсутствующих ролей становятся общими; всем — их задания
function shareMissingRoles(scene,party,departed=[]) {
  const roles=new Set(party.map(p=>p.role).filter(Boolean)),shared=entities.shared();
  let changed=false;
  for(const q of sceneQuests(scene.id)){
    if(q.role==='all'||roles.has(q.role)||shared[q.id])continue;
    const previous=departed.filter(p=>p.role===q.role).map(p=>p.quests?.[q.id]).filter(Boolean).sort((a,b)=>(b.status==='done'?1000:b.step)-(a.status==='done'?1000:a.step))[0];
    shared[q.id]=previous?structuredClone(previous):fresh();
    changed=true;entities.markDirty();
  }
  return changed;
}

// After a reconnect/server restart, or expiry of a disconnected role, its tasks become shared.
// In-progress tasks survive the handover instead of leaving an ownerless required objective.
export function refreshParty(scene,party,departed=[]) {
  const ids=new Set(party.map(p=>p.id)),sources=new Map();
  // Persisted actors are not re-added to the party; only their abandoned quest resources are recovered.
  for(const p of party[0]?.scene?loadScenePlayers(party[0].scene):[])if(!ids.has(p.id))sources.set(p.id,p);
  for(const p of departed)sources.set(p.id??p.role,p);
  const absent=[...sources.values()],changed=shareMissingRoles(scene,party,absent),recipients=new Set();
  for(const gone of absent){
    const recipient=party.find(p=>p.connected&&p.role===gone.role)??party.find(p=>p.connected);
    if(!recipient)continue;
    const tasks=sceneQuests(scene.id).filter(q=>!q.optional&&q.role===gone.role&&(entities.shared()[q.id]?.status??recipient.quests[q.id]?.status)!=='done');
    const steps=tasks.flatMap(q=>q.steps.flatMap(step=>step.of??[step]));
    const needed=new Set(steps.map(step=>step.item).filter(Boolean));
    const items=(gone.inventory??[]).filter(item=>needed.has(item));
    const money=steps.some(step=>step.type==='trade_complete')?(gone.money??0):0;
    if(!items.length&&!money)continue;
    for(const item of items){gone.inventory.splice(gone.inventory.indexOf(item),1);recipient.inventory.push(item);}
    gone.money=(gone.money??0)-money;recipient.money+=money;
    for(const id of entities.ownedItemIds(gone.id,items)){
      entities.setState(id,{holder:recipient.id});players.broadcast({t:S2C.ENTITY,id,state:entities.stateOf(id)});
    }
    players.save(gone,{now:true});players.save(recipient,{now:true});recipients.add(recipient);
  }
  if(!changed&&!recipients.size)return;
  for(const recipient of recipients){players.sendInventory(recipient);players.send(recipient,{t:S2C.NOTICE,text:'Припасы для общего задания переданы тебе.'});}
  for(const p of party){
    for(const q of sceneQuests(scene.id)){
      const r=ref(q,p);if(r){settle(q,r.st,p);if(r.shared)entities.markDirty();}
    }
    if(!playerDone(p,scene.id))p.ready=false;
    sendAll(p,scene.id);players.save(p,{now:true});
  }
}

export function onSceneStart(scene, party) {
  shareMissingRoles(scene,party);
  for (const p of party) {
    for (const q of sceneQuests(scene.id)) {
      const r = ref(q, p);
      if (r && !r.shared) settle(q, r.st, p);
    }
    sendAll(p, scene.id);
    players.save(p);
  }
}

// Все задания сцены, относящиеся к игроку (при входе и смене сцены)
export function sendAll(p, sceneId) {
  for (const q of sceneQuests(sceneId)) {
    const r = ref(q, p);
    if (r) players.send(p, message(q, r.st, r.shared));
  }
}

function questDone(q, party) {
  const sh = entities.shared()[q.id];
  if (sh) return sh.status === 'done';
  if (q.role === 'all') return party.length > 0 && party.every((p) => p.quests[q.id]?.status === 'done');
  const owner = party.find((p) => p.role === q.role);
  return owner?.quests[q.id]?.status === 'done';
}

export const isSceneComplete = (scene, party) => requiredQuests(scene.id).every((q) => questDone(q, party));

// Игрок закончил свои обязательные задания сцены (и общие, если есть)
export const playerDone = (p, sceneId) =>
  requiredQuests(sceneId).every((q) => { const r = ref(q, p); return !r || r.st.status === 'done'; });

function finish(q, r, p) {
  if (r.st.status === 'done') return;
  r.st.status = 'done';
  r.st.step = q.steps.length;
  notify(q, r, p);
  if (r.shared) entities.markDirty();
}

// Страховочный таймер: незакрытые обязательные задания засчитываем
export function forceComplete(scene, party) {
  for (const q of requiredQuests(scene.id)) {
    for (const p of party) {
      const r = ref(q, p);
      if (r) finish(q, r, p);
    }
  }
  for (const p of party) players.save(p);
}

// /done: выполнить мои задания текущей сцены
export function completeFor(p, sceneId) {
  for (const q of sceneQuests(sceneId)) {
    const r = ref(q, p);
    if (!r || r.st.status === 'done') continue;
    for (const step of q.steps) players.addLog(p, step.log);
    players.addLog(p, q.log);
    finish(q, r, p);
  }
  players.save(p);
}
