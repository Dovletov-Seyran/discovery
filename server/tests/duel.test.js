import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';process.env.AI='0';process.env.TTS='0';
const db=await import('../db.js');
const {players}=await import('../game/players.js');
const director=await import('../game/director.js');
await import('../game/index.js');
const duel=await import('../game/duel.js');
const combat=await import('../game/combat.js');
const {SPANIARDS,pathToBatey}=await import('../game/spaniards.js');
const {WEAPONS}=await import('../../shared/weapons.js');
const {D,RING,ARENAS,DUELISTS}=duel;
after(()=>db.closeDb());

function player(name,role,p){
 const id=db.createUser(name,'fixture'),x=players.getOrCreate(id,name),msgs=[];
 Object.assign(x,{connected:true,role,zone:'guanahani',p,r:0,inventory:[],quests:{},log:[],vitals:{stamina:100,drunkUntil:0,drunkStrength:0},ws:{readyState:1,send:m=>msgs.push(JSON.parse(m))}});
 x.msgs=msgs;return x;
}
const at=(x,z)=>[x,director.groundAt('guanahani',x,z),z];
const young=DUELISTS[0],veteran=DUELISTS[1];
const me=id=>duel.state().duelists.find(d=>d.id===id);
const quiet=()=>{for(const x of players.all())x.connected=false;}; // игроки прошлых тестов не мешают
// повернуться к сопернику (r — как у камеры) и ударить
const aim=(p,id)=>{const d=me(id);p.r=Math.atan2(p.p[0]-d.p[0],p.p[2]-d.p[2]);};
const hit=(p,id,now)=>{aim(p,id);return duel.attack(p,id,now);};
// встать перед ним на расстоянии m
const front=(p,id,m)=>{const d=me(id);p.p=at(d.p[0]-Math.sin(d.r)*m,d.p[2]-Math.cos(d.r)*m);};
function start(name,def=young,inventory=[]){
 quiet();director.setScene('p2_day');combat.reset();duel.reset();duel.setRandom(()=>0.5);
 const p=player(name,'grumete',at(def.home[0]+(def===young?1.2:-1.2),def.home[1]));
 p.inventory.push(...inventory);if(inventory[0])p.equipped=inventory[0];
 const now=director.startAt()+5000;
 assert.equal(duel.challenge(p,def.id,now),true);
 return {p,now:now+D.READY_MS+10};
}
// такты с шагом 100 мс; fn(t) может двигать игрока
const run=(from,ms,fn=()=>{})=>{for(let t=from;t<from+ms;t+=100){fn(t);duel.tick(t);}return from+ms;};
const until=(from,cond,limit=10000)=>{for(let t=from;t<from+limit;t+=50){duel.tick(t);if(cond(t))return t;}throw Error('condition never met');};
const CD=WEAPONS.macana.cooldown;

test('a challenge puts both in the centre of the batey, lends a macana and counts down',()=>{
 quiet();director.setScene('p2_day');combat.reset();duel.reset();
 const far=player('far','grumete',at(150,255)),now=director.startAt()+5000;
 assert.equal(duel.challenge(far,young.id,now),false,'too far');
 const {p}=start('challenger');
 assert.equal(me(young.id).state,'ready');assert.equal(me(young.id).player,p.id);assert.equal(me(young.id).playerWeapon,'macana');
 assert.ok(Math.hypot(p.p[0]-RING.c[0],p.p[2]-RING.c[1])<2,'stands in the centre');
 assert.ok(p.msgs.some(m=>m.t==='pos_correct'));
 assert.ok(p.inventory.includes('macana'));assert.equal(p.equipped,'macana');
 const other=player('other','piloto',at(young.home[0]+1,young.home[1]));
 assert.equal(duel.challenge(other,young.id,now+100),false,'the warrior is busy');
 assert.ok(other.msgs.some(m=>m.t==='notice'&&/уже бьётся/.test(m.text)));
 assert.equal(duel.challenge(p,veteran.id,now+100),false,'one bout at a time');
 assert.deepEqual(duel.state().duelists.map(d=>d.id),['duelist_young','duelist_veteran'],'only the cacique\'s warriors by day');
});

