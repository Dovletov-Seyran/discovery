import{randomUUID,randomInt}from'node:crypto';
import{loadMinigameState,saveMinigameState}from'../db.js';
import{players}from'./players.js';
import * as director from './director.js';
import * as entities from './entities.js';
import{shuffledDeck,playDealer}from'./cards-engine.js';
import{handValue,roundOutcome,DANCE_BEAT,DANCE_BEATS,DANCE_DURATION,DIRECTIONS,danceJudgement}from'../../shared/feast-games.js';
import{performAction}from'./player-actions.js';
import{worldEvent}from'./world-events.js';
import{feastCommentary}from'../ai/feast-commentary.js';

const viewers=new Map();let table=null,dances={},loadedKey=null,commentPending=false;
let hooks={credit:()=>{},npcOwner:()=>null,deck:shuffledDeck};
export const setHooks=h=>{hooks={...hooks,...h};};
const key=()=>`${director.scene().id}@${director.startAt()}`;
const valid=p=>p.connected&&director.scene().id==='ship_evening'&&p.zone==='ship'&&p.scene===key()&&!director.isTransitioning();
const active=t=>!!t&&['lobby','playing','reveal'].includes(t.phase);
const persist=()=>saveMinigameState('feast',{scene:loadedKey,table,dances});
const stats=id=>loadMinigameState(`feast-stats:${id}`)??{hands:0,highHits:0,busts:0,matches:0};
function ensure(){
 if(loadedKey===key())return;
 for(const [id]of viewers){const p=players.get(id);if(p)players.send(p,{t:'cards_state',phase:'closed',serverNow:Date.now()});}
 viewers.clear();for(const p of players.all())if(p.action?.kind==='dance'){p.action=null;players.broadcast({t:'player_action',id:p.id,action:null,serverNow:Date.now()});}
 const saved=loadMinigameState('feast');loadedKey=key();table=saved?.scene===loadedKey?saved.table:null;dances=saved?.scene===loadedKey?saved.dances??{}:{};
}
export function reset(){loadedKey=null;ensure();}
const error=(p,text)=>players.send(p,{t:'notice',text});
export function isDancing(id){ensure();return !!dances[id]&&dances[id].phase==='dancing';}
export function participant(id){ensure();return active(table)&&table.players.some(s=>s.id===id&&!s.left);}
export function busy(){ensure();return active(table)||Object.values(dances).some(s=>s.phase==='dancing');}
export function reservation(npc){
 ensure();if(npc!=='storyteller'||!active(table)||!table.players.some(s=>!s.left))return null;
 return {id:'card-table',name:'игроками за карточным столом',lookAt:entities.def('cards').p};
}
export function cardView(p,now=Date.now()){
 ensure();if(!table)return {t:'cards_state',phase:'closed',serverNow:now};
 const revealed=['reveal','finished'].includes(table.phase),own=table.players.find(s=>s.id===p.id&&!s.left);
 return {t:'cards_state',sessionId:table.id,revision:table.revision,scene:table.scene,phase:table.phase,round:table.round,hostId:table.hostId,turnId:table.turnId,deadline:table.deadline,endsAt:table.endsAt,serverNow:now,
  participant:!!own,canJoin:table.phase==='lobby'&&!own&&table.players.filter(s=>!s.left).length<3,
  dealer:{cards:table.dealer.map((c,i)=>revealed||i===0?c:null),total:revealed?handValue(table.dealer):table.dealer.length?handValue(table.dealer.slice(0,1)):0},
  players:table.players.map(s=>({id:s.id,name:s.name,points:s.points,left:s.left,stood:s.stood,connected:!!players.get(s.id)?.connected,cards:s.hand.map(c=>revealed||s.id===p.id?c:null),total:revealed||s.id===p.id?handValue(s.hand):null,result:revealed?s.result:null})),
  commentary:table.commentary,commentId:table.commentId,cancelled:!!table.cancelled};
}
function send(p,open=false){players.send(p,{...cardView(p),open});}
function broadcast(){for(const [id]of viewers){const p=players.get(id);if(p?.connected)send(p);}}
function changed(){table.revision++;persist();broadcast();}
function comment(fallback,event){
 if(!table)return;table.commentary=fallback;table.commentId=(table.commentId??0)+1;
 const now=Date.now();if(commentPending||now-(table.lastAiAt??0)<12000||process.env.AI==='0')return;
 table.lastAiAt=now;commentPending=true;
 const id=table.id,round=table.round,serial=table.commentId;
 const previous=table.players.map(s=>({name:s.name,...s.previous}));
 feastCommentary({event,round,players:table.players.map(s=>s.name),previous}).then(text=>{
  ensure();if(text&&table?.id===id&&table.round===round&&table.commentId===serial){table.commentary=text;persist();broadcast();}
 }).catch(()=>{}).finally(()=>commentPending=false);
}
function create(p,now){
 table={id:randomUUID(),scene:key(),revision:0,phase:'lobby',round:0,hostId:p.id,players:[],dealer:[],turnId:null,deadline:now+60000,endsAt:null,deck:[],commentary:'Хуан: садитесь к столу. Можно начать одному или дождаться товарищей.',commentId:1};
}
function add(p){table.players.push({id:p.id,name:p.name,hand:[],points:0,left:false,stood:false,result:null,previous:stats(p.id),roundHighHits:0});}
function deal(now){
 table.round++;table.phase='playing';table.deck=hooks.deck();table.dealer=[];
 for(const s of table.players){s.hand=[];s.stood=s.left;s.result=null;s.roundHighHits=0;}
 const seated=table.players.filter(s=>!s.left);
 for(let i=0;i<2;i++){for(const s of seated)s.hand.push(table.deck.pop());table.dealer.push(table.deck.pop());}
 for(const s of seated)if(handValue(s.hand)===21)s.stood=true;
 table.turnId=null;advance(now);
}
function advance(now){
 const seat=table.players.find(s=>!s.left&&!s.stood&&players.get(s.id)?.connected);
 for(const s of table.players)if(!players.get(s.id)?.connected)s.stood=true;
 if(seat){table.turnId=seat.id;table.deadline=now+20000;return;}
 finishRound(now);
}
function finishRound(now){
 playDealer(table.deck,table.dealer);table.phase='reveal';table.turnId=null;table.deadline=now+5000;
 for(const s of table.players){
  if(s.left)continue;s.completedRounds=(s.completedRounds??0)+1;s.result=roundOutcome(s.hand,table.dealer);if(s.result==='win')s.points++;
  const memory=stats(s.id);memory.hands++;memory.highHits+=s.roundHighHits;if(s.result==='bust')memory.busts++;saveMinigameState(`feast-stats:${s.id}`,memory);s.previous=memory;
 }
 comment('Хуан: вскрываем карты. Победа — одно очко; равная сумма — ничья.',`Deal ${table.round} is over. All hands are now public. Results: ${table.players.filter(s=>!s.left).map(s=>`${s.name}: ${s.result}`).join('; ')}. Juan has ${handValue(table.dealer)}.`);
 // Put the table in reveal BEFORE crediting: scene completion must still see an active match.
 persist();
 for(const s of table.players){const p=players.get(s.id);if(p&&!s.left)hooks.credit(p,'cards');}
}
function finish(now,cancelled=false){
 table.phase='finished';table.cancelled=cancelled;table.turnId=null;table.deadline=now+30000;table.endsAt=now;
 if(!cancelled)for(const s of table.players)if(!s.left){const m=stats(s.id);m.matches++;saveMinigameState(`feast-stats:${s.id}`,m);}
 if(cancelled){table.dealer=[];for(const s of table.players)s.hand=[];table.commentary='Хуан: на сегодня довольно. Продолжим в другой раз.';}
 else comment('Хуан: три раздачи сыграны. Спасибо за компанию!',`The three-deal match has ended. Scores: ${table.players.map(s=>`${s.name}: ${s.points}`).join('; ')}.`);
}
export function cards(p,msg={}){
 ensure();const action=msg.action;
 if(action==='hide'){viewers.delete(p.id);return;}
 if(!valid(p))return error(p,'В карты играют только вечером на корабле.');
 if(action==='heartbeat'){if(viewers.has(p.id))viewers.set(p.id,Date.now()+30000);return;}
 if(!entities.isNear(p,'cards',1))return error(p,'Подойди к карточному столу.');
 const now=Date.now();
 if(action==='open'||action==='join'){
  if(isDancing(p.id))return error(p,'Сначала закончи танец.');
  if(!active(table)){
   const owner=hooks.npcOwner('storyteller');if(owner&&owner!==p)return error(p,'Хуан разговаривает с товарищем. Дождись окончания разговора.');
   create(p,now);
  }
  if(table.phase==='lobby'&&!table.players.some(s=>s.id===p.id&&!s.left)){
   if(table.players.filter(s=>!s.left).length>=3)return error(p,'За столом уже трое.');
   table.players=table.players.filter(s=>s.id!==p.id);add(p);table.revision++;persist();
  }
  viewers.set(p.id,now+30000);send(p,true);broadcast();return;
 }
 if(!table||msg.sessionId!==table.id)return error(p,'Эта партия уже закончилась. Открой стол заново.');
 const seat=table.players.find(s=>s.id===p.id&&!s.left);
 if(action==='leave'){
  if(seat){seat.left=true;seat.stood=true;if(table.hostId===p.id)table.hostId=table.players.find(s=>!s.left)?.id??null;
   if(!table.players.some(s=>!s.left))finish(now,true);else if(table.phase==='playing'&&table.turnId===p.id)advance(now);changed();}
  viewers.delete(p.id);return;
 }
 if(!seat)return error(p,'Ты наблюдаешь. Присоединиться можно к следующей партии.');
 if(msg.revision!==table.revision){send(p);return;}
 if(action==='start'&&table.phase==='lobby'&&table.hostId===p.id){
  table.players=table.players.filter(s=>!s.left&&players.get(s.id)?.connected);if(!table.players.length)return;
  table.endsAt=now+210000;comment('Хуан: три раздачи. Береги голову — больше двадцати одного не нужно.','The match begins. No wagers, three deals.');deal(now);changed();return;
 }
 if(table.phase!=='playing'||table.turnId!==p.id||now>=table.deadline)return send(p);
 if(action==='hit'){
  if(handValue(seat.hand)>=16)seat.roundHighHits++;
  seat.hand.push(table.deck.pop());const total=handValue(seat.hand);
  if(total>21){seat.stood=true;comment('Хуан: перебор! Море любит смелых, а карты — осторожных.',`${p.name} has publicly busted.`);advance(now);}
  else{if(total>=16)comment('Хуан: ещё карта? Смелости тебе не занимать.',`${p.name} takes another card. They now hold ${seat.hand.length} cards; their values remain private.`);if(total===21){seat.stood=true;advance(now);}}
 }else if(action==='stand'){seat.stood=true;advance(now);}else return;
 changed();
}
export function dance(p,msg={}){
 ensure();const now=Date.now(),old=dances[p.id];
 if(msg.action==='cancel'){
  if(old&&old.id===msg.sessionId&&old.phase==='dancing'){old.phase='cancelled';endDance(p,old,false);persist();}return;
 }
 if(!valid(p))return error(p,'Танцевать можно вечером на корабле.');
 if(msg.action==='start'){
  if(participant(p.id))return error(p,'Сначала выйди из партии в карты.');
  if(old?.phase==='dancing'){players.send(p,{t:'dance_state',...old,serverNow:now,open:true});return;}
  if(!entities.isNear(p,'dance',0))return error(p,'Подойди к кругу танцующих.');
  if(players.connected().some(o=>o!==p&&o.zone===p.zone&&Math.abs(o.p[1]-p.p[1])<1.3&&Math.hypot(o.p[0]-p.p[0],o.p[2]-p.p[2])<.85))return error(p,'Для танца нужно немного места: отойди от товарища на шаг.');
  const startAt=director.startAt()+Math.ceil((now+2500-director.startAt())/DANCE_BEAT)*DANCE_BEAT;
  const session={id:randomUUID(),scene:key(),phase:'dancing',startAt,endsAt:startAt+DANCE_DURATION,steps:Array.from({length:DANCE_BEATS},()=>DIRECTIONS[randomInt(4)]),anchor:[...p.p],attempts:{},score:0,perfect:0,good:0};
  dances[p.id]=session;p.a='idle';p.action=null;
  performAction(p,'dance',null,{duration:session.endsAt-now,danceStartAt:startAt,beatMs:DANCE_BEAT,steps:session.steps});
  worldEvent(p,'dance',{until:session.endsAt},now);players.send(p,{t:'dance_state',...session,serverNow:now,open:true});persist();return;
 }
 if(!old||msg.sessionId!==old.id||old.phase!=='dancing')return;
 if(msg.action==='hit'){
  const index=msg.index;if(Object.hasOwn(old.attempts,index))return;
  const judged=danceJudgement(old,index,msg.direction,now);if(!judged)return;
  // Reject early/late spam instead of using it to consume future steps.
  if(Math.abs(now-(old.startAt+(index+.5)*DANCE_BEAT))>450)return;
  old.attempts[index]=judged.grade;old.score+=judged.points;if(judged.grade==='perfect')old.perfect++;if(judged.grade==='good')old.good++;
  players.send(p,{t:'dance_state',...old,serverNow:now,judged:{index,...judged}});persist();
 }
}
function endDance(p,s,success){
 p.action=null;p.a='idle';players.broadcast({t:'player_action',id:p.id,action:null,serverNow:Date.now()});
 players.send(p,{t:'dance_state',...s,serverNow:Date.now()});if(success)hooks.credit(p,'dance');
}
export function moveLocked(p){ensure();return dances[p.id]?.phase==='dancing'?dances[p.id].anchor:null;}
export function disconnect(p){
 ensure();viewers.delete(p.id);const s=dances[p.id];if(s?.phase==='dancing'){s.phase='cancelled';endDance(p,s,false);persist();}
 if(table?.phase==='playing'&&table.turnId===p.id){const seat=table.players.find(s=>s.id===p.id);if(seat)seat.stood=true;advance(Date.now());changed();}
}
export function reconnect(p){
 ensure();const seat=table?.players.find(s=>s.id===p.id&&!s.left);
 if(seat&&(active(table)||table.phase==='finished')){viewers.set(p.id,Date.now()+30000);send(p,true);if(seat.completedRounds)hooks.credit(p,'cards');}
 const s=dances[p.id];if(s?.phase==='dancing'){s.phase='cancelled';endDance(p,s,false);persist();}
}
export function tick(now=Date.now()){
 ensure();for(const[id,until]of viewers)if(until<now||!players.get(id)?.connected)viewers.delete(id);
 if(table&&active(table)){
  let change=false;
  if(table.phase==='lobby'&&now>=table.deadline){finish(now,true);change=true;}
  else if(table.phase!=='lobby'&&now>=table.endsAt){finish(now,true);change=true;}
  else if(table.phase==='playing'&&(now>=table.deadline||!players.get(table.turnId)?.connected)){
   const s=table.players.find(s=>s.id===table.turnId);if(s)s.stood=true;advance(now);change=true;
  }else if(table.phase==='reveal'&&now>=table.deadline){if(table.round>=3||!table.players.some(s=>!s.left&&players.get(s.id)?.connected))finish(now);else deal(now);change=true;}
  if(change)changed();
 }
 for(const[id,s]of Object.entries(dances))if(s.phase==='dancing'){
  const p=players.get(Number(id));if(!p?.connected){s.phase='cancelled';if(p)endDance(p,s,false);persist();}
  else if(now>=s.endsAt){s.phase='finished';endDance(p,s,true);persist();}
 }
}
