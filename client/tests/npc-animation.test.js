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

test('evening routes clear ship furniture and ladders; NPCs change places after the island', () => {
  const ship = buildShip(M), built = buildLayout(M, layout), collider = new Collider([...ship.collider, ...built.col]);
  for (const n of layout.npcs) {
    const evening = npcActivity(n, 0, 'ship_evening');
    assert.notDeepEqual(npcActivity(n,30,'ship_evening').p, n.p, `${n.id} kept the daytime place`);
    let previous = evening;
    for (let t = 0; t < 180; t += 0.15) {
      const state = npcActivity(n, t, 'ship_evening'), [x,y,z] = state.p;
      assert.ok(new Vector3(...state.p).distanceTo(new Vector3(...previous.p)) <= 0.11, `${n.id} teleported`);
      // Нижняя сфера выше настила: проверяем проход туловища, а не касание ботинка со склоном трапа.
      const cap = {start:new Vector3(x,y+0.45,z),end:new Vector3(x,y+1.45,z),radius:0.3};
      const hit = collider.collide(cap);
      assert.ok(Math.hypot(hit.delta.x,hit.delta.z)<0.015, `${n.id} intersects furniture at ${state.p}`);
      assert.ok(Math.abs(collider.groundHeight(x,z,y+0.1)-y)<0.12, `${n.id} floats or leaves the deck`);
      previous = state;
    }
  }
});

test('night listeners face Juan, have seats, and leave actual and documented player seats free', () => {
  const storyteller = layout.npcs.find(n=>n.id==='storyteller').scenes.night_story;
  const playerSeats = [...layout.seats.map(s=>s.p), [2,1.6,3],[-2,1.6,3],[0,1.6,5]];
  const locations=[];
  for (const n of layout.npcs) {
    const state=npcActivity(n, 42, 'night_story');
    assert.equal(state.walking,false);
    assert.deepEqual(state.p,npcActivity(n,100,'night_story').p);
    for (const p of [...playerSeats,...locations]) assert.ok(Math.hypot(state.p[0]-p[0],state.p[2]-p[2])>0.8, `${n.id} overlaps a seat`);
    locations.push(state.p);
    if(n.id!=='storyteller') {
      assert.equal(state.action,'listen');
      const dx=storyteller.p[0]-state.p[0],dz=storyteller.p[2]-state.p[2];
      assert.ok((-Math.sin(state.r)*dx-Math.cos(state.r)*dz)/Math.hypot(dx,dz)>0.999);
    }
    const {obj}=buildNpc(M,n,true);prepareNpc(obj);animateNpc(obj,0,42,true,'night_story');
    assert.equal(obj.userData.rig.guitar?.visible??false,false,'guitar must rest while listening');
    assert.ok(obj.userData.rig.stool.visible||n.id==='musician');
    assert.ok(Math.abs(obj.userData.rig.hip.position.y-0.48)<0.001);
  }
});

test('scene clock supports late joins, pauses, continuation and rejects pauses from another scene', () => {
  const scene={id:'ship_evening',startAt:100000};
  const before=npcActivity(captain,127,scene);
  const paused={scene:'ship_evening@100000',at:127000,offset:0,lookAt:[0,0,0]};
  const frozen=npcActivity(captain,140,scene,paused);
  assert.deepEqual(frozen.p,before.p);assert.equal(frozen.walking,false);
  const resumed={...paused,at:null,offset:13000,lookAt:null};
  assert.deepEqual(npcActivity(captain,141,scene,resumed).p,npcActivity(captain,128,scene).p);
  assert.deepEqual(npcActivity(captain,140,{id:'night_story',startAt:135000},paused).p,captain.scenes.night_story.p);
});

