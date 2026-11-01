import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene,PerspectiveCamera,MeshStandardMaterial} from 'three';
import {Island} from '../src/world/island.js';
import {Controller} from '../src/game/controller.js';
import {generateCanary} from '../../server/world/terrain.js';

test('actual Front 1 island and Front 2 controller: all three spawns survive delayed chunk loading',()=>{
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  document.exitPointerLock=()=>{document.pointerLockElement=null;};
  const data=JSON.parse(readFileSync(new URL('../../content/canary_layout.json',import.meta.url)));
  const {chunks,layout}=generateCanary(data,{warn:()=>{}});
  const material=new MeshStandardMaterial(),M={get:()=>material,canvas:()=>material,person:material};
  const island=new Island(new Scene(),M);
  const world={zone:'canary',island,camera:new PerspectiveCamera(),collide:c=>island.collide(c),groundHeight:(...args)=>island.groundHeight(...args)};
  for(const spawn of Object.values(layout.spawns)){
    for(const key of [...island.chunks.keys()])island.remove(key);
    const canvas={};document.pointerLockElement=canvas;
    const c=new Controller(world,canvas);c.teleport(spawn.p,spawn.r);c.setMode('play');
    for(let i=0;i<120;i++)c.update(1/60,i/60);
    assert.equal(c.position.y,spawn.p[1],'gravity must wait for terrain');
    const cx=Math.floor(spawn.p[0]/32),cz=Math.floor(spawn.p[2]/32);
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
      const key=`${cx+dx},${cz+dz}`,chunk=chunks.get(key);if(chunk)island.add(key,chunk);
    }
    for(let i=0;i<120;i++)c.update(1/60,i/60);
    const ground=island.heightAt(c.position.x,c.position.z);
    assert.ok(c.position.y>=ground-0.1,`spawn ${spawn.p}: ${c.position.y} below ${ground}`);
    assert.ok(c.position.y>-2.5,'server rescue must not be needed');
    c.dispose();
  }
  for(const key of [...island.chunks.keys()])island.remove(key);material.dispose();
});
