import{test,after}from'node:test';import assert from'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';process.env.TTS='0';
const db=await import('../db.js'),{players}=await import('../game/players.js'),director=await import('../game/director.js'),entities=await import('../game/entities.js'),quests=await import('../game/quests.js');
const game=await import('../game/index.js'),rules=await import('../game/rules.js'),feast=await import('../game/feast.js');
const {npcActivity}=await import('../../shared/npc-activity.js');
const {handValue,roundOutcome,DANCE_BEAT,DANCE_DURATION}=await import('../../shared/feast-games.js');
const{shuffledDeck,playDealer}=await import('../game/cards-engine.js');
const crew=['Alpha','Bravo','Charlie'].map((name,i)=>{const id=db.createUser(name,'fixture'),p=players.getOrCreate(id,name),messages=[];p.connected=true;p.role=['grumete','piloto','lengua'][i];p.ws={readyState:1,send:s=>messages.push(JSON.parse(s))};return{p,messages};});
after(()=>db.closeDb());
function setup(t){let now=Date.now();t.mock.method(Date,'now',()=>now);for(const{p,messages}of crew){p.connected=true;p.dialogue=null;p.npcRequest=null;p.quests={};p.action=null;messages.length=0;}entities.reset();feast.setHooks({deck:()=>shuffledDeck(n=>n-1)});director.setScene('ship_evening');now=director.startAt()+3000;crew.forEach(({p},i)=>p.p=[1.8+i*.6,0,2.5]);return{get now(){return now},set now(v){now=v}};}
const intent=(p,action,extra={})=>{const v=feast.cardView(p);feast.cards(p,{action,sessionId:v.sessionId,revision:v.revision,...extra});return feast.cardView(p);};
function roundToReveal(clock){for(let i=0;i<4&&feast.cardView(crew[0].p).phase==='playing';i++){clock.now=feast.cardView(crew[0].p).deadline+1;feast.tick(clock.now);}assert.equal(feast.cardView(crew[0].p).phase,'reveal');}

test('36 unique cards, flexible aces, busts, draws and the dealer stands on 17',()=>{
 const deck=shuffledDeck(n=>n-1);assert.equal(deck.length,36);assert.equal(new Set(deck).size,36);
 assert.equal(handValue(['cups:A','coins:A','swords:9']),21);assert.equal(handValue(['cups:A','coins:6','swords:6']),13);
 assert.equal(handValue(['cups:J','coins:Q','swords:K']),9);assert.equal(handValue(['cups:10','coins:9','swords:6']),25);
 assert.equal(roundOutcome(['cups:10','cups:7'],['coins:10','coins:7']),'draw');assert.equal(roundOutcome(['cups:10','cups:9','cups:6'],['coins:10','coins:9','coins:6']),'bust');
 assert.equal(roundOutcome(['cups:10','cups:9'],['coins:10','coins:9','coins:6']),'win');
 const hand=['cups:10','cups:6'],draw=['coins:10','coins:A'];playDealer(draw,hand);assert.equal(handValue(hand),17);assert.equal(draw.length,1);
});

test('only own cards are transmitted; spectators never see the deck or foreign totals; stale and foreign moves fail',t=>{
 setup(t);const[a,b,c]=crew.map(x=>x.p);intent(a,'open');intent(b,'open');intent(a,'start');intent(c,'open');
 const own=feast.cardView(a),watch=feast.cardView(c);assert.equal(own.players.find(s=>s.id===a.id).cards.length,2);assert.ok(own.players.find(s=>s.id===a.id).cards.every(Boolean));
 assert.ok(watch.players.every(s=>s.cards.every(c=>c===null)));assert.ok(watch.players.every(s=>s.total===null));assert.equal(watch.dealer.cards[1],null);assert.equal('deck'in watch,false);
 const current=crew.find(x=>x.p.id===own.turnId).p,other=current===a?b:a;
 const before=JSON.stringify(feast.cardView(current).players.find(s=>s.id===current.id).cards);intent(other,'hit',{playerId:current.id});assert.equal(JSON.stringify(feast.cardView(current).players.find(s=>s.id===current.id).cards),before);
 const old=feast.cardView(current);intent(current,'hit');const once=JSON.stringify(feast.cardView(current));feast.cards(current,{action:'hit',sessionId:old.sessionId,revision:old.revision});assert.equal(JSON.stringify(feast.cardView(current)),once);
 assert.equal(feast.reservation('storyteller').id,'card-table');
 const publicChunks=JSON.stringify(entities.snapshot());assert.equal(publicChunks.includes('"deck"'),false);assert.equal(publicChunks.includes('"hand"'),false);
});

