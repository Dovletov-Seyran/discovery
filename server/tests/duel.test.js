import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';process.env.TTS='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
await import('../game/index.js');
const duel=await import('../game/duel.js');
const combat=await import('../game/combat.js');
const {D,RING,DUELISTS}=duel;
after(()=>db.closeDb());

function player(name,role,p){
 const id=db.createUser(name,'fixture'),x=players.getOrCreate(id,name),msgs=[];
 Object.assign(x,{connected:true,role,zone:'guanahani',p,r:0,inventory:[],quests:{},log:[],vitals:{stamina:100,drunkUntil:0,drunkStrength:0},ws:{readyState:1,send:m=>msgs.push(JSON.parse(m))}});
 x.msgs=msgs;return x;
}
const at=(x,z)=>[x,director.groundAt('guanahani',x,z),z];
const young=DUELISTS[0],veteran=DUELISTS[1];
const me=id=>duel.state().duelists.find(d=>d.id===id);
function start(name,def=young){
 director.setScene('p2_day');combat.reset();duel.reset();duel.setRandom(()=>0.5);
 const p=player(name,'grumete',at(def.home[0]+(def===young?1.2:-1.2),def.home[1]));
 const now=director.startAt()+5000;
 assert.equal(duel.challenge(p,def.id,now),true);
 return {p,now:now+D.READY_MS+10};
}
// такты с шагом 100 мс; fn(t) может двигать игрока
const run=(from,ms,fn=()=>{})=>{for(let t=from;t<from+ms;t+=100){fn(t);duel.tick(t);}return from+ms;};
const until=(from,cond,limit=10000)=>{for(let t=from;t<from+limit;t+=50){duel.tick(t);if(cond(t))return t;}throw Error('condition never met');};

test('a challenge puts both in the centre of the batey, gives a macana and counts down',()=>{
 director.setScene('p2_day');combat.reset();duel.reset();
 const far=player('far','grumete',at(150,255)),now=director.startAt()+5000;
 assert.equal(duel.challenge(far,young.id,now),false,'too far');
 const {p}=start('challenger');
 assert.equal(me(young.id).state,'ready');assert.equal(me(young.id).player,p.id);
 assert.ok(Math.hypot(p.p[0]-RING.c[0],p.p[2]-RING.c[1])<2,'stands in the centre');
 assert.ok(p.msgs.some(m=>m.t==='pos_correct'));
 assert.ok(p.inventory.includes('macana'));assert.equal(p.equipped,'macana');
 const other=player('other','piloto',at(young.home[0]+1,young.home[1]));
 assert.equal(duel.challenge(other,young.id,now+100),false,'the warrior is busy');
 assert.ok(other.msgs.some(m=>m.t==='notice'&&/уже бьётся/.test(m.text)));
 assert.equal(duel.challenge(p,veteran.id,now+100),false,'one bout at a time');
});

test('a frontal blow is parried; a blow during his wind-up, after his strike or from the side scores',()=>{
 let {p,now}=start('fencer');
 duel.tick(now);
 now=until(now,()=>['circle','approach'].includes(me(young.id).state));
 const w=()=>me(young.id);
 // встать прямо перед ним на дистанции удара
 const face=()=>{const d=w();p.p=at(d.p[0]-Math.sin(d.r)*1.8,d.p[2]-Math.cos(d.r)*1.8);};
 face();
 assert.equal(duel.attack(p,young.id,now),true);assert.deepEqual(w().score,[0,0],'parried');assert.equal(w().state,'block');
 assert.ok(p.msgs.some(m=>m.t==='hit'&&m.blocked));
 now=until(now+D.ATTACK_MS,t=>w().state==='windup');
 face();duel.attack(p,young.id,now);assert.deepEqual(w().score,[1,0],'interrupted the wind-up');
 // ждёт его удар, отступив, и бьёт, пока он открыт
 now=until(now+D.ATTACK_MS,t=>{if(w().state==='windup'){const d=w();p.p=at(d.p[0]-Math.sin(d.r)*3.2,d.p[2]-Math.cos(d.r)*3.2);}return w().state==='recover';});
 assert.deepEqual(w().score,[1,0],'stepped back — his strike missed');
 face();duel.attack(p,young.id,now+10);assert.deepEqual(w().score,[2,0],'hit while he was open');
 // сбоку
 now=until(now+D.ATTACK_MS+10,()=>['circle','approach'].includes(w().state));
 const d=w();p.p=at(d.p[0]+Math.cos(d.r)*1.5,d.p[2]-Math.sin(d.r)*1.5);
 duel.attack(p,young.id,now);assert.deepEqual(w().score,[3,0],'from the side');
});

