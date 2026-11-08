import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,MeshStandardMaterial,Object3D} from 'three';
import {Crowd} from '../src/world/crowd.js';
import {Warriors} from '../src/world/warriors.js';

const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
const label=()=>{const o=new Object3D();o.draw=(a)=>{o.text=a;};return o;};
const bout=(over={})=>({id:'es_sancho',kind:'spaniard',name:'Санчо',weapon:'sword',p:[163,2,255],r:0,state:'circle',player:7,score:[0,0],startsAt:0,ring:{c:[161.6,255],rx:7.7,rz:9.9},...over});
const finite=(o)=>{o.traverse(x=>assert.ok([...x.position.toArray(),...x.rotation.toArray().slice(0,3)].every(Number.isFinite)));};

test('a bout draws a crowd: villagers walk up to the circle, face it and clap; on a bout with a sailor two shipmates come too',()=>{
  const c=new Crowd(new Scene(),M,{labelFactory:label,heightAt:()=>2});c.setZone('guanahani');
  c.apply([bout()],7);
  const b=[...c.bouts.values()][0];
  assert.ok(b.people.length>=5,'a crowd, not one man');
  assert.equal(b.people.filter(p=>p.side==='sailor').length,2,'Pedro and Gil cheer for Sancho');
  for(const p of b.people){let n=0;p.rig.root.traverse(o=>{if(o.isMesh)n++;});assert.ok(n<=14,`a spectator is ${n} meshes, not 33`);}
  for(const p of b.people){
    const d=((p.spot[0]-161.6)/7.7)**2+((p.spot[1]-255)/9.9)**2;assert.ok(d>1,'outside the line');
    assert.ok(Math.hypot(p.spot[0]-171,p.spot[1]-257)>1.8,'not in the fire');
  }
  // те же места у всех клиентов
  const c2=new Crowd(new Scene(),M,{labelFactory:label,heightAt:()=>2});c2.apply([bout()],9);
  assert.deepEqual([...c2.bouts.values()][0].people.map(p=>p.spot),b.people.map(p=>p.spot));
  for(let i=0;i<500;i++)c.update(1/30);
  assert.ok(b.people.every(p=>p.state==='watch'),'all arrived');
  for(const p of b.people)assert.ok(Math.hypot(p.rig.root.position.x-p.spot[0],p.rig.root.position.z-p.spot[1])<0.2);
  finite(c.group);
});

test('the crowd cheers for its own: Taíno jump when the player scores, sailors groan; a block makes everyone gasp; then they go home',()=>{
  const c=new Crowd(new Scene(),M,{labelFactory:label,heightAt:()=>2});c.setZone('guanahani');
  c.apply([bout()],7);for(let i=0;i<500;i++)c.update(1/30);
  const b=[...c.bouts.values()][0],taino=b.people.filter(p=>p.side==='taino'),sailors=b.people.filter(p=>p.side==='sailor');
  c.hit({kind:'duel',by:7,target:'es_sancho',weapon:'macana',score:[1,0]});
  assert.ok(taino.every(p=>p.state==='cheer'));assert.ok(sailors.every(p=>p.state==='groan'));
  assert.ok(b.people.some(p=>p.label?.visible),'somebody shouts');
  c.update(1/30);finite(c.group);
  c.hit({kind:'duel',by:7,target:'es_sancho',weapon:'macana',blocked:true,score:[1,0]});
  assert.ok(b.people.every(p=>p.state==='ooh'));
  c.hit({kind:'duel',by:'es_sancho',target:7,weapon:'sword',score:[1,1]});
  assert.ok(sailors.every(p=>p.state==='cheer')&&taino.every(p=>p.state==='groan'));
  c.update(1/30);finite(c.group);
  // конец боя: победа игрока — таино ликуют, потом расходятся
  c.apply([bout({player:null,state:'return',result:'player',lastPlayer:7,ring:undefined})],7);
  assert.ok(b.over);assert.ok(taino.every(p=>p.state==='cheer'));
  for(const p of b.people)p.leaveAt=0.0001;
  for(let i=0;i<900;i++)c.update(1/30);
  assert.equal(c.bouts.size,0,'everyone went home');assert.equal(c.group.children.length,0);
});

test('the cacique\'s warriors between bouts: walk with the weapon on the shoulder, shadow-fight, stretch, burn the spear point, watch',()=>{
  const w=new Warriors(new Scene(),M,{labelFactory:label,kind:'duelist'});w.setZone('guanahani');
  const d=(state,act,o={})=>({duelists:[{id:'duelist_veteran',name:'Опытный воин',weapon:'war_spear',p:[175.5,2,255],r:1.57,state,act,doing:'обжигает остриё копья',player:null,score:[0,0],startsAt:0,...o}]});
  w.applyDuel(d('act','sharpen'),7);
  const x=w.map.get('duelist_veteran');assert.match(x.rig.root.userData.label,/E — вызвать/);assert.equal(x.sub,'обжигает остриё копья');
  for(const [state,act] of [['walk'],['act','practice'],['act','stretch'],['act','sharpen'],['act','watch']]){
    w.applyDuel(d(state,act),7);for(const y of w.map.values())for(const b of y.buf)b.at-=500;
    for(let i=0;i<20;i++)w.update(1/30);
    assert.equal(x.state,state);finite(x.rig.root);
  }
});

test('a thrown spear flies along an arc from the hand to where it lands',async()=>{
  const {arcPoint}=await import('../src/world/weapons.js');const {Vector3}=await import('three');
  const a=new Vector3(0,1.5,0),b=new Vector3(0,0.2,-10);
  assert.deepEqual(arcPoint(a,b,1.2,0).toArray(),a.toArray());assert.deepEqual(arcPoint(a,b,1.2,1).toArray().map(v=>+v.toFixed(6)),b.toArray());
  const mid=arcPoint(a,b,1.2,0.5);assert.ok(mid.y>(a.y+b.y)/2+1.1&&Math.abs(mid.z+5)<1e-9,'above the straight line in the middle');
});
