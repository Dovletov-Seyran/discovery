import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MeshStandardMaterial,Vector3,Box3} from 'three';
import {ISLAND_MODELS} from '../src/world/islandModels.js';
import {Collider} from '../src/world/collision.js';
const m=new MeshStandardMaterial(),M={get:()=>m,canvas:()=>m};
test('furnished homes and warehouse keep the entrance and central aisle open, with solid furniture beside it',()=>{
 for(const [model,doorX,depth,min]of [['house',-.6,5.5,8],['house_governor',0,8,8],['warehouse',0,7,11]]){
  const built=ISLAND_MODELS[model](M),collider=new Collider(built.col);assert.ok(built.col.length>=min,`${model} has no furniture collisions`);
  for(let z=depth/2+.6;z>=-.3;z-=.12){
   const start=new Vector3(doorX,.5,z),end=new Vector3(doorX,1.5,z),hit=collider.collide({start,end,radius:.32});
   assert.ok(Math.hypot(hit.delta.x,hit.delta.z)<.01,`${model}: furniture blocks the door/aisle at ${z}`);
  }
  assert.ok(!new Box3().setFromObject(built.obj).isEmpty());collider.geometry.dispose();built.col.forEach(g=>g.dispose());built.obj.traverse(o=>o.geometry?.dispose());
 }
});
