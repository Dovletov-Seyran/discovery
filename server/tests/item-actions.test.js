import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {applyItemUse,advanceStamina} from '../game/item-actions.js';
import {freshVitals,ITEM_RULES} from '../../shared/item-actions.js';
import {readFileSync} from 'node:fs';
process.env.DB_FILE=':memory:';
const db=await import('../db.js');after(()=>db.closeDb());
const player=items=>({inventory:[...items],money:50,vitals:freshVitals(),itemUses:{},lastItemUse:{}});
test('every inventory item has a declared action, including rum',()=>{
 const items=JSON.parse(readFileSync(new URL('../../content/items.json',import.meta.url)));
 for(const item of items)assert.ok(ITEM_RULES[item.id],item.id);
});
test('rum stacks a real timed effect, is rate limited, and the bottle has two servings',()=>{
 const p=player(['rum']);const first=applyItemUse(p,'rum',1000);
 assert.equal(first.effect,'drink');assert.equal(p.vitals.drunkUntil,21000);assert.equal(p.vitals.drunkStrength,.65);assert.equal(p.itemUses.rum,1);
 assert.ok(applyItemUse(p,'rum',1200).error);assert.equal(p.itemUses.rum,1);
 applyItemUse(p,'rum',3000);assert.equal(p.vitals.drunkUntil,41000);assert.equal(p.vitals.drunkStrength,1);assert.deepEqual(p.inventory,[]);
 assert.ok(applyItemUse(p,'rum',5000).error);
});
test('food restores actual stamina, consumes the food, and water eventually leaves an empty barrel',()=>{
 const p=player(['cheese','meat','biscuit','barrel_full']);p.vitals.stamina=10;
 applyItemUse(p,'cheese',0);assert.equal(p.vitals.stamina,45);assert.ok(!p.inventory.includes('cheese'));
 applyItemUse(p,'meat',1000);assert.equal(p.vitals.stamina,95);
 applyItemUse(p,'biscuit',2000);assert.equal(p.vitals.stamina,100);
 for(const now of [3000,5000,7000])applyItemUse(p,'barrel_full',now);
 assert.ok(p.inventory.includes('barrel'));assert.ok(!p.inventory.includes('barrel_full'));
});
test('sprinting spends stamina, rest restores it, gun cooldown prevents instant fire',()=>{
 const p=player(['espingarda']);p.a='run';p.lastMoveAt=1000;
 advanceStamina(p,1,1000);assert.equal(p.vitals.stamina,88);
 p.a='idle';advanceStamina(p,1,2000);assert.equal(p.vitals.stamina,94);
 assert.equal(applyItemUse(p,'espingarda',3000).effect,'shot');assert.ok(applyItemUse(p,'espingarda',3200).error);
 assert.equal(applyItemUse(p,'espingarda',5600).effect,'shot');
});
test('effects and remaining servings survive a real SQLite save/reload',()=>{
 const id=db.createUser('drinker','fixture'),p=player(['wine']);applyItemUse(p,'wine',10000);
 db.savePlayer(id,{...p,role:'piloto',zone:'ship',p:[0,0,0],scene:'test',quests:{},log:[]},{now:true});
 const saved=db.loadPlayer(id);assert.equal(saved.itemUses.wine,2);assert.deepEqual(saved.vitals,p.vitals);
 saved.lastItemUse={};applyItemUse(saved,'wine',12000);assert.equal(saved.itemUses.wine,1);
});
test('merchant purchase state persists even after a purchased food has been eaten',()=>{
 const id=db.createUser('buyer','fixture'),p=player(['cheese']);p.trade={'trader:cheese':{price:35,low:0,sold:true}};
 applyItemUse(p,'cheese',0);db.savePlayer(id,{...p,role:'lengua',zone:'canary',p:[0,0,0],scene:'shop',quests:{},log:[]},{now:true});
 const saved=db.loadPlayer(id);assert.deepEqual(saved.inventory,[]);assert.equal(saved.trade['trader:cheese'].sold,true);
});
