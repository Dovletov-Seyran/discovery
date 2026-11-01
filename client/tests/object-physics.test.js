import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBody,advanceBody,PHYSICS_STEP,shipRoll} from '../../shared/object-physics.js';
import {doorBox,boxContact,rayBox} from '../../shared/world-interact.js';
const ground=(p,r)=>[p[0],Math.max(r,p[1]),p[2]];
test('a throw is identical at 30, 60 and 144 frames per second and after catchup',()=>{
  const results=[];
  for(const fps of [30,60,144]){
    const b=createBody({p:[0,1.4,0],v:[2,2,-3],item:'cup',startedAt:1000});
    for(let frame=1;frame<=fps*3;frame++)advanceBody(b,1000+frame/fps*1000,ground);
    results.push(b);
  }
  const late=createBody({p:[0,1.4,0],v:[2,2,-3],item:'cup',startedAt:1000});advanceBody(late,4000,ground);
  for(const b of results)assert.deepEqual(b,late);
});
test('gravity, bounce and friction settle an object on the surface, without tunnelling',()=>{
  const b=createBody({p:[0,2,0],v:[3,0,0],item:'wine'});let bounced=false;
  for(let i=1;i<=8/PHYSICS_STEP;i++){advanceBody(b,i*PHYSICS_STEP*1000,ground);if(b.v[1]>0)bounced=true;assert.ok(b.p[1]>=b.radius);}
  assert.ok(bounced);assert.ok(b.sleeping);assert.deepEqual(b.v,[0,0,0]);
});
test('empty kegs respond to shared-time roll; a full keg comes to rest',()=>{
  const roll=createBody({p:[0,.27,0],item:'barrel',roll:true}),fixed=createBody({p:[0,.27,0],item:'barrel_full'});
  advanceBody(roll,5000,ground,{inertia:true});advanceBody(fixed,5000,ground);
  assert.ok(Math.abs(roll.p[0])>.05);assert.equal(fixed.p[0],0);assert.equal(shipRoll(1),shipRoll(1));
});
test('closed door blocks a capsule and a ray; opening rotates the leaf out of the doorway',()=>{
  const door={p:[0,0,0],r:0,w:1.2,h:2.2};
  assert.notDeepEqual(boxContact([0,.4,.08],.35,doorBox(door),1),[0,.4,.08]);
  assert.deepEqual(boxContact([0,.4,0],.35,doorBox(door,true),1),[0,.4,0]);
  assert.ok(rayBox([0,1,2],[0,0,-1],doorBox(door),3));
  assert.equal(rayBox([0,1,2],[0,0,-1],doorBox(door,true),3),null);
});
