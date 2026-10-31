import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene,PerspectiveCamera,MeshStandardMaterial} from 'three';
import {Chunks} from '../src/world/chunks.js';
import {Island} from '../src/world/island.js';
import {Controller} from '../src/game/controller.js';
import {generateCanary} from '../../server/world/terrain.js';
import lodPlugin from '../src/world/islandLodPlugin.js';
test('real streamed island and controller stay above ground while LOD + payload remain under 10%',async()=>{
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.pointerLockElement=null;
 const source=await lodPlugin().load.call({addWatchFile(){}},'\0virtual:island-lod'),lod=JSON.parse(source.slice('export default '.length,-1));
 const layout=JSON.parse(readFileSync(new URL('../../content/canary_layout.json',import.meta.url))),generated=generateCanary(layout,{warn(){}});
 const ship=JSON.parse(readFileSync(new URL('../../content/ship_layout.json',import.meta.url)));
 const total=[...generated.chunks.values()].reduce((n,c)=>n+new TextEncoder().encode(JSON.stringify(c)).length,0)+JSON.stringify(ship).length;
 const material=new MeshStandardMaterial(),M={get:()=>material,canvas:()=>material,person:material};
 const island=new Island(new Scene(),M),chunks=new Chunks(),queue=[];
 chunks.setBuilder('canary',island);chunks.setWorldMeta({totalChunks:257,totalBytes:total,cacheLimit:25,zones:{canary:{chunks:256}}});
 chunks.setStaticData('lod',lod.byteLength);chunks.setStaticData('ship',new TextEncoder().encode(JSON.stringify(ship)).length);
 chunks.setStaticData('paths',new TextEncoder().encode(JSON.stringify(layout.paths)).length);
 chunks.setZone('canary');chunks.setSender(m=>{if(m.t==='chunk_req')for(const key of m.keys)queue.push(key);});
 const world={zone:'canary',island,camera:new PerspectiveCamera(),groundHeight:(...args)=>island.groundHeight(...args),collide:c=>island.collide(c)};
 const canvas={focus(){}};const controller=new Controller(world,canvas);controller.teleport(generated.layout.spawns.piloto.p);controller.setMode('play');controller.lock();controller.keys.add('KeyW');
 const start=controller.position.clone();
 for(let i=0;i<420;i++){
  chunks.update(world.camera.position,.05);
  for(let n=0;n<2&&queue.length;n++){const key=queue.shift(),data=generated.chunks.get(key);if(data)chunks.receive('canary',key,data);}
  controller.update(.05,i*.05);
  const floor=island.heightAt(controller.position.x,controller.position.z);
  if(floor!==null)assert.ok(controller.position.y>=floor-.12,`fell under terrain at ${controller.position.toArray()}`);
  assert.ok(chunks.stats().bytes<=Math.floor(total*.10));assert.ok(chunks.stats().loaded<=25);
 }
 assert.ok(controller.position.distanceTo(start)>12,'movement must not remain blocked by the reduced cache');
 controller.dispose();for(const key of [...island.chunks.keys()])island.remove(key);material.dispose();
});