test('a frontal blow is parried; a blow during his wind-up, after his strike or from the side scores',()=>{
 let {p,now}=start('fencer');
 duel.tick(now);
 now=until(now,()=>['circle','approach'].includes(me(young.id).state));
 const w=()=>me(young.id);
 front(p,young.id,1.8);
 assert.equal(hit(p,young.id,now),true);assert.deepEqual(w().score,[0,0],'parried');assert.equal(w().state,'block');
 assert.ok(p.msgs.some(m=>m.t==='hit'&&m.blocked));
 now=until(now+CD,t=>w().state==='windup');
 front(p,young.id,1.8);hit(p,young.id,now);assert.deepEqual(w().score,[1,0],'interrupted the wind-up');
 // ждёт его удар, отступив, и бьёт, пока он открыт
 now=until(now+CD,t=>{if(w().state==='windup')front(p,young.id,3.2);return w().state==='recover';});
 assert.deepEqual(w().score,[1,0],'stepped back — his strike missed');
 front(p,young.id,1.8);hit(p,young.id,now+10);assert.deepEqual(w().score,[2,0],'hit while he was open');
 // сбоку
 now=until(now+CD+10,()=>['circle','approach'].includes(w().state));
 const d=w();p.p=at(d.p[0]+Math.cos(d.r)*1.5,d.p[2]-Math.sin(d.r)*1.5);
 hit(p,young.id,now);assert.deepEqual(w().score,[3,0],'from the side');
});

test('a blow while looking away goes into the air',()=>{
 let {p,now}=start('looker');
 now=until(now,()=>me(young.id).state==='windup');
 front(p,young.id,1.8);aim(p,young.id);p.r+=Math.PI/2;
 assert.equal(duel.attack(p,young.id,now),false);assert.deepEqual(me(young.id).score,[0,0]);
});

test('standing still gets you hit; winning completes the trial, is logged and returns the macana',()=>{
 let {p,now}=start('winner');
 now=until(now,()=>me(young.id).score[1]===1,15000);
 assert.ok(p.msgs.some(m=>m.t==='hit'&&m.kind==='duel'&&m.target===p.id),'the warrior scored');
 // теперь как надо: на его замахе отступить, когда открыт — шаг вперёд и удар
 for(let i=0;i<3;i++){
  now=until(now+CD,()=>{const d=me(young.id);if(d.state==='windup')front(p,young.id,3.2);return d.state==='recover';},15000);
  front(p,young.id,1.6);hit(p,young.id,now);
 }
 assert.equal(me(young.id).result,'player');
 assert.ok(p.log.includes('duel_young'));
 assert.ok(p.msgs.some(m=>m.t==='quest'&&m.id==='q_p2_day_duel'&&m.status==='done'),'the optional trial is done');
 assert.ok(!p.inventory.includes('macana'),'the lent macana is taken back');
 now=run(now,8000);assert.equal(me(young.id).state,'act','walked back to his place and practises again');assert.equal(me(young.id).act,'practice');
 assert.ok(Math.hypot(me(young.id).p[0]-young.home[0],me(young.id).p[2]-young.home[1])<0.2);
 assert.ok(duel.state().duelists.every(d=>d.p.every(Number.isFinite)),'positions stay numbers');
});

test('the veteran fights with a spear: feints, reaches further, strikes faster',()=>{
 let {p,now}=start('vs-veteran',veteran);duel.setRandom(()=>0); // всегда ложный замах
 let feints=0,prev=null;
 run(now,6000,t=>{const s=me(veteran.id).state;if(prev==='windup'&&s==='circle')feints++;prev=s;});
 assert.ok(feints>0,'feints');
 assert.equal(veteran.weapon,'war_spear');assert.equal(me(veteran.id).weapon,'war_spear');
 assert.ok(WEAPONS.war_spear.strikeR>WEAPONS.macana.strikeR);
 assert.ok(veteran.windup<young.windup&&veteran.recover<young.recover);
});

