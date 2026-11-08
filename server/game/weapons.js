import {WEAPONS,inWeaponArc} from '../../shared/weapon-rules.js';
import {heldItem} from '../../shared/player-presentation.js';
import {npcActivity} from '../../shared/npc-activity.js';
import {players} from './players.js';
import * as director from './director.js';
import * as entities from './entities.js';
import * as combat from './combat.js';
import {surfaceAt} from '../world/object-collision.js';
import {applyItemUse} from './item-actions.js';
import {performAction} from './player-actions.js';
import {worldEvent} from './world-events.js';
const tell=(p,text)=>players.send(p,{t:'notice',text});
function interruptConversation(id){
 for(const p of players.all())if(p.dialogue?.npc===id){
  players.send(p,{t:'npc_say',npc:id,dialogueId:p.dialogue.id,busy:true,error:true,ru:'Разговор прерван: персонаж погиб.',hints:[]});p.dialogue=null;p.npcRequest=null;
 }
}
export function weaponAttack(p,msg={},now=Date.now()){
 const item=heldItem(p),rule=WEAPONS[item];if(!rule)return false;
 if(!p.connected||!director.acceptsMove()||director.isTransitioning()||!p.p)return false;
 let target=null,at=null,missed=false;
 if(typeof msg.target==='string'){
  const warrior=p.zone==='guanahani'?combat.state(now).warriors.find(w=>w.id===msg.target):null,def=entities.def(msg.target);
  if(warrior){target=msg.target;at=warrior.p;}
  else if(def?.kind==='npc'&&def.zone===p.zone){target=def.id;at=npcActivity(def,now/1000,{id:director.scene().id,startAt:director.startAt()},entities.stateOf(def.id)?.paused,entities.stateOf(def.id)?.behavior).p;}
  if(!target||entities.stateOf(target)?.dead)return false;
  if(!inWeaponArc(p,at,item)){tell(p,'Промах: цель вне досягаемости или прицела.');missed=true;}
  const origin=[p.p[0],p.p[1]+1.4,p.p[2]],point=[at[0],at[1]+1.0,at[2]],length=Math.hypot(...point.map((n,i)=>n-origin[i]));
  const hit=surfaceAt(p.zone,origin,point.map((n,i)=>(n-origin[i])/length),length);
  if(hit&&hit.distance<length-.4){tell(p,'Попаданию помешало препятствие.');missed=true;}
 }
 const used=applyItemUse(p,item,now);if(used.error){tell(p,used.error);return false;}
 players.send(p,{t:'item_used',...used});performAction(p,rule.effect,item);worldEvent(p,item==='espingarda'?'scare':'swing',{weapon:item},now);
 for(const d of entities.allDefs())if(d.kind==='npc'&&d.zone===p.zone&&d.p&&Math.hypot(d.p[0]-p.p[0],d.p[2]-p.p[2])<22){
  const state=entities.setState(d.id,{panicUntil:now+4500});players.broadcast({t:'entity',id:d.id,state},x=>x.zone===p.zone);
 }
 if(!target||missed)return !missed;
 if(p.zone==='guanahani'&&combat.weaponHit(p,target,rule.damage,now)){if(entities.stateOf(target)?.dead)interruptConversation(target);return true;}
 const old=entities.stateOf(target)??{},hp=Math.max(0,(old.hp??100)-rule.damage),dead=hp===0;
 if(dead)interruptConversation(target);
 const state=entities.setState(target,{hp,dead,down:dead?Number.MAX_SAFE_INTEGER:0,paused:null});
 players.broadcast({t:'entity',id:target,state},x=>x.zone===p.zone);players.broadcast({t:'hit',target,by:p.id,kind:'npc',hp,down:dead},x=>x.zone===p.zone);
 worldEvent(p,'scare',{weapon:item},now);players.save(p,{now:true});director.persistNow();return true;
}

export function resetWeaponNPCs(){
 for(const d of entities.allDefs())if(d.kind==='npc'&&entities.stateOf(d.id)?.dead){
  const state=entities.setState(d.id,{dead:false,hp:100,down:0,panicUntil:0});players.broadcast({t:'entity',id:d.id,state});
 }
}
