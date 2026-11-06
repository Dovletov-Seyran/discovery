// Охота на животных (docs/tz-combat.md, «Охота»). Где животное и как бежит — считает каждый клиент сам
// (client/src/world/fauna.js, от общего времени), поэтому охотник сообщает, где он его настиг; сервер
// проверяет вид, оружие, дальность и направление взгляда, помнит убитых (у всех оно падает и пропадает),
// кладёт на землю тушку-предмет — её можно поднять E и съесть. Через RESPAWN_MS животное появляется снова.
//   hunt { id: 'guanahani:17', kind: 'hutia', p: [x, y, z], r, mode? } — удар / выстрел / бросок копья
//   fauna { zone, dead: [{ id, p }], killed?: { id, kind, p, by } } — всем в зоне; при входе — список убитых
import { S2C } from '../../shared/protocol.js';
import { heldItem } from '../../shared/player-presentation.js';
import { WEAPONS } from '../../shared/weapons.js';
import { players } from './players.js';
import * as director from './director.js';
import * as objects from './objects.js';
import { performAction } from './player-actions.js';
import { worldEvent } from './world-events.js';
import * as entities from './entities.js';

// на кого можно охотиться, где; сколько ударов выдерживает; что остаётся (предмет)
export const GAME = {
  guanahani: { hutia: { hp: 1, loot: 'hutia' }, iguana: { hp: 1, loot: 'iguana' }, crab: { hp: 1, loot: 'crab' } },
  canary: { goat: { hp: 2, loot: 'goat_meat' }, chicken: { hp: 1, loot: 'chicken' } },
  ship: { rat: { hp: 1, loot: null } },
};
// чем можно охотиться: дальность и точность (рад) — у оружия поединков, у части 1 — меч и эспингарда
const TOOLS = {
  macana: WEAPONS.macana, war_spear: WEAPONS.war_spear, bow: WEAPONS.bow, sword: WEAPONS.sword,
  espingarda: { kind: 'ranged', reach: 22, aim: 0.1, cooldown: 2500 },
};
export const H = { RESPAWN_MS: 180000, LAG: 1.0, LOOT_MS: 650, MAX_ID: 400, LITTER_MS: 240000 };

const dead = new Map(); // id → { zone, kind, p, at, hp? }
const wounds = new Map(); // id → { hp, at } — подранок (коза держит два удара)
export const reset = () => { dead.clear(); wounds.clear(); };
const notice = (p, text) => players.send(p, { t: S2C.NOTICE, text });
const round = (v) => Math.round(v * 100) / 100;
const deadList = (zone) => [...dead.entries()].filter(([, d]) => d.zone === zone).map(([id, d]) => ({ id, p: d.p }));
const toZone = (zone, msg) => players.broadcast(msg, (x) => x.zone === zone);

// При входе и смене зоны — кто сейчас убит
export function sync(p) { if (p.zone) players.send(p, { t: S2C.FAUNA, zone: p.zone, dead: deadList(p.zone) }); }