test('your own spear: kept after the bout, reaches further and meets him as he closes in',()=>{
 let {p,now}=start('spearman',young,['war_spear']);
 assert.equal(me(young.id).playerWeapon,'war_spear');assert.ok(!p.inventory.includes('macana'),'no macana lent');
 // встречает на подходе, с 2,6 м: держится на этом расстоянии (ближе, чем он кружит), пока он не пойдёт в атаку
 now=until(now,()=>{front(p,young.id,2.6);return me(young.id).state==='circle';});
 now=until(now,()=>{front(p,young.id,2.6);return me(young.id).state==='approach';},15000);
 assert.equal(hit(p,young.id,now),true);assert.deepEqual(me(young.id).score,[1,0],'met him with the spear point');
 for(let i=0;i<2;i++){
  now=until(now+WEAPONS.war_spear.cooldown,()=>{const d=me(young.id);if(d.state==='windup')front(p,young.id,3.2);return d.state==='recover';},15000);
  front(p,young.id,2.8);hit(p,young.id,now);
 }
 assert.equal(me(young.id).result,'player');assert.ok(p.inventory.includes('war_spear'),'your spear stays yours');
});

test('a bow: the first arrow from the front is dodged, the next one is not; on his wind-up it always hits',()=>{
 let {p,now}=start('archer',young,['bow']);
 now=until(now,()=>me(young.id).state==='circle');
 // отбежать: издалека спереди уворачивается — шаг вбок
 p.p=at(me(young.id).p[0]+(me(young.id).p[0]>RING.c[0]?-11:11),RING.c[1]);
 now=until(now,()=>['approach','circle'].includes(me(young.id).state)&&Math.hypot(me(young.id).p[0]-p.p[0],me(young.id).p[2]-p.p[2])>7);
 const before=me(young.id).p;
 assert.equal(hit(p,young.id,now),true);assert.deepEqual(me(young.id).score,[0,0]);assert.equal(me(young.id).state,'dodge');
 assert.ok(p.msgs.some(m=>m.t==='hit'&&m.weapon==='bow'&&m.dodged),'he dodged the arrow');
 assert.ok(Math.hypot(me(young.id).p[0]-before[0],me(young.id).p[2]-before[2])>0.5,'with a step aside');
 aim(p,young.id);p.r+=0.5;now+=WEAPONS.bow.cooldown;
 assert.equal(duel.attack(p,young.id,now),false,'aimed past him');assert.ok(p.msgs.some(m=>m.t==='hit'&&m.missed));
 // вторую подряд — не успевает (не прошло DODGE_MS)
 now+=WEAPONS.bow.cooldown;aim(p,young.id);
duel.attack(p,young.id,now);assert.deepEqual(me(young.id).score,[1,0],'the second arrow hits');
 // на его замахе — попал, хоть и отступив на 4 м
 now=until(now+WEAPONS.bow.cooldown,()=>me(young.id).state==='windup',15000);
 front(p,young.id,4);hit(p,young.id,now);assert.deepEqual(me(young.id).score,[2,0],'an arrow while he winds up');
 // yaw из самого удара важнее последнего move
 now=until(now+WEAPONS.bow.cooldown,()=>me(young.id).state==='windup',15000);
 front(p,young.id,4);const d=me(young.id);p.r+=2;
 duel.attack(p,young.id,now,Math.atan2(p.p[0]-d.p[0],p.p[2]-d.p[2]));assert.deepEqual(me(young.id).score,[3,0]);
 assert.ok(WEAPONS.bow.reach>WEAPONS.war_spear.reach);
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
 assert.equal(duel.state().duelists.length,0);assert.ok(p.msgs.some(m=>m.t==='duel'&&m.duelists.length===0),'warriors leave the batey at night');
 director.setScene('p2_day');combat.reset();duel.reset();
 const stranger=player('stranger','piloto',at(young.home[0]+1,young.home[1]));
 assert.equal(duel.attack(stranger,young.id,director.startAt()+5000),false);
 assert.equal(combat.level(),'calm','hitting a sparring warrior outside a bout is not an offence');
});

