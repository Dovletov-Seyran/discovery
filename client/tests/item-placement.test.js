import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,BoxGeometry,MeshStandardMaterial,Scene,Group,Vector3} from 'three';
import {createBody,advanceBody,supportPoints,supportHeight,objectProfile,bodyQuaternion,OBJECT_PROFILES} from '../../shared/object-physics.js';
import {swordMotion} from '../../shared/sword-motion.js';
import {worldItemModel} from '../src/game/world-item-model.js';
import {WorldObjects} from '../src/world/objects.js';
import {MODELS} from '../src/world/props.js';
import {Collider} from '../src/world/collision.js';
import {sphereContact} from '../src/world/physics.js';
import {releaseModel} from '../src/game/held-models.js';
const material=new MeshStandardMaterial(),M={get:()=>material,canvas:()=>material};
const ground=(p,r)=>[p[0],Math.max(r,p[1]),p[2]];

test('paper settles flat without rebound; all map corners clear a sloping surface',()=>{
 const map=createBody({item:'map',p:[0,1.5,0],v:[1,0,0],r:.8});let impacted=false;
 for(let t=10;t<=5000;t+=10){advanceBody(map,t,ground);if(map.p[1]<.04)impacted=true;if(impacted)assert.ok(map.v[1]<=1e-8,'paper rebounded');}
 assert.ok(map.sleeping);assert.ok(Math.abs(map.p[1]-supportHeight('map')-.006)<1e-6);
 const slope=(p,r)=>{const n=[-.2,1,0],len=Math.hypot(...n),distance=(p[1]-.2*p[0])/len,depth=Math.max(0,r-distance);return p.map((v,i)=>v+n[i]/len*depth);};
 const tilted=createBody({item:'map',p:[0,1.5,0],r:.7});advanceBody(tilted,5000,slope);
 for(const offset of supportPoints(tilted)){const p=offset.map((v,i)=>v+tilted.p[i]);assert.ok(p[1]-.2*p[0]>=-.00001);}
});
test('a fast thrown map does not tunnel through the actual thin deck collider',()=>{
 const collider=new Collider([new BoxGeometry(20,.06,20).translate(0,-.03,0)]),world={zone:'ship',collider};
 const map=createBody({item:'map',p:[0,1,0],v:[1,-9,0],r:.9});
 for(let t=10;t<=3000;t+=10){advanceBody(map,t,(p,r,from)=>sphereContact(world,p,r,from));for(const o of supportPoints(map))assert.ok(map.p[1]+o[1]>=-.0001);}
 assert.ok(map.sleeping);collider.geometry.dispose();
});
test('rendered items fit the authoritative collision shape and dropped sword has a pointed tip',()=>{
 for(const item of Object.keys(OBJECT_PROFILES)){
  const model=worldItemModel(M,item,item);assert.ok(model,item);
  const box=new Box3().setFromObject(model),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3()),half=objectProfile(item).half;
  for(let i=0;i<3;i++)assert.ok(Math.abs(size.getComponent(i)-2*half[i])<1e-5,`${item} size mismatch`);
  assert.ok(center.length()<1e-5,`${item} is not centred`);releaseModel(model);
 }
 const sword=worldItemModel(M,'sword','sword');sword.updateMatrixWorld(true);
 const points=[];sword.traverse(m=>{const a=m.geometry?.attributes.position;if(!a)return;for(let i=0;i<a.count;i++)points.push(new Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld));});
 const end=Math.max(...points.map(p=>p.z)),tip=points.filter(p=>Math.abs(p.z-end)<1e-6);
 assert.ok(tip.length>=1);assert.ok(Math.max(...tip.map(p=>p.x))-Math.min(...tip.map(p=>p.x))<1e-6);releaseModel(sword);
});
test('keg rolls about its centre; reapplying the same snapshot never accumulates rotation',()=>{
 const original=new Group();original.userData.id='deck_keg';
 const world={scene:new Scene(),M,zone:'ship',layout:{},shipInteractables:[original],island:{interactables:[],chunks:new Map()},chunks:{setStaticData(){}}};
 world.objects=new WorldObjects(world);
 const body=createBody({item:'barrel',p:[0,.206,0],roll:true});advanceBody(body,1000,ground,{inertia:true});
 const patch={ops:[{op:'spawn',id:'deck_keg',kind:'item',item:'barrel',zone:'ship',p:[0,0,0],state:{body}}]};
 world.objects.applyPatch(patch);world.objects.update(body.startedAt+body.step*1000/120);
 const obj=world.objects.records.get('deck_keg').obj,first=obj.quaternion.toArray();
 world.objects.applyPatch(patch);world.objects.update(body.startedAt+body.step*1000/120);
 assert.deepEqual(obj.quaternion.toArray(),first);assert.deepEqual(first,bodyQuaternion(body));assert.equal(original.visible,false);
 const box=new Box3().setFromObject(obj,true);assert.ok(box.min.y>-.008,'barrel penetrates the deck');world.objects.clear();
 assert.equal(createBody({item:'cup',p:[0,.1,0],roll:true}).roll,false);
});
test('arched chest lid spans its own width, hinges at the back and rises above the rim',()=>{
 const built=MODELS.nav_chest(M),lid=built.obj.children.find(c=>c.userData.noBake),closed=new Box3().setFromObject(lid);
 assert.ok(closed.max.x-closed.min.x<1.02);assert.ok(closed.max.z-closed.min.z<.61);assert.ok(closed.max.y-closed.min.y<.32);
 built.obj.userData.setOpen(1);const open=new Box3().setFromObject(lid);
 assert.ok(open.min.y>.40);assert.ok(open.max.y>.9);releaseModel(built.obj);built.col.forEach(g=>g.dispose());
});
test('sword motion winds up before a quick cut and returns smoothly to its grip',()=>{
 assert.deepEqual(swordMotion(0),swordMotion(1));assert.ok(swordMotion(.12).cut<0);assert.ok(swordMotion(.48).cut>1.4);
 assert.ok(swordMotion(.95).cut<.05);assert.ok(swordMotion(.35).cut-swordMotion(.22).cut>.6);
});

