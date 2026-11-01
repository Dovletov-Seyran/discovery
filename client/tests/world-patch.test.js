import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,MeshStandardMaterial,Vector3,BoxGeometry} from 'three';
import {WorldObjects} from '../src/world/objects.js';
import {buildLayout,MODELS,applyState,animateProp} from '../src/world/props.js';
import {Collider} from '../src/world/collision.js';
const mat=new MeshStandardMaterial();const M={get:()=>mat,canvas:()=>mat};
function world(){
 const w={scene:new Scene(),zone:'ship',layout:{},M,shipInteractables:[],island:{interactables:[],chunks:new Map()},chunks:{setStaticData(name,bytes){this.bytes=bytes;}}};w.objects=new WorldObjects(w);return w;
}
test('spawn → move → remove patches update rendering and pickup targets; hidden holder is not selectable',()=>{
 const w=world();w.objects.applyPatch({ops:[{op:'spawn',id:'drop:one',zone:'ship',kind:'item',item:'rum',model:'rum',p:[1,1,2],r:0,state:{uses:1}}]});
 assert.equal(w.objects.selectable.length,1);assert.equal(w.objects.selectable[0].userData.item,'rum');assert.ok(w.chunks.bytes>0);
 w.objects.applyPatch({ops:[{op:'set',id:'drop:one',p:[3,1,2]}]});assert.equal(w.objects.selectable[0].position.x,3);
 w.objects.applyEntity('drop:one',{holder:7});assert.equal(w.objects.selectable.length,0);
 w.objects.applyPatch({ops:[{op:'remove',id:'drop:one'}]});assert.equal(w.objects.records.size,0);
});
test('a door update keeps its parent-relative transform and animated hinge after baking',()=>{
 const w=world(),door=new Group();door.position.set(-.6,0,2.78);door.userData={id:'home:door:0',kind:'toggle',setOpen:v=>door.rotation.y=v};
 w.island.interactables.push(door);w.zone='canary';
 const data={id:door.userData.id,kind:'toggle',zone:'canary',p:[200,3,300],r:1.2,toggleType:'door',w:1.1,h:2.1};
 w.objects.applyPatch({ops:[{op:'spawn',...data,state:{open:false,changedAt:0}}]});
 w.objects.applyPatch({ops:[{op:'set',...data,state:{open:true,changedAt:1000}}]});
 assert.deepEqual(door.position.toArray(),[-.6,0,2.78]);animateProp(door,1450);assert.equal(door.rotation.y,1);
});
test('hourglass uses the full server period on late join and replays the turn without resetting its duration',()=>{
 const {obj}=MODELS.hourglass(M);obj.userData.period=120;
 applyState(obj,{startedAt:1000,duration:120000,emptyAt:121000,turnedBy:2});animateProp(obj,61000);
 const parts=obj.userData.sandParts;assert.ok(Math.abs(parts.top.scale.x-Math.cbrt(.5))<1e-7);assert.equal(parts.stream.visible,true);
 animateProp(obj,121001);assert.equal(parts.stream.visible,false);assert.ok(parts.bottom.scale.x>.99);
 applyState(obj,{startedAt:122000,duration:120000,emptyAt:242000,turnedBy:2});animateProp(obj,122325);
 assert.ok(obj.userData.flipPivot.rotation.z>1);animateProp(obj,122651);assert.equal(obj.userData.flipPivot.rotation.z,0);
});
test('chest lids remain independent and open on the actual ship layout path',()=>{
 const built=buildLayout(M,{objects:[{id:'nav_chest',m:'nav_chest',p:[0,0,0]}],interact:[],npcs:[]});
 const chest=built.interactables[0];assert.equal(chest.userData.kind,'toggle');
 applyState(chest,{open:true,changedAt:0});animateProp(chest,1000);
 assert.ok(chest.children.some(child=>child.userData.noBake&&child.rotation.x<-1));
});
test('sphere contacts use the real world collider, bounce on the floor and remain above it',async()=>{
 const {sphereContact}=await import('../src/world/physics.js');
 const collider=new Collider([new BoxGeometry(20,.1,20).translate(0,-.05,0)]),w={zone:'ship',collider};
 const result=sphereContact(w,[1,.05,1],.15);assert.ok(result[1]>=.1499);collider.geometry.dispose();
});

test('explicit removal hides a static pickup, but interest unload does not destroy it',()=>{
 const w=world(),obj=new Group();obj.userData={id:'map'};w.shipInteractables.push(obj);
 const data={id:'map',zone:'ship',kind:'item',item:'map',model:'map',p:[0,0,0]};
 w.objects.applyPatch({ops:[{op:'spawn',...data,state:{}}]});
 w.objects.applyPatch({ops:[{op:'remove',id:'map',unload:true}]});assert.equal(obj.visible,true);
 w.objects.applyPatch({ops:[{op:'remove',id:'map'}]});assert.equal(obj.visible,false);
 w.objects.applyPatch({ops:[{op:'spawn',...data,state:{}}]});assert.equal(obj.visible,true);
});
test('houses keep an openable doorway instead of a solid building collider',async()=>{
 const {ISLAND_MODELS}=await import('../src/world/islandModels.js');
 const {registerDoors}=await import('../src/world/objects.js');
 const {obj,col}=ISLAND_MODELS.house(M),targets=registerDoors(M,obj,{id:'home',m:'house',p:[0,0,0]});
 assert.equal(targets.length,1);assert.equal(targets[0].userData.id,'home:door:0');
 const collider=new Collider(col),start=new Vector3(-.6,.4,2.75),capsule={start,end:new Vector3(-.6,1.4,2.75),radius:.35};
 collider.collide(capsule);assert.ok(Math.abs(start.z-2.75)<.01,'the static shell must have a doorway gap');
 const w=world();w.zone='canary';w.island.interactables=targets;
 w.objects.collide(capsule);assert.ok(Math.abs(start.z-2.75)>.1,'closed leaf blocks the gap before the first patch arrives');
 collider.geometry.dispose();col.forEach(g=>g.dispose());
});
test('patch cache reserves its bytes within the same 10% world budget and evicts farthest objects',async()=>{
 const {Chunks}=await import('../src/world/chunks.js');
 const w=world();w.chunks=new Chunks();w.chunks.setWorldMeta({totalBytes:1000000,totalChunks:257,cacheLimit:25});w.chunks.setStaticData('existing',88000);
 w.objects.applyPatch({ops:Array.from({length:60},(_,i)=>({op:'spawn',id:`drop:${i}`,zone:'ship',kind:'item',item:'rum',model:'rum',p:[i,0,0],state:{note:'x'.repeat(250)}}))});
 assert.ok(w.chunks.stats().bytes<=100000);assert.ok(w.objects.records.has('drop:0'));assert.equal(w.objects.records.has('drop:59'),false);
});

test('a movable keg does not collide with its own old position after being picked up or rolling away',()=>{
 const built=buildLayout(M,{objects:[],interact:[{id:'keg',m:'keg',kind:'item',item:'barrel',p:[0,0,0]}],npcs:[]});
 assert.equal(built.col.length,0);assert.equal(built.interactables.length,1);
});