// --- испанцы 12 октября ---

const diego=SPANIARDS.find(s=>s.id==='es_diego'),sancho=SPANIARDS.find(s=>s.id==='es_sancho'),boss=SPANIARDS.find(s=>s.id==='es_boatswain');
function landing(){quiet();director.setScene('p2_landing');combat.reset();duel.reset();duel.setRandom(()=>0.5);return director.startAt()+5000;}
// подойти к испанцу и встать рядом
const beside=(p,id)=>{const d=me(id);p.p=at(d.p[0]+1.5,d.p[2]);};

test('the routes keep to the paths: no stop inside a hut, every loop passes the batey',()=>{
 const huts=[[193.4,263.2],[181.5,275.8],[163.3,278.6],[147.3,270.4],[147.3,239.6],[188.7,239.6],[206,229],[207,287],[168,222]];
 for(const s of SPANIARDS){
  assert.equal(s.route.filter(x=>x.batey).length,1,s.id);
  for(const x of s.route){
   for(const h of huts)assert.ok(Math.hypot(x.p[0]-h[0],x.p[1]-h[1])>(h[1]===222?9:5),`${s.id} ${x.p} near a hut`);
   if(x.act)assert.ok(x.doing&&x.say&&x.face&&x.wait>0,`${s.id} stop ${x.p}`);
  }
  // по каждому отрезку маршрута — не через хижину
  for(let i=0;i<s.route.length;i++){
   const a=s.route[i].p,b=s.route[(i+1)%s.route.length].p;
   for(let k=0;k<=20;k++){const q=[a[0]+(b[0]-a[0])*k/20,a[1]+(b[1]-a[1])*k/20];for(const h of huts)assert.ok(Math.hypot(q[0]-h[0],q[1]-h[1])>(h[1]===222?8:4.6),`${s.id} ${a}→${b} crosses a hut`);}
  }
  for(let i=0;i<s.route.length;i++){const {path,b}=pathToBatey(s,[...s.route[i].p.slice(0,1),0,s.route[i].p[1]],i);assert.deepEqual(path.at(-1),s.route[b].p);}
 }
});

test('on 12 October the crew of the Santa María walk the village, stop by the villagers and greet the Taíno',()=>{
 let now=landing();duel.tick(now);
 const list=duel.state(now).duelists;
 assert.deepEqual(list.map(d=>d.id).sort(),['es_boatswain','es_diego','es_sancho']);
 assert.deepEqual(Object.fromEntries(list.map(d=>[d.id,d.crew])),{es_diego:'sailor_1',es_sancho:'sailor_3',es_boatswain:'boatswain'},'the same people as on the ship');
 assert.equal(me('es_diego').weapon,'espingarda');assert.equal(me('es_sancho').weapon,'sword');
 assert.equal(me('es_diego').state,'act');assert.equal(me('es_diego').act,'guard');assert.match(me('es_diego').doing,/лодки/);assert.ok(me('es_diego').say);
 // через минуту Диего уже на тропе к деревне, потом слушает старейшину
 now=run(now,20000);assert.equal(me('es_diego').state,'walk');
 const start=me('es_diego').p;now=run(now,8000);assert.ok(me('es_diego').p[0]>start[0]+5,'walks inland');
 now=until(now,()=>me('es_diego').act==='listen',90000);assert.match(me('es_diego').doing,/старейшин/);
 // таино на тропе: останавливается и здоровается
 now=until(now,()=>me('es_diego').state==='walk',60000);
 const p=player('villager','grumete',at(0,0));const d=me('es_diego'),f=[-Math.sin(d.r),-Math.cos(d.r)];
 p.p=at(d.p[0]+f[0]*2,d.p[2]+f[1]*2);duel.tick(now+=100);
 assert.equal(me('es_diego').state,'greet');assert.ok(me('es_diego').say);
 now=run(now,3000);assert.notEqual(me('es_diego').state,'greet');
 assert.ok(duel.state(now).duelists.every(x=>x.p.every(Number.isFinite)));
 // батей пуст днём: воинов касика 12 октября нет
 assert.equal(me('duelist_young'),undefined);
});

