import * as THREE from 'three';
import {MODELS} from '../world/props.js';
import {ISLAND_MODELS} from '../world/islandModels.js';

import {HELD_MODELS,hand,releaseModel} from './held-models.js';

const aliases={barrel_full:'barrel',planks:'planks',tar:'tar_bucket'};
const builder=id=>HELD_MODELS[id]||MODELS[aliases[id]||id]||ISLAND_MODELS[aliases[id]||id];
const makeObject=(make,M)=>{
 const built=make(M);built.col?.forEach(geometry=>geometry.dispose());
 // World metals rely on environment reflections. Give the held copy a diffuse component too.
 const copies=new Map();
 built.obj.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const readable=material=>{
   if(!(material.metalness>.6)||material.userData.equipmentOwned)return material;
   if(!copies.has(material)){
    const copy=material.clone();copy.metalness=.48;copy.roughness=Math.max(.32,copy.roughness);
    copy.emissive.copy(copy.color).multiplyScalar(.04);copy.userData.equipmentOwned=true;copies.set(material,copy);
   }
   return copies.get(material);
  };
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(readable):readable(mesh.material);
 });
 return built.obj;
};
// Sizes in metres, measured on the long edge. Each tool gets a readable pose.
export const HOLD_POSES={
 sword:{size:1.2,rotation:[-.24,-.12,-.18],depth:.95},
 compass:{size:.34,rotation:[1.10,0,0],depth:.72},
 astrolabe:{size:.40,rotation:[1.40,0,0],depth:.78},
 map:{size:.68,rotation:[1.05,0,-.10],depth:.88},
 wine:{size:.40,rotation:[.75,0,-.15],depth:.72},
 espingarda:{size:1.05,rotation:[-.70,.12,-.12],depth:1.0},
 barrel:{size:.55,rotation:[.05,-.25,0],depth:.92},
 barrel_full:{size:.55,rotation:[.05,-.25,0],depth:.92},
 tar:{size:.45,rotation:[.12,-.15,0],depth:.82},
 planks:{size:.85,rotation:[.30,.40,-.18],depth:1.0},
 purse:{size:.32,rotation:[0,-.15,0],depth:.72},
 cheese:{size:.35,rotation:[.15,-.30,0],depth:.72},
 meat:{size:.40,rotation:[.15,.20,0],depth:.75},
 biscuit:{size:.30,rotation:[.35,.10,0],depth:.72},
};

export class Equipment {
 constructor(world){
  this.world=world;this.item=null;this.action=0;this.drunk=0;
  // Independent view-model pass: no walls through the blade, no tiny dark prop in the distance.
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(60,1,.01,10);
  this.root=new THREE.Group();this.scene.add(this.root);
  this.scene.add(new THREE.HemisphereLight(0xfff0d9,0x77849b,2.4));
  const key=new THREE.DirectionalLight(0xffead0,3.5);key.position.set(-2,3,3);this.scene.add(key);
  const rim=new THREE.DirectionalLight(0xc2d7ff,2);rim.position.set(3,1,-2);this.scene.add(rim);
  this.size=new THREE.Vector2();
 }
 equip(id){
  if(this.item===id)return;
  this.item=id;this.action=0;
  if(this.object){releaseModel(this.object);this.root.remove(this.object);this.object=null;}
  const make=builder(id);if(!make||!this.world.M)return;
  const model=makeObject(make,this.world.M),pose=HOLD_POSES[id];
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=(pose?.size||.4)/Math.max(size.x,size.y,size.z,.01);
  model.scale.setScalar(scale);
  if(id==='sword')model.position.set(0,0,0); // pivot at the grip, not the centre of the blade
  else {model.position.copy(center).multiplyScalar(-scale);model.position.y+=(pose?.size||.4)*.32;}
  this.object=new THREE.Group();this.object.add(model);
  this.heldModel=model;
  const grip=hand();if(['map','planks'].includes(id))grip.position.set(-.13,-.04,.04);
  this.object.add(grip);this.root.add(this.object);
 }
 use(){if(this.action>0)return false;this.action=this.item==='sword' ? 0.58 : 0.9;return true;}
 drink(){this.drunk=10;}
 update(dt,time,visible){
  this.root.visible=visible&&!!this.object;
  this.action=Math.max(0,this.action-dt);this.drunk=Math.max(0,this.drunk-dt);
  this.camera.aspect=this.world.camera.aspect||1;this.camera.updateProjectionMatrix();
  const pose=HOLD_POSES[this.item]||{rotation:[0,0,0],depth:.8};
  const halfHeight=pose.depth*Math.tan(Math.PI/6),halfWidth=halfHeight*this.camera.aspect;
  const sword=this.item==='sword',wave=this.action?Math.sin((1-this.action/(sword ? 0.58 : 0.9))*Math.PI):0;
  this.root.position.set(Math.min(.38,halfWidth*.48),-halfHeight*(sword ? 0.82 : 0.70),-pose.depth);
  this.root.rotation.set(...pose.rotation);
  if(sword){this.root.rotation.z-=wave*1.45;this.root.rotation.x-=wave*.35;this.root.position.x-=wave*.30;}
  else if(this.item==='wine'){this.root.position.x-=wave*.22;this.root.position.y+=wave*.26;this.root.rotation.x-=wave*.85;}
  else this.root.position.y+=wave*.05;
  if(this.item==='compass'&&this.heldModel)this.heldModel.rotation.y=-this.world.camera.rotation.y;
  this.world.camera.rotation.z=this.drunk?Math.sin(time*1.8)*.018*Math.min(1,this.drunk/3):0;
 }
 render(){
  const r=this.world.renderer;if(!this.root.visible||!r)return;
  const autoClear=r.autoClear,target=r.getRenderTarget();
  try{r.setRenderTarget(null);r.autoClear=false;r.clearDepth();r.render(this.scene,this.camera);}
  finally{r.autoClear=autoClear;r.setRenderTarget(target);}
 }
 dispose(){this.equip(null);this.root.removeFromParent();}
}

export function itemPictures(world,ids) {
  if(!world?.M)return {};
  const result={},renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setSize(160,140);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-0.7,0.7,0.61,-0.61,0.01,10);
  camera.position.set(0.8,1.1,1.3);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xfff0d4,0x655a49,3));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,3,2);scene.add(light);
  try {
    for(const id of ids) {
      const make=builder(id);if(!make)continue;
      const obj=makeObject(make,world.M),box=new THREE.Box3().setFromObject(obj),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      const scale=1/Math.max(size.x,size.y,size.z,0.01);obj.scale.setScalar(scale);obj.position.copy(center).multiplyScalar(-scale);
      scene.add(obj);renderer.render(scene,camera);result[id]=renderer.domElement.toDataURL('image/png');scene.remove(obj);releaseModel(obj);
    }
  } finally { renderer.dispose();renderer.forceContextLoss(); }
  return result;
}
