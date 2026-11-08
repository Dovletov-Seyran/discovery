import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,Vector3} from 'three';
import {ISLAND_MODELS} from '../src/world/islandModels.js';
import {Collider} from '../src/world/collision.js';
import {colliderFor} from '../src/world/props.js';
const layout=JSON.parse(readFileSync(new URL('../../content/canary_layout.json',import.meta.url))),material=new MeshStandardMaterial(),M={get:()=>material,canvas:()=>material};
const sizes={house:[7,5.5],house_governor:[11,8],warehouse:[12,7]};
test('every rotated town/farm house blocks players at all four walls, including cross-chunk sized models',()=>{
 for(const o of layout.objects.filter(o=>sizes[o.m])){
  const built=ISLAND_MODELS[o.m](M),placed={...o,p:[o.p[0],0,o.p.at(-1)]},geos=colliderFor(built.col,placed),collider=new Collider(geos),[w,d]=sizes[o.m],r=o.r??0;
  for(const [x,z,nx,nz]of [[w/2+.15,0,1,0],[-w/2-.15,0,-1,0],[w/3,d/2+.15,0,1],[0,-d/2-.15,0,-1]]){
   const start=new Vector3(placed.p[0]+x*Math.cos(r)+z*Math.sin(r),.5,placed.p[2]-x*Math.sin(r)+z*Math.cos(r)),end=start.clone().add(new Vector3(0,1,0)),cap={start,end,radius:.35};
   const hit=collider.collide(cap),out=new Vector3(nx*Math.cos(r)+nz*Math.sin(r),0,-nx*Math.sin(r)+nz*Math.cos(r));
   assert.ok(hit.delta.dot(out)>.25,`${o.id}: wall ${nx},${nz} has a gap`);
  }
  collider.geometry.dispose();geos.forEach(g=>g.dispose());built.col.forEach(g=>g.dispose());built.obj.traverse(m=>m.geometry?.dispose());
 }
});
