// Объекты мира: описания из content/*_layout.json и изменяемое состояние (сохраняется в game_state).
import { npcActivity } from '../../shared/npc-activity.js';
import { CONFIG } from '../../shared/config.js';
import { loadContent } from '../content.js';
import { layoutToggles } from '../../shared/world-interact.js';
import { OBJECT_LIMIT, finiteVec } from '../../shared/object-physics.js';
import { resolveLayout } from '../world/terrain.js';

// id → { id, zone, x, z, kind, item?, period?, ... } — интерактивные объекты и NPC
const defs = new Map();
for (const zone of ['ship', 'canary']) {
  // остров — с координатами, как их считает генератор (rel/shore разворачиваются в точки)
  const raw = loadContent(`${zone}_layout.json`, {});
  const layout = zone === 'canary' && raw.shape ? resolveLayout(raw).layout : raw;
  for (const o of layout.interact ?? []) defs.set(o.id, { ...o, zone, x: o.p[0], z: o.p.at(-1) });
  for (const o of layoutToggles(layout,zone)) defs.set(o.id,{...o,x:o.p[0],z:o.p[2]});
  for (const o of layout.npcs ?? []) defs.set(o.id, { ...o, kind: 'npc', zone, x: o.p[0], z: o.p.at(-1) });
}

const staticIds = new Set(defs.keys());
let objects = {};       // id → состояние ({ holder }, { emptyAt }, ...)
let sharedQuests = {};  // questId → состояние общих заданий (роль никто не взял)
let dirty = false;
let epoch=0;
export const generation=()=>epoch;

export const def = (id) => defs.get(id);
export const allDefs = () => [...defs.values()];
export const positionOf = id => objects[id]?.p ?? defs.get(id)?.p;
export function register(data) {
  if(!data||typeof data.id!=='string'||data.id.length>100||staticIds.has(data.id)||!finiteVec(data.p)||!['ship','canary'].includes(data.zone))return null;
  if(!defs.has(data.id)&&[...defs.keys()].filter(id=>!staticIds.has(id)).length>=OBJECT_LIMIT)return null;
  const d={...data,kind:data.kind??'item',x:data.p[0],z:data.p[2],dynamic:true};
  defs.set(d.id,d);dirty=true;return d;
}
export function remove(id){if(staticIds.has(id))return false;defs.delete(id);delete objects[id];dirty=true;return true;}

export const stateOf = (id) => objects[id];
export const shared = () => sharedQuests;
export const ownedItemIds = (holder, items) => [...defs.values()].filter(d=>d.kind==='item'&&objects[d.id]?.holder===holder
  && (items.includes(d.item)||(d.item==='barrel'&&items.includes('barrel_full')))).map(d=>d.id);

export function setState(id, patch) {
  objects[id] = { ...objects[id], ...patch };
  dirty = true;
  return objects[id];
}

export const markDirty = () => { dirty = true; };
export function takeDirty() {
  const d = dirty;
  dirty = false;
  return d;
}

export function load(saved) {
  epoch++;
  for(const id of defs.keys())if(!staticIds.has(id))defs.delete(id);
  objects = saved?.objects ?? {};
  for(const d of saved?.dynamic??[])register(d);
  dirty=false;
  sharedQuests = saved?.sharedQuests ?? {};
}

export const snapshot = () => ({ objects, sharedQuests, dynamic:[...defs.values()].filter(d=>d.dynamic) });

export function reset() {
  epoch++;
  for(const id of defs.keys())if(!staticIds.has(id))defs.delete(id);
  objects = {};
  sharedQuests = {};
  dirty = true;
}

// Игрок стоит рядом с объектом? Сравниваем по горизонтали, +1 м на задержку сети
export function isNear(p, id, extra = 1) {
  const d = defs.get(id);
  if (!d || d.zone !== p.zone || !p.p) return false;
  const position = d.zone === 'ship' && d.kind === 'npc' ? npcActivity(d).p : positionOf(id);
  return Math.hypot(position[0] - p.p[0], position[2] - p.p[2]) <= CONFIG.INTERACT_DIST + extra;
}
