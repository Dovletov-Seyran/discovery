import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,MeshStandardMaterial,Object3D} from 'three';
import {Warriors} from '../src/world/warriors.js';
const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
const label=()=>{const o=new Object3D();o.draw=()=>{};return o;};
const msg=(level,warriors)=>({t:'combat',level,offenders:[1],serverNow:Date.now(),warriors});
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('warriors appear from the server state, move smoothly, can be hit unless lying, leave when the village calms down',async()=>{
 const w=new Warriors(new Scene(),M,{labelFactory:label});w.setZone('guanahani');
 w.apply(msg('alert',[{id:'warrior_0',p:[170,2,255],r:0,state:'guard',hp:3},{id:'warrior_1',p:[174,2,255],r:0,state:'guard',hp:3}]));
 assert.equal(w.map.size,2);assert.equal(w.targets.length,2);
 assert.equal(w.targets[0].userData.kind,'warrior');
 await wait(20);
 w.apply(msg('fight',[{id:'warrior_0',p:[171,2,255],r:0,state:'chase',hp:3},{id:'warrior_1',p:[174,2,255],r:0,state:'down',hp:0}]));
 await wait(150);w.update(1/60);
 const x=w.map.get('warrior_0').rig.root.position.x;assert.ok(x>170&&x<=171,`interpolated ${x}`);
 assert.equal(w.targets.length,1,'a lying warrior is not a target');
 const lying=w.map.get('warrior_1').rig.root;await wait(400);w.update(1/60);
 assert.ok(lying.rotation.x<-1.4,'lies on his back');
 for(const state of ['windup','strike','return']){
  w.apply(msg('fight',[{id:'warrior_0',p:[171,2,255],r:1,state,hp:3}]));await wait(140);w.update(1/60);
  w.map.get('warrior_0').rig.root.traverse(o=>{for(const v of [o.position,o.rotation])assert.ok(v.toArray().slice(0,3).every(Number.isFinite),state);});
 }
 assert.equal(w.map.size,1,'warrior_1 left with the next state');
 w.setZone('ship');assert.equal(w.targets.length,0,'not on the ship');w.setZone('guanahani');
 w.apply(msg('calm',[]));assert.equal(w.map.size,0);
});
