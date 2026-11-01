import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,MeshStandardMaterial,Box3,Vector3} from 'three';
import {Equipment,HOLD_POSES} from '../src/game/equipment.js';
function equipment(aspect=16/9){
 const material=new MeshStandardMaterial();
 const world={camera:new PerspectiveCamera(70,aspect,.1,100),M:{get:()=>material,canvas:()=>material}};
 return new Equipment(world);
}
function bounds(eq){
 eq.scene.updateMatrixWorld(true);eq.camera.updateMatrixWorld(true);
 const points=[];
 eq.heldModel.traverse(mesh=>{
  const positions=mesh.geometry?.attributes.position;if(!positions)return;
  for(let i=0;i<positions.count;i++)points.push(new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(eq.camera));
 });
 return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
}
test('all inventory items have a 3D held presentation with their own readable size',()=>{
 const eq=equipment();
 for(const id of Object.keys(HOLD_POSES)){
  eq.equip(id);eq.update(0,0,true);assert.ok(eq.heldModel,`${id}: missing model`);
  const box=new Box3().setFromObject(eq.heldModel),size=box.getSize(new Vector3());
  assert.ok(Math.max(size.x,size.y,size.z)>.15,`${id}: too small`);
  assert.equal(eq.root.visible,true);
 }
 eq.dispose();
});
test('sword occupies most of the view height and its tip stays inside wide and narrow windows',()=>{
 for(const aspect of [16/9,1,.75]){
  const eq=equipment(aspect);eq.equip('sword');eq.update(0,0,true);const b=bounds(eq);
  assert.ok(b.maxY-b.minY>1.05,`sword too small at aspect ${aspect}: ${JSON.stringify(b)}`);
  assert.ok(b.maxY<1&&b.maxX<1&&b.minX>-.95,`sword outside view: ${JSON.stringify(b)}`);
  eq.dispose();
 }
});
test('held model draws after the world, preserves renderer state, and disappears during cutscenes',()=>{
 const eq=equipment(),calls=[];eq.equip('sword');eq.update(0,0,true);
 eq.world.renderer={autoClear:true,getRenderTarget:()=>null,setRenderTarget:v=>calls.push(['target',v]),clearDepth:()=>calls.push(['depth']),render:()=>calls.push(['render'])};
 eq.render();assert.equal(eq.world.renderer.autoClear,true);assert.ok(calls.some(c=>c[0]==='depth'));assert.ok(calls.some(c=>c[0]==='render'));
 calls.length=0;eq.update(0,0,false);eq.render();assert.equal(calls.length,0);eq.dispose();
});
test('sword swing uses its grip pivot and returns to rest; repeated use is gated',()=>{
 const eq=equipment();eq.equip('sword');eq.update(0,0,true);const rest=eq.root.rotation.z;
 assert.equal(eq.use(),true);assert.equal(eq.use(),false);eq.update(.29,.29,true);assert.ok(Math.abs(eq.root.rotation.z-rest)>1);
 eq.update(1,2,true);assert.equal(eq.root.rotation.z,rest);eq.dispose();
});

test('espingarda has a shaped stock, open muzzle and matchlock; the held muzzle and flash line up',()=>{
 const eq=equipment();eq.equip('espingarda');eq.update(0,0,true);
 for(const name of ['wooden-stock','octagonal-barrel','dark-bore','match-holder','trigger','ramrod'])assert.ok(eq.heldModel.getObjectByName(name),name);
 const muzzle=new Vector3().fromArray(eq.heldModel.userData.muzzle).multiply(eq.heldModel.scale).add(eq.heldModel.position);
 assert.ok(Math.abs(eq.flash.position.y-muzzle.y-.08)<.001);assert.ok(Math.abs(eq.flash.position.x-muzzle.x)<.001);
 const b=bounds(eq);assert.ok(b.maxY<1&&b.maxX<1&&b.minX>-.9,JSON.stringify(b));eq.dispose();
});
