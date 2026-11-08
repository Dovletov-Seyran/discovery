import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CombatSounds,COMBAT_SOUNDS} from '../src/audio/combat-sounds.js';

// Поддельный Web Audio: узлы с connect/start/stop и параметрами-заглушками
function fakeContext(state='running'){
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  const node=(extra={})=>({connect(n){return n??this;},disconnect(){},...extra});
  const made={osc:0,src:0};
  return {made,state,currentTime:0,sampleRate:8000,destination:node(),
    createGain:()=>node({gain:param()}),createStereoPanner:()=>node({pan:param()}),
    createBiquadFilter:()=>node({type:'',Q:param(),frequency:param()}),
    createOscillator:()=>{made.osc++;return node({type:'',frequency:param(),start(){},stop(){}});},
    createBufferSource:()=>{made.src++;return node({buffer:null,loop:false,playbackRate:param(),start(){},stop(){}});},
    createBuffer:(c,n)=>({getChannelData:()=>new Float32Array(n)})};
}

test('every combat sound synthesises without files; silent until the audio is unlocked or when far away',()=>{
  const ctx=fakeContext(),s=new CombatSounds(()=>ctx,()=>ctx.destination);
  for(const kind of COMBAT_SOUNDS)assert.equal(s.play(kind,{gain:.8,pan:.3}),true,kind);
  assert.ok(ctx.made.osc>10&&ctx.made.src>10);
  for(const kind of ['swing','swing_sword','thrust','block_wood','block_steel','body','hurt','bow','arrow_hit','dodge','match','gunshot','ramrod','drum','drum_go','win','lose'])assert.ok(COMBAT_SOUNDS.includes(kind),kind);
  assert.equal(s.play('nonsense'),false);
  assert.equal(s.play('body',{gain:.01}),false,'too far to hear');
  const locked=fakeContext('suspended');assert.equal(new CombatSounds(()=>locked,()=>locked.destination).play('gunshot'),false);
});

test('the world hears the fight: blows, blocks of wood or steel, the gunner\'s match, bang and ramrod, the drum of my bout',async()=>{
  globalThis.addEventListener??=()=>{};
  const {WorldAudio}=await import('../src/audio/world-audio.js');
  const handlers={},events={on:(t,f)=>((handlers[t]??=[]).push(f)),emit:(t,m)=>handlers[t]?.forEach(f=>f(m))};
  const a=new WorldAudio(events),played=[];
  a.combat.play=(kind,o)=>{played.push([kind,o]);return true;};
  a.attach({listener:()=>({p:[0,0,0],yaw:0}),locate:id=>id===7?[0,0,0]:[3,0,0]});
  events.emit('auth_ok',{you:{id:7}});
  const kinds=()=>played.map(x=>x[0]);
  // свои и чужие действия
  events.emit('player_action',{id:7,action:{kind:'swing',item:'war_spear'}});
  events.emit('player_action',{id:8,action:{kind:'shot',item:'bow'}});
  events.emit('player_action',{id:8,action:{kind:'swing',item:'sword'}});
  assert.deepEqual(kinds(),['thrust','bow','swing_sword']);
  assert.ok(played[1][1].pan>0,'the archer on the right is heard on the right');
  // соперник: стрелок целится, стреляет, перезаряжает
  played.length=0;
  const d=(state,o={})=>({duelists:[{id:'es_diego',kind:'spaniard',weapon:'espingarda',p:[0,0,-20],state,player:7,score:[0,0],startsAt:0,...o}],serverNow:0});
  for(const s of ['circle','aim','fire','reload'])events.emit('duel',d(s));
  assert.deepEqual(kinds(),['match','gunshot']);
  assert.ok(played[1][1].gain>played[0][1].gain,'the bang is loud even at 20 m');
  await new Promise(r=>setTimeout(r,800));assert.ok(kinds().includes('ramrod'));
  // попадания
  played.length=0;
  events.emit('hit',{kind:'duel',by:7,target:'es_diego',weapon:'macana',blocked:true,against:'espingarda'});
  events.emit('hit',{kind:'duel',by:7,target:'es_sancho',weapon:'macana',blocked:true,against:'sword'});
  events.emit('hit',{kind:'duel',by:7,target:'es_diego',weapon:'bow',dodged:true,blocked:true});
  events.emit('hit',{kind:'duel',by:7,target:'es_diego',weapon:'bow'});
  events.emit('hit',{kind:'duel',by:'es_diego',target:7,weapon:'espingarda',shot:true,missed:true});
  events.emit('hit',{kind:'duel',by:'es_diego',target:7,weapon:'espingarda',shot:true});
  assert.deepEqual(kinds(),['block_wood','block_steel','dodge','arrow_hit','body','hurt']);
  // отсчёт своего боя и победа
  played.length=0;
  events.emit('duel',{duelists:[{id:'duelist_young',kind:'warrior',weapon:'macana',p:[0,0,-3],state:'idle',player:null,score:[0,0],startsAt:0}],serverNow:1000});
  events.emit('duel',{duelists:[{id:'duelist_young',kind:'warrior',weapon:'macana',p:[0,0,-3],state:'ready',player:7,score:[0,0],startsAt:1300}],serverNow:1000});
  await new Promise(r=>setTimeout(r,450));assert.ok(kinds().includes('drum_go'));
  events.emit('duel',{duelists:[{id:'duelist_young',kind:'warrior',weapon:'macana',p:[0,0,-3],state:'return',player:null,score:[3,1],startsAt:0,result:'player',lastPlayer:7}],serverNow:9000});
  assert.equal(kinds().at(-1),'win');
});
