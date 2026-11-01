import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';
const db=await import('../db.js');
const memory=await import('../ai/memory.js');
memory.setStore({load:db.loadAgentMemory,save:db.saveAgentMemory,reset:db.deleteAgentMemory});
after(()=>db.closeDb());
test('new NPC memory (summary, visits, dialogue turns) round-trips through real SQLite adapter',()=>{
 const data={told:['why_west'],turns:[{role:'user',content:'My name is Sanjar',at:123}],summary:'They study navigation.',lastAt:123,lastScene:'ship_day',visits:2};
 memory.saveMemory(7,'columbus',data);
 assert.deepEqual(memory.loadMemory(7,'columbus'),data);
 memory.resetMemory(7,'columbus');assert.equal(memory.loadMemory(7,'columbus').summary,'');
});
