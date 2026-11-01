import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,PerspectiveCamera} from 'three';
import {buildLayout} from '../src/world/props.js';
import {Interaction} from '../src/game/interact.js';
const layout=JSON.parse(readFileSync(new URL('../../content/ship_layout.json',import.meta.url),'utf8'));
const mat=new MeshStandardMaterial(),M={get:()=>mat,canvas:()=>mat,person:mat};
// Вечером праздник: прицел должен находить и стол с картами, и круг танцующих (у него нет модели)
for(const id of ['dance','cards','wine_barrel'])test(`прицел попадает в «${id}» на празднике`,()=>{
 const built=buildLayout(M,{...layout,interact:layout.interact.filter(o=>o.id===id),npcs:[]});
 const target=built.interactables.find(t=>t.userData.id===id),o=layout.interact.find(x=>x.id===id);
 const camera=new PerspectiveCamera(70,1.6,.05,100);camera.position.set(o.p[0]+1.8,1.6,o.p[2]+1.8);camera.lookAt(o.p[0],o.p[1]+(id==='cards'?.02:.5),o.p[2]);camera.updateMatrixWorld(true);
 target.updateMatrixWorld(true);
 assert.equal(new Interaction({camera,interactables:[target]}).target()?.id,id);
});
