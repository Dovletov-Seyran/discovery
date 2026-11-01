import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {npcActivity} from '../../shared/npc-activity.js';
process.env.DB_FILE=':memory:';process.env.AI='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
const entities=await import('../game/entities.js');
const rules=await import('../game/rules.js');
const game=await import('../game/index.js');
const {onChunkReq}=await import('../world/chunks.js');
const recipients=[];
for(const [i,role] of ['lengua','piloto'].entries()){
 const id=db.createUser(`npc-listener-${i}`,'fixture');
 const p=players.getOrCreate(id,`npc-listener-${i}`),messages=[];
 p.connected=true;p.role=role;p.ws={readyState:1,send:json=>messages.push(JSON.parse(json))};
 recipients.push({p,messages});
}
after(()=>db.closeDb());

test('dialogue pauses captain for everyone, resumes continuously, and handles a lost speaker/scene change',t=>{
 const [first,second]=recipients;
 director.setScene('ship_evening');
 const scene={id:'ship_evening',startAt:director.startAt()};
 let now=scene.startAt+27000;t.mock.method(Date,'now',()=>now);
 const captain=entities.def('columbus');
 first.p.p=[...npcActivity(captain,now/1000,scene).p];second.p.p=[...first.p.p];
 for(const x of recipients)x.messages.length=0;
 rules.dialogue(first.p,{active:true,npc:'columbus',dialogueId:'first'});
 const paused=entities.stateOf('columbus').paused,at=now;
 assert.equal(paused.at,at);
 for(const x of recipients)assert.ok(x.messages.some(m=>m.t==='entity'&&m.id==='columbus'&&m.state.paused.at===at));
 const position=npcActivity(captain,now/1000,scene,paused).p;
 db.putChunk('ship',0,0,{interact:[],npcs:[captain]});
 const chunks=[];
 onChunkReq(first.p,{zone:'ship',keys:['0,0']},{send:m=>chunks.push(m),entityState:entities.stateOf});
 assert.deepEqual(chunks.find(m=>m.t==='chunk').data.npcs[0].state.paused,paused,'late join receives paused route with layout');
 const saved=JSON.parse(JSON.stringify(entities.snapshot()));entities.load(saved);
 assert.deepEqual(entities.stateOf('columbus').paused,paused,'paused clock survives storage');
 now+=10000;rules.syncNpcDialogues(now);
 assert.deepEqual(npcActivity(captain,now/1000,scene,entities.stateOf('columbus').paused).p,position);
 assert.equal(entities.isNear(first.p,'columbus',-2.5),true);
 // Второй собеседник не сбрасывает часы паузы.
 rules.dialogue(second.p,{active:true,npc:'columbus',dialogueId:'second'});
 rules.dialogue(first.p,{active:false,dialogueId:'first'});
 assert.equal(entities.stateOf('columbus').paused.at,at);
 // Потеря последней вкладки возобновляет маршрут немедленно.
 game.leave(second.p,second.p.ws);
 const resumed=entities.stateOf('columbus').paused;
 assert.equal(resumed.at,null);assert.equal(resumed.offset,10000);
 assert.deepEqual(npcActivity(captain,now/1000,scene,resumed).p,position);
 now+=1000;
 assert.deepEqual(npcActivity(captain,now/1000,scene,resumed).p,npcActivity(captain,(at+1000)/1000,scene).p);
 // Истечение lease снимает паузу; старый ответ закрытого окна её не возвращает.
 first.p.p=[...npcActivity(captain,now/1000,scene,resumed).p];
 rules.dialogue(first.p,{active:true,npc:'columbus',dialogueId:'expired'});
 now+=31000;rules.tickVitals(now);
 assert.equal(entities.stateOf('columbus').paused.at,null);
 director.setScene('night_story');
 assert.equal(entities.stateOf('columbus').paused,null);
 assert.deepEqual(npcActivity(captain,now/1000,{id:'night_story',startAt:director.startAt()}).p,captain.scenes.night_story.p);
});
