import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.DB_FILE=':memory:';process.env.AI='1';process.env.TTS='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js'),entities=await import('../game/entities.js');
await import('../game/index.js');
const {tickNpcBrain,resetNpcBrain,routeIsClear,chooseNpcJobs}=await import('../game/npc-brain.js');
const {npcRoute}=await import('../../shared/npc-navigation.js');
const {npcActivity}=await import('../../shared/npc-activity.js');
const {setTransport}=await import('../ai/llm.js');
const routines=JSON.parse(readFileSync(new URL('../../content/npc-routines.json',import.meta.url)));
const id=db.createUser('routine-observer','fixture'),p=players.getOrCreate(id,'routine-observer');p.connected=true;p.role='grumete';p.ws={readyState:1,send(){}};
after(()=>db.closeDb());

test('every profession graph connects its jobs without crossing the actual ship',()=>{
 for(const [id,profile]of Object.entries(routines))for(const [scene,g]of Object.entries(profile.scenes)){
  assert.ok(g.jobs.length>=2);
  for(const a of g.jobs)for(const b of g.jobs){const path=npcRoute(g,g.nodes[a.node],b.node);
   assert.ok(path,`${id}: disconnected ${a.id} -> ${b.id}`);assert.ok(routeIsClear(path,{id:scene}),`${id}: unsafe ${a.id} -> ${b.id}`);
  }
 }
});

test('one model call chooses the batch from per-NPC enums without coordinates',async()=>{
 let calls=0;
 setTransport(async(messages,opts)=>{calls++;assert.ok(opts.maxTokens<=180);
  assert.deepEqual(opts.format.properties.cook.enum,['cook','serve']);assert.equal(opts.format.additionalProperties,false);
  return {text:'{"cook":"serve"}',ms:1};
 });
 const result=await chooseNpcJobs([{id:'cook',profession:'Cook',jobs:[{id:'cook',title:'Cook at galley'},{id:'serve',title:'Serve food'}]}],{id:'ship_day'});
 assert.deepEqual(result,{cook:'serve'});assert.equal(calls,1);
});

test('safe choices are synchronized, bounded, persisted, and never replace a live conversation',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);entities.reset();director.setScene('ship_day');resetNpcBrain();now=director.startAt()+20000;
 let calls=0;
 await tickNpcBrain(now,async candidates=>{calls++;return Object.fromEntries(candidates.map(c=>[c.id,c.jobs.at(-1).id]));});
 assert.equal(calls,1);
 const scene={id:'ship_day',startAt:director.startAt()},all=entities.snapshot();
 const behavior=entities.stateOf('cook')?.behavior;assert.ok(behavior);assert.equal(behavior.source,'llm');
 const def=entities.def('cook'),one=npcActivity(def,(now+2000)/1000,scene,null,behavior),two=npcActivity(def,(now+2000)/1000,scene,null,structuredClone(behavior));
 assert.deepEqual(one,two);assert.ok(routeIsClear(behavior.path,scene));
 entities.load(JSON.parse(JSON.stringify(all)));assert.deepEqual(entities.stateOf('cook').behavior,behavior);
 p.dialogue={npc:'cook',id:'locked',until:now+120000};now+=60000;
 await tickNpcBrain(now,async()=>{throw Error('must not invoke model during conversation');});assert.equal(calls,1);
 assert.deepEqual(entities.stateOf('cook').behavior,behavior);p.dialogue=null;
});

test('a scene change discards a model decision that arrived late',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);entities.reset();director.setScene('ship_day');resetNpcBrain();now=director.startAt()+20000;
 let resolve;const pending=tickNpcBrain(now,()=>new Promise(r=>resolve=r));
 director.setScene('night_story');resolve({cook:'serve'});await pending;
 assert.equal(entities.stateOf('cook')?.behavior,undefined);
});

test('unknown jobs and invented coordinates cannot enter the movement state',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);entities.reset();director.setScene('ship_day');resetNpcBrain();now=director.startAt()+20000;
 await tickNpcBrain(now,async()=>({cook:{p:[999,999,999]},columbus:'leave_ship'}));
 for(const d of entities.allDefs()){
  const behavior=entities.stateOf(d.id)?.behavior;if(!behavior)continue;
  assert.ok(routines[d.id].scenes.ship_day.jobs.some(j=>j.id===behavior.job));
  assert.ok(behavior.path.every(p=>p.every(v=>Math.abs(v)<30)));
 }
});