export function hunt(p, msg, now = Date.now()) {
  const zone = p.zone, game = GAME[zone]?.[msg?.kind];
  if (!game || !p.p || typeof msg.id !== 'string' || !Array.isArray(msg.p) || msg.p.length !== 3 || !msg.p.every(Number.isFinite)) return false;
  const [z, n] = msg.id.split(':');
  if (z !== zone || !(Number(n) >= 0 && Number(n) < H.MAX_ID)) return false;
  if (!director.acceptsMove() || director.isTransitioning()) return false;
  if (dead.has(msg.id)) return false;
  const thrown = msg.mode === 'throw', item = heldItem(p);
  if (thrown && item !== 'war_spear') return notice(p, 'Метнуть можно копьё'), false;
  const tool = thrown ? WEAPONS.war_spear.throw : TOOLS[item];
  if (!tool) return notice(p, 'Нужно оружие: макана, копьё или лук'), false;
  if (now - (p.lastHuntAt ?? 0) < tool.cooldown) return false;
  p.lastHuntAt = now;
  if (Number.isFinite(msg.r)) p.r = msg.r;
  const dx = msg.p[0] - p.p[0], dz = msg.p[2] - p.p[2], dist = Math.hypot(dx, dz), ranged = tool.kind === 'ranged';
  const off = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - (p.r ?? 0)), Math.cos(Math.atan2(-dx, -dz) - (p.r ?? 0))));
  // удар / выстрел виден и слышен всем
  if (thrown) performAction(p, 'throw', 'war_spear'); else performAction(p, tool.action ?? (item === 'espingarda' ? 'shot' : 'swing'), item);
  if (item === 'espingarda') worldEvent(p, 'scare', {}, now);
  else if (!ranged && !thrown) worldEvent(p, 'swing', {}, now); // замах распугивает соседей; стрела — бесшумна
  const lands = dist <= tool.reach + H.LAG && off <= tool.aim + (ranged ? 0.8 / Math.max(dist, 1) : 0.35);
  if (thrown) dropSpear(p, lands ? msg.p : [p.p[0] - Math.sin(p.r ?? 0) * Math.min(12, dist + 3), msg.p[1], p.p[2] - Math.cos(p.r ?? 0) * Math.min(12, dist + 3)], dist);
  if (!lands) return false;
  // подранок: коза держит два удара маканой или мечом; стрела и копьё убивают сразу
  const w = wounds.get(msg.id), hp = (w && now - w.at < 20000 ? w.hp : game.hp) - (ranged || thrown || item === 'war_spear' ? game.hp : 1);
  if (hp > 0) { wounds.set(msg.id, { hp, at: now }); toZone(zone, { t: S2C.FAUNA, zone, hurt: { id: msg.id, p: msg.p.map(round) } }); return true; }
  wounds.delete(msg.id);
  const at = [round(msg.p[0]), round(Math.max(director.groundAt(zone, msg.p[0], msg.p[2]) ?? msg.p[1], zone === 'ship' ? msg.p[1] : 0)), round(msg.p[2])];
  dead.set(msg.id, { zone, kind: msg.kind, p: at, at: now });
  toZone(zone, { t: S2C.FAUNA, zone, killed: { id: msg.id, kind: msg.kind, p: at, by: p.id }, dead: deadList(zone) });
  console.log(`[hunt] ${p.name}: ${msg.kind} (${item ?? 'копьё'})`);
  // тушка — на земле, когда животное упадёт
  if (game.loot) setTimeout(() => objects.spawnWorldItem({ id: `drop:game:${msg.id}:${now}`, zone, item: game.loot, p: at, r: Math.random() * 6.28, dynamic: true }), H.LOOT_MS);
  return true;
}

// Несъеденная тушка и брошенное копьё (охота и поединки) лежат LITTER_MS, потом исчезают; съеденная —
// сразу (иначе такие предметы копятся до предела объектов мира). Время броска — в конце id
export function litter(now = Date.now()) {
  for (const d of entities.allDefs()) {
    const m = /^drop:(game|spear):.*:(\d+)$/.exec(d.id);
    if (!m) continue;
    const holder = entities.stateOf(d.id)?.holder, owner = holder && players.get(holder);
    if (owner) { if (!owner.inventory?.includes(d.item)) objects.removeWorldObject(d.id); continue; } // у кого-то в руках — пока не съел
    if (now - Number(m[2]) > H.LITTER_MS) objects.removeWorldObject(d.id); // лежит (или ушедший игрок унёс) — пора убрать
  }
}

// метнутое копьё ложится там, куда долетело
function dropSpear(p, to, dist) {
  const i = p.inventory.indexOf('war_spear');
  if (i < 0) return;
  p.inventory.splice(i, 1); players.sendInventory(p);
  const zone = p.zone, ms = Math.max(150, (dist / WEAPONS.war_spear.throw.speed) * 1000), now = Date.now();
  const ground = [to[0], director.groundAt(zone, to[0], to[2]) ?? to[1], to[2]];
  toZone(zone, { t: S2C.FAUNA, zone, thrown: { from: [p.p[0], p.p[1] + 1.5, p.p[2]], to: ground, ms: Math.round(ms) } });
  setTimeout(() => objects.spawnWorldItem({ id: `drop:spear:${p.id}:${now}`, zone, item: 'war_spear', p: ground, r: p.r ?? 0, dynamic: true }), ms);
}

// Раз в несколько секунд: кто пролежал RESPAWN_MS — появляется снова
let listedAt = 0;
export function tick(now = Date.now()) {
  const zones = new Set();
  for (const [id, d] of dead) if (now - d.at > H.RESPAWN_MS) { dead.delete(id); zones.add(d.zone); }
  litter(now);
  // раз в 10 с — список убитых всем (кто вошёл в зону или загрузил мир позже)
  if (now - listedAt > 10000) { listedAt = now; for (const d of dead.values()) zones.add(d.zone); }
  for (const zone of zones) toZone(zone, { t: S2C.FAUNA, zone, dead: deadList(zone) });
}