test('AI job paths animate on the shared clock and resume at the same place after dialogue',()=>{
 const profiles=JSON.parse(readFileSync(new URL('../../content/npc-routines.json',import.meta.url)));
 const scene={id:'ship_day',startAt:100000},key='ship_day@100000';
 for(const n of layout.npcs){
  const g=profiles[n.id].scenes.ship_day,{obj}=buildNpc(M,n,true);prepareNpc(obj);
  for(const job of g.jobs){
   const behavior={scene:key,path:[g.nodes[0],g.nodes[job.node]],start:0,pose:job.pose,r:job.r,seat:job.seat};
   obj.userData.behavior=behavior;
   for(const time of [100,101,160]){
    animateNpc(obj,1/60,time,false,scene);
    assert.deepEqual(obj.position.toArray(),npcActivity(n,time,scene,null,behavior).p);
    assert.ok(obj.userData.motion.joints.every(j=>j.quaternion.toArray().every(Number.isFinite)));
   }
   const paused={scene:key,at:101000,offset:0,lookAt:[0,0,0],kind:'dialogue'};
   obj.userData.paused=paused;animateNpc(obj,1/60,110,false,scene);
   assert.deepEqual(obj.position.toArray(),npcActivity(n,101,scene,null,behavior).p);
   obj.userData.paused={...paused,at:null,offset:9000};animateNpc(obj,1/60,111,false,scene);
   assert.deepEqual(obj.position.toArray(),npcActivity(n,102,scene,null,behavior).p);
   obj.userData.paused=null;
  }
 }
});

test('captain holds the chart by its scroll edges, above the hands and clear of his coat',async()=>{
 const {giveChart}=await import('../src/world/npc-animation.js'),{MODELS}=await import('../src/world/props.js');
 const {obj}=buildNpc(M,captain,true);prepareNpc(obj);giveChart(obj,MODELS.map(M).obj);
 const scene='ship_day';let chartTime=null;
 for(let t=0;t<120;t+=.2)if(npcActivity(captain,t,scene).action==='chart'){chartTime=t+.01;break;}
 assert.ok(chartTime!==null);
 for(let frame=0;frame<90;frame++)animateNpc(obj,1/60,chartTime+frame/60,false,scene,true);
 obj.updateMatrixWorld(true);const {rig,chart}=obj.userData;assert.equal(chart.visible,true);
 for(const arm of rig.arms){
  const hand=chart.worldToLocal(arm.fa.localToWorld(new Vector3(0,-.3,0)));
  assert.ok(Math.abs(hand.x)>.49,'hand goes through the middle of the parchment');
  assert.ok(hand.y<-.06,'parchment passes through the knuckles');
 }
 chart.traverse(mesh=>{const positions=mesh.geometry?.attributes.position;if(!positions)return;
  for(let i=0;i<positions.count;i++){
   const point=rig.torso.worldToLocal(new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));
   assert.ok(point.z>.34,'parchment intersects the front of the coat');
  }
 });
 animateNpc(obj,1/60,chartTime+1.5,false,scene,false);assert.equal(chart.visible,false);
});
test('cook supports the tray with both hands while serving, walking and speaking',()=>{
 const n=layout.npcs.find(n=>n.id==='cook'),{obj}=buildNpc(M,n,true);prepareNpc(obj);
 const scene={id:'ship_day',startAt:100000},rig=obj.userData.rig;
 obj.userData.behavior={scene:'ship_day@100000',path:[[1,0,0],[2,0,0]],start:0,pose:'serve',r:0,seat:false};
 for(const [time,paused] of [[101,null],[110,null],[115,{scene:'ship_day@100000',at:110000,offset:0,lookAt:[0,0,0],kind:'dialogue'}]]){
  obj.userData.paused=paused;animateNpc(obj,1/60,time,false,scene);obj.updateMatrixWorld(true);
  const tray=rig.tray.getWorldPosition(new Vector3());assert.equal(rig.tray.visible,true);
  for(const arm of rig.arms){const palm=arm.fa.localToWorld(new Vector3(0,-.3,0));assert.ok(Math.abs(tray.y-palm.y-.025)<.01);assert.ok(Math.hypot(palm.x-tray.x,palm.z-tray.z)<.25);}
 }
});
