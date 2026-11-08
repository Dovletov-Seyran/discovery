import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';process.env.TTS='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
await import('../game/index.js');
const hunt=await import('../game/hunt.js');
const entities=await import('../game/entities.js');
after(()=>db.closeDb());

function player(name,p,inventory=[]){
 const id=db.createUser(name,'fixture'),x=players.getOrCreate(id,name),msgs=[];
 Object.assign(x,{connected:true,role:'grumete',zone:'guanahani',p,r:0,inventory,equipped:inventory[0]??null,quests:{},log:[],vitals:{stamina:100,drunkUntil:0,drunkStrength:0},ws:{readyState:1,send:m=>msgs.push(JSON.parse(m))}});
 x.msgs=msgs;return x;
}
const at=(x,z)=>[x,director.groundAt('guanahani',x,z),z];
// смотреть на точку (r — как у камеры)
const look=(p,q)=>{p.r=Math.atan2(p.p[0]-q[0],p.p[2]-q[2]);return p.r;};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const fauna=(p)=>p.msgs.filter(m=>m.t==='fauna');

test('a hutia struck with a macana falls for everyone, leaves a carcass to pick up and comes back later',async()=>{
 director.setScene('p2_day');hunt.reset();
 const p=player('hunter',at(200,250),['macana']),other=player('watcher',at(205,252));
 const prey=at(201.5,250);look(p,prey);
 assert.equal(hunt.hunt(p,{id:'guanahani:20',kind:'hutia',p:prey,r:p.r}),true);
 const k=fauna(other).find(m=>m.killed);assert.equal(k.killed.id,'guanahani:20');assert.equal(k.killed.by,p.id);
 assert.ok(k.dead.some(d=>d.id==='guanahani:20'),'everyone gets the list of the dead');
 assert.ok(p.msgs.some(m=>m.t==='player_action'&&m.action.kind==='swing'),'the blow is seen');
 assert.ok(other.msgs.some(m=>m.t==='world_event'&&m.type==='swing'),'the swing scares the animals around');
 assert.equal(hunt.hunt(p,{id:'guanahani:20',kind:'hutia',p:prey,r:p.r},Date.now()+1000),false,'already dead');
 await sleep(hunt.H.LOOT_MS+60);
 const carcass=entities.allDefs().find(d=>d.item==='hutia');assert.ok(carcass,'a carcass lies on the ground');
 assert.ok(Math.hypot(carcass.p[0]-prey[0],carcass.p[2]-prey[2])<0.05);
 hunt.sync(other);assert.ok(fauna(other).at(-1).dead.some(d=>d.id==='guanahani:20'));
 hunt.tick(Date.now()+hunt.H.RESPAWN_MS+1000);
 assert.ok(!fauna(other).at(-1).dead.some(d=>d.id==='guanahani:20'),'it comes back');
});

test('too far, looking away, bare hands, a wrong zone or species — no kill; the bow reaches far and silently',async()=>{
 director.setScene('p2_day');hunt.reset();
 const p=player('archer',at(190,250),['bow']),far=at(205,250);look(p,far);
 const near=at(192,250);
 const bare=player('bare',at(190,252));look(bare,near);
 assert.equal(hunt.hunt(bare,{id:'guanahani:1',kind:'hutia',p:near,r:bare.r}),false);assert.ok(bare.msgs.some(m=>m.t==='notice'&&/Нужно оружие/.test(m.text)));
 assert.equal(hunt.hunt(p,{id:'guanahani:2',kind:'parrot',p:far,r:p.r}),false,'not game');
 assert.equal(hunt.hunt(p,{id:'canary:2',kind:'hutia',p:far,r:p.r}),false,'another zone');
 const away=p.r+1.2;assert.equal(hunt.hunt(p,{id:'guanahani:3',kind:'iguana',p:far,r:away}),false,'looked away');
 const before=p.msgs.filter(m=>m.t==='world_event').length;
 assert.equal(hunt.hunt(p,{id:'guanahani:3',kind:'iguana',p:far,r:look(p,far)},Date.now()+5000),true,'15 m with a bow');
 assert.equal(p.msgs.filter(m=>m.t==='world_event').length,before,'an arrow makes no noise');
 const mac=player('club',at(190,256),['macana']),tooFar=at(196,256);
 assert.equal(hunt.hunt(mac,{id:'guanahani:4',kind:'crab',p:tooFar,r:look(mac,tooFar)}),false,'a club does not reach 6 m');
 await sleep(hunt.H.LOOT_MS+60);
});

test('a goat on La Gomera takes two blows of a sword, one arrow-like spear throw; the thrown spear lies on the ground',async()=>{
 director.setScene('canary');hunt.reset();
 const p=player('swordsman',[250,director.groundAt('canary',250,300)??10,300],['sword']);p.zone='canary';
 const goat=[251.8,p.p[1],300];look(p,goat);
 assert.equal(hunt.hunt(p,{id:'canary:22',kind:'goat',p:goat,r:p.r}),true);
 assert.ok(fauna(p).some(m=>m.hurt?.id==='canary:22'),'wounded');assert.ok(!fauna(p).some(m=>m.killed));
 assert.equal(hunt.hunt(p,{id:'canary:22',kind:'goat',p:goat,r:p.r},Date.now()+1000),true);
 assert.ok(fauna(p).some(m=>m.killed?.id==='canary:22'),'the second blow kills');
 director.setScene('p2_day');
 const t=player('thrower',at(180,250),['war_spear']),prey=at(188,250);look(t,prey);
 assert.equal(hunt.hunt(t,{id:'guanahani:30',kind:'iguana',p:prey,r:t.r,mode:'throw'}),true);
 assert.ok(!t.inventory.includes('war_spear'),'the spear left the hand');
 const flight=fauna(t).find(m=>m.thrown);assert.ok(flight&&flight.thrown.ms>100);
 await sleep(Math.max(flight.thrown.ms,hunt.H.LOOT_MS)+80);
 assert.ok(entities.allDefs().some(d=>d.item==='war_spear'&&Math.hypot(d.p[0]-prey[0],d.p[2]-prey[2])<0.1),'the spear lies by the iguana');
 assert.ok(entities.allDefs().some(d=>d.item==='iguana'),'and the iguana');
});

test('carcasses and spears do not pile up: an eaten carcass goes at once, one left on the ground after a few minutes',async()=>{
 director.setScene('p2_day');hunt.reset();
 const p=player('litter',at(200,260),['macana']);
 for(const [id,x] of [['guanahani:40',201.5],['guanahani:41',198.5]]){const prey=at(x,260);look(p,prey);hunt.hunt(p,{id,kind:'crab',p:prey,r:p.r},Date.now()+(id.endsWith('41')?2000:0));}
 await sleep(hunt.H.LOOT_MS+80);
 const crabs=()=>entities.allDefs().filter(d=>d.item==='crab'&&d.id.startsWith('drop:game:'));
 assert.equal(crabs().length,2);
 // одного подобрал и съел
 const eaten=crabs()[0];entities.setState(eaten.id,{holder:p.id});p.inventory.push('crab');
 hunt.litter();assert.equal(crabs().length,2,'in the hand, not eaten yet — kept');
 p.inventory=['macana'];hunt.litter();assert.ok(!crabs().some(d=>d.id===eaten.id),'eaten — removed');
 assert.equal(crabs().length,1);
 hunt.litter(Date.now()+hunt.H.LITTER_MS+5000);assert.equal(crabs().length,0,'the uneaten one is gone after a while');
});
