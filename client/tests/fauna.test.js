import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene,Group,Vector3,PerspectiveCamera} from 'three';
import {Fauna} from '../src/world/fauna.js';
const canary=JSON.parse(readFileSync(new URL('../../content/canary_layout.json',import.meta.url),'utf8'));
// Мир-заглушка: плоский остров, камера в городе, общий сдвиг часов как у NPC
function world(zone='canary'){
 const camera=new PerspectiveCamera();camera.position.set(256,2,300);
 return {zone,scene:new Scene(),ship:new Group(),camera,npcClockOffset:0,island:{heightAt:()=>3},players:{map:new Map()}};
}
const positions=f=>f.herds.get('canary').agents.map(a=>a.p.map(v=>Math.round(v*100)));

test('на Канарах 15–20 жителей и животные; ≤ 80 вызовов отрисовки на всех',()=>{
 const f=new Fauna(world(),{layouts:{canary}});f.update(.016);
 const herd=f.herds.get('canary'),kinds=herd.agents.map(a=>a.kind);
 const people=kinds.filter(k=>k==='human'||k==='woman').length;
 assert.ok(people>=15&&people<=20,`жителей ${people}`);
 for(const k of ['goat','chicken','dog','gull'])assert.ok(kinds.includes(k),k);
 assert.ok(f.stats().drawCalls<=40,`вызовов отрисовки ${f.stats().drawCalls}`);
});

test('одинаково у всех клиентов: маршруты считаются от общего времени',()=>{
 const realNow=Date.now;Date.now=()=>1_800_000_000_000;
 try{
  const a=new Fauna(world(),{layouts:{canary}}),b=new Fauna(world(),{layouts:{canary}});
  a.update(.016);b.update(.016);
  assert.deepEqual(positions(a),positions(b));
 }finally{Date.now=realNow;}
});

test('автомат: от выстрела разбегаются, к тому, кто ест, подходят козы и собаки, на танец собираются люди',()=>{
 const f=new Fauna(world(),{layouts:{canary}});f.update(.016);
 const herd=f.herds.get('canary'),goat=herd.agents.find(a=>a.kind==='goat'),person=herd.agents.find(a=>a.kind==='human');
 const at=(a,dx=0)=>[a.p[0]+dx,3,a.p[1]];
 f.react({type:'eat',zone:'canary',p:at(goat,3)});f.update(.016);assert.equal(goat.mode,'beg');
 f.react({type:'scare',zone:'canary',p:at(goat,2)});f.update(.016);assert.equal(goat.mode,'flee');
 const before=Math.hypot(goat.p[0]-goat.goal[0],goat.p[1]-goat.goal[1]);for(let i=0;i<30;i++)f.update(.05);
 assert.ok(Math.hypot(goat.p[0]-goat.goal[0],goat.p[1]-goat.goal[1])<before,'бежит прочь');
 f.react({type:'dance',zone:'canary',p:at(person,5)});f.update(.016);assert.equal(person.mode,'dance');
 // корабельные события не трогают остров
 const goat2=herd.agents.filter(a=>a.kind==='goat')[1];goat2.mode='route';
 f.react({type:'scare',zone:'ship',p:at(goat2)});f.update(.016);assert.equal(goat2.mode,'route');
});

test('настройка «нет» убирает всех, «половина» — примерно половину',()=>{
 const f=new Fauna(world(),{layouts:{canary}});f.update(.016);const all=f.stats().creatures;
 f.setDensity(.5);f.update(.016);const half=f.stats().creatures;assert.ok(half<all*.65&&half>all*.35,`${half} из ${all}`);
 f.setDensity(0);f.update(.016);assert.equal(f.stats().creatures,0);
});

test('на корабле кот и крысы, на Гуанахани попугаи, чайки и игуаны (без собак и лошадей)',()=>{
 const ship=new Fauna(world('ship'));ship.update(.016);
 assert.deepEqual([...new Set(ship.herds.get('ship').agents.map(a=>a.kind))].sort(),['cat','rat']);
 const g=new Fauna(world('guanahani'));g.update(.016);
 const kinds=new Set(g.herds.get('guanahani').agents.map(a=>a.kind));
 assert.deepEqual([...kinds].sort(),['gull','iguana','parrot']);
});

test('колодец: при наборе воды ворот крутится, ведро опускается и возвращается',async()=>{
 const {MeshStandardMaterial}=await import('three'),{ISLAND_MODELS}=await import('../src/world/islandModels.js'),{animateProp}=await import('../src/world/props.js');
 const m=new MeshStandardMaterial(),{obj}=ISLAND_MODELS.well({get:()=>m,canvas:()=>m});
 const w=obj.userData.winch;assert.ok(w,'у колодца есть ворот');
 obj.userData.winchAt=0;animateProp(obj,2000);
 assert.ok(w.bucket.position.y<0.5,'ведро в колодце');assert.notEqual(w.axle.rotation.x,0);
 animateProp(obj,4100);assert.equal(obj.userData.winchAt,null);assert.ok(Math.abs(w.bucket.position.y-1.1)<1e-6,'ведро вернулось');
});

test('ворот колодца остаётся подвижным и после запекания модели в чанке острова',async()=>{
 const {MeshStandardMaterial}=await import('three'),{buildInteract}=await import('../src/world/props.js'),{ISLAND_MODELS}=await import('../src/world/islandModels.js');
 const m=new MeshStandardMaterial(),{obj}=buildInteract({get:()=>m,canvas:()=>m},{id:'well',m:'well',p:[0,0,0],kind:'well'},ISLAND_MODELS);
 const w=obj.userData.winch;let inTree=false;obj.traverse(o=>{if(o===w?.bucket)inTree=true;});
 assert.ok(w&&inTree,'ворот и ведро в сцене');
});
