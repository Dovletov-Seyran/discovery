import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STAMINA,staminaStep,restoreVitals} from '../../shared/stamina.js';
test('six-minute presentation sprint retains a reserve on client and server clocks',()=>{
 let client=STAMINA.max,server=STAMINA.max;
 for(let i=0;i<360*60;i++)client=staminaStep(client,true,1/60);
 for(let i=0;i<360*15;i++)server=staminaStep(server,true,1/15);
 assert.ok(client>29.99&&server>29.99);assert.ok(Math.abs(client-server)<1e-6);
 assert.equal(staminaStep(0,false,10),STAMINA.max);assert.equal(staminaStep(1,true,10),0);
});
test('old saves preserve reserve percentage and health, migrate once and use the new capacity',()=>{
 const old=restoreVitals({stamina:50,hp:72});assert.equal(old.stamina,150);assert.equal(old.hp,72);
 assert.deepEqual(restoreVitals(old),old);assert.equal(restoreVitals().stamina,300);assert.equal(restoreVitals({stamina:0}).stamina,0);
});
