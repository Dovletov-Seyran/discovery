import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Scene,MeshStandardMaterial,Vector3} from 'three';
import {buildLayout} from '../src/world/props.js';
import {WorldObjects} from '../src/world/objects.js';
import {Collider} from '../src/world/collision.js';
import {surfaceHit,sphereContact} from '../src/world/physics.js';
import {createBody,advanceBody,supportHeight} from '../../shared/object-physics.js';
const material=new MeshStandardMaterial(),M={get:()=>material,canvas:()=>material};
function fixture(model='nav_chest',r=0){
 const layout={objects:[{id:'chest',m:model,p:[0,0,0],r}],interact:[],npcs:[]},built=buildLayout(M,layout);
 const world={scene:new Scene(),M,layout,zone:'ship',shipInteractables:built.interactables,island:{interactables:[],chunks:new Map()},chunks:{setStaticData(){}}};
 world.collider=new Collider([new BoxGeometry(10,.1,10).translate(0,-.05,0),...built.col]);world.objects=new WorldObjects(world);
 const set=open=>world.objects.applyPatch({ops:[{op:'spawn',id:'chest',zone:'ship',model,kind:'toggle',toggleType:'lid',p:[0,0,0],r,state:{open}}]});
 const dispose=()=>{world.collider.geometry.dispose();built.col.forEach(g=>g.dispose());world.objects.clear();};return {world,set,dispose};
}
test('opened chests raycast to the visible interior floor, closed lids block the same ray',()=>{
 for(const model of ['nav_chest','arms_chest'])for(const r of [0,1.45]){
  const {world,set,dispose}=fixture(model,r),ray=()=>surfaceHit(world,new Vector3(0,2,0),new Vector3(0,-1,0),3);
  assert.ok(ray().point.y>.49,'closed before the initial state patch');
  set(true);assert.ok(Math.abs(ray().point.y-.06)<1e-6,'invisible solid interior remains');
  set(false);assert.ok(ray().point.y>.49);dispose();
 }
});
test('an astrolabe falls to the actual bottom of each opened chest without levitation',()=>{
 for(const model of ['nav_chest','arms_chest']){
  const {world,set,dispose}=fixture(model,1.45);set(true);
  const body=createBody({item:'astrolabe',p:[0,1.1,0]});
  advanceBody(body,6000,(p,r,from)=>sphereContact(world,p,r,from));
  assert.ok(body.sleeping);assert.ok(Math.abs(body.p[1]-supportHeight('astrolabe')-.066)<.002,`${model}: ${body.p}`);dispose();
 }
});
