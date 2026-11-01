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

test('world_patch renders rations, allows targeting, removes pickup and restores on full reconnect',()=>{
  const {world}=fixture(),patch={op:'spawn',id:'ration',kind:'item',model:'biscuit',zone:'ship',p:[1,0,1],state:{item:'biscuit',label:'Сухари'}};
  world.patches.apply({full:true,ops:[patch]});
  assert.equal(world.patches.interactables[0].userData.item,'biscuit');
  world.patches.apply({ops:[{op:'set',id:'ration',p:[2,0,1]}]});
  assert.equal(world.patches.spawned.get('ration').obj.position.x,2);
  world.patches.apply({ops:[{op:'remove',id:'ration'}]});assert.equal(world.patches.interactables.length,0);
  world.patches.apply({full:true,ops:[patch]});assert.equal(world.patches.interactables.length,1);
  world.zone='canary';world.patches.update();assert.equal(world.patches.interactables.length,0);
  world.patches.apply({full:true,ops:[]});assert.equal(world.patches.group.children.length,0);
});

test('lantern, flag, fog, static-object removal and reset actually affect the scene',()=>{
  const {world,light,staticItem}=fixture();
  world.patches.apply({ops:[{op:'set',id:'lantern',kind:'lantern',state:{lit:true,brightness:.5}},{op:'set',id:'flag_castile',state:{raised:true}},{op:'set',id:'fog',state:{density:.6}},{op:'remove',id:'old'}]});
  assert.equal(light.intensity,2);assert.equal(world.patches.flag.visible,true);assert.ok(world.scene.fog.density>.03);assert.equal(staticItem.visible,false);
  world.patches.apply({ops:[{op:'remove',id:'flag_castile'}]});assert.equal(world.patches.flag.visible,false);
  world.patches.apply({full:true,ops:[]});assert.equal(staticItem.visible,true);assert.equal(world.patches.flag.visible,false);
});

test('spawned water barrels have collisions, goods are display-only, and zones isolate both',()=>{
  const {world}=fixture();
  world.patches.apply({ops:[{op:'spawn',id:'water',kind:'water_barrel',model:'barrel',zone:'ship',p:[3,0,1]},{op:'spawn',id:'goods',kind:'goods',model:'cheese',zone:'canary',p:[270,3,290]}]});
  const cap={start:new Vector3(3.5,.35,1),end:new Vector3(3.5,1.45,1),radius:.35};world.patches.collide(cap);assert.ok(Math.abs(cap.start.x-3.5)+Math.abs(cap.start.z-1)>.1);
  assert.equal(world.patches.interactables.length,0);
  world.zone='canary';world.patches.update();assert.equal(world.patches.spawned.get('water').obj.visible,false);assert.equal(world.patches.spawned.get('goods').obj.visible,true);
});


test('sail command deforms actual sail geometry and full reset restores it',async()=>{
 const {buildShip}=await import('../src/world/ship.js');
 const {world}=fixture(),ship=buildShip({...world.M,person:new MeshStandardMaterial()});world.env.sails=ship.sails;
 const before=ship.sails[0].m.geometry.attributes.position.array.slice();
 world.patches.apply({ops:[{op:'set',id:'sails',state:{furled:true}}]});
 assert.ok(ship.sails.every(s=>s.k===1));assert.notDeepEqual(ship.sails[0].m.geometry.attributes.position.array,before);
 world.patches.apply({full:true,ops:[]});assert.ok(ship.sails[0].m.geometry.attributes.position.array.every((v,i)=>Math.abs(v-before[i])<1e-6));
});

test('earned water barrels leave the captain route and the ladder clear',async()=>{
 const {readFileSync}=await import('node:fs'),{buildShip}=await import('../src/world/ship.js'),{buildLayout}=await import('../src/world/props.js'),{Collider}=await import('../src/world/collision.js');
 const state=await import('../../server/game/world-state.js'),{npcActivity}=await import('../../shared/npc-activity.js');
 const layout=JSON.parse(readFileSync(new URL('../../content/ship_layout.json',import.meta.url)));
 const {world}=fixture();world.M.person=new MeshStandardMaterial();
 state.load(null);state.onQuestDone('q_water');state.onSceneStart({id:'ship_evening'});world.patches.apply(state.fullMessage());
 const ship=buildShip(world.M),built=buildLayout(world.M,layout);
 const collider=new Collider([...ship.collider,...built.col,...[...world.patches.spawned.values()].map(e=>e.col.geometry)]);
 const captain=layout.npcs.find(n=>n.id==='columbus');
 for(let t=0;t<150;t+=.2){const p=npcActivity(captain,t,'ship_evening').p;
  const capsule={start:new Vector3(p[0],p[1]+.45,p[2]),end:new Vector3(p[0],p[1]+1.45,p[2]),radius:.3};
  const hit=collider.collide(capsule);assert.ok(Math.hypot(hit.delta.x,hit.delta.z)<.015,`route blocked at ${p}`);
 }
 state.load(null);
});
