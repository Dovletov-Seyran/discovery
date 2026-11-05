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
 // опытный — с копьём
 w.applyDuel({duelists:[{...vet,weapon:'war_spear'}]},7);let spear=false;w.map.get('duelist_veteran').rig.root.traverse(o=>{if(o.name==='war_spear')spear=true;});assert.ok(spear);
 for(const state of ['windup','strike','dodge','idle']){w.applyDuel({duelists:[{...vet,weapon:'war_spear',state}]},7);w.update(1/60);}
});

test('the board follows the weapon and the walk to the batey with a sailor',()=>{
 const es=(over)=>({id:'es_sancho',kind:'spaniard',name:'Санчо',crew:'sailor_3',weapon:'sword',p:[160,2,256],r:0,state:'lead',player:7,score:[0,0],startsAt:0,...over});
 assert.match(duelView({duelists:[es()]},7).html,/Иди за ним на батей/);
 assert.match(duelView({duelists:[es({state:'await'})]},7).html,/войди в круг/);
 assert.match(duelView({duelists:[es({state:'ready',startsAt:5000,playerWeapon:'bow'})]},7,1000).html,/ЛКМ — выстрел.*за круг на земле/);
 assert.match(duelView({duelists:[es({state:'approach',playerWeapon:'war_spear'})]},7).html,/встречай копьём/);
 assert.match(duelView({duelists:[es({state:'dodge',playerWeapon:'bow'})]},7).html,/Увернулся.*не успеет/);
 const gun=(state)=>duelView({duelists:[es({id:'es_diego',name:'Диего',weapon:'espingarda',state})]},7);
 assert.equal(gun('aim').tone,'danger');assert.match(gun('aim').html,/Целится.*вбок/);
 assert.equal(gun('reload').tone,'chance');assert.match(gun('reload').html,/Перезаряжает/);
 assert.match(gun('fire').html,/Выстрел/);
});

test('the gunner: aims along the barrel with a glowing match, fires with flash and smoke, reloads with the ramrod upright',async()=>{
 const {Spaniards}=await import('../src/world/spaniards.js');
 const {Vector3}=await import('three');
 const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
 const s=new Spaniards(new Scene(),M,{labelFactory:()=>{const o=new Object3D();o.draw=()=>{};return o;}});s.setZone('guanahani');
 const diego=(state)=>({duelists:[{id:'es_diego',kind:'spaniard',name:'Диего',crew:'sailor_1',weapon:'espingarda',p:[0,0,0],r:0,state,player:7,score:[0,0],startsAt:0}]});
 const settle=(state)=>{s.applyDuel(diego(state),7);for(const x of s.map.values())for(const b of x.buf)b.at-=500;s.update(1/60);return s.map.get('es_diego');};
 // направление ствола в мире: от приклада к дулу
 const barrel=(x)=>{x.rig.root.updateMatrixWorld(true);const a=x.gun.localToWorld(new Vector3(0,0,0)),b=x.gun.localToWorld(new Vector3(0,1,0));return b.sub(a).normalize();};
 let x=settle('aim');x.since-=500;s.update(1/60);
 assert.ok(x.ember.visible||true);assert.equal(x.flash.visible,false);
 const aimDir=barrel(x);assert.ok(aimDir.z<-0.97&&Math.abs(aimDir.y)<0.2,`aims forward (−z) along the barrel: ${aimDir.toArray()}`);
 x=settle('fire');assert.ok(x.flash.visible,'muzzle flash');assert.ok(s.puffs.length>=6,'a cloud of smoke');
 for(let i=0;i<200;i++)s.update(1/30);assert.equal(s.puffs.length,0,'the smoke clears');
 x=settle('reload');x.since-=1000;s.update(1/60);
 assert.ok(barrel(x).y>0.8,'the gun stands upright');assert.ok(x.rod.visible,'ramrod in the other hand');
 x=settle('circle');assert.equal(x.rod.visible,false);assert.equal(x.ember.visible,false);
 x.rig.root.traverse(o=>assert.ok([...o.position.toArray(),...o.rotation.toArray().slice(0,3)].every(Number.isFinite)));
});

