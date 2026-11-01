import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';process.env.TTS='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
await import('../game/index.js');
const combat=await import('../game/combat.js');
const {C}=combat;
after(()=>db.closeDb());

// Игрок в зоне Гуанахани с «сокетом», который копит сообщения
function player(name,role,p){
 const id=db.createUser(name,'fixture'),x=players.getOrCreate(id,name),msgs=[];
 Object.assign(x,{connected:true,role,zone:'guanahani',p,r:0,inventory:[],vitals:{stamina:100,drunkUntil:0,drunkStrength:0},ws:{readyState:1,send:m=>msgs.push(JSON.parse(m))}});
 x.msgs=msgs;return x;
}
const at=(x,z)=>[x,director.groundAt('guanahani',x,z),z];
const run=(from,ms,fn=()=>{})=>{for(let t=from;t<from+ms;t+=100){fn(t);combat.tick(t);}return from+ms;};

test('a blow at a villager raises the alarm, a second one starts the fight; only the offender is chased',()=>{
 director.setScene('p2_day');combat.reset();
 const a=player('offender','grumete',at(212.5,250.5)),b=player('bystander','piloto',at(205,240));
 let now=director.startAt()+5000;
 assert.equal(combat.attack(a,{target:'villager_2'},now),true);
 assert.equal(combat.level(),'alert');
 assert.ok(b.msgs.some(m=>m.t==='combat'&&m.level==='alert'&&m.warriors.length===C.WARRIORS),'everybody sees the warriors come out');
 assert.ok(b.msgs.some(m=>m.t==='world_event'&&m.type==='alarm'),'the crowd hears the alarm');
 assert.ok(b.msgs.some(m=>m.t==='hit'&&m.target==='villager_2'&&m.by===a.id));
 assert.equal(combat.attack(a,{target:'villager_2'},now+100),false,'cooldown between blows');
 assert.equal(combat.attack(b,{target:'cacique'},now+1000),false,'out of reach');
 assert.equal(combat.refuses(a,'elder'),true);assert.equal(combat.refuses(b,'elder'),false);
 now+=C.ATTACK_MS+50;
 assert.equal(combat.attack(a,{target:'villager_2'},now),true);assert.equal(combat.level(),'fight');
 // обидчик идёт в деревню и стоит — воины догоняют и бьют, прохожего не трогают
 a.p=at(172,255);
 let most=0,downAt=null;const hpBefore=combat.hpOf(a),from=now;
 now=run(now,4000,t=>{most=Math.max(most,combat.state(t).warriors.filter(w=>w.state==='windup'||w.state==='strike').length);if(downAt==null&&a.msgs.some(m=>m.t==='hit'&&m.target===a.id&&m.down))downAt=t-from;});
 assert.ok(most<=C.ATTACKERS,`at most ${C.ATTACKERS} warriors swing at once (${most})`);
 assert.ok(downAt==null||downAt>=3000,`a player standing still lasts at least 3 s (${downAt} ms)`);
 assert.ok(combat.hpOf(a)<hpBefore,'the offender is hit');
 assert.equal(combat.hpOf(b),C.HP,'the bystander is left alone');
 assert.ok(a.msgs.some(m=>m.t==='vitals'&&m.hp<C.HP));
 const hits=a.msgs.filter(m=>m.t==='hit'&&m.target===a.id);
 assert.ok(hits.length&&hits.every(h=>h.by.startsWith('warrior_')));
});

test('a strike is telegraphed: stepping back during the wind-up avoids it',()=>{
 director.setScene('p2_day');combat.reset();
 const a=player('dodger','grumete',at(212.5,250.5));let now=director.startAt()+5000;
 combat.attack(a,{target:'villager_2'},now);now+=C.ATTACK_MS+50;combat.attack(a,{target:'villager_2'},now);
 a.p=at(172,255);
 let dodged=0;
 now=run(now,8000,t=>{
  const w=combat.state(t).warriors.find(x=>x.state==='windup');
  if(w){const dx=a.p[0]-w.p[0],dz=a.p[2]-w.p[2],d=Math.hypot(dx,dz)||1;a.p=at(a.p[0]+dx/d*1.5,a.p[2]+dz/d*1.5);dodged++;}
 });
 assert.ok(dodged>0);assert.equal(combat.hpOf(a),C.HP,'every wind-up was dodged');
});

test('knocked out: wakes at his spawn with full health, the village calms down only by a gift or time',()=>{
 director.setScene('p2_day');combat.reset();
 const a=player('loser','lengua',at(212.5,250.5));let now=director.startAt()+5000;
 combat.attack(a,{target:'villager_2'},now);now+=C.ATTACK_MS+50;combat.attack(a,{target:'villager_2'},now);
 a.p=at(172,255);
 now=run(now,20000);
 assert.ok(a.msgs.some(m=>m.t==='notice'&&/оглушили/.test(m.text)));
 assert.equal(combat.hpOf(a),C.HP);
 assert.ok(Math.hypot(a.p[0]-172,a.p[2]-255)>10,'moved away from the village');
 assert.equal(combat.level(),'alert','forgiven blows end the fight, the guard stays');
 // ещё раз обидел — и помирился даром
 a.p=at(212.5,250.5);now+=1000;combat.attack(a,{target:'villager_2'},now);
 a.p=at(168.5,229.5);a.inventory=['fish'];
 assert.equal(combat.offerPeace(a,now+100),true);
 assert.equal(combat.level(),'calm');assert.deepEqual(a.inventory,[]);
 assert.equal(combat.refuses(a,'cacique'),false);
});

test('a villager falls after three blows and gets up; the alarm fades after a quiet spell',()=>{
 director.setScene('p2_day');combat.reset();
 const a=player('brute','grumete',at(181,264.5));let now=director.startAt()+5000;
 for(let i=0;i<C.HITS;i++){combat.attack(a,{target:'villager_1'},now);now+=C.ATTACK_MS+50;}
 assert.equal(combat.npcDown('villager_1',now),true);
 assert.ok(a.msgs.some(m=>m.t==='entity'&&m.id==='villager_1'&&m.state.down>now));
 assert.equal(combat.npcDown('villager_1',now+C.DOWN_MS+100),false);
 assert.equal(combat.level(),'fight');
 a.p=at(300,250); // убежал далеко
 now=run(now,C.ESCAPE_MS+1000);assert.equal(combat.level(),'alert');
 now=run(now,C.CALM_MS+1000);assert.equal(combat.level(),'calm');
 assert.ok(combat.state(now).warriors.length===0);
});

test('a scene change resets the village',()=>{
 director.setScene('p2_day');combat.reset();
 const a=player('leaver','grumete',at(212.5,250.5));const now=director.startAt()+5000;
 combat.attack(a,{target:'villager_2'},now);assert.equal(combat.level(),'alert');
 director.setScene('p2_evening');combat.tick(now+200);
 assert.equal(combat.level(),'calm');
});
