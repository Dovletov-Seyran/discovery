import * as THREE from 'three';
import {MODELS} from '../world/props.js';
import {ISLAND_MODELS} from '../world/islandModels.js';
import {HELD_MODELS} from './held-models.js';
import {objectProfile,OBJECT_PROFILES} from '../../../shared/object-physics.js';

// The rendered pickup fits the same centred shape that the server collides.
export function worldItemModel(M,item,model){
 const aliases={barrel_full:'barrel',tar:'tar_bucket'};
 const make=HELD_MODELS[item]??MODELS[model]??ISLAND_MODELS[model]??MODELS[aliases[item]??item]??ISLAND_MODELS[aliases[item]??item];
 if(!make)return null;
 const built=make(M);built.col?.forEach(g=>g.dispose());
 const content=built.obj;
 if(item==='sword')content.rotation.x=Math.PI/2;
 let box=new THREE.Box3().setFromObject(content),size=box.getSize(new THREE.Vector3());
 if(['espingarda','planks'].includes(item)){
  if(size.y>size.z&&size.y>size.x)content.rotation.x=Math.PI/2;
  else if(size.x>size.z)content.rotation.y=Math.PI/2;
 }
 // Put rotations in a wrapper before sizing; the physics extents are world-aligned at rest.
 const wrapper=new THREE.Group();wrapper.add(content);
 box=new THREE.Box3().setFromObject(wrapper);size=box.getSize(new THREE.Vector3());
 const half=objectProfile(item).half,center=box.getCenter(new THREE.Vector3());
 content.position.sub(center);
 if(!Object.hasOwn(OBJECT_PROFILES,item)){wrapper.userData.supportHeight=size.y/2;return wrapper;}
 wrapper.scale.set(half[0]*2/Math.max(size.x,.001),half[1]*2/Math.max(size.y,.001),half[2]*2/Math.max(size.z,.001));
 return wrapper;
}
