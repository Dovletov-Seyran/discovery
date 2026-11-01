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
const {clearObjectColliders}=await import('../world/object-collision.js');
seedWorld();
director.setHooks({isSceneComplete:()=>false});
const messages=[],second=[];
function player(name,out){const id=db.createUser(name,'fixture'),p=players.getOrCreate(id,name);p.connected=true;p.role='piloto';p.zone='ship';p.p=[1,0,-3];p.ws={readyState:1,send:json=>out.push(JSON.parse(json))};return p;}
const p=player('object-owner',messages),other=player('object-peer',second);
director.setScene('ship_day');p.zone=other.zone='ship';p.p=[1,0,-3];other.p=[1.4,0,-3];
after(()=>{clearObjectColliders();db.closeDb();});
const drops=()=>entities.allDefs().filter(d=>d.dynamic);
const reset=()=>{entities.reset();p.lastObjectAction=0;p.inventory=['wine','rum','sword'];p.itemUses={wine:2};p.zone='ship';p.p=[1,0,-3];other.zone='ship';messages.length=second.length=0;};

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
 reset();const now=Date.now();objects.throwItem(p,{item:'rum',p:[1,1.5,-3.3],v:[0,2,-3]});
 assert.equal(drops().length,1);const id=drops()[0].id;
 assert.ok(messages.some(m=>m.t==='world_event'&&m.type==='throw'&&m.who===p.id));
 for(let t=now;t<=now+9000;t+=100)objects.tickObjects(t);
 const st=entities.stateOf(id);assert.ok(st.body.sleeping);assert.ok(st.p[1]>=-.02);
 const saved=structuredClone(entities.snapshot());entities.reset();entities.load(saved);
 assert.equal(entities.def(id).item,'rum');assert.deepEqual(entities.stateOf(id).p,st.p);
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
 reset();const d=objects.spawnWorldItem({id:'agent:move',item:'rum',zone:'ship',p:[1,0,-3]});
 assert.equal(objects.setWorldObject(d.id,{p:[2,0,-3]}),true);assert.deepEqual(entities.positionOf(d.id),[2,0,-3]);
 assert.equal(objects.setWorldObject(d.id,{p:[NaN,0,0]}),false);
 assert.equal(objects.removeWorldObject(d.id),true);assert.equal(entities.def(d.id),undefined);
});

test('island throws use streamed terrain/colliders and finish above the water',async()=>{
 reset();const {resolveLayout}=await import('../world/terrain.js'),{loadContent}=await import('../content.js');
 const layout=resolveLayout(loadContent('canary_layout.json')).layout;
 p.zone='canary';p.p=[...layout.spawns.piloto.p];p.chunks=new Set([`canary:${Math.floor(p.p[0]/32)},${Math.floor(p.p[2]/32)}`]);
 const now=Date.now();objects.throwItem(p,{item:'rum',p:[p.p[0],p.p[1]+1.6,p.p[2]-.35],v:[0,2,-3]});
 const d=drops()[0];assert.ok(d);
 for(let t=now;t<now+10000;t+=100)objects.tickObjects(t);
 const st=entities.stateOf(d.id);assert.ok(st.body.sleeping);assert.ok(st.p[1]>=-.02);assert.ok(st.p.every(Number.isFinite));
});
