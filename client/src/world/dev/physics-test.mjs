// Physics test without a browser: the real colliders of the ship and the whole island, and a player moved
// exactly like client/src/game/controller.js (gravity 20, jump 5.5, 4 substeps per frame).
//   node client/src/world/dev/physics-test.mjs            — everything
//   node client/src/world/dev/physics-test.mjs ship|island
// Reports: overboard escapes from the ship, falls under the terrain, spots where a player gets stuck,
// and walks that must succeed (beach → pier → its end, plaza → every building's door).
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildShip } from '../ship.js';
import { buildLayout } from '../props.js';
import { Collider } from '../collision.js';
import { Island } from '../island.js';
import { xAtY, topY, L0, L1 } from '../hullShape.js';
import { generateCanary } from '../../../../server/world/terrain.js';

const ROOT = new URL('../../../../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const only = process.argv[2];

// Materials are irrelevant for collisions: one plain material for every kind
const plain = new THREE.MeshStandardMaterial();
const M = { get: () => plain, canvas: () => plain, person: new THREE.MeshStandardMaterial({ vertexColors: true }) };

// --- the player, as in controller.js ---------------------------------------------------------
const DT = 1 / 60, RADIUS = 0.35;
class Player {
  constructor(collide, p) { this.collide = collide; this.pos = new THREE.Vector3(...p); this.vy = 0; this.onGround = false; this.cap = { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: RADIUS }; }
  step(dir, { run = true, jump = false } = {}) {
    const offset = new THREE.Vector3(dir[0], 0, dir[1]);
    if (offset.lengthSq()) offset.normalize().multiplyScalar(run ? 6 : 3);
    if (jump && this.onGround) { this.vy = 5.5; this.onGround = false; }
    this.vy -= 20 * DT;
    const step = DT / 4;
    let grounded = false;
    for (let i = 0; i < 4; i++) {
      this.pos.addScaledVector(offset, step);
      this.pos.y += this.vy * step;
      const c = this.cap;
      c.start.set(this.pos.x, this.pos.y + RADIUS, this.pos.z);
      c.end.set(this.pos.x, this.pos.y + 1.7 - RADIUS, this.pos.z);
      const r = this.collide(c);
      this.pos.set(c.start.x, c.start.y - RADIUS, c.start.z);
      if (r?.onGround) { grounded = true; this.vy = Math.max(0, this.vy); } else if (r?.delta?.y < 0) this.vy = Math.min(0, this.vy);
    }
    this.onGround = grounded;
  }
  settle() { for (let i = 0; i < 30; i++) this.step([0, 0]); return this; }
}
const DIRS = Array.from({ length: 16 }, (_, i) => [Math.sin(i * Math.PI / 8), -Math.cos(i * Math.PI / 8)]);

// A spot is "stuck" if from it the player cannot move 0.4 m in any of 8 directions within a second
function stuckAt(collide, p) {
  for (let d = 0; d < 16; d += 2) {
    const pl = new Player(collide, p).settle(), from = pl.pos.clone();
    for (let f = 0; f < 60; f++) pl.step(DIRS[d], { run: false, jump: f % 30 === 0 });
    if (Math.hypot(pl.pos.x - from.x, pl.pos.z - from.z) > 0.4) return false;
  }
  return true;
}

let failures = 0;
const report = (ok, text) => { console.log(`${ok ? '✓' : '✗'} ${text}`); if (!ok) failures++; };

// --- ship -------------------------------------------------------------------------------------
if (!only || only === 'ship') {
  const t0 = Date.now(), layout = json('content/ship_layout.json');
  const ship = buildShip(M), built = buildLayout(M, layout);
  const col = new Collider([...ship.collider, ...built.col]);
  const collide = (c) => col.collide(c);
  // every spot a player can stand on inside the bulwarks: decks and the tops of props, every 0.6 m
  // not behind the castle bulkheads (z −7.6 and 4.9): the main deck runs on under the castles, closed off
  const behindBulkhead = (y, z) => y < 1.4 && (z < -7.55 || z > 4.85);
  const inside = (x, y, z) => z > L0 + 0.5 && z < L1 - 0.2 && y < topY(z) + 1.2 && !behindBulkhead(y, z) && Math.abs(x) < xAtY(z, Math.min(y + 0.3, topY(z))) - 0.35;
  const starts = [];
  for (let x = -3.6; x <= 3.6; x += 0.6) for (let z = -11.4; z <= 10.8; z += 0.6) {
    for (const fromY of [8, 2.6, 1.2]) {
      const y = col.groundHeight(x, z, fromY);
      if (y === null || y < -0.6 || !inside(x, y, z)) continue;
      if (starts.some((s) => s[0] === x && s[2] === z && Math.abs(s[1] - y) < 0.3)) continue;
      // a spot where the capsule fits: standing still it does not get pushed aside
      const pl = new Player(collide, [x, y + 0.02, z]).settle();
      if (Math.hypot(pl.pos.x - x, pl.pos.z - z) < 0.12) starts.push([x, y + 0.02, z]);
    }
  }
  let escapes = 0, runs = 0;
  const worst = [];
  for (const s of starts) {
    for (let d = 0; d < 16; d += 2) {
      const pl = new Player(collide, s);
      for (let f = 0; f < 120; f++) pl.step(DIRS[d], { jump: true });
      runs++;
      // overboard: outside the hull, or fallen below the main deck
      const out = pl.pos.y < -1 || pl.pos.z < L0 - 0.3 || pl.pos.z > L1 + 0.3 || Math.abs(pl.pos.x) > xAtY(pl.pos.z, Math.max(0, Math.min(pl.pos.y, topY(pl.pos.z)))) + 0.15;
      if (out) { escapes++; if (worst.length < 5) worst.push([...s.map((v) => +v.toFixed(1)), d]); }
    }
  }
  report(escapes === 0, `корабль: ${runs} забегов с прыжками от ${starts.length} точек (палубы и верх реквизита) — за бортом ${escapes}${worst.length ? `, например от ${JSON.stringify(worst)}` : ''}`);
  const stuck = starts.filter((s, i) => i % 2 === 0 && stuckAt(collide, s));
  report(stuck.length === 0, `корабль: застреваний ${stuck.length} из ${Math.ceil(starts.length / 2)} проверенных точек${stuck.length ? ` ${JSON.stringify(stuck.slice(0, 5).map((p) => p.map((v) => +v.toFixed(1))))}` : ''}`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
}

// --- island -----------------------------------------------------------------------------------
if (!only || only === 'island') {
  const t0 = Date.now();
  const { chunks, heightAt, layout } = generateCanary(json('content/canary_layout.json'), { warn: () => {} });
  const island = new Island(new THREE.Scene(), M);
  for (const [key, data] of chunks) island.add(key, data);
  island.refresh();
  const collide = (c) => island.collide(c);
  console.log(`  остров собран: ${chunks.size} чанков за ${((Date.now() - t0) / 1000).toFixed(1)} с`);

  // 1. runs with jumps across all the land: never below the terrain
  let falls = 0, runs = 0;
  const fallAt = [];
  for (let x = 120; x <= 392; x += 8) for (let z = 140; z <= 350; z += 8) {
    if (heightAt(x, z) < 0.5) continue;
    for (let d = 0; d < 16; d += 4) {
      const pl = new Player(collide, [x, heightAt(x, z) + 0.05, z]);
      for (let f = 0; f < 120; f++) {
        pl.step(DIRS[d], { jump: f % 20 === 0 });
        const g = heightAt(pl.pos.x, pl.pos.z);
        if (g !== null && pl.pos.y < g - 0.35) { falls++; if (fallAt.length < 5) fallAt.push([+pl.pos.x.toFixed(1), +pl.pos.z.toFixed(1)]); break; }
      }
      runs++;
    }
  }
  report(falls === 0, `остров: ${runs} забегов по суше — провалов под рельеф ${falls}${fallAt.length ? ` ${JSON.stringify(fallAt)}` : ''}`);

  // 2. stuck spots: around every building and prop with a collider, and on a grid in town
  const probes = [];
  for (const o of [...layout.objects, ...layout.interact, ...layout.npcs]) {
    for (let a = 0; a < 16; a++) {
      const R = { church: 11, house_governor: 8, warehouse: 8, shipyard: 9, house: 5.5, pier: 2.4, market_stall: 3 }[o.m] ?? 2.2;
      const x = o.p[0] + Math.sin(a * Math.PI / 8) * R, z = o.p[2] + Math.cos(a * Math.PI / 8) * R, h = heightAt(x, z);
      if (h > -0.5) probes.push([x, h + 0.05, z]);
    }
  }
  const stuck = probes.filter((p) => stuckAt(collide, p));
  report(stuck.length === 0, `остров: застреваний у построек и предметов ${stuck.length} из ${probes.length}${stuck.length ? ` ${JSON.stringify(stuck.slice(0, 6).map((p) => p.map((v) => +v.toFixed(1))))}` : ''}`);

  // 3. walks that must work: from the beach onto the pier and to its end; from the plaza to every door
  const pier = layout.objects.find((o) => o.id === 'pier');
  // A walker heading for a point, like a player would: when blocked for half a second it sidesteps,
  // to the right first, then to the left, for longer each time.
  const walk = (from, to, secs = 12) => {
    const pl = new Player(collide, [from[0], heightAt(from[0], from[1]) + 0.05, from[1]]).settle();
    let last = pl.pos.clone(), detour = 0, side = 1, tries = 0;
    for (let f = 0; f < secs * 60; f++) {
      const dx = to[0] - pl.pos.x, dz = to[1] - pl.pos.z;
      if (Math.hypot(dx, dz) < 0.6) return { ok: true, pl };
      pl.step(detour > 0 ? [-dz * side, dx * side] : [dx, dz], { run: false });
      detour--;
      if (f % 30 === 29) {
        if (pl.pos.distanceTo(last) < 0.3 && detour <= 0) { tries++; side = tries % 2 ? 1 : -1; detour = 40 + 30 * tries; }
        last.copy(pl.pos);
      }
    }
    return { ok: false, pl };
  };
  const lane = pier.p[0] + 0.9; // the barrel stands on the middle of the planks
  const w = walk([lane, pier.p[2] - 10], [lane, pier.p[2] + 22], 20);
  report(w.ok && w.pl.pos.y > pier.p[1] - 0.1, `пристань: с берега до конца пешком, высота ${w.pl.pos.y.toFixed(2)} (настил ${pier.p[1]})`);
  const back = walk([lane, pier.p[2] + 20], [lane, pier.p[2] - 10], 20);
  report(back.ok, 'пристань: обратно на берег пешком');
  const plaza = [256, 296];
  const doors = layout.objects.filter((o) => ['house', 'house_governor', 'church', 'warehouse'].includes(o.m) && Math.hypot(o.p[0] - plaza[0], o.p[2] - plaza[1]) < 60);
  const blocked = [];
  for (const o of doors) {
    const depth = { house: 2.75, house_governor: 4, church: 9, warehouse: 3.5 }[o.m] + 1.5;
    const door = [o.p[0] + Math.sin(o.r) * depth, o.p[2] + Math.cos(o.r) * depth];
    if (!walk(plaza, door, 25).ok) blocked.push(o.id);
  }
  report(blocked.length === 0, `город: от площади до дверей ${doors.length} построек${blocked.length ? ` — не дойти: ${blocked.join(', ')}` : ''}`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
}

console.log(failures ? `\n${failures} проверок не прошло` : '\nВсе проверки прошли');
process.exit(failures ? 1 : 0);
