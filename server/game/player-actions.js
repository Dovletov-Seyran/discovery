import {players} from './players.js';
import * as director from './director.js';
import {S2C} from '../../shared/protocol.js';
import {ITEM_RULES} from '../../shared/item-actions.js';
import {PLAYER_ACTION_MS,setHeldItem} from '../../shared/player-presentation.js';

// Only inventory-validated state is shared. Raw client animation requests do not exist.
export function equip(p,{item}){
  if(item!==null&&(typeof item!=='string'||!Object.hasOwn(ITEM_RULES,item)||!p.inventory.includes(item))){players.sendEquipment(p,true);return false;}
  if(item!==null&&(!director.acceptsMove()||director.isTransitioning())){players.sendEquipment(p,true);return false;}
  // Bound expensive remote model rebuilds; putting a consumed item away is handled independently.
  if(item!==null&&Date.now()-(p.lastEquipAt??0)<100){players.sendEquipment(p,true);return false;}
  if(setHeldItem(p,item)){p.lastEquipAt=Date.now();p.action=null;players.sendEquipment(p);players.save(p,{now:true});}
  else players.sendEquipment(p,true);
  return true;
}
export function equipForUse(p,item){
  if(p.inventory.includes(item)&&setHeldItem(p,item))players.sendEquipment(p);
}
export function performAction(p,kind,item=null,extra={}){
  const duration=PLAYER_ACTION_MS[kind];if(!duration||!p.p)return null;
  const action={...extra,kind,item,startedAt:Date.now(),duration:kind==='dance'?Math.min(24000,Math.max(duration,extra.duration??duration)):duration,seq:(p.actionSeq??0)+1,equipmentRev:p.equipmentRev??0,zone:p.zone,scene:p.scene};
  p.actionSeq=action.seq;p.action=action;
  players.broadcast({t:S2C.PLAYER_ACTION,id:p.id,action,serverNow:action.startedAt},other=>other.zone===p.zone);
  return action;
}
