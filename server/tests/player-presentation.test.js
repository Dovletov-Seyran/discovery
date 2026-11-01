import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
const {equip,performAction}=await import('../game/player-actions.js');
const rules=await import('../game/rules.js');
const {presentation}=await import('../../shared/player-presentation.js');
const messages=[],peer=[],elsewhere=[];
function actor(name,out,zone='ship'){const id=db.createUser(name,'fixture'),p=players.getOrCreate(id,name);p.connected=true;p.role='piloto';p.zone=zone;p.p=[0,1.95,8.6];p.ws={readyState:1,send:raw=>out.push(JSON.parse(raw))};return p;}
const p=actor('presenter',messages),other=actor('observer',peer),far=actor('elsewhere',elsewhere,'canary');
director.setHooks({isSceneComplete:()=>false});director.setScene('ship_day');far.zone='canary';
after(()=>db.closeDb());
function reset(){p.inventory=['sword','wine','cheese','espingarda'];p.equipped=null;p.equipmentRev=0;p.action=null;p.actionSeq=0;p.lastEquipAt=0;p.lastItemUse={};p.itemUses={};p.p=[0,1.95,8.6];messages.length=peer.length=elsewhere.length=0;}
test('equipment is inventory validated, visible to peers in the same zone and acknowledged to the owner',()=>{
 reset();assert.equal(equip(p,{item:'sword'}),true);assert.equal(p.equipped,'sword');
 for(const out of [messages,peer])assert.ok(out.some(m=>m.t==='player_equipment'&&m.item==='sword'));
 assert.equal(elsewhere.some(m=>m.t==='player_equipment'),false);
 peer.length=0;assert.equal(equip(p,{item:'fake_sword'}),false);assert.equal(p.equipped,'sword');assert.equal(peer.length,0);
 assert.equal(equip(p,{item:null}),true);assert.equal(p.equipped,null);
});
test('successful sword use emits one authoritative action; cooldown/absent item cannot animate fake attacks',()=>{
 reset();equip(p,{item:'sword'});rules.use(p,{item:'sword'});rules.use(p,{item:'sword'});rules.use(p,{item:'rum'});
 const actions=peer.filter(m=>m.t==='player_action');assert.equal(actions.length,1);assert.equal(actions[0].action.kind,'swing');assert.equal(actions[0].action.item,'sword');
 assert.equal(actions[0].action.equipmentRev,p.equipmentRev);assert.equal(actions[0].action.duration,580);
 assert.equal(elsewhere.some(m=>m.t==='player_action'),false);
});
test('consumed food clears the held state but sends a timed visual action with its original item',()=>{
 reset();equip(p,{item:'cheese'});rules.use(p,{item:'cheese'});
 assert.equal(p.equipped,null);assert.ok(!p.inventory.includes('cheese'));
 const action=peer.findLast(m=>m.t==='player_action').action;assert.equal(action.kind,'eat');assert.equal(action.item,'cheese');assert.equal(action.equipmentRev,p.equipmentRev);
 assert.ok(peer.some(m=>m.t==='player_equipment'&&m.item===null));
});
test('late-join public state contains held item and active action; expired/previous-scene actions are filtered',()=>{
 reset();equip(p,{item:'wine'});const action=performAction(p,'drink','wine');const info=players.publicInfo(p);
 assert.equal(info.equipped,'wine');assert.equal(info.action.seq,action.seq);
 assert.equal(presentation(p,action.startedAt+action.duration+1).action,null);p.scene='different-run';assert.equal(presentation(p).action,null);
});
test('equipped state survives SQLite save/reload and disappears if the inventory no longer owns it',()=>{
 reset();equip(p,{item:'sword'});players.save(p,{now:true});const saved=db.loadPlayer(p.id);assert.equal(saved.equipped,'sword');
 p.inventory=[];players.sendInventory(p);assert.equal(p.equipped,null);players.save(p,{now:true});assert.equal(db.loadPlayer(p.id).equipped,null);
});
test('a fresh server-side player restores a saved held item only when its inventory still contains it',()=>{
 const id=db.createUser('cold-presenter','fixture');
 db.savePlayer(id,{role:'piloto',zone:'ship',p:[0,0,0],inventory:['sword'],equipped:'sword',quests:{},log:[]},{now:true});
 assert.equal(players.getOrCreate(id,'cold-presenter').equipped,'sword');players.remove(id);
 db.savePlayer(id,{role:'piloto',zone:'ship',p:[0,0,0],inventory:[],equipped:'sword',quests:{},log:[]},{now:true});
 assert.equal(players.getOrCreate(id,'cold-presenter').equipped,null);players.remove(id);
});
