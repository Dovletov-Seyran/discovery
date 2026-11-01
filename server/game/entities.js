// Объекты мира: описания из content/*_layout.json и изменяемое состояние (сохраняется в game_state).
import { npcActivity } from '../../shared/npc-activity.js';
import { CONFIG } from '../../shared/config.js';
import { loadContent } from '../content.js';
import { resolveLayout } from '../world/terrain.js';
import * as world from './world-state.js';

// id → { id, zone, x, z, kind, item?, period?, ... } — интерактивные объекты и NPC
const defs = new Map();
for (const zone of ['ship', 'canary']) {
  // остров — с координатами, как их считает генератор (rel/shore разворачиваются в точки)
  const raw = loadContent(`${zone}_layout.json`, {});
  const layout = zone === 'canary' && raw.shape ? resolveLayout(raw).layout : raw;
  for (const o of layout.interact ?? []) defs.set(o.id, { ...o, zone, x: o.p[0], z: o.p.at(-1) });
  for (const o of layout.npcs ?? []) defs.set(o.id, { ...o, kind: 'npc', zone, x: o.p[0], z: o.p.at(-1) });
}

let objects = {};       // id → состояние ({ holder }, { emptyAt }, ...)
let sharedQuests = {};  // questId → состояние общих заданий (роль никто не взял)
let dirty = false;

// Объект раскладки или появившийся по world_patch предмет (сухари на столе можно взять, как обычный предмет)
export const def = (id) => defs.get(id) ?? dynamicDef(id);
function dynamicDef(id) {
  const o = world.get(id);
  if (!o?.spawned || !o.p) return undefined;
  return { id, kind: o.kind, item: o.state?.item, zone: o.zone, p: o.p, x: o.p[0], z: o.p[2], label: o.state?.label };
}
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
  const d = world.takeDirty() || dirty;
  dirty = false;
  return d;
}

export function load(saved) {
  objects = saved?.objects ?? {};
  sharedQuests = saved?.sharedQuests ?? {};
  world.load(saved?.world);
}

export const snapshot = () => ({ objects, sharedQuests, world: world.snapshot() });

export function reset() {
  objects = {};
  sharedQuests = {};
  dirty = true;
  world.reset();
}

// Игрок стоит рядом с объектом? Сравниваем по горизонтали, +1 м на задержку сети
export function isNear(p, id, extra = 1) {
  const d = def(id);
  if (!d || d.zone !== p.zone || !p.p) return false;
  const [sceneId, started] = (p.scene ?? 'ship_day').split('@');
  const scene = { id: sceneId, ...(started ? { startAt: Number(started) } : {}) };
  const position = d.zone === 'ship' && d.kind === 'npc' ? npcActivity(d, Date.now() / 1000, scene, objects[id]?.paused).p : d.p;
  return Math.hypot(position[0] - p.p[0], position[2] - p.p[2]) <= CONFIG.INTERACT_DIST + extra;
}


// Серверная пауза маршрутов: первый активный собеседник задаёт направление взгляда.
// Изменения идут обычным entity и попадают в snapshot/chunk при переподключении.
export function syncNpcDialogues(party, scene, now = Date.now()) {
  const key = `${scene.id}@${scene.startAt ?? 0}`, patches = [];
  for (const d of defs.values()) {
    if (d.zone !== 'ship' || d.kind !== 'npc') continue;
    const saved = objects[d.id]?.paused;
    const previous = saved?.scene === key ? saved : null;
    const speaker = party.find(p => p.connected && p.zone === 'ship' && p.scene === key
      && p.dialogue?.npc === d.id && p.dialogue.until > now);
    let paused = previous;
    if (speaker) paused = { scene: key, at: previous?.at ?? now, offset: previous?.offset ?? 0, lookAt: [...speaker.p] };
    else if (previous?.at != null) paused = { scene: key, at: null, offset: previous.offset + now - previous.at, lookAt: null };
    if (JSON.stringify(saved ?? null) === JSON.stringify(paused)) continue;
    patches.push({ id: d.id, state: setState(d.id, { paused }) });
  }
  return patches;
}
