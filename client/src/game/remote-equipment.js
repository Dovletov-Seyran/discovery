import * as THREE from 'three';
import {swordMotion} from '../../../shared/sword-motion.js';
import {bake} from '../world/geom.js';
import {MODELS} from '../world/props.js';
import {ISLAND_MODELS} from '../world/islandModels.js';
import {HELD_MODELS,releaseModel} from './held-models.js';
import {ITEM_RULES} from '../../../shared/item-actions.js';
import {PLAYER_ACTION_MS} from '../../../shared/player-presentation.js';

const aliases={barrel_full:'barrel',tar:'tar_bucket'};
const sizes={sword:1.2,espingarda:1.2,macana:.95,map:.65,compass:.32,astrolabe:.3,wine:.35,barrel:.52,barrel_full:.52,planks:.8,tar:.4,purse:.25,cheese:.26,meat:.3,biscuit:.2,cup:.22};
const temporaryItem=new Set(['swing','shot','drink','eat','inspect','fill']);

// Third-person presentation only. Inventory/cooldowns/actions are all decided by the server.
// The grip is parented to the avatar's actual forearm, so it follows walking and seated poses too.
export class RemoteEquipment {
  constructor(rig,M){
    this.rig=rig;this.M=M;this.equipped=null;this.equipmentRev=-1;this.lastSeq=0;this.action=null;this.item=null;
    this.right=rig.arms.find(a=>a.s===1)??rig.arms[1];this.left=rig.arms.find(a=>a.s===-1)??rig.arms[0];
    this.grip=new THREE.Group();this.grip.position.set(0,-.3,0);this.right.fa.add(this.grip);
    // The espingarda is shouldered, not held in the fist: its place follows the torso and the arms reach for it
    this.shoulder=new THREE.Group();this.shoulder.position.set(this.right.s*.12,.47,0);rig.torso.add(this.shoulder);
  }
  setEquipment(item,rev){
    if(Number.isFinite(rev)&&rev<this.equipmentRev)return;
    if(Number.isFinite(rev))this.equipmentRev=rev;
    this.equipped=typeof item==='string'&&Object.hasOwn(ITEM_RULES,item)?item:null;
    if(this.action&&this.action.equipmentRev<this.equipmentRev)this.action=null;
  }
  setAction(action){
    if(!action)return; // Expiry uses render time, including snapshot interpolation delay.
    if(!Object.hasOwn(PLAYER_ACTION_MS,action.kind)||!Number.isFinite(action.startedAt)||!Number.isFinite(action.duration)||action.duration<=0||action.duration>4000||!Number.isSafeInteger(action.seq)||action.seq<=this.lastSeq)return;
    this.lastSeq=action.seq;
    if((action.equipmentRev??0)<this.equipmentRev)return;
    this.action={...action,item:typeof action.item==='string'&&Object.hasOwn(ITEM_RULES,action.item)?action.item:null};
  }
  showItem(item){
    if(item===this.item)return;
    if(this.model){releaseModel(this.model);this.model.removeFromParent();}
    this.flash=null;this.model=null;this.item=item;
    if(!item)return;
    const make=HELD_MODELS[item]??MODELS[aliases[item]??item]??ISLAND_MODELS[aliases[item]??item];if(!make)return;
    const built=make(this.M);built.col?.forEach(g=>g.dispose());const model=built.obj;bake(model);
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=(sizes[item]??.35)/Math.max(size.x,size.y,size.z,.01);model.scale.setScalar(scale);
    this.model=model;
    if(item==='espingarda'){
      // Model origin is the wrist of the stock, muzzle along +Y (world/espingarda.js): barrel forward,
      // trigger down, wrist in front of the shoulder so the butt rests against it
      model.position.set(0,0,.28);model.rotation.set(Math.PI/2,0,0);this.shoulder.add(model);
      const material=new THREE.MeshBasicMaterial({color:0xffda85,transparent:true,opacity:.95,depthWrite:false});material.userData.equipmentOwned=true;
      this.flash=new THREE.Mesh(new THREE.SphereGeometry(.1/scale,8,6),material);this.flash.position.fromArray(model.userData.muzzle??[0,1.18,0]);this.flash.visible=false;model.add(this.flash);
      return;
    }
    if(item==='sword'||item==='macana')model.position.set(0,0,0); // the blade's origin is the grip
    else model.position.copy(center).multiplyScalar(-scale);
    this.grip.rotation.set(Math.PI/2,0,0);
    this.grip.add(model);
  }
  update(now,pitch=0){
    pitch=THREE.MathUtils.clamp(pitch,-1.35,1.35);this.rig.head.rotation.x=-pitch*.65;
    let action=this.action;
    if(action&&now>=action.startedAt+action.duration){this.action=null;action=null;}
    const item=action&&temporaryItem.has(action.kind)?action.item:this.equipped;
    this.showItem(item);
    if(this.flash)this.flash.visible=false;
    const right=this.right,left=this.left;
    if(item){
      right.ua.rotation.set(-.55,0,-.12);right.fa.rotation.set(-.9,0,0);
      if(['map','espingarda','planks','barrel','barrel_full'].includes(item)){
        left.ua.rotation.set(-.8,0,.22);left.fa.rotation.set(-.85,.25,-.15);
      }
      if(item==='espingarda'){
        // aimed where the player looks: the gun turns about the shoulder, the hands go with it
        this.shoulder.rotation.x=-pitch*.8;
        right.ua.rotation.set(-.85-pitch*.8,0,-right.s*.35);right.fa.rotation.set(-1.05,0,0);
        left.ua.rotation.set(-1.3-pitch*.8,0,-left.s*.55);left.fa.rotation.set(-.35,0,0);
      }
    }
    if(item!=='espingarda')this.shoulder.rotation.x=0;
    if(!action||now<action.startedAt)return;
    const u=THREE.MathUtils.clamp((now-action.startedAt)/action.duration,0,1),wave=Math.sin(u*Math.PI);
    switch(action.kind){
      case 'swing': {
        const {cut,lift}=swordMotion(u);right.ua.rotation.set(-.55-cut*.55-lift,-cut*.4,-.12-cut);right.fa.rotation.x=-.9+cut*.35;
        this.rig.torso.rotation.y-=cut*.2;break;}
      case 'shot':
        right.ua.rotation.x-=wave*.25;left.ua.rotation.x-=wave*.2;this.rig.torso.rotation.x-=wave*.09;
        if(this.flash)this.flash.visible=u<.3;break;
      case 'drink': case 'eat':
        right.ua.rotation.x=-.55-wave*1.2;right.fa.rotation.x=-.9-wave*.55;
        this.rig.head.rotation.x=-(action.kind==='drink'?.13:.05)*wave;break;
      case 'inspect':
        right.ua.rotation.x=-.8-wave*.4;right.fa.rotation.x=-1;this.rig.head.rotation.x=wave*.18;break;
      case 'throw':
        right.ua.rotation.set(-.5-wave*2.1,0,-wave*.35);right.fa.rotation.x=-.2-wave*.35;this.rig.torso.rotation.y=-wave*.2;break;
      case 'place': case 'pickup': case 'give': case 'toggle': case 'fill':
        this.rig.torso.rotation.x+=wave*.28;right.ua.rotation.x=-.3-wave;right.fa.rotation.x=-.4;break;
      case 'dance':
        this.rig.hip.position.y+=Math.abs(Math.sin(u*Math.PI*6))*.06;this.rig.torso.rotation.z=Math.sin(u*Math.PI*6)*.12;
        right.ua.rotation.z=-.8;left.ua.rotation.z=.8;break;
      case 'scare':right.ua.rotation.x=-2*wave;left.ua.rotation.x=-2*wave;break;
    }
  }
  dispose(){this.showItem(null);this.grip.removeFromParent();this.shoulder.removeFromParent();}
}