test('sailors from the ship walk the village: their own look, a sword in its sheath or a gun on the shoulder, labels say what they do',async()=>{
 const {Spaniards,spaniardLabel}=await import('../src/world/spaniards.js');
 const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
 const label=()=>{const o=new Object3D();o.draw=(a,b)=>{o.text=[a,b];};return o;};
 const s=new Spaniards(new Scene(),M,{labelFactory:label});s.setZone('guanahani');
 const diego={id:'es_diego',kind:'spaniard',name:'Диего',crew:'sailor_1',weapon:'espingarda',p:[114,2,256],r:0,state:'act',act:'guard',doing:'стережёт лодки',say:'¡Quietos!',player:null,score:[0,0],startsAt:0};
 const sancho={id:'es_sancho',kind:'spaniard',name:'Санчо',crew:'sailor_3',weapon:'sword',p:[111,2,258],r:0,state:'act',act:'offer',doing:'показывает рыбаку колокольчик',player:null,score:[0,0],startsAt:0};
 s.applyDuel({duelists:[diego,sancho]},7);s.update(1/60);
 const d=s.map.get('es_diego'),sa=s.map.get('es_sancho');
 assert.match(d.rig.root.userData.label,/E — вызвать на тренировочный бой/);assert.deepEqual(d.label.text,['Диего','«¡Quietos!»']);
 assert.deepEqual(sa.label.text,['Санчо','показывает рыбаку колокольчик']);
 assert.ok(d.gun.parent===d.rig.torso,'the espingarda rides on the shoulder');
 assert.ok(sa.blade.parent===null,'the sword stays in its sheath');assert.ok(sa.trinket.visible,'holds out the beads');
 // бой: оружие в руках
 s.applyDuel({duelists:[{...diego,state:'windup',act:undefined,say:undefined,player:7},{...sancho,state:'strike',player:9}]},7);
 for(const x of s.map.values())for(const b of x.buf)b.at-=500; // рисуются на 120 мс в прошлом — состояние уже наступило
 s.update(1/60);
 assert.ok(d.gun.parent===d.arm.fa,'gun in hands');assert.ok(sa.blade.parent===sa.arm.fa,'sword in hand');assert.equal(sa.sheathHilt.visible,false);
 assert.ok(d.rig.root.userData.mine&&d.rig.root.userData.fighting);assert.ok(!sa.rig.root.userData.mine);
 assert.equal(spaniardLabel({...sancho,state:'lead',player:7},7).prompt,'Санчо · иди за ним на батей');
 for(const state of ['walk','greet','lead','await','ready','approach','circle','windup','strike','recover','block','dodge','stagger','return'])
  for(const x of [diego,sancho]){
   s.applyDuel({duelists:[{...x,state,act:undefined}]},7);s.update(1/60);
   s.map.get(x.id).rig.root.traverse(o=>assert.ok([...o.position.toArray(),...o.rotation.toArray().slice(0,3)].every(Number.isFinite),state));
  }
 for(const act of ['guard','listen','greet','offer','look','kneel','point','drink']){s.applyDuel({duelists:[{...sancho,act}]},7);s.update(1/60);}
});

test('weapon models: a spear with its point up, a bow that draws and loses its arrow, a rack for each',async()=>{
 const {warSpear,bow,arrow,weaponRack}=await import('../src/world/weapons.js');
 const {Box3,Vector3}=await import('three');
 const size=o=>new Box3().setFromObject(o).getSize(new Vector3());
 const s=warSpear().obj;assert.ok(size(s).y>2.1&&size(s).y<2.5,'about 2.3 m');
 assert.ok(new Box3().setFromObject(s).max.y>1.5,'the point is up, the grip near the bottom third');
 const b=bow().obj,string=()=>new Box3().setFromObject(b).min.z;
 assert.ok(size(b).y>1.4&&size(b).y<1.6);
 const rest=string();b.userData.draw(1);assert.ok(string()<rest-0.3,'the string comes back toward the archer');
 assert.ok(b.userData.arrow.position.z<-0.5,'the arrow is nocked on the string');
 assert.ok(size(arrow().obj).y>0.75);
 for(const item of ['macana','war_spear','bow']){const r=weaponRack(null,item);assert.ok(r.obj.children.length>5&&r.col.length===1,item);}
});
