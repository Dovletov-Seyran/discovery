// Объекты мира: описания из content/*_layout.json и изменяемое состояние (сохраняется в game_state).
import { CONFIG } from '../../shared/config.js';
import { loadContent } from '../content.js';
import { resolveLayout } from '../world/terrain.js';

// id → { id, zone, x, z, kind, item?, period?, ... } — интерактивные объекты и NPC
const defs = new Map();
for (const zone of ['ship', 'canary', 'guanahani']) {
  // остров — с координатами, как их считает генератор (rel/shore разворачиваются в точки)
  const raw = loadContent(`${zone}_layout.json`, {});
  const layout = zone !== 'ship' && raw.shape ? resolveLayout(raw).layout : raw;
  for (const o of layout.interact ?? []) defs.set(o.id, { ...o, zone, x: o.p[0], z: o.p.at(-1) });
  for (const o of layout.npcs ?? []) defs.set(o.id, { ...o, kind: 'npc', zone, x: o.p[0], z: o.p.at(-1) });
}

let objects = {};       // id → состояние ({ holder }, { emptyAt }, ...)
let sharedQuests = {};  // questId → состояние общих заданий (роль никто не взял)
let dirty = false;

export const def = (id) => defs.get(id);
export const stateOf = (id) => objects[id];
export const shared = () => sharedQuests;

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
  objects = saved?.objects ?? {};
  sharedQuests = saved?.sharedQuests ?? {};
}

export const snapshot = () => ({ objects, sharedQuests });

export function reset() {
  objects = {};
  sharedQuests = {};
  dirty = true;
}

// Игрок стоит рядом с объектом? Сравниваем по горизонтали, +1 м на задержку сети
export function isNear(p, id, extra = 1) {
  const d = defs.get(id);
  if (!d || d.zone !== p.zone || !p.p) return false;
  return Math.hypot(d.x - p.p[0], d.z - p.p[2]) <= CONFIG.INTERACT_DIST + extra;
}