test('a challenged sailor leads you to the batey; the bout counts for «Сила чужаков» and he goes back to his round',()=>{
 let now=landing();duel.tick(now);
 const p=player('challenger-es','piloto',at(0,0));beside(p,'es_sancho');
 assert.equal(duel.challenge(p,'es_sancho',now),true);
 assert.equal(me('es_sancho').state,'lead');assert.equal(me('es_sancho').player,p.id);
 assert.ok(p.msgs.some(m=>m.t==='notice'&&/идёт на батей/.test(m.text)));
 assert.equal(duel.attack(p,'es_sancho',now),false,'no blows on the way');
 // идёт следом
 // идёт следом, отстав на 8 м; он доходит до середины своей половины батея и ждёт
 let seen=new Set();
 now=until(now,()=>{const d=me('es_sancho');seen.add(d.state);if(d.state==='lead')p.p=at(d.p[0]+Math.sin(d.r)*8,d.p[2]+Math.cos(d.r)*8);return d.state==='await';},90000);
 assert.deepEqual([...seen],['lead','await']);
 const arena=ARENAS.find(a=>Math.hypot(a.c[0]-me('es_sancho').p[0],a.c[1]-me('es_sancho').p[2])<0.5);assert.ok(arena,'waits in the middle of a half of the batey');
 p.p=at(arena.c[0]+2,arena.c[1]+1);
 duel.tick(now+=100);assert.equal(me('es_sancho').state,'ready','the bout starts once you are in the circle');
 assert.ok(Math.hypot(p.p[0]-arena.c[0],p.p[2]-arena.c[1])<D.START+0.1,'face to face in the middle of his half');
 assert.ok(p.inventory.includes('macana'),'empty hands — a macana is lent');
 now+=D.READY_MS+10;
 for(let i=0;i<3;i++){
  now=until(now+CD,()=>{const d=me('es_sancho');if(d.state==='windup')front(p,'es_sancho',3.2);return d.state==='recover';},20000);
  front(p,'es_sancho',1.6);hit(p,'es_sancho',now);
 }
 assert.equal(me('es_sancho').result,'player');assert.ok(p.log.includes('duel_es_sancho'));
 assert.ok(p.msgs.some(m=>m.t==='quest'&&m.id==='q_p2_landing_duel'&&m.status==='done'));
 assert.ok(p.msgs.some(m=>m.t==='notice'&&/хлопает тебя по плечу/.test(m.text)));
 assert.equal(me('es_sancho').state,'return');
 now=until(now,()=>['walk','act'].includes(me('es_sancho').state),30000);
 now=run(now,30000);assert.ok(['walk','act','greet'].includes(me('es_sancho').state),'back on his round');
});

