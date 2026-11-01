import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {Controller} from '../src/game/controller.js';
function setup(){
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 const canvas={};document.pointerLockElement=canvas;document.exitPointerLock=()=>{document.pointerLockElement=null;};
 let loaded=false;
 const world={zone:'canary',camera:new PerspectiveCamera(),
   groundHeight:(x)=>loaded&&x<32?2:null,
   collide(c){const push=Math.max(0,2+c.radius-c.start.y);c.start.y+=push;c.end.y+=push;return {onGround:push>0};}};
 const c=new Controller(world,canvas);c.teleport([31,3,5]);c.setMode('play');
 return {c,world,load:()=>loaded=true};
}
test('late Canary chunk cannot drop player under terrain; loaded terrain resumes gravity',()=>{
 const {c,load}=setup();
 for(let i=0;i<200;i++)c.update(0.05,i/20);
 assert.equal(c.position.y,3);assert.equal(c.velocityY,0);
 load();for(let i=0;i<30;i++)c.update(0.05,i/20);
 assert.ok(Math.abs(c.position.y-2)<1e-6);assert.equal(c.onGround,true);c.dispose();
});
test('unloaded neighbour blocks movement before capsule crosses the chunk seam',()=>{
 const {c,load}=setup();load();c.keys.add('KeyD');
 for(let i=0;i<40;i++)c.update(0.05,i/20);
 assert.ok(c.position.x+0.35<32);assert.ok(c.position.y>=2);c.dispose();
});
test('saved position below loaded terrain recovers above the ground',()=>{
 const {c,load}=setup();load();c.teleport([10,-6,5]);c.update(0.05,0);
 assert.ok(c.position.y>=2);c.dispose();
});
