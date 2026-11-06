import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Scene,MeshStandardMaterial,Object3D} from 'three';

test('a spear, a bow and a macana lie flat on the ground, the long side along the ground',async()=>{
  const {worldItemModel}=await import('../src/game/world-item-model.js');
  const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
  for(const [item,len] of [['war_spear',2.2],['bow',1.3],['macana',0.85]]){
    const m=worldItemModel(M,item,item),s=new Box3().setFromObject(m).getSize(new Vector3());
    assert.ok(s.y<0.12,`${item} is flat (${s.y.toFixed(2)} m high)`);
    assert.ok(Math.max(s.x,s.z)>len,`${item} lies full length`);
  }
});

test('the gunner holds the espingarda at the ready in a bout: barrel forward and down, not butt first',async()=>{
  const {Spaniards}=await import('../src/world/spaniards.js');
  const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
  const s=new Spaniards(new Scene(),M,{labelFactory:()=>{const o=new Object3D();o.draw=()=>{};return o;}});s.setZone('guanahani');
  for(const state of ['circle','ready','approach','recover']){
    s.applyDuel({duelists:[{id:'es_diego',kind:'spaniard',name:'Диего',crew:'sailor_1',weapon:'espingarda',p:[0,0,0],r:0,state,player:7,score:[0,0],startsAt:0}]},7);
    for(const x of s.map.values())for(const b of x.buf)b.at-=500;s.update(1/60);
    const x=s.map.get('es_diego');x.rig.root.updateMatrixWorld(true);
    const a=x.gun.localToWorld(new Vector3(0,0,0)),b=x.gun.localToWorld(new Vector3(0,1,0)),d=b.sub(a).normalize();
    assert.ok(d.z<-0.75&&d.y<-0.2,`${state}: barrel forward (−z) and down, got ${d.toArray().map(v=>v.toFixed(2))}`);
  }
});
