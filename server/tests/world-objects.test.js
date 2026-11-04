import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';
const db=await import('../db.js');
const {seedWorld}=await import('../world/generate.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
const entities=await import('../game/entities.js');
const objects=await import('../game/objects.js');
const rules=await import('../game/rules.js');
const {clearObjectColliders,surfaceAt}=await import('../world/object-collision.js');
const {supportHeight}=await import('../../shared/object-physics.js');
seedWorld();
director.setHooks({isSceneComplete:()=>false});
const messages=[],second=[];
function player(name,out){const id=db.createUser(name,'fixture'),p=players.getOrCreate(id,name);p.connected=true;p.role='piloto';p.zone='ship';p.p=[1,0,-3];p.ws={readyState:1,send:json=>out.push(JSON.parse(json))};return p;}
const p=player('object-owner',messages),other=player('object-peer',second);
director.setScene('ship_day');p.zone=other.zone='ship';p.p=[1,0,-3];other.p=[1.4,0,-3];
after(()=>{clearObjectColliders();db.closeDb();});
const drops=()=>entities.allDefs().filter(d=>d.dynamic);
const reset=()=>{entities.reset();p.lastObjectAction=0;p.inventory=['wine','cup','sword'];p.itemUses={wine:2};p.zone='ship';p.p=[1,0,-3];other.zone='ship';messages.length=second.length=0;};

test('placement removes inventory atomically, preserves servings and reaches both clients',()=>{
 reset();objects.place(p,{item:'wine',p:[1,.185,-3.8],r:0});
 assert.equal(p.inventory.includes('wine'),false);assert.equal(drops().length,1);
 const d=drops()[0];assert.equal(entities.stateOf(d.id).uses,2);
 for(const out of [messages,second])assert.ok(out.some(m=>m.t==='world_patch'&&m.ops.some(op=>op.id===d.id)));
 objects.place(p,{item:'wine',p:[1,.185,-3.8],r:0});assert.equal(drops().length,1);
 p.p=[1,0,-3.8];rules.pickup(p,{id:d.id});assert.equal(p.inventory.filter(i=>i==='wine').length,1);assert.equal(p.itemUses.wine,2);
 rules.pickup(other,{id:d.id});assert.equal(other.inventory.includes('wine'),false);
});
test('server rejects distant placements, non-finite coordinates, empty air and excessive throws',()=>{
 reset();for(const pos of [[100,.18,100],[NaN,.18,0],[1,8,-3]])objects.place(p,{item:'wine',p:pos,r:0});
 objects.throwItem(p,{item:'sword',p:[1,1.5,-3],v:[200,1,0]});
 assert.equal(drops().length,0);assert.equal(p.inventory.length,3);
});
test('throw gets a server launch time, simulation and final authoritative rest; persists across reload',()=>{
 reset();const now=Date.now();objects.throwItem(p,{item:'cup',p:[1,1.5,-3.3],v:[0,2,-3]});
 assert.equal(drops().length,1);const id=drops()[0].id;
 assert.ok(messages.some(m=>m.t==='world_event'&&m.type==='throw'&&m.who===p.id));
 for(let t=now;t<=now+9000;t+=100)objects.tickObjects(t);
 const st=entities.stateOf(id);assert.ok(st.body.sleeping);assert.ok(st.p[1]>=-.02);
 const saved=structuredClone(entities.snapshot());entities.reset();entities.load(saved);
 assert.equal(entities.def(id).item,'cup');assert.deepEqual(entities.stateOf(id).p,st.p);
});
test('door and chest state is authoritative, nearby only, and closing does not trap a player',()=>{
 reset();const chest=entities.def('nav_chest');p.p=[...chest.p];objects.toggle(p,{id:chest.id});assert.equal(entities.stateOf(chest.id).open,true);
 p.p=[200,0,200];objects.toggle(p,{id:'arms_chest'});assert.equal(entities.stateOf('arms_chest'),undefined);
 const door=entities.allDefs().find(d=>d.toggleType==='door');assert.ok(door);
 p.zone='canary';p.p=[door.p[0],door.p[1],door.p[2]+1];p.chunks=new Set([`canary:${Math.floor(door.p[0]/32)},${Math.floor(door.p[2]/32)}`]);objects.toggle(p,{id:door.id});
 assert.equal(entities.stateOf(door.id).open,true);
 entities.setState(door.id,{changedAt:0});other.zone='canary';other.p=[...door.p];
 objects.toggle(p,{id:door.id});assert.equal(entities.stateOf(door.id).open,true);
});
test('agent-spawned items are registered before the patch, can be picked up and remain zone-scoped',()=>{
 reset();other.zone='canary';
 const d=objects.spawnWorldItem({id:'agent:biscuit',item:'biscuit',zone:'ship',p:[1,.1,-3]});assert.ok(d);
 assert.ok(messages.some(m=>m.t==='world_patch'&&m.ops.some(op=>op.id===d.id)));
 assert.equal(second.some(m=>m.t==='world_patch'&&m.ops.some(op=>op.id===d.id&&op.op!=='remove')),false);
 rules.pickup(p,{id:d.id});assert.ok(p.inventory.includes('biscuit'));
});

test('a consumed dynamic serving frees its registry entry; agent ids cannot respawn an owned object',()=>{
 reset();const d=objects.spawnWorldItem({id:'agent:food',item:'biscuit',zone:'ship',p:[1,0,-3]});
 rules.pickup(p,{id:d.id});assert.equal(objects.spawnWorldItem({id:d.id,item:'biscuit',zone:'ship',p:[1,0,-3]}),null);
 p.lastItemUse={};rules.use(p,{item:'biscuit'});assert.equal(entities.def(d.id),undefined);
});
test('agent helpers move and remove a dynamic object, and changes persist',()=>{
 reset();const d=objects.spawnWorldItem({id:'agent:move',item:'cup',zone:'ship',p:[1,0,-3]});
 assert.equal(objects.setWorldObject(d.id,{p:[2,0,-3]}),true);assert.deepEqual(entities.positionOf(d.id),[2,0,-3]);
 assert.equal(objects.setWorldObject(d.id,{p:[NaN,0,0]}),false);
 assert.equal(objects.removeWorldObject(d.id),true);assert.equal(entities.def(d.id),undefined);
});

test('island throws use streamed terrain/colliders and finish above the water',async()=>{
 reset();const {resolveLayout}=await import('../world/terrain.js'),{loadContent}=await import('../content.js');
 const layout=resolveLayout(loadContent('canary_layout.json')).layout;
 p.zone='canary';p.p=[...layout.spawns.piloto.p];p.chunks=new Set([`canary:${Math.floor(p.p[0]/32)},${Math.floor(p.p[2]/32)}`]);
 const now=Date.now();objects.throwItem(p,{item:'cup',p:[p.p[0],p.p[1]+1.6,p.p[2]-.35],v:[0,2,-3]});
 const d=drops()[0];assert.ok(d);
 for(let t=now;t<now+10000;t+=100)objects.tickObjects(t);
 const st=entities.stateOf(d.id);assert.ok(st.body.sleeping);assert.ok(st.p[1]>=-.02);assert.ok(st.p.every(Number.isFinite));
});

test('saved sphere-era pickups migrate to centred shapes without resetting inventory or entity ids',()=>{
 reset();const d=objects.spawnWorldItem({id:'legacy:map',item:'map',zone:'ship',p:[1,0,-3.8],uses:3});
 entities.setState(d.id,{body:{p:[1,.5,-3.8],v:[0,0,0],radius:.5,item:'map',startedAt:0,step:960,sleeping:true,roll:false}});
 const inventory=[...p.inventory];objects.tickObjects(Date.now());const st=entities.stateOf(d.id);
 assert.equal(st.body.version,3);assert.equal(st.uses,3);assert.equal(st.body.item,'map');assert.ok(st.body.p[1]<.1);assert.deepEqual(p.inventory,inventory);
});

test('opening a lid wakes a settled item and it falls into the hollow chest',async()=>{
 reset();const {createBody}=await import('../../shared/object-physics.js'),chest=entities.def('nav_chest');
 const now=Date.now(),id='fixture:chest-astrolabe',p0=[chest.p[0],chest.p[1]+.76,chest.p[2]];
 objects.spawnWorldItem({id,item:'astrolabe',zone:'ship',p:[p0[0],p0[1]-.025,p0[2]]});
 entities.setState(id,{body:{...createBody({p:p0,item:'astrolabe',startedAt:now}),sleeping:true}});
 p.p=[chest.p[0]+.8,chest.p[1],chest.p[2]];objects.toggle(p,{id:chest.id});
 assert.equal(entities.stateOf(chest.id).open,true);assert.equal(entities.stateOf(id).body.sleeping,false);
 for(let t=now;t<=now+8000;t+=100)objects.tickObjects(t);
 const body=entities.stateOf(id).body;assert.ok(body.sleeping);assert.ok(Math.abs(body.p[1]-(chest.p[1]+.091))<.005,`still floating: ${body.p}`);
});

test('removed item types cannot be spawned or restored from old world saves',()=>{
 reset();const old={id:'legacy:removed',item:'retired-fixture-item',kind:'item',zone:'ship',p:[1,0,-3]};
 assert.equal(objects.spawnWorldItem(old),null);assert.equal(entities.register(old),null);
 const saved=entities.snapshot();saved.dynamic.push(old);saved.objects[old.id]={holder:null};entities.load(saved);
 assert.equal(entities.def(old.id),undefined);assert.equal(entities.stateOf(old.id),undefined);
});
test('в трюме предмет остаётся там, куда положен: пол ниже −2 м — это не «за бортом»',()=>{
 reset();p.p=[0,-2.6,-1];const now=Date.now();
 objects.place(p,{item:'sword',p:[0,-2.6+.06,-1.9],r:0});
 assert.equal(drops().length,1);const id=drops()[0].id;
 for(let t=now;t<=now+6000;t+=100)objects.tickObjects(t);
 const rest=entities.stateOf(id).p;assert.ok(rest[1]<-2.4,`упал не на пол: ${rest}`);assert.ok(Math.abs(rest[2]+1.9)<.3,`перенесён к ногам: ${rest}`);
});
test('предмет возвращается на своё пустое место: ружьё в стойку, из выброшенного тоже',()=>{
 reset();p.inventory=[];p.p=[-.65,-2.6,6.3];
 rules.pickup(p,{id:'hold_gun_1'});assert.ok(p.inventory.includes('espingarda'));assert.equal(entities.stateOf('hold_gun_1').holder,p.id);
 objects.restore(p,{item:'sword',id:'hold_gun_1'});assert.ok(p.inventory.includes('espingarda'),'чужое место');
 objects.restore(p,{item:'espingarda',id:'hold_gun_2'});assert.ok(p.inventory.includes('espingarda'),'занятое место');
 objects.restore(p,{item:'espingarda',id:'hold_gun_1'});
 assert.equal(p.inventory.includes('espingarda'),false);assert.equal(entities.stateOf('hold_gun_1').holder,null);assert.equal(drops().length,0);
 assert.ok(messages.some(m=>m.t==='world_patch'&&m.ops.some(op=>op.id==='hold_gun_1'&&op.state.holder===null)));
 // выбросил, поднял с пола, повесил обратно: на полу копии не остаётся
 p.lastObjectAction=0;rules.pickup(p,{id:'hold_sword_1'});
 objects.place(p,{item:'sword',p:[.2,-2.6+supportHeight('sword')+.015,5.2],r:0});assert.equal(drops().length,1);assert.equal(entities.stateOf('hold_sword_1').holder,'placed');
 p.lastObjectAction=0;rules.pickup(p,{id:drops()[0].id});
 objects.restore(p,{item:'sword',id:'hold_sword_1'});
 assert.equal(p.inventory.includes('sword'),false);assert.equal(drops().length,0);assert.equal(entities.stateOf('hold_sword_1').holder,null);
 // издалека и сквозь палубу нельзя
 p.lastObjectAction=0;rules.pickup(p,{id:'hold_gun_3'});p.p=[-1.05,0,7.2];
 objects.restore(p,{item:'espingarda',id:'hold_gun_3'});assert.ok(p.inventory.includes('espingarda'),'сквозь палубу');
});
test('записка возвращается в сундук, только когда он открыт',()=>{
 reset();p.inventory=[];p.p=[-.3,-2.6,-5.85];
 objects.toggle(p,{id:'hold_stores'});assert.equal(entities.stateOf('hold_stores').open,true);
 rules.pickup(p,{id:'hold_note_stores'});assert.ok(p.inventory.includes('note_stores'));
 entities.setState('hold_stores',{open:false,changedAt:0});
 objects.restore(p,{item:'note_stores',id:'hold_note_stores'});assert.ok(p.inventory.includes('note_stores'),'сквозь закрытую крышку');
 entities.setState('hold_stores',{open:true,changedAt:0});
 objects.restore(p,{item:'note_stores',id:'hold_note_stores'});
 assert.equal(p.inventory.includes('note_stores'),false);assert.equal(entities.stateOf('hold_note_stores').holder,null);
});
test('листок, положенный в открытый сундук в трюме, остаётся в нём',()=>{
 reset();p.inventory=['note_stores'];p.p=[-.7,-2.6,-5.85];
 objects.toggle(p,{id:'hold_stores'});
 const eye=[p.p[0],p.p[1]+1.6,p.p[2]],aim=[-1.25,-2.5,-5.85],len=Math.hypot(...aim.map((x,i)=>x-eye[i]));
 const hit=surfaceAt('ship',eye,aim.map((x,i)=>(x-eye[i])/len),3.5);assert.ok(hit&&hit.point.y<-2.3,`луч не в дно сундука: ${hit?.point.y}`);
 const now=Date.now();objects.place(p,{item:'note_stores',p:[hit.point.x,hit.point.y+.015+supportHeight('note_stores'),hit.point.z],r:0});
 assert.equal(drops().length,1);const id=drops()[0].id;
 for(let t=now;t<=now+6000;t+=100)objects.tickObjects(t);
 const rest=entities.stateOf(id).p;assert.ok(rest[1]<-2.3&&Math.abs(rest[0]+1.25)<.5&&Math.abs(rest[2]+5.85)<.5,`не в сундуке: ${rest}`);
});
