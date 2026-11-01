import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MeshStandardMaterial, Vector3 } from 'three';
import { buildLayout, buildNpc } from '../src/world/props.js';
import { buildShip } from '../src/world/ship.js';
import { Collider } from '../src/world/collision.js';
import { prepareNpc, animateNpc, collideNpcs } from '../src/world/npc-animation.js';
import { isNear } from '../../server/game/entities.js';
import { npcActivity } from '../../shared/npc-activity.js';

const layout = JSON.parse(readFileSync(new URL('../../content/ship_layout.json', import.meta.url)));
const material = new MeshStandardMaterial({ vertexColors: true });
const M = { person: material, get: () => material, canvas: () => material };
const captain = layout.npcs.find(n => n.id === 'columbus');

test('captain completes a continuous bounded loop past chart and compass on the actual deck', () => {
  const ship = buildShip(M), built = buildLayout(M, layout);
  const collider = new Collider([...ship.collider, ...built.col]);
  const actions = new Set();
  let previous = npcActivity(captain, 0);
  for (let t = 0; t <= 120; t += 0.1) {
    const state = npcActivity(captain, t); actions.add(state.action);
    assert.ok(Math.hypot(state.p[0] - previous.p[0], state.p[2] - previous.p[2]) <= 0.056, 'no teleport at stops or loop boundary');
    const [x, y, z] = state.p;
    const capsule = { start: new Vector3(x, y + 0.35, z), end: new Vector3(x, y + 1.45, z), radius: 0.3 };
    const result = collider.collide(capsule);
    assert.ok(Math.hypot(result.delta.x, result.delta.z) < 0.01, `route hits ship/props at ${state.p}: ${result.delta.toArray()}`);
    assert.ok(Math.abs(collider.groundHeight(x, z, y + 0.1) - y) < 0.01, 'route stays on the quarterdeck');
    previous = state;
  }
  for (const action of ['admiral', 'walk', 'chart', 'compass']) assert.ok(actions.has(action));
});

test('every ship NPC retains moving joints after optimization; island NPCs stay static', () => {
  for (const n of layout.npcs) {
    const { obj, col } = buildNpc(M, n, true); prepareNpc(obj);
    assert.equal(col.length, 0, 'animated bodies must not remain in static collider');
    animateNpc(obj, 1 / 60, 13);
    const before = obj.userData.motion.joints.map(j => j.quaternion.clone());
    for (let frame = 0; frame < 60; frame++) animateNpc(obj, 1 / 60, 13 + frame / 60);
    assert.ok(obj.userData.motion.joints.some((j, i) => j.quaternion.angleTo(before[i]) > 0.005), `${n.id} does not animate`);
    for (const joint of obj.userData.motion.joints) assert.ok(joint.quaternion.toArray().every(Number.isFinite));
    assert.ok(obj.userData.rig.head.children.some(c => c.isMesh), 'optimization preserved head geometry');
  }
  const island = buildNpc(M, { id: 'trader', p: [1, 0, 1] });
  assert.equal(island.obj.userData.rig, null); assert.equal(island.col.length, 1);
});

test('NPC collider follows captain and leaves his old location free', () => {
  const { obj } = buildNpc(M, captain, true); prepareNpc(obj);
  animateNpc(obj, 0, 25);
  const p = obj.position;
  const cap = { start: p.clone().add(new Vector3(0.2, 0.35, 0)), end: p.clone().add(new Vector3(0.2, 1.45, 0)), radius: 0.35 };
  assert.ok(collideNpcs([obj], cap).length() > 0.3);
  const old = { start: new Vector3(2.55, 2.3, 5.75), end: new Vector3(2.55, 3.4, 5.75), radius: 0.35 };
  assert.equal(collideNpcs([obj], old).length(), 0);
});


test('server interaction range follows the same moving NPC as the client', () => {
  const realNow = Date.now;
  try {
    for (let t = 0; t < 120; t += 0.5) {
      Date.now = () => t * 1000;
      const state = npcActivity(captain, t);
      assert.equal(isNear({ zone: 'ship', p: state.p }, 'columbus', -2.5), true);
      assert.equal(isNear({ zone: 'ship', p: [state.p[0] + 0.6, state.p[1], state.p[2]] }, 'columbus', -2.5), false);
      assert.equal(isNear({ zone: 'canary', p: state.p }, 'columbus'), false);
    }
  } finally { Date.now = realNow; }
});
