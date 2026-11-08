import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';
const db=await import('../db.js'),{players}=await import('../game/players.js'),director=await import('../game/director.js'),entities=await import('../game/entities.js'),rules=await import('../game/rules.js');
const p=players.getOrCreate(db.createUser('treasure-fixture','fixture'),'Finder');Object.assign(p,{role:'grumete',connected:true,ws:{readyState:1,send(){}},inventory:[],trade:{}});
director.setHooks({onSceneStart:rules.onSceneStart,isSceneComplete:()=>false});director.setScene('canary');after(()=>db.closeDb());
const approach=id=>{p.zone='canary';p.p=[...entities.def(id).p];};
test('buried chest stays hidden; only a map, held shovel and completed nearby dig reveal it, loot is not duplicated',()=>{
 assert.equal(entities.stateOf('treasure_chest').visible,false);approach('treasure_site');rules.interact(p,{id:'treasure_site'});rules.tickVitals(Date.now()+5000);assert.equal(entities.stateOf('treasure_chest').visible,false);
 p.inventory=['treasure_map'];p.equipped=null;rules.interact(p,{id:'treasure_site'});rules.tickVitals(Date.now()+5000);assert.equal(entities.stateOf('treasure_chest').visible,false);
 p.inventory=['treasure_map','shovel'];p.equipped='shovel';rules.interact(p,{id:'treasure_site'});assert.equal(entities.stateOf('treasure_chest').visible,false);rules.tickVitals(Date.now()+4000);assert.equal(entities.stateOf('treasure_chest').visible,true);
 approach('treasure_chest');const money=p.money;rules.interact(p,{id:'treasure_chest'});rules.interact(p,{id:'treasure_chest'});assert.equal(p.money,money+75);assert.equal(p.inventory.filter(x=>x==='medallion').length,1);assert.equal(db.loadPlayer(p.id).trade.treasure_claimed,true);assert.equal(p.quests.q_treasure.status,'done');assert.equal(entities.stateOf('treasure_chest').looted,true);
});
