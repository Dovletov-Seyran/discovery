import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,PerspectiveCamera} from 'three';
import {homeSlot} from '../src/game/object-actions.js';
import {Collider} from '../src/world/collision.js';

const slot=(id,item,p,holder)=>{const o=new Group();o.position.fromArray(p);o.visible=!holder;o.userData={id,kind:'item',item,state:{holder}};return o;};
const chest=(id,p,open)=>{const o=new Group();o.userData={id,kind:'toggle',lidDef:{id,m:'sea_chest',p},state:{open}};return o;};
function world(objects,barrier=null){
 const camera=new PerspectiveCamera();camera.position.set(0,1.6,2);camera.lookAt(0,1.6,0);camera.updateMatrixWorld(true);
 return {zone:'ship',camera,shipInteractables:objects,barrier};
}

test('finds the empty spot of this item under the crosshair, the nearest to the aim',()=>{
 const w=world([slot('a','gun',[.3,1.6,0],'placed'),slot('b','gun',[.05,1.6,0],7),slot('c','sword',[0,1.6,0],'placed')]);
 assert.deepEqual(homeSlot(w,'gun',7),{id:'b',closed:false});
});
test('a spot that is taken, held by someone else, off the aim, behind you or too far is not offered',()=>{
 assert.equal(homeSlot(world([slot('a','gun',[0,1.6,0],null)]),'gun',7),null);
 assert.equal(homeSlot(world([slot('a','gun',[0,1.6,0],8)]),'gun',7),null);
 assert.equal(homeSlot(world([slot('a','gun',[0,1.6,0],'consumed')]),'gun',7),null);
 assert.equal(homeSlot(world([slot('a','gun',[1,1.6,0],'placed')]),'gun',7),null);
 assert.equal(homeSlot(world([slot('a','gun',[0,1.6,5],'placed')]),'gun',7),null);
 assert.equal(homeSlot(world([slot('a','gun',[0,1.6,-3],'placed')]),'gun',7),null);
});
test('only on the ship, and not through a wall',()=>{
 const off=world([slot('a','gun',[0,1.6,0],'placed')]);off.zone='canary';assert.equal(homeSlot(off,'gun',7),null);
 const barrier=new Collider([new BoxGeometry(4,4,.1).translate(0,1.6,1)]);
 assert.equal(homeSlot(world([slot('a','gun',[0,1.6,0],'placed')],barrier),'gun',7),null);barrier.geometry.dispose();
});
test('a note in a chest reports whether the lid is open',()=>{
 const note=()=>slot('n','note_a',[0,1.5,0],'placed');
 assert.deepEqual(homeSlot(world([note(),chest('box',[0,1.43,0],false)]),'note_a',7),{id:'n',closed:true});
 assert.deepEqual(homeSlot(world([note(),chest('box',[0,1.43,0],true)]),'note_a',7),{id:'n',closed:false});
});