test('agent scenery keeps full dimensions, while loose barrels use their side-rest pose',()=>{
 const prop=worldItemModel(M,undefined,'barrel'),size=new Box3().setFromObject(prop).getSize(new Vector3());
 assert.ok(size.y>.9,'agent water barrels were shrunk to the pickup proxy');assert.ok(prop.userData.supportHeight>.45);releaseModel(prop);
 const world={scene:new Scene(),M,zone:'ship',layout:{},shipInteractables:[],island:{interactables:[],chunks:new Map()},chunks:{setStaticData(){}}};world.objects=new WorldObjects(world);
 world.objects.applyPatch({ops:[{op:'spawn',id:'drop:keg',kind:'item',item:'barrel',model:'barrel',zone:'ship',p:[0,0,0],state:{}}]});
 const box=new Box3().setFromObject(world.objects.records.get('drop:keg').obj,true);assert.ok(Math.abs(box.min.y)<.003);world.objects.clear();
});

test('navigation tools are supported by the table, clear one another and no pickup sits over a chest',async()=>{
 const {readFileSync}=await import('node:fs'),layout=JSON.parse(readFileSync(new URL('../../content/ship_layout.json',import.meta.url)));
 const {buildLayout}=await import('../src/world/props.js'),built=buildLayout(M,{objects:[],npcs:[],interact:layout.interact.filter(x=>['map','astrolabe'].includes(x.id))});
 const boxes=built.interactables.map(o=>new Box3().setFromObject(o,true));assert.equal(boxes[0].intersectsBox(boxes[1]),false);
 for(const b of boxes){assert.ok(b.min.x>=.625&&b.max.x<=1.875);assert.ok(b.min.z>=8.275&&b.max.z<=9.125);assert.ok(b.min.y>=2.84-1e-6&&b.min.y<2.86);}
 for(const item of layout.interact.filter(x=>x.kind==='item'))for(const chest of layout.objects.filter(x=>x.m.endsWith('_chest')))assert.ok(Math.hypot(item.p[0]-chest.p[0],item.p[2]-chest.p[2])>.65);
 for(const obj of built.interactables)releaseModel(obj);
});
