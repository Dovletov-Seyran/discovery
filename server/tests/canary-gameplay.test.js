import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';
const db=await import('../db.js'),{players}=await import('../game/players.js'),director=await import('../game/director.js'),rules=await import('../game/rules.js'),entities=await import('../game/entities.js'),quests=await import('../game/quests.js');
const messages=[];
function actor(name,role){const p=players.getOrCreate(db.createUser(name,'fixture'),name);p.role=role;p.connected=true;p.ws={readyState:1,send:s=>messages.push(JSON.parse(s))};return p;}
const sailor=actor('island-sailor','grumete'),pilot=actor('island-pilot','piloto');actor('island-language','lengua');
director.setHooks({onSceneStart:rules.onSceneStart,isSceneComplete:()=>false});director.setScene('canary');
after(()=>db.closeDb());
const approach=(p,id)=>{p.zone='canary';p.p=[...entities.def(id).p];};
test('the well fills only after work completes and walking away cancels without consuming a barrel',()=>{
 approach(sailor,'well');sailor.inventory=['barrel'];rules.interact(sailor,{id:'well'});
 assert.deepEqual(sailor.inventory,['barrel']);rules.tickVitals(Date.now()+4000);assert.deepEqual(sailor.inventory,['barrel_full']);
 sailor.inventory=['barrel'];rules.interact(sailor,{id:'well'});sailor.p=[0,0,0];rules.tickVitals(Date.now()+4000);assert.deepEqual(sailor.inventory,['barrel']);
});
test('carpenter keeps the final supply until work ends and only then completes the repair quest',()=>{
 approach(pilot,'carpenter');pilot.inventory=['planks','tar'];pilot.quests.q_rudder={status:'active',step:2,count:0,sub:[],got:[]};
 rules.interact(pilot,{id:'carpenter'});assert.equal(pilot.inventory.length,1);assert.notEqual(pilot.quests.q_rudder.status,'done');
 rules.tickVitals(Date.now()+4000);assert.equal(pilot.inventory.length,0);assert.equal(pilot.quests.q_rudder.status,'done');
});
test('three landmarks can be read in any order and are an optional, persisted quest',()=>{
 for(const id of ['gomera_market_history','gomera_well_history','gomera_yard_history']){approach(sailor,id);rules.interact(sailor,{id});}
 assert.equal(sailor.quests.q_gomera_history.status,'done');players.save(sailor,{now:true});assert.equal(db.loadPlayer(sailor.id).quests.q_gomera_history.status,'done');
 assert.equal(quests.sceneQuests('canary').find(q=>q.id==='q_gomera_history').optional,true);
 assert.ok(messages.some(m=>m.t==='island_activity'&&m.status==='started'));assert.ok(messages.some(m=>m.t==='island_activity'&&m.status==='done'));
});

test('NPC scene schedules are objects, not presence arrays, and interaction must not throw',()=>{
 director.setScene('ship_day');pilot.p=[...entities.def('columbus').p];pilot.zone='ship';
 assert.equal(Array.isArray(entities.def('columbus').scenes),false);
 assert.doesNotThrow(()=>rules.interact(pilot,{id:'columbus'}));
});