test('two bouts at once on the two halves of the batey; a third waits; walking away cancels',()=>{
 let now=landing();duel.tick(now);
 const a=player('a-es','grumete',at(0,0)),b=player('b-es','piloto',at(0,0)),c=player('c-es','lengua',at(0,0));
 beside(a,'es_diego');assert.equal(duel.challenge(a,'es_diego',now),true);
 beside(b,'es_boatswain');assert.equal(duel.challenge(b,'es_boatswain',now),true);
 beside(c,'es_sancho');assert.equal(duel.challenge(c,'es_sancho',now),false);
 assert.ok(c.msgs.some(m=>m.t==='notice'&&/уже бьются двое/.test(m.text)));
 // a не идёт — Диего ждёт и уходит
 b.connected=false;
 now=run(now,200000);
 assert.equal(me('es_diego').player,null);assert.ok(a.msgs.some(m=>m.t==='notice'&&/не дождался/.test(m.text)));
 assert.equal(me('es_boatswain').player,null,'a disconnected challenger frees him');
 assert.ok(['walk','act','greet','return'].includes(me('es_diego').state));
 beside(c,'es_sancho');assert.equal(duel.challenge(c,'es_sancho',now),true,'the batey is free again');
 // смена сцены — все расходятся
 director.setScene('p2_departure');duel.tick(now+100);assert.equal(duel.state().duelists.length,0);
 assert.ok(!c.inventory.includes('macana'));
});

test('Diego with the espingarda keeps his distance, aims, fires a blank and reloads: step aside, then rush him',()=>{
 let now=landing();duel.tick(now);
 const p=player('vs-gunner','grumete',at(0,0));beside(p,'es_diego');
 assert.equal(duel.challenge(p,'es_diego',now),true);
 now=until(now,()=>{const d=me('es_diego');if(d.state==='lead')p.p=at(d.p[0]+Math.sin(d.r)*2,d.p[2]+Math.cos(d.r)*2);return d.state==='ready';},120000);
 now+=D.READY_MS+10;
 // держит дистанцию: подходишь — пятится
 const d0=me('es_diego');p.p=at(d0.p[0]-Math.sin(d0.r)*2.6,d0.p[2]-Math.cos(d0.r)*2.6);
 now=run(now,600);assert.ok(Math.hypot(me('es_diego').p[0]-p.p[0],me('es_diego').p[2]-p.p[2])>2.9,'backs away');
 // стоишь на линии ствола — попадает
 now=until(now,()=>me('es_diego').state==='aim',15000);
 now=until(now,()=>me('es_diego').state==='fire',3000);
 assert.deepEqual(me('es_diego').score,[0,1],'shot when you stood still');
 assert.ok(p.msgs.some(m=>m.t==='hit'&&m.shot&&m.target===p.id&&!m.missed));
 assert.ok(p.msgs.some(m=>m.t==='world_event'&&m.type==='scare'&&m.who==='es_diego'),'the bang scares the birds');
 now=until(now,()=>me('es_diego').state==='reload',1000);
 // перезаряжает — открыт: удар спереди засчитан
 front(p,'es_diego',1.8);hit(p,'es_diego',now);assert.deepEqual(me('es_diego').score,[1,1],'hit while he reloads');
 // целится — после фиксации ствола шаг вбок: мимо
 now=until(now+CD,()=>me('es_diego').state==='aim',20000);
 now=run(now,diego.aimMs-diego.lockMs+100);
 { const d=me('es_diego');p.p=at(p.p[0]+Math.cos(d.r)*1.6,p.p[2]-Math.sin(d.r)*1.6); }
 now=until(now,()=>me('es_diego').state==='fire',3000);
 assert.deepEqual(me('es_diego').score,[1,1],'stepped off the line of the barrel');
 assert.ok(p.msgs.some(m=>m.t==='hit'&&m.shot&&m.missed));
 // удар во время прицела тоже сбивает
 now=until(now,()=>me('es_diego').state==='aim',20000);
 front(p,'es_diego',1.8);hit(p,'es_diego',now);assert.deepEqual(me('es_diego').score,[2,1]);
 assert.ok(duel.state(now).duelists.every(x=>x.p.every(Number.isFinite)));
});

