import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,MeshStandardMaterial,Object3D} from 'three';
import {duelView} from '../src/ui/duel-hud.js';
import {Warriors} from '../src/world/warriors.js';
const d=(over)=>({id:'duelist_young',name:'Юный воин',p:[168,2,255],r:0,state:'circle',player:7,score:[1,2],startsAt:1000,...over});

test('the duel board counts down, warns about the wind-up, calls the opening and shows the result',()=>{
 assert.equal(duelView({duelists:[d({player:null,state:'idle'})]},7),null,'nothing when not fighting');
 assert.equal(duelView({duelists:[d({player:9})]},7),null,'somebody else\'s bout');
 const ready=duelView({duelists:[d({state:'ready',startsAt:3500,score:[0,0]})]},7,1000);
 assert.match(ready.html,/Поединок · Юный воин/);assert.match(ready.html,/duel-count">3</);
 const wind=duelView({duelists:[d({state:'windup'})]},7);assert.equal(wind.tone,'danger');assert.match(wind.html,/Отступи/);
 const open=duelView({duelists:[d({state:'recover'})]},7);assert.equal(open.tone,'chance');assert.match(open.html,/бей/);
 assert.match(open.html,/Ты <b>1<\/b>.*<b>2<\/b> Юный воин/);
 const won=duelView({duelists:[d({player:null,state:'return',result:'player',lastPlayer:7,score:[3,1]})]},7);
 assert.equal(won.tone,'win');assert.match(won.html,/Победа/);
 assert.equal(duelView({duelists:[d({player:null,state:'return',result:'player',lastPlayer:8})]},7),null);
 assert.doesNotMatch(duelView({duelists:[d({name:'<b>x'})]},7).html,/<b>x/,'names are escaped');
});

test('warriors on the batey carry a macana and tell who to challenge and whom you may hit',()=>{
 const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
 const label=()=>{const o=new Object3D();o.draw=()=>{};return o;};
 const w=new Warriors(new Scene(),M,{labelFactory:label,kind:'duelist'});w.setZone('guanahani');
 const vet={id:'duelist_veteran',name:'Опытный воин',p:[175.5,2,255],r:1.57,state:'idle',player:null,score:[0,0],startsAt:0};
 w.applyDuel({duelists:[d({state:'idle',player:null}),vet]},7);
 const [young,veteran]=w.targets.map(o=>o.userData);
 assert.equal(young.kind,'duelist');assert.match(young.label,/E — вызвать/);assert.equal(young.mine,false);
 w.applyDuel({duelists:[d({state:'windup'}),{...vet,state:'circle',player:9}]},7);
 assert.match(w.map.get('duelist_young').rig.root.userData.label,/ЛКМ — удар/);assert.equal(w.map.get('duelist_young').rig.root.userData.mine,true);
 assert.equal(w.map.get('duelist_veteran').rig.root.userData.mine,false);assert.match(w.map.get('duelist_veteran').rig.root.userData.label,/бьётся/);
 let macana=false;w.map.get('duelist_young').rig.root.traverse(o=>{if(o.name==='macana')macana=true;});assert.ok(macana);
 for(const state of ['ready','approach','circle','windup','strike','recover','block','stagger','return','idle']){
  w.applyDuel({duelists:[d({state}),vet]},7);w.update(1/60);
  w.map.get('duelist_young').rig.root.traverse(o=>assert.ok([...o.position.toArray(),...o.rotation.toArray().slice(0,3)].every(Number.isFinite),state));
 }
 w.applyDuel({duelists:[]},7);assert.equal(w.map.size,0,'they leave the batey at night');
});
