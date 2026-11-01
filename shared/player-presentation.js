import {ITEM_RULES} from './item-actions.js';

export const PLAYER_ACTION_MS={swing:580,shot:400,drink:1100,eat:1000,inspect:1000,throw:650,place:650,pickup:650,toggle:700,fill:1200,give:700,dance:2000,scare:650};
export const actionForEffect=effect=>({swing:'swing',shot:'shot',drink:'drink',water:'drink',food:'eat',compass:'inspect',map:'inspect',astrolabe:'inspect',cup:'inspect',wallet:'inspect'})[effect];
export const heldItem=p=>typeof p.equipped==='string'&&Object.hasOwn(ITEM_RULES,p.equipped)&&p.inventory?.includes(p.equipped)?p.equipped:null;
export function setHeldItem(p,item){
  if(p.equipped===item)return false;
  p.equipped=item;p.equipmentRev=(p.equipmentRev??0)+1;return true;
}
export function presentation(p,now=Date.now()){
  const action=p.action&&p.action.zone===p.zone&&p.action.scene===p.scene&&now<p.action.startedAt+p.action.duration?p.action:null;
  return {equipped:heldItem(p),equipmentRev:p.equipmentRev??0,action};
}
