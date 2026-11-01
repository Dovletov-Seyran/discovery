import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {GameplayRuntime} from '../src/game/runtime.js';
import {layoutForWorld,entityPatch} from '../src/game/contracts.js';

test('server interact field is mapped to Front 1 layout without mutating source',()=>{
  const data={objects:[],npcs:[],interact:[{id:'astrolabe'}],spawns:{piloto:[0,0,0]}};
  const layout=layoutForWorld(data);assert.equal(layout.interactables[0].id,'astrolabe');assert.equal(data.interactables,undefined);assert.deepEqual(layout.spawn,data.spawns);
});
test('server holder state hides picked-up items and restores released items',()=>{
  assert.deepEqual(entityPatch({holder:7}),{visible:false});assert.deepEqual(entityPatch({holder:null}),{visible:true});
});
test('controller sends Front 1 sphere centers, resolves floor and retains 1.6 m eye height',()=>{
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  const canvas={};document.pointerLockElement=canvas;
  let collisions=0;
  const world={camera:new PerspectiveCamera(),interactables:[],groundHeight:()=>0,collide(capsule){
    assert.ok(capsule.start.isVector3);assert.ok(capsule.end.isVector3);assert.equal(capsule.radius,0.35);collisions++;
    const push=Math.max(0,capsule.radius-capsule.start.y);capsule.start.y+=push;capsule.end.y+=push;
    return {onGround:push>0,delta:new Vector3(0,push,0)};
  }};
  const sent=[];const runtime=new GameplayRuntime(world,canvas,{send:(type,data)=>{sent.push(data);return true;}});
  runtime.setMode('play');runtime.update(0.05,0);assert.ok(collisions>=4);assert.ok(Math.abs(runtime.controller.position.y)<1e-8);assert.ok(Math.abs(world.camera.position.y-1.6)<1e-8);
  runtime.controller.yaw=0.2;runtime.update(0.01,0.01);assert.equal(sent.length,1);
  runtime.update(0.01,0.07);assert.equal(sent.length,2);
  document.pointerLockElement=null;runtime.dispose();
});
test('opening dialogue/menu sends a final idle movement instead of leaving the player running remotely',()=>{
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.pointerLockElement=null;
 const sent=[],world={camera:new PerspectiveCamera(),interactables:[],groundHeight:()=>0,collide:()=>({onGround:true})};
 const runtime=new GameplayRuntime(world,{}, {send:(type,data)=>{sent.push({type,...data});return true;}});
 runtime.setMode('play');runtime.controller.animation='run';runtime.setMode('blocked');
 assert.equal(sent.at(-1).a,'idle');assert.equal(sent.at(-1).type,'move');runtime.dispose();
});
