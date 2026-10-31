import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';
process.env.AI='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
const rules=await import('../game/rules.js');
const entities=await import('../game/entities.js');
const quests=await import('../game/quests.js');
const received=[];
const id=db.createUser('test-crew','fixture');
const p=players.getOrCreate(id,'test-crew');
p.connected=true;p.role='piloto';p.ws={readyState:1,send:json=>received.push(JSON.parse(json))};
let complete=false;
director.setHooks({isSceneComplete:()=>complete});
after(()=>db.closeDb());

test('expired play timer does not complete unfinished quests',()=>{
  director.setScene('ship_day');received.length=0;
  director.tick(director.startAt()+9999999);
  assert.equal(director.scene().id,'ship_day');
  assert.equal(received.some(m=>m.t==='scene'),false);
});
test('all tasks complete waits for dialogue, then advances without ready votes',()=>{
  director.setScene('ship_evening');complete=true;p.ready=false;
  const now=director.startAt()+2000;
  p.dialogue={id:'open',until:now+30000};
  director.tick(now);assert.equal(director.scene().id,'ship_evening');
  rules.dialogue(p,{active:false,dialogueId:'old'});
  assert.ok(p.dialogue);
  rules.dialogue(p,{active:false,dialogueId:'open'});
  director.tick(now);assert.equal(director.scene().id,'cut_night');
  complete=false;
});
test('lost dialogue lease does not hold the party forever; cutscene keeps timeline',()=>{
  director.setScene('ship_evening');complete=true;
  p.dialogue={until:director.startAt()+1000};
  director.tick(director.startAt()+2000);assert.equal(director.scene().id,'cut_night');
  director.tick(director.startAt()+1000);assert.equal(director.scene().id,'cut_night');
  director.tick(director.startAt()+26000);assert.equal(director.scene().id,'night_story');
  complete=false;
});
function approach(npc){const d=entities.def(npc);p.zone=d.zone;p.p=[d.x,3,d.z];}
test('NPC refuses remote dialogue and explicitly answers cooldown with matching request id',async()=>{
  director.setScene('ship_day');approach('columbus');
  p.lastNpcTalkAt=Date.now();received.length=0;
  rules.dialogue(p,{npc:'columbus',dialogueId:'d1',active:true});
  assert.equal(p.dialogue.id,'d1');
  await rules.npcTalk(p,{npc:'columbus',text:'Зачем?',dialogueId:'d1',requestId:'r1'});
  assert.ok(received.some(m=>m.t==='npc_say'&&m.error&&m.requestId==='r1'));
  rules.dialogue(p,{dialogueId:'d1',active:false});
  p.p=[400,3,400];
  rules.dialogue(p,{npc:'columbus',dialogueId:'remote',active:true});
  assert.equal(p.dialogue,null);
});
test('closing a conversation suppresses its late AI reply',async()=>{
  approach('columbus');p.lastNpcTalkAt=0;received.length=0;
  rules.dialogue(p,{npc:'columbus',dialogueId:'old',active:true});
  const pending=rules.npcTalk(p,{npc:'columbus',text:'Зачем на запад?',dialogueId:'old',requestId:'late'});
  rules.dialogue(p,{dialogueId:'old',active:false});
  await pending;
  assert.equal(received.some(m=>m.t==='npc_say'),false);
});
test('NPC response echoes dialogue/request ids; duplicate requests do not overlap',async()=>{
  approach('columbus');p.lastNpcTalkAt=0;received.length=0;
  rules.dialogue(p,{npc:'columbus',dialogueId:'new',active:true});
  const pending=rules.npcTalk(p,{npc:'columbus',text:'Зачем на запад?',dialogueId:'new',requestId:'first'});
  await rules.npcTalk(p,{npc:'columbus',text:'Что обещано?',dialogueId:'new',requestId:'duplicate'});
  await pending;
  assert.equal(received.filter(m=>m.t==='npc_thinking').length,1);
  assert.ok(received.some(m=>m.t==='npc_say'&&m.requestId==='first'&&m.dialogueId==='new'&&!m.error));
  assert.ok(received.some(m=>m.t==='npc_say'&&m.requestId==='duplicate'&&m.error));
});
test('astrolabe requires a valid measured angle as well as the latitude answer',()=>{
  p.inventory=['astrolabe'];p.role='piloto';p.quests={};entities.reset();
  quests.onSceneStart(director.scene(),[p]);
  rules.minigame(p,{game:'astrolabe',result:{answer:33,angle:5}});
  assert.notEqual(p.quests.q_latitude.status,'done');
  rules.minigame(p,{game:'astrolabe',result:{answer:33,angle:73}});
  assert.equal(p.quests.q_latitude.status,'done');
});
test('navigation task advances through owned compass and map use, once per step',()=>{
  p.inventory=['compass','map'];p.quests={};entities.reset();quests.onSceneStart(director.scene(),[p]);
  rules.use(p,{item:'sword'});assert.equal(p.quests.q_navigation.step,0);
  rules.use(p,{item:'compass'});assert.equal(p.quests.q_navigation.step,1);
  rules.use(p,{item:'compass'});assert.equal(p.quests.q_navigation.step,1);
  rules.use(p,{item:'map'});assert.equal(p.quests.q_navigation.status,'done');
});
