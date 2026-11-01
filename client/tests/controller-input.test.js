import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {Controller} from '../src/game/controller.js';
function event(type,data={}){const event=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(data))Object.defineProperty(event,key,{value});return event;}
function setup(request){
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 document.pointerLockElement=null;document.exitPointerLock=()=>{document.pointerLockElement=null;};
 const canvas=new EventTarget();canvas.focus=()=>{};canvas.requestPointerLock=request;
 const world={camera:new PerspectiveCamera(),groundHeight:()=>0,collide:()=>({onGround:false})};
 const c=new Controller(world,canvas);c.setMode('play');return {c,canvas};
}
test('WASD works without a click (after an item card closes); blur and modal stop movement',()=>{
 const {c,canvas}=setup();window.dispatchEvent(event('keydown',{code:'KeyW'}));c.update(.05,0);assert.ok(c.position.z<0);
 c.setMode('blocked');c.setMode('play');const z=c.position.z;c.update(.05,1);assert.equal(c.position.z,z,'окно сбросило нажатые клавиши');
 c.lock();window.dispatchEvent(event('keydown',{code:'KeyW'}));c.update(.05,2);assert.ok(c.position.z<z);
 canvas.dispatchEvent(event('blur'));assert.equal(c.hasControl,false);assert.equal(c.keys.size,0);
 c.lock();c.setMode('blocked');assert.equal(c.hasControl,false);c.dispose();
});
test('denied Pointer Lock still allows movement and right-drag looking',async()=>{
 const {c,canvas}=setup(()=>Promise.reject(new Error('not supported')));c.lock();await Promise.resolve();assert.equal(c.hasControl,true);
 const yaw=c.yaw;document.dispatchEvent(event('mousemove',{movementX:20,movementY:5}));assert.equal(c.yaw,yaw);
 canvas.dispatchEvent(event('mousedown',{button:2}));document.dispatchEvent(event('mousemove',{movementX:20,movementY:5}));assert.ok(c.yaw<yaw);assert.ok(c.pitch<0);
 window.dispatchEvent(event('mouseup'));const stopped=c.yaw;document.dispatchEvent(event('mousemove',{movementX:20,movementY:5}));assert.equal(c.yaw,stopped);c.dispose();
});
test('synchronous Pointer Lock rejection is handled; leaving a successful lock pauses input',()=>{
 const {c,canvas}=setup(()=>{throw new Error('blocked frame');});assert.doesNotThrow(()=>c.lock());assert.equal(c.hasControl,true);
 document.pointerLockElement=canvas;document.dispatchEvent(event('pointerlockchange'));
 document.pointerLockElement=null;document.dispatchEvent(event('pointerlockchange'));assert.equal(c.hasControl,false);c.dispose();
});
test('exhausted sprint slows to walking and stamina recovers while resting',()=>{
 const {c}=setup();c.lock();c.stamina=.1;c.keys.add('KeyW');c.keys.add('ShiftLeft');
 c.update(.05,0);c.update(.05,.05);assert.equal(c.exhausted,true);assert.equal(c.animation,'walk');
 c.keys.clear();for(let i=0;i<90;i++)c.update(.05,i*.05);
 assert.ok(c.stamina>=20);assert.equal(c.exhausted,false);c.dispose();
});
