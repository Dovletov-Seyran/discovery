import {test,after}from'node:test';
import assert from'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.TTS='0';process.env.AI='1';
const db=await import('../db.js');const {players}=await import('../game/players.js');const director=await import('../game/director.js'),entities=await import('../game/entities.js');
await import('../game/index.js');const rules=await import('../game/rules.js');
const {perform,canPerform}=await import('../game/npc-performance.js');const ai=await import('../ai/index.js');
const {setTransport}=await import('../ai/llm.js');const {understand}=await import('../ai/understand.js');
const {npcActivity}=await import('../../shared/npc-activity.js');const {activePerformance}=await import('../../shared/npc-performance.js');
const party=['performer-listener-a','performer-listener-b'].map(name=>{const id=db.createUser(name,'fixture'),p=players.getOrCreate(id,name),messages=[];p.connected=true;p.role='grumete';p.ws={readyState:1,send:s=>messages.push(JSON.parse(s))};return {p,messages};});
after(()=>db.closeDb());

test('AI request starts a bounded shared performance; closing dialogue keeps it playing and the route resumes continuously',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);entities.reset();director.setScene('ship_day');now=director.startAt()+20000;
 setTransport(async(messages,opts)=>({text:opts.format?'{"kind":"topic","topic":"song","person":"none","action":"play_quiet"}':messages[0].content.includes('Translate')?'Сыграю тихую мелодию о доме.':'A quiet tune for home. Listen to the strings.',ms:1}));
 const [a,b]=party,def=entities.def('musician'),scene={id:'ship_day',startAt:director.startAt()};a.p.p=[...npcActivity(def,now/1000,scene).p];
 rules.dialogue(a.p,{active:true,npc:'musician',dialogueId:'song-talk'});
 await rules.npcTalk(a.p,{npc:'musician',text:'сыграй тихую мелодию о доме',dialogueId:'song-talk',requestId:'quiet'});
 const state=entities.stateOf('musician'),performance=state.performance;assert.equal(performance.song,'quiet');assert.equal(performance.until-performance.startAt,30000);
 for(const x of party)assert.ok(x.messages.some(m=>m.t==='entity'&&m.id==='musician'&&m.state.performance?.song==='quiet'));
 const frozen=npcActivity(def,now/1000,scene,state.paused).p;
 rules.dialogue(a.p,{active:false,dialogueId:'song-talk'});now+=4000;rules.syncNpcDialogues(now);
 assert.equal(entities.stateOf('musician').paused.kind,'performance');assert.deepEqual(npcActivity(def,now/1000,scene,entities.stateOf('musician').paused).p,frozen);
 const saved=JSON.parse(JSON.stringify(entities.snapshot()));entities.load(saved);assert.deepEqual(entities.stateOf('musician').performance,performance);
 assert.equal(canPerform('musician','quiet').reason,'playing');assert.equal(canPerform('cook','quiet').ok,false);assert.equal(canPerform('musician','../../remote.mp3').ok,false);
 now=performance.until+1;rules.syncNpcDialogues(now);assert.equal(entities.stateOf('musician').paused.at,null);
 assert.deepEqual(npcActivity(def,now/1000,scene,entities.stateOf('musician').paused).p,frozen);
 assert.equal(activePerformance(performance,scene,now),false);director.setScene('night_story');assert.equal(canPerform('musician','quiet').ok,false);
});

test('modern named songs, questions and negated requests do not trigger a performance',async()=>{
 const agent=ai.getAgent('musician');
 for(const [text,reply]of [['сыграй Metallica','{"kind":"unknown","topic":"song","person":"none","action":"play_cheerful"}'],['расскажи про песни','{"kind":"topic","topic":"song","person":"none","action":"play_quiet"}'],['не играй музыку','{"kind":"small_talk","topic":"none","person":"none","action":"play_cheerful"}']]){
  setTransport(async()=>({text:reply,ms:1}));assert.equal((await understand({agent,text,scene:'ship_day'})).action,null);
 }
});

test('a stop request clears shared performance and unrelated scene packets cannot play it',()=>{
 director.setScene('ship_evening');assert.equal(perform('musician','cheerful').ok,true);assert.ok(entities.stateOf('musician').performance);
 const saved=entities.stateOf('musician').performance;assert.equal(activePerformance(saved,{id:'night_story',startAt:director.startAt()},saved.startAt+1),false);
 assert.equal(perform('musician','stop').ok,true);assert.equal(entities.stateOf('musician').performance,null);
});
