import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {inWeaponArc} from '../../shared/weapon-rules.js';
process.env.DB_FILE=':memory:';process.env.AI='0';
const db=await import('../db.js'),{players}=await import('../game/players.js'),director=await import('../game/director.js'),entities=await import('../game/entities.js'),combat=await import('../game/combat.js'),{weaponAttack}=await import('../game/weapons.js');
after(()=>db.closeDb());
const messages=[],p=players.getOrCreate(db.createUser('weapon-fixture','fixture'),'Fighter');Object.assign(p,{role:'piloto',connected:true,p:[0,0,0],r:0,ws:{readyState:1,send:s=>messages.push(JSON.parse(s))}});
test('weapon arcs reject targets behind the player, out of range and far outside vertical aim',()=>{
 assert.equal(inWeaponArc(p,[0,0,-2],'sword'),true);assert.equal(inWeaponArc(p,[0,0,2],'sword'),false);assert.equal(inWeaponArc(p,[0,0,-8],'sword'),false);
 assert.equal(inWeaponArc(p,[0,0,-20],'espingarda'),true);assert.equal(inWeaponArc({...p,pitch:1},[0,0,-20],'espingarda'),false);
});
test('a sword damages an NPC and a close aimed gunshot kills, cooldown and zone checks prevent forged damage',()=>{
 director.setHooks({isSceneComplete:()=>false});director.setScene('canary');const npc=entities.def('town_1');p.zone='canary';p.p=[npc.p[0],npc.p[1],npc.p[2]+1.7];p.r=0;p.pitch=0;p.inventory=['sword','espingarda'];p.equipped='sword';p.lastItemUse={};
 const now=Date.now()+3000;assert.equal(weaponAttack(p,{target:npc.id},now),true);assert.equal(entities.stateOf(npc.id).hp,45);assert.equal(weaponAttack(p,{target:npc.id},now+10),false);
 p.equipped='espingarda';assert.equal(weaponAttack(p,{target:npc.id},now+1000),true);assert.equal(entities.stateOf(npc.id).dead,true);assert.ok(messages.some(m=>m.t==='item_used'&&m.effect==='shot'));
});

test('gunshots at village residents trigger retaliation, with permanent-down enemies until a scene restart',()=>{
 director.setScene('p2_day');combat.reset();const npc=entities.def('villager_2');p.zone='guanahani';p.p=[npc.p[0],npc.p[1],npc.p[2]+1.7];p.r=0;p.pitch=0;p.equipped='espingarda';p.inventory=['espingarda'];p.lastItemUse={};
 assert.equal(weaponAttack(p,{target:npc.id},Date.now()+10000),true);assert.equal(combat.level(),'fight');assert.equal(entities.stateOf(npc.id).dead,true);
 assert.ok(combat.state().warriors.length>0);
});

test('cross-zone targets and a real island house both prevent gun damage',async()=>{
 director.setScene('canary');const npc=entities.def('town_1');entities.setState(npc.id,{dead:false,hp:100,down:0});
 p.zone='ship';p.p=[0,0,-3];p.inventory=['espingarda'];p.equipped='espingarda';p.r=0;p.lastItemUse={};
 assert.equal(weaponAttack(p,{target:npc.id},Date.now()+20000),false);assert.equal(entities.stateOf(npc.id).hp,100);
 const {seedWorld}=await import('../world/generate.js');seedWorld();p.zone='canary';p.p=[225,npc.p[1],npc.p[2]];p.r=-Math.PI/2;p.pitch=0;p.lastItemUse={};
 assert.equal(weaponAttack(p,{target:npc.id},Date.now()+22000),false);assert.equal(entities.stateOf(npc.id).hp,100);
});
