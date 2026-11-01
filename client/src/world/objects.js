import * as THREE from 'three';
import {applyState,animateProp} from './props.js';
import {releaseModel} from '../game/held-models.js';
import {bodyQuaternion,supportHeight,OBJECT_PROFILES} from '../../../shared/object-physics.js';
import {doorSpecs,interactionBoxes,boxContact} from '../../../shared/world-interact.js';
import {worldItemModel} from '../game/world-item-model.js';
import {advanceBody,sphereContact} from './physics.js';

// One bounded, streamed overlay for both player drops and agent/admin patches.
// Static geometry stays in its chunk. Its state is replayed after a chunk is rebuilt.
export class WorldObjects {
  constructor(world){this.world=world;this.records=new Map();this.root=new THREE.Group();world.scene.add(this.root);this.clockOffset=0;}
  clear(){for(const id of [...this.records.keys()])this.remove(id);this.budget();}
  remove(id){const record=this.records.get(id);if(record?.obj){record.obj.removeFromParent();releaseModel(record.obj);}this.records.delete(id);}
  budget(){
    const chunks=this.world.chunks,encode=()=>new TextEncoder().encode(JSON.stringify([...this.records.values()].map(({data,state})=>({data,state})))).length;
    const other=(chunks?.staticBytes?.()??0)-(chunks?.staticData?.get('object-state')??0),total=(chunks?.meta?.totalBytes??0)*.1;
    const reserve=this.world.zone==='ship'?0:Math.min(12000,total*.15);
    const limit=total?Math.max(0,Math.min(16384,total-other-reserve)):16384;
    const camera=this.world.camera?.position??{x:0,z:0};
    const candidates=[...this.records.values()].sort((a,b)=>{
      const pa=a.state.p??a.data.p??[0,0,0],pb=b.state.p??b.data.p??[0,0,0];
      return Math.hypot(pb[0]-camera.x,pb[2]-camera.z)-Math.hypot(pa[0]-camera.x,pa[2]-camera.z);
    });
    let bytes=encode();
    for(const record of candidates){if(bytes<=limit)break;this.remove(record.data.id);bytes=encode();}
    chunks?.setStaticData('object-state',this.records.size?bytes:0);
  }
  applyPatch({ops=[],serverNow}={}){
    if(Number.isFinite(serverNow))this.clockOffset=serverNow-Date.now();
    for(const op of ops.slice(0,160)){
      if(op.op==='remove'){if(!op.unload){const original=this.staticEntity(op.id);if(original)original.visible=false;}this.remove(op.id);continue;}
      const previous=this.records.get(op.id),state={...previous?.state,...op.state};
      // Accept the protocol's top-level set fields as well as entity.state.
      if(op.op==='set'&&!op.state)for(const key of ['p','r','v','open','paused'])if(key in op)state[key]=op[key];
      const data={...previous?.data,...op};data.zone??=this.world.zone;delete data.state;delete data.op;
      if(data.zone&&data.zone!==this.world.zone){this.remove(op.id);continue;}
      const record=previous??{data,state,obj:null};record.data=data;record.state=state;
      this.records.set(op.id,record);
      this.applyRecord(record);
    }
    // Keep malicious/mistaken extensions from growing the client's object cache indefinitely.
    while(this.records.size>128)this.remove(this.records.keys().next().value);
    this.budget();
  }
  applyEntity(id,state){const record=this.records.get(id);if(record){record.state={...record.state,...state};this.applyRecord(record);this.budget();}else{const obj=this.staticEntity(id);if(obj)applyState(obj,state);}}
  staticEntity(id){return this.world.shipInteractables.find(o=>o.userData.id===id)??this.world.island?.interactables.find(o=>o.userData.id===id);}
  applyRecord(record){
    const {data,state}=record;
    const original=this.staticEntity(data.id);
    if(original&&!state.body){if(record.obj){record.obj.removeFromParent();releaseModel(record.obj);record.obj=null;}original.visible=!state.holder&&state.visible!==false;applyState(original,state);record.body=state.body?structuredClone(state.body):null;return;}
    if(original&&state.body)original.visible=false;
    // A static NPC/door can arrive before its chunk. Never create a generic replacement for it.
    if(data.kind!=='item'&&data.kind!=='prop')return;
    // Original ship pickups already have a model once the ship layout arrives.
    if(data.zone==='ship'&&!this.world.layout)return;
    if(!record.obj){
      const content=worldItemModel(this.world.M,data.item,data.model);if(!content)return;
      const root=new THREE.Group();root.add(content);root.userData={id:data.id,kind:data.kind,item:data.item,label:data.label,noBake:true};
      // Крупный декор из патчей (бочки с водой на палубе) — твёрдый: сквозь него не пройти.
      // Мелочь (товар на прилавке, сухари) не мешает: её и так держит стол или прилавок.
      const size=new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3());
      record.solid=data.kind==='prop'&&size.y>.5?[size.x/2,size.y/2,size.z/2]:null;
      this.root.add(root);record.obj=root;
    }
    const obj=record.obj;
    obj.position.fromArray(state.p??data.p);obj.position.y+=obj.children[0]?.userData.supportHeight??supportHeight(data.item);obj.rotation.set(0,state.r??data.r??0,0);
    if(Object.hasOwn(OBJECT_PROFILES,data.item))obj.quaternion.fromArray(bodyQuaternion({item:data.item,r:state.r??data.r??0}));obj.visible=!state.holder&&state.visible!==false;
    record.body=state.body?structuredClone(state.body):null;
    if(record.body){obj.position.fromArray(record.body.p);obj.quaternion.fromArray(bodyQuaternion(record.body));}
  }
  loaded(){
    // Called after the normal chunk builder; adopts its static model and discards a temporary one.
    for(const record of this.records.values()){
      const original=this.staticEntity(record.data.id);
      if(original&&record.obj&&!record.state.body){record.obj.removeFromParent();releaseModel(record.obj);record.obj=null;}
      this.applyRecord(record);
    }
  }
  setZone(zone){for(const [id,r] of this.records)if(r.data.zone!==zone)this.remove(id);this.root.visible=true;this.budget();}
  get selectable(){return [...this.records.values()].filter(r=>r.obj?.visible).map(r=>r.obj);}
  collisionBoxes(point=null,radius=0,height=0){
    const records=[...this.records.values()].filter(r=>r.data.toggleType==='door'||r.data.toggleType==='lid');
    for(const obj of [...(this.world.island?.interactables??[]),...this.world.shipInteractables]){
      const def=obj.userData.doorDef??obj.userData.lidDef;
      if(def&&!this.records.has(obj.userData.id))records.push({data:{...def,toggleType:def.toggleType??'door'},state:obj.userData.state??{}});
    }
    return records.filter(r=>r.data.zone===this.world.zone&&r.state.visible!==false&&(!point||Math.hypot(point[0]-r.data.p[0],point[2]-r.data.p[2])<4+radius&&Math.abs(point[1]-r.data.p[1])<4+radius+height)).flatMap(r=>interactionBoxes(r.data,r.state.open));
  }
  collide(capsule){
    const start=capsule.start.clone();
    // крупный декор из патчей (бочки с водой) — твёрдые коробки по своему размеру
    for(const record of this.records.values()){
      if(!record.solid||!record.obj?.visible||record.data.zone!==this.world.zone)continue;
      const o=record.obj.position,box={p:[o.x,o.y+record.solid[1],o.z],r:record.obj.rotation.y,half:record.solid};
      const p=boxContact(capsule.start.toArray(),capsule.radius,box,capsule.end.y-capsule.start.y);
      const delta=new THREE.Vector3().fromArray(p).sub(capsule.start);capsule.start.add(delta);capsule.end.add(delta);
    }
    for(const box of this.collisionBoxes(capsule.start.toArray(),capsule.radius,Math.abs(capsule.end.y-capsule.start.y))){
      const p=boxContact(capsule.start.toArray(),capsule.radius,box,Math.max(0,capsule.end.y-capsule.start.y));
      const delta=new THREE.Vector3().fromArray(p).sub(capsule.start);capsule.start.add(delta);capsule.end.add(delta);
    }
    return capsule.start.clone().sub(start);
  }
  update(now=Date.now()+this.clockOffset){
    for(const record of this.records.values()){
      const obj=record.obj??this.staticEntity(record.data.id);if(!obj)continue;
      animateProp(obj,now);
      if(!record.body||record.state.holder)continue;
      const body=record.body;
      // If a terrain chunk has not arrived, hold the last authoritative pose until it does.
      if(this.world.island&&!this.world.island.chunks.has(`${Math.floor(body.p[0]/32)},${Math.floor(body.p[2]/32)}`))continue;
      advanceBody(body,Math.min(now,body.startedAt+(body.step+36)/120*1000),(p,r,from)=>sphereContact(this.world,p,r,from),{inertia:this.world.zone==='ship'&&body.roll});
      obj.position.fromArray(body.p);obj.quaternion.fromArray(bodyQuaternion(body));
    }
  }
}
// Register the original door leaves as raycast targets before their parent meshes are baked.
export function registerDoors(M,object,definition){
  const specs=doorSpecs(definition.m),doors=[];let index=0;
  object.updateMatrixWorld(true);
  object.traverse(child=>{
    if(!child.userData.door||index>=specs.length)return;
    child.userData={...child.userData,id:`${definition.id}:door:${index++}`,kind:'toggle',label:'Дверь',doorDef:{id:`${definition.id}:door:${index-1}`,zone:'canary',p:child.getWorldPosition(new THREE.Vector3()).toArray(),r:definition.r??0,w:child.userData.door.w*(definition.s??1),h:child.userData.door.h*(definition.s??1)}};doors.push(child);
  });
  return doors;
}
