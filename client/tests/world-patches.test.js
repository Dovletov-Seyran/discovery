import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene,Group,MeshStandardMaterial,PointLight,FogExp2,Vector3 } from 'three';
import { WorldPatches } from '../src/world/world-patches.js';

function fixture() {
  const mat=new MeshStandardMaterial(),scene=new Scene();scene.fog=new FogExp2(0,0.01);
  const light=new PointLight();light.position.set(0,.2,-4.6);scene.add(light);
  const staticItem=new Group();staticItem.position.set(1,0,1);staticItem.userData.id='old';scene.add(staticItem);
  const world={scene,ship:new Group(),zone:'ship',M:{get:()=>mat,canvas:()=>mat},env:{sails:[],lamps:[light]},layout:{interact:[{id:'lantern',p:[0,0,-4.6]}]},entity:id=>id==='old'?staticItem:null,chunks:{setStaticData(){}}};
  world.patches=new WorldPatches(world);return {world,light,staticItem};
}

test('lantern, flag, fog and static-object removal reach the scene; full reset restores them',()=>{
  const {world,light,staticItem}=fixture();
  world.patches.apply({ops:[{op:'set',id:'lantern',kind:'lantern',state:{lit:true,brightness:.5}},{op:'set',id:'flag_castile',state:{raised:true}},{op:'set',id:'fog',state:{density:.6}},{op:'remove',id:'old'}]});
  world.patches.update();
  // окружение каждый кадр учитывает поправки (environment.js): фонарь горит вполсилы, туман густой
  assert.deepEqual(world.env.lampPatch.get(light),{lit:true,brightness:.5});
  assert.ok(world.env.fogOverride>.03);assert.equal(world.patches.flag.visible,true);assert.equal(staticItem.visible,false);
  world.patches.apply({ops:[{op:'remove',id:'flag_castile'}]});world.patches.update();assert.equal(world.patches.flag.visible,false);
  world.patches.apply({full:true,ops:[]});world.patches.update();
  assert.equal(staticItem.visible,true);assert.equal(world.env.lampPatch,null);assert.equal(world.env.fogOverride,null);
});

test('only recomputes after a patch, layout load or zone change, not every frame',()=>{
  const {world}=fixture();let looked=0;const entity=world.entity;world.entity=id=>{looked++;return entity(id);};
  world.patches.apply({ops:[{op:'set',id:'fog',state:{density:.3}}]});
  for(let i=0;i<100;i++)world.patches.update();
  assert.equal(looked,1);
  world.patches.invalidate();world.patches.update();assert.equal(looked,2);
});

test('spawned objects are left to WorldObjects (one renderer for items and props)',()=>{
  const {world}=fixture();
  world.patches.apply({ops:[{op:'spawn',id:'ration_1',kind:'item',item:'biscuit',zone:'ship',p:[1,0,1]}]});
  assert.equal(world.patches.states.size,0);
});

test('sail command deforms actual sail geometry and full reset restores it',async()=>{
 const {buildShip}=await import('../src/world/ship.js');
 const {world}=fixture(),ship=buildShip({...world.M,person:new MeshStandardMaterial()});world.env.sails=ship.sails;
 const before=ship.sails[0].m.geometry.attributes.position.array.slice();
 world.patches.apply({ops:[{op:'set',id:'sails',state:{furled:true}}]});world.patches.update();
 assert.ok(ship.sails.every(s=>s.k===1));assert.notDeepEqual(ship.sails[0].m.geometry.attributes.position.array,before);
 world.patches.apply({full:true,ops:[]});world.patches.update();assert.ok(ship.sails[0].m.geometry.attributes.position.array.every((v,i)=>Math.abs(v-before[i])<1e-6));
});

test('earned water barrels leave the captain route and the ladder clear',async()=>{
 const {readFileSync}=await import('node:fs'),{buildShip}=await import('../src/world/ship.js'),{buildLayout}=await import('../src/world/props.js'),{Collider}=await import('../src/world/collision.js');
 const state=await import('../../server/game/world-state.js'),{npcActivity}=await import('../../shared/npc-activity.js');
 const layout=JSON.parse(readFileSync(new URL('../../content/ship_layout.json',import.meta.url)));
 const {world}=fixture();world.M.person=new MeshStandardMaterial();
 state.load(null);state.onQuestDone('q_water');state.onSceneStart({id:'ship_evening'});
 const ship=buildShip(world.M),built=buildLayout(world.M,layout);
 const {BoxGeometry}=await import('three');
 const barrels=state.fullMessage().ops.filter(o=>o.id.startsWith('water_barrel')).map(o=>new BoxGeometry(.66,.95,.66).translate(o.p[0],o.p[1]+.475,o.p[2]));
 assert.equal(barrels.length,3);
 const collider=new Collider([...ship.collider,...built.col,...barrels]);
 const captain=layout.npcs.find(n=>n.id==='columbus');
 for(let t=0;t<150;t+=.2){const p=npcActivity(captain,t,'ship_evening').p;
  const capsule={start:new Vector3(p[0],p[1]+.45,p[2]),end:new Vector3(p[0],p[1]+1.45,p[2]),radius:.3};
  const hit=collider.collide(capsule);assert.ok(Math.hypot(hit.delta.x,hit.delta.z)<.015,`route blocked at ${p}`);
 }
 state.load(null);
});