test('standing still gets you hit; winning completes the trial, is logged and returns the macana',()=>{
 let {p,now}=start('winner');
 now=until(now,()=>me(young.id).score[1]===1,15000);
 assert.ok(p.msgs.some(m=>m.t==='hit'&&m.kind==='duel'&&m.target===p.id),'the warrior scored');
 // теперь как надо: на его замахе отступить, когда открыт — шаг вперёд и удар
 for(let i=0;i<3;i++){
  now=until(now+D.ATTACK_MS,()=>{const d=me(young.id);if(d.state==='windup')p.p=at(d.p[0]-Math.sin(d.r)*3.2,d.p[2]-Math.cos(d.r)*3.2);return d.state==='recover';},15000);
  const d=me(young.id);p.p=at(d.p[0]-Math.sin(d.r)*1.6,d.p[2]-Math.cos(d.r)*1.6);
  duel.attack(p,young.id,now);
 }
 assert.equal(me(young.id).result,'player');
 assert.ok(p.log.includes('duel_young'));
 assert.ok(p.msgs.some(m=>m.t==='quest'&&m.id==='q_p2_day_duel'&&m.status==='done'),'the optional trial is done');
 assert.ok(!p.inventory.includes('macana'));
 now=run(now,8000);assert.equal(me(young.id).state,'idle','walked back to his place');
 assert.ok(Math.hypot(me(young.id).p[0]-young.home[0],me(young.id).p[2]-young.home[1])<0.2);
 assert.ok(duel.state().duelists.every(d=>d.p.every(Number.isFinite)),'positions stay numbers');
});

test('the veteran feints, strikes faster; the young one lets you breathe',()=>{
 let {p,now}=start('vs-veteran',veteran);duel.setRandom(()=>0); // всегда ложный замах
 let feints=0,prev=null;
 run(now,6000,t=>{const s=me(veteran.id).state;if(prev==='windup'&&s==='circle')feints++;prev=s;});
 assert.ok(feints>0,'feints');
 assert.ok(veteran.windup<young.windup&&veteran.recover<young.recover);
});

test('leaving the batey loses the bout; a scene change or a village alarm stops it; no alarm for sparring',()=>{
 let {p,now}=start('runner');
 p.p=at(RING.c[0]+RING.rx+D.EXIT+2,RING.c[1]);duel.tick(now);
 assert.equal(me(young.id).result,'warrior');assert.ok(p.msgs.some(m=>m.t==='notice'&&/вышел из круга/.test(m.text)));
 assert.ok(!p.inventory.includes('macana'));
 ({p,now}=start('alarmed'));
 const brute=player('brute','lengua',at(212.5,250.5));combat.attack(brute,{target:'villager_2'},now);
 duel.tick(now+100);assert.equal(me(young.id).result,'draw','the alarm ends the bout');
 assert.equal(duel.challenge(p,young.id,now+200),false,'no bouts while the village is alarmed');
 ({p,now}=start('switch'));director.setScene('p2_sleep');duel.tick(now+100);
 assert.equal(duel.state().duelists[0].state,'idle');assert.ok(p.msgs.some(m=>m.t==='duel'&&m.duelists.length===0),'warriors leave the batey at night');
 director.setScene('p2_day');combat.reset();duel.reset();
 const stranger=player('stranger','piloto',at(young.home[0]+1,young.home[1]));
 assert.equal(duel.attack(stranger,young.id,director.startAt()+5000),false);
 assert.equal(combat.level(),'calm','hitting a sparring warrior outside a bout is not an offence');
});
