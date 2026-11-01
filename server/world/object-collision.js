// Build exactly the renderer's simplified collision geometry, without WebGL, textures or NPC meshes.
// Only a bounded neighbourhood is cached; the island height map still comes from server chunks.
import * as THREE from 'three';
import {Collider} from '../../client/src/world/collision.js';
import {buildShip} from '../../client/src/world/ship.js';
import {MODELS,colliderFor} from '../../client/src/world/props.js';
import {ISLAND_MODELS,VEGETATION} from '../../client/src/world/islandModels.js';
import {getChunk} from '../db.js';
import * as entities from '../game/entities.js';
import {doorBox,rayBox} from '../../shared/world-interact.js';
import {loadContent} from '../content.js';
const mat=new THREE.MeshBasicMaterial();
const M={get:()=>mat,canvas:()=>mat,person:{get:()=>mat}};
let ship=null;
const cache=new Map(),templates=new Map();
const clean=obj=>obj?.traverse(o=>o.geometry?.dispose());
function geometryFor(o){
  if(o.kind==='item')return []; // picked/rolling items must not leave a fixed invisible obstacle
  if(!templates.has(o.m)){
    const make=ISLAND_MODELS[o.m]??MODELS[o.m]??VEGETATION[o.m];
    if(typeof make!=='function'){templates.set(o.m,[]);return [];}
    const built=make(M);clean(built.obj);built.parts?.forEach(p=>p.geo.dispose());
    templates.set(o.m,built.col??[]);
  }
  return colliderFor(templates.get(o.m),o);
}
export function shipCollision(){
  if(ship)return ship;
  const built=buildShip(M),layout=loadContent('ship_layout.json',{});
  clean(built.group);
  const col=[...built.collider];
  for(const o of [...layout.objects??[],...layout.interact??[]])col.push(...geometryFor(o));
  ship=new Collider(col);col.forEach(g=>g.dispose());return ship;
}
function islandCollision(cx,cz){
  const key=`${cx},${cz}`;
  if(cache.has(key)){const c=cache.get(key);cache.delete(key);cache.set(key,c);return c;}
  const data=getChunk('canary',cx,cz);if(!data)return null;
  const terrain=new THREE.PlaneGeometry(32,32,32,32);terrain.rotateX(-Math.PI/2);
  const p=terrain.attributes.position;
  for(let i=0;i<p.count;i++)p.setXYZ(i,cx*32+i%33,data.h[i],cz*32+Math.floor(i/33));
  const col=[terrain];
  for(const o of [...data.objects,...data.interact])col.push(...geometryFor(o));
  const c=new Collider(col);col.forEach(g=>g.dispose());cache.set(key,c);
  while(cache.size>64){const old=cache.keys().next().value;cache.get(old).geometry.dispose();cache.delete(old);}
  return c;
}
export function objectColliders(zone,p){
  if(zone==='ship')return [shipCollision()];
  const cx=Math.floor(p[0]/32),cz=Math.floor(p[2]/32),list=[];
  for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++){const c=islandCollision(x,z);if(c)list.push(c);}
  return list;
}
export function contactAt(zone,p,radius,from=p){
  const start=new THREE.Vector3().fromArray(from),capsule={start,end:new THREE.Vector3().fromArray(p),radius};
  for(const c of objectColliders(zone,p))c.collide(capsule);
  return capsule.end.toArray();
}
export function surfaceAt(zone,origin,direction,maxDistance){
  const ray=new THREE.Ray(new THREE.Vector3().fromArray(origin),new THREE.Vector3().fromArray(direction));let best=null;
  for(const c of objectColliders(zone,origin)){const hit=c.bvh.raycastFirst(ray,THREE.DoubleSide);if(hit&&hit.distance<=maxDistance&&(!best||hit.distance<best.distance))best=hit;}
  for(const d of entities.allDefs())if(d.zone===zone&&d.toggleType==='door'&&entities.stateOf(d.id)?.visible!==false){
    const hit=rayBox(origin,direction,doorBox(d,entities.stateOf(d.id)?.open),maxDistance);
    if(hit&&(!best||hit.distance<best.distance))best={point:new THREE.Vector3().fromArray(hit.p),distance:hit.distance,face:{normal:new THREE.Vector3().fromArray(hit.normal)}};
  }
  return best;
}
export function clearObjectColliders(){ship?.geometry.dispose();ship=null;for(const c of cache.values())c.geometry.dispose();cache.clear();for(const list of templates.values())list.forEach(g=>g.dispose());templates.clear();}