test('closing the table retains the seat; timeout and reconnect restore the same hand, three deals finish and free Juan',t=>{
 const clock=setup(t),[a,b]=crew.map(x=>x.p);intent(a,'open');intent(b,'open');intent(a,'start');
 const initial=feast.cardView(a);feast.cards(a,{action:'hide'});assert.equal(feast.participant(a.id),true);
 feast.reset();const restored=feast.cardView(a);assert.deepEqual(restored.players.find(s=>s.id===a.id).cards,initial.players.find(s=>s.id===a.id).cards);assert.equal(restored.sessionId,initial.sessionId);
 feast.reconnect(a);assert.ok(crew[0].messages.some(m=>m.t==='cards_state'&&m.open&&m.sessionId===initial.sessionId));
 for(let round=1;round<=3;round++){
  roundToReveal(clock);assert.ok(a.quests.q_feast.sub.includes(2));assert.ok(b.quests.q_feast.sub.includes(2));
  assert.ok(feast.cardView(a).players.every(s=>s.cards.every(Boolean)));
  clock.now=feast.cardView(a).deadline+1;feast.tick(clock.now);
 }
 assert.equal(feast.cardView(a).phase,'finished');assert.equal(feast.reservation('storyteller'),null);assert.equal(feast.busy(),false);
 const memory=db.loadMinigameState(`feast-stats:${a.id}`);assert.equal(memory.hands,3);assert.equal(memory.matches,1);
});

test('disconnect advances the turn, explicit exit frees the table and a private conversation prevents a new table',t=>{
 setup(t);const[a,b]=crew.map(x=>x.p);intent(a,'open');intent(b,'open');intent(a,'start');const current=players.get(feast.cardView(a).turnId);current.connected=false;feast.disconnect(current);
 assert.notEqual(feast.cardView(a).turnId,current.id);current.connected=true;feast.reconnect(current);
 intent(a,'leave');intent(b,'leave');assert.equal(feast.reservation('storyteller'),null);
 a.dialogue={npc:'storyteller',id:'private',until:Date.now()+30000};intent(b,'open');assert.equal(feast.cardView(b).phase,'finished');assert.ok(crew[1].messages.some(m=>m.t==='notice'&&/разговаривает/.test(m.text)));
});

test('a table blocks talking to Juan and the next scene until the bounded session ends',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const clock=setup(t),[a,b]=crew.map(x=>x.p);intent(a,'open');intent(a,'start');
 b.p=[...npcActivity(entities.def('storyteller'),clock.now/1000,{id:'ship_evening',startAt:director.startAt()},entities.stateOf('storyteller')?.paused,entities.stateOf('storyteller')?.behavior).p];rules.dialogue(b,{active:true,npc:'storyteller',dialogueId:'cannot-steal'});assert.equal(b.dialogue,null);
 assert.ok(crew[1].messages.some(m=>m.t==='npc_say'&&m.busy));
 for(const{p}of crew)quests.completeFor(p,'ship_evening');director.tick(clock.now);assert.equal(director.isTransitioning(),false);assert.equal(director.progressMessage().phase,'activities');
 clock.now+=220000;feast.tick(clock.now);assert.equal(feast.busy(),false);director.tick(clock.now);assert.equal(director.isTransitioning(),true);
});

test('dance is server-timed, wrong and repeated keys cannot forge score, finishing credits and cancellation does not',t=>{
 const clock=setup(t),[a,b]=crew.map(x=>x.p);a.p=[-.4,0,-1];b.p=[1.7,0,-1];
 feast.dance(a,{action:'start'});const state=crew[0].messages.filter(m=>m.t==='dance_state').at(-1);assert.equal(state.phase,'dancing');assert.equal(state.endsAt-state.startAt,DANCE_DURATION);assert.equal(state.steps.length,24);
 const visible=crew[1].messages.find(m=>m.t==='player_action'&&m.id===a.id);assert.equal(visible.action.kind,'dance');assert.ok(visible.action.duration>=20000);assert.equal(feast.busy(),true);
 rules.minigame(a,{game:'dance',result:{success:true}});assert.ok(!a.quests.q_feast.sub.includes(3));
 clock.now=state.startAt+DANCE_BEAT*.5;feast.dance(a,{action:'hit',sessionId:state.id,index:0,direction:state.steps[0]});feast.dance(a,{action:'hit',sessionId:state.id,index:0,direction:state.steps[0]});
 assert.equal(crew[0].messages.filter(m=>m.t==='dance_state').at(-1).score,100);
 assert.deepEqual(feast.moveLocked(a),state.anchor);feast.dance(b,{action:'start'});const second=crew[1].messages.filter(m=>m.t==='dance_state').at(-1);assert.notDeepEqual(second.anchor,state.anchor);
 feast.dance(b,{action:'cancel',sessionId:second.id});assert.ok(!b.quests.q_feast.sub.includes(3));assert.equal(b.action,null);
 clock.now=state.endsAt-1;feast.tick(clock.now);assert.ok(!a.quests.q_feast.sub.includes(3));clock.now+=2;feast.tick(clock.now);assert.ok(a.quests.q_feast.sub.includes(3));assert.equal(a.action,null);assert.equal(feast.moveLocked(a),null);
});

test('scene changes clean sessions and a disconnected dancer is cancelled without credit',t=>{
 setup(t);const[a]=crew.map(x=>x.p);a.p=[-.4,0,-1];feast.dance(a,{action:'start'});a.connected=false;feast.disconnect(a);assert.ok(!a.quests.q_feast.sub.includes(3));assert.equal(feast.isDancing(a.id),false);a.connected=true;
 director.setScene('ship_day');assert.equal(feast.reservation('storyteller'),null);assert.equal(feast.busy(),false);assert.equal(feast.cardView(a).phase,'closed');
});
