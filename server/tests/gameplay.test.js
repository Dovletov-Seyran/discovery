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
test('all tasks complete waits for dialogue, then advances without ready votes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  director.setScene('ship_evening');complete=true;p.ready=false;
  const now=director.startAt()+2000;
  p.dialogue={id:'open',until:now+30000};
  director.tick(now);assert.equal(director.scene().id,'ship_evening');
  rules.dialogue(p,{active:false,dialogueId:'old'});
  assert.ok(p.dialogue);
  rules.dialogue(p,{active:false,dialogueId:'open'});
  director.tick(now);assert.equal(director.progressMessage().phase,'departing');
  t.mock.timers.tick(5000);await Promise.resolve();assert.equal(director.scene().id,'cut_night');
  complete=false;
});
test('lost dialogue lease does not hold the party forever; cutscene keeps timeline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  director.setScene('ship_evening');complete=true;
  p.dialogue={until:director.startAt()+1000};
  director.tick(director.startAt()+2000);assert.equal(director.progressMessage().phase,'departing');
  t.mock.timers.tick(5000);await Promise.resolve();assert.equal(director.scene().id,'cut_night');
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
  rules.minigame(p,{game:'astrolabe',result:{variant:'gomera',answer:28,angle:5}});
  assert.notEqual(p.quests.q_latitude.status,'done');
  rules.minigame(p,{game:'astrolabe',result:{variant:'gomera',answer:28,angle:68}});
  assert.equal(p.quests.q_latitude.status,'done');
});
test('navigation task advances through owned compass and map use, once per step',()=>{
  p.inventory=['compass','map'];p.quests={};entities.reset();quests.onSceneStart(director.scene(),[p]);
  rules.use(p,{item:'sword'});assert.equal(p.quests.q_navigation.step,0);
  rules.use(p,{item:'compass'});assert.equal(p.quests.q_navigation.step,1);
  rules.use(p,{item:'compass'});assert.equal(p.quests.q_navigation.step,1);
  rules.use(p,{item:'map'});assert.equal(p.quests.q_navigation.status,'done');
});
test('server repairs an old underground save before movement validation can return it underground',()=>{
  director.setScene('canary');
  const spawn=director.spawnFor(director.scene(),p.role);
  p.p=[256,-6,280];p.zone='canary';
  assert.equal(director.restoreGround(p),true);
  assert.ok(p.p[1]>0);
  assert.equal(director.restoreGround(p),false);
  // Scene rejoin applies the same repair even when the scene key already matches.
  p.p[1]=-6;director.placeOnJoin(p);assert.ok(p.p[1]>0);
  p.p=spawn.p;
});
test('quest scenes do not display an irrelevant ready wait for other accounts',()=>{
  director.setScene('ship_day');p.ready=false;
  assert.equal(director.partyMessage().waitingFor.length,0);
  director.setScene('canary');assert.equal(director.partyMessage().waitingFor.length,1);
});
test('missing roles after restart get shared tasks; expired roles retain their progress',()=>{
  director.setScene('ship_day');entities.reset();p.role='piloto';p.quests={};
  const departed={role:'lengua',quests:{q_ask_columbus:{status:'active',step:0,count:0,sub:[],got:['why_west']}}};
  quests.refreshParty(director.scene(),[p],[departed]);
  assert.equal(entities.shared().q_hourglass.status,'active');
  assert.deepEqual(entities.shared().q_ask_columbus.got,['why_west']);
  quests.onEvent(p,{type:'topics',npc:'columbus',topics:['reward']},'ship_day');
  assert.equal(entities.shared().q_ask_columbus.status,'done');
});
test('server publishes timed cutscene deadline and task-gated play phase',()=>{
  director.setScene('cut_night');const timed=director.progressMessage();
  assert.equal(timed.phase,'timed');assert.equal(timed.endsAt,director.startAt()+director.sceneDuration()*1000); // длительность — из content/scenes.json (Фронт 1 её меняет)
  director.setScene('ship_day');complete=false;
  assert.equal(director.progressMessage().phase,'objectives');assert.equal(director.progressMessage().endsAt,null);
  assert.equal(director.sceneMessage(p).progress.scene,'ship_day');
});
test('final task during a conversation never starts the transition timer',()=>{
 director.setScene('ship_evening');complete=true;p.dialogue={until:Date.now()+30000};
 const progress=director.progressMessage();assert.equal(progress.phase,'dialogue');assert.equal(progress.endsAt,null);
 p.dialogue=null;complete=false;
});
test('expired player hands quest supplies to the party without duplicating the saved inventory',()=>{
  director.setScene('canary');entities.reset();p.inventory=[];p.quests={};p.role='grumete';p.ready=true;
  const goneId=db.createUser('gone-pilot','fixture');
  const gone={id:goneId,role:'piloto',zone:'canary',scene:'fixture',inventory:['planks','tar'],money:0,quests:{q_rudder:{status:'active',step:1,count:0,sub:[0],got:[]}},log:[]};
  entities.setState('planks',{holder:goneId});entities.setState('tar',{holder:goneId});
  quests.refreshParty(director.scene(),[p],[gone]);
  assert.deepEqual(p.inventory,['planks','tar']);assert.deepEqual(db.loadPlayer(goneId).inventory,[]);
  assert.equal(entities.stateOf('tar').holder,p.id);assert.equal(entities.shared().q_rudder.step,2);
  assert.equal(p.ready,false);
});
test('restart recovers an astrolabe held by an account absent from this scene party',()=>{
  director.setScene('ship_day');entities.reset();p.role='grumete';p.inventory=[];p.quests={};
  const owner=db.createUser('orphan-astro','fixture');
  db.savePlayer(owner,{role:'piloto',zone:'ship',scene:p.scene,p:[0,0,0],inventory:['astrolabe'],money:0,quests:{q_latitude:{status:'active',step:1,count:0,sub:[],got:[]}},log:[]},{now:true});
  entities.setState('astrolabe',{holder:owner});
  quests.refreshParty(director.scene(),[p]);
  assert.ok(p.inventory.includes('astrolabe'));assert.equal(entities.stateOf('astrolabe').holder,p.id);
  assert.deepEqual(db.loadPlayer(owner).inventory,[]);assert.equal(entities.shared().q_latitude.step,1);
});
test('two immediate restarts of the same scene have different request/transition keys',()=>{
 director.setScene('ship_day');const first=director.startAt();director.setScene('ship_day');assert.ok(director.startAt()>first);
});
test('provision purchases reserve enough money for the rest and cannot be bought twice after reconnect',async()=>{
 director.setScene('canary');entities.reset();p.role='lengua';p.inventory=[];p.quests={};p.money=100;p.trade={};p.npcRequest=null;
 quests.onSceneStart(director.scene(),[p]);approach('trader');
 p.lastTradeAt=0;await rules.trade(p,{npc:'trader',item:'cheese',offer:40});assert.equal(p.money,60);
 p.lastTradeAt=0;await rules.trade(p,{npc:'trader',item:'meat',offer:40});assert.equal(p.money,60);assert.ok(!p.inventory.includes('meat'));
 p.lastTradeAt=0;await rules.trade(p,{npc:'trader',item:'meat',offer:35});assert.equal(p.money,25);
 p.lastTradeAt=0;await rules.trade(p,{npc:'trader',item:'biscuit',offer:25});assert.equal(p.money,0);assert.equal(p.quests.q_trade.status,'done');
 p.trade={};p.money=100;p.lastTradeAt=0;await rules.trade(p,{npc:'trader',item:'cheese',offer:30});assert.equal(p.money,100);assert.equal(p.inventory.filter(i=>i==='cheese').length,1);
});
test('вечерние карты и танец запускают сессии, но не засчитываются нажатием или поддельным результатом',()=>{
  director.setScene('ship_evening');p.quests={};p.inventory=[];entities.reset();quests.onSceneStart(director.scene(),[p]);
  received.length=0;
  for(const id of ['wine_barrel','cards','dance']){approach(id);p.p=[entities.def(id).x,0,entities.def(id).z];rules.interact(p,{id});}
  assert.notEqual(p.quests.q_feast.status,'done');
  assert.ok(received.some(m=>m.t==='cards_state'&&m.phase==='lobby'));
  rules.minigame(p,{game:'cards',result:{success:true}});rules.minigame(p,{game:'dance',result:{success:true}});
  assert.notEqual(p.quests.q_feast.status,'done');assert.deepEqual(p.quests.q_feast.sub,[0]);
  director.setScene('ship_day');p.quests={};quests.onSceneStart(director.scene(),[p]);received.length=0;
  rules.interact(p,{id:'dance'});assert.equal(received.some(m=>m.t==='world_event'),false);
});
