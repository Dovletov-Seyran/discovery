import * as THREE from 'three';
import {MODELS} from '../world/props.js';
import {ISLAND_MODELS} from '../world/islandModels.js';

const aliases={barrel_full:'barrel',planks:'planks',tar:'tar_bucket'};
const builder=id=>MODELS[aliases[id]||id]||ISLAND_MODELS[aliases[id]||id];
const disposeGeometry=obj=>obj?.traverse(child=>child.geometry?.dispose());
const makeObject=(make,M)=>{const built=make(M);built.col?.forEach(geometry=>geometry.dispose());return built.obj;};

// Reuse Front 1's models and shared materials; do not duplicate terrain or chunk data.
export class Equipment {
  constructor(world) {
    this.world=world;this.item=null;this.action=0;this.drunk=0;
    this.root=new THREE.Group();this.root.position.set(0.34,-0.26,-0.65);
    world.camera.add(this.root);
    this.light=new THREE.PointLight(0xffe6bd,0.5,2);this.root.add(this.light);
  }
  equip(id) {
    if(this.item===id)return;
    this.item=id;this.action=0;
    if(this.object){this.root.remove(this.object);disposeGeometry(this.object);this.object=null;}
    const make=builder(id);if(!make||!this.world.M)return;
    const object=makeObject(make,this.world.M);
    const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=0.32/Math.max(size.x,size.y,size.z,0.01);
    object.position.copy(center).multiplyScalar(-scale);object.scale.setScalar(scale);
    this.object=new THREE.Group();this.object.add(object);this.root.add(this.object);
  }
  use() { if(this.action>0)return false;this.action=this.item==='sword'?0.55:0.8;return true; }
  drink() { this.drunk=10; }
  update(dt,time,visible) {
    this.root.visible=visible;
    this.action=Math.max(0,this.action-dt);this.drunk=Math.max(0,this.drunk-dt);
    const wave=this.action>0?Math.sin((1-this.action/(this.item==='sword'?0.55:0.8))*Math.PI):0;
    this.root.position.set(0.34-(this.item==='sword'?wave*0.28:0),-0.26+wave*0.12,-0.65);
    this.root.rotation.set(0.45,0,this.item==='sword'?0.9-wave*1.8:0);
    if(this.item==='compass'&&this.object)this.object.rotation.y=-this.world.camera.rotation.y;
    // A short sway, not a permanent change to mouse look.
    this.world.camera.rotation.z=this.drunk>0?Math.sin(time*1.8)*0.018*Math.min(1,this.drunk/3):0;
  }
  dispose(){this.equip(null);this.root.removeFromParent();this.light.dispose();}
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
      scene.add(obj);renderer.render(scene,camera);result[id]=renderer.domElement.toDataURL('image/png');scene.remove(obj);disposeGeometry(obj);
    }
  } finally { renderer.dispose();renderer.forceContextLoss(); }
  return result;
}
