import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MeshStandardMaterial} from 'three';
import {person,pose,NPC_LOOK} from '../src/world/people.js';
test('every NPC has cloth-covered hips, upper and lower legs; existing poses remain valid',()=>{
 const mat=new MeshStandardMaterial({vertexColors:true});
 // таино (часть 2) носят набедренную повязку или нагуа, а не штаны — у них своя одежда
 for(const [id,look]of Object.entries(NPC_LOOK).filter(([,l])=>!l.loincloth&&!l.nagua)){
  const rig=person(mat,look),cloth=[];rig.root.traverse(o=>{if(o.userData.clothing==='trousers')cloth.push(o);});
  assert.equal(cloth.length,5,`${id}: missing trouser section`);
  for(const limb of rig.legs){assert.equal(limb.sh.children[0].userData.clothing,'trousers');assert.ok(limb.sh.children.length>=3);}
  for(const p of ['stand','walk','run','sit','kneel','haul']){pose(rig,p,.5);assert.ok(Number.isFinite(rig.hip.position.y));}
  rig.root.traverse(o=>o.geometry?.dispose());
 }
 mat.dispose();
});
