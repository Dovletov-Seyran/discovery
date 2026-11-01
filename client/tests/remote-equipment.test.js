import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Object3D,MeshStandardMaterial,Vector3,Box3} from 'three';
import {person,pose,ROLE_LOOK} from '../src/world/people.js';
import {RemoteEquipment} from '../src/game/remote-equipment.js';
import {Players} from '../src/world/players.js';
import {ITEM_RULES} from '../../shared/item-actions.js';
const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material};
function actor(){const rig=person(material,ROLE_LOOK.grumete);return {rig,eq:new RemoteEquipment(rig,M)};}
function action(kind,item,seq=1,rev=1){return {kind,item,seq,equipmentRev:rev,startedAt:1000,duration:kind==='swing'?580:1100,zone:'ship'};}
function update(rig,eq,now,base='stand'){pose(rig,base,1);eq.update(now);rig.root.updateMatrixWorld(true);}

test('every usable inventory item has a readable third-person model attached to the actual hand',()=>{
 const {rig,eq}=actor();let rev=0;
 for(const item of Object.keys(ITEM_RULES)){
  eq.setEquipment(item,++rev);update(rig,eq,1000);assert.ok(eq.model,item);
  assert.equal(eq.grip.parent,rig.arms.find(a=>a.s===1).fa);
  const size=new Box3().setFromObject(eq.model).getSize(new Vector3());assert.ok(size.length()>.15,item);
 }
 eq.dispose();assert.equal(eq.grip.parent,null);
});
test('a sword swing moves the blade through space and returns to holding pose while walking still works',()=>{
 const {rig,eq}=actor();eq.setEquipment('sword',1);update(rig,eq,1000);
 const tip=()=>new Vector3(0,1.12,0).applyMatrix4(eq.model.matrixWorld),rest=tip();
 eq.setAction(action('swing','sword'));update(rig,eq,1290);
 assert.ok(tip().distanceTo(rest)>.45);assert.ok(Math.abs(rig.torso.rotation.y)>.1);
 update(rig,eq,1700);assert.ok(tip().distanceTo(rest)<.001);assert.equal(eq.action,null);
 update(rig,eq,1800,'walk');assert.ok(Math.abs(rig.legs[0].th.rotation.x)>.1);assert.equal(eq.item,'sword');
 eq.dispose();
});
test('last food serving remains in the eating animation, then disappears; a newer equip cancels an old action',()=>{
 const {rig,eq}=actor();eq.setEquipment(null,2);eq.setAction(action('eat','cheese',1,2));update(rig,eq,1400);
 assert.equal(eq.item,'cheese');assert.ok(rig.arms[1].ua.rotation.x<-1);
 update(rig,eq,2200);assert.equal(eq.item,null);
 eq.setAction(action('drink','cup',2,2));eq.setEquipment('sword',3);update(rig,eq,1400);assert.equal(eq.item,'sword');assert.equal(eq.action,null);
 eq.dispose();
});
test('duplicate/stale actions do not replay after completion and stale equipment does not overwrite a newer choice',()=>{
 const {rig,eq}=actor();eq.setEquipment('sword',3);const swing=action('swing','sword',5,3);
 eq.setAction(swing);update(rig,eq,1800);eq.setAction(swing);update(rig,eq,1300);assert.equal(eq.action,null);
 eq.setEquipment('wine',2);assert.equal(eq.equipped,'sword');
 eq.setAction(action('swing','sword',4,3));assert.equal(eq.action,null);eq.dispose();
});
test('a gun shot flashes and recoils only during its server-confirmed action',()=>{
 const {rig,eq}=actor();eq.setEquipment('espingarda',1);const shot={...action('shot','espingarda'),duration:400};eq.setAction(shot);update(rig,eq,1040);
 assert.equal(eq.flash.visible,true);update(rig,eq,1250);assert.equal(eq.flash.visible,false);update(rig,eq,1500);assert.equal(eq.action,null);eq.dispose();
});
function labels(){const o=new Object3D();o.draw=()=>{};return o;}
test('late join/snapshot restores held item and ongoing action, while other zones hide their avatars',()=>{
 const peers=new Players(new Scene(),M,{labelFactory:labels});peers.clockOffset=1000-Date.now();
 peers.upsert(7,{name:'Crew',role:'piloto',zone:'ship',p:[1,0,2],r:0,equipped:'sword',equipmentRev:1,action:action('swing','sword')});
 peers.update(.016);assert.equal(peers.map.get(7).equipment.item,'sword');
 peers.setZone('canary');peers.update(.016);assert.equal(peers.map.get(7).rig.root.visible,false);
 peers.snapshot([{id:7,name:'Crew',role:'piloto',zone:'canary',p:[200,3,300],r:1,a:'idle',equipped:'cup',equipmentRev:2,action:null}],1,Date.now());
 peers.update(.016);assert.equal(peers.map.get(7).rig.root.visible,true);assert.equal(peers.map.get(7).equipment.item,'cup');
 peers.remove(7);assert.equal(peers.map.size,0);
});
test('replacing a remote item releases owned materials without disposing shared world materials',()=>{
 const {rig,eq}=actor();let sharedDisposed=0;const listener=()=>sharedDisposed++;material.addEventListener('dispose',listener);
 eq.setEquipment('sword',1);update(rig,eq,1000);const old=eq.model;let disposed=0;
 old.traverse(o=>{if(o.material?.userData.equipmentOwned)o.material.addEventListener('dispose',()=>disposed++);});
 eq.setEquipment('compass',2);update(rig,eq,1100);assert.equal(old.parent,null);assert.ok(disposed>0);assert.equal(sharedDisposed,0);
 eq.dispose();material.removeEventListener('dispose',listener);
});
test('snapshot null does not cut off the interpolated end of a gesture; scene change cancels it',()=>{
 const peers=new Players(new Scene(),M,{labelFactory:labels});peers.syncClock(1500);
 peers.upsert(8,{name:'Crew',role:'piloto',zone:'ship',equipped:'sword',equipmentRev:1,action:action('swing','sword')});
 peers.map.get(8).equipment.setAction(null);peers.update(.016);assert.equal(peers.map.get(8).equipment.action?.kind,'swing');
 peers.clearActions();assert.equal(peers.map.get(8).equipment.action,null);peers.remove(8);
});
test('snapshot role changes rebuild the correct avatar without losing the item or action',()=>{
 const peers=new Players(new Scene(),M,{labelFactory:labels});peers.syncClock(1300);
 peers.upsert(9,{name:'Crew',role:null,zone:'ship',equipped:'sword',equipmentRev:1,action:action('swing','sword')});const old=peers.map.get(9).rig;
 peers.snapshot([{id:9,name:'Crew',role:'piloto',zone:'ship',p:[0,0,0],r:0,a:'idle',equipped:'sword',equipmentRev:1,action:action('swing','sword')}],1);
 peers.update(.016);assert.notEqual(peers.map.get(9).rig,old);assert.equal(old.root.parent,null);assert.equal(peers.map.get(9).equipment.item,'sword');assert.equal(peers.map.get(9).equipment.action.kind,'swing');peers.remove(9);
});
test('third-person equipment batches meshes so the forged sword does not add dozens of draw calls',()=>{
 const {rig,eq}=actor();eq.setEquipment('sword',1);update(rig,eq,1000);let count=0;eq.model.traverse(o=>{if(o.isMesh)count++;});assert.ok(count<=6,`Sword adds ${count} meshes`);eq.dispose();
});
test('a remote gun follows the player aim pitch and the head looks in the same vertical direction',()=>{
 const {rig,eq}=actor();eq.setEquipment('espingarda',1);pose(rig,'stand');eq.update(1000,.7);
 assert.ok(rig.arms[1].ua.rotation.x<-1.3);assert.ok(rig.head.rotation.x<-.4); // shouldered gun: the arm rises with the aim
 pose(rig,'stand');eq.update(1000,-.7);assert.ok(rig.arms[1].ua.rotation.x>-.8);assert.ok(rig.head.rotation.x>.4);eq.dispose();
});
test('the espingarda is shouldered: butt at the right shoulder, muzzle forward, raised with the gaze',()=>{
 const {rig,eq}=actor();eq.setEquipment('espingarda',1);update(rig,eq,1000);
 const at=(y)=>new Vector3(0,y,0).applyMatrix4(eq.model.matrixWorld),root=new Vector3().setFromMatrixPosition(rig.root.matrixWorld);
 const muzzle=at(1.18),butt=at(-.38),shoulder=new Vector3().setFromMatrixPosition(eq.right.ua.matrixWorld);
 assert.ok(butt.distanceTo(shoulder)<.25,`butt ${butt.distanceTo(shoulder).toFixed(2)} m from the shoulder`);
 assert.ok(muzzle.z-root.z>.7,'muzzle is in front of the body');
 assert.ok(Math.abs(muzzle.y-butt.y)<.15,'held level');
 eq.update(1000,.6);rig.root.updateMatrixWorld(true);
 assert.ok(at(1.18).y-muzzle.y>.3,'aimed up when the player looks up');
 eq.dispose();assert.equal(eq.shoulder.parent,null);
});