test('the cacique\'s warriors do not stand still: they practise, walk the edge of the batey, stretch, burn the spear point — and can be challenged at any of it',()=>{
 quiet();director.setScene('p2_day');combat.reset();duel.reset();duel.setRandom(()=>0.5);
 let now=director.startAt()+5000;duel.tick(now);
 assert.equal(me(young.id).state,'act');assert.equal(me(young.id).act,'practice');assert.match(me(young.id).doing,/удары/);
 const acts=new Set(),spots=new Set();
 for(let t=0;t<240000;t+=100){now+=100;duel.tick(now);const d=me(young.id),v=me(veteran.id);acts.add(d.act??d.state);acts.add(v.act??v.state);spots.add(`${Math.round(d.p[0])},${Math.round(d.p[2])}`);}
 for(const a of ['practice','stretch','watch','sharpen','walk'])assert.ok(acts.has(a),a);
 assert.ok(spots.size>8,'walks around');
 // вызов на ходу
 now=until(now,()=>me(veteran.id).state==='walk',60000);
 const p=player('mid-walk','grumete',at(me(veteran.id).p[0]+1,me(veteran.id).p[2]));
 assert.equal(duel.challenge(p,veteran.id,now),true);assert.equal(me(veteran.id).state,'ready');
 assert.ok(Math.hypot(p.p[0]-RING.c[0],p.p[2]-RING.c[1])<2,'both go to the middle of the batey');
});

test('a spear can be thrown (F): it flies like an arrow, lands by the opponent, you fight with fists until you pick it up',async()=>{
 let {p,now}=start('thrower',young,['war_spear']);
 now=until(now,()=>me(young.id).state==='windup',15000);
 front(p,young.id,6);aim(p,young.id);
 assert.equal(duel.attack(p,young.id,now,null,'throw'),true);
 assert.deepEqual(me(young.id).score,[1,0],'a throw at his wind-up scores');
 const hitMsg=p.msgs.findLast(m=>m.t==='hit'&&m.by===p.id);
 assert.ok(hitMsg.thrown&&hitMsg.thrown.ms>100&&hitMsg.thrown.to.every(Number.isFinite),'everyone sees the spear fly');
 assert.ok(!p.inventory.includes('war_spear'),'it left your hand');
 assert.equal(duel.attack(p,young.id,now+2000,null,'throw'),false,'nothing to throw');
 // кулаки
 now=run(now,600);assert.equal(me(young.id).playerWeapon,'fist');
 // упало на землю у круга — его можно поднять
 await new Promise(r=>setTimeout(r,hitMsg.thrown.ms+50));
 const entities=await import('../game/entities.js');
 const dropped=entities.allDefs().find(d=>d.item==='war_spear'&&String(d.id).startsWith('drop:spear:'));
 assert.ok(dropped,'the spear lies on the ground');
 assert.ok(((dropped.p[0]-RING.c[0])/RING.rx)**2+((dropped.p[2]-RING.c[1])/RING.rz)**2<=1,'inside the circle');
 assert.ok(Math.hypot(dropped.p[0]-hitMsg.thrown.to[0],dropped.p[2]-hitMsg.thrown.to[2])<0.1,'where it was seen landing');
 // поднял — снова в руке
 p.inventory.push('war_spear');now=run(now,200);assert.equal(p.equipped,'war_spear');assert.equal(me(young.id).playerWeapon,'war_spear');
 // промах: летит дальше, мимо
 now=until(now+1000,()=>me(young.id).state==='circle',15000);
 front(p,young.id,5);aim(p,young.id);p.r+=0.8;
 assert.equal(duel.attack(p,young.id,now,null,'throw'),false);
 const miss=p.msgs.findLast(m=>m.t==='hit'&&m.missed&&m.thrown);assert.ok(miss,'a missed throw still flies');
 assert.ok(Math.hypot(miss.thrown.to[0]-p.p[0],miss.thrown.to[2]-p.p[2])>5,'further than him');
 await new Promise(r=>setTimeout(r,miss.thrown.ms+80)); // упало до конца теста
});
