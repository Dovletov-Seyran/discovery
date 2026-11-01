import {ITEM_RULES,freshVitals} from '../../shared/item-actions.js';

// Pure state mutation; rules.js handles proximity, quests, persistence and broadcasts.
export function applyItemUse(p,item,now=Date.now()){
 const rule=ITEM_RULES[item];
 if(!rule||!p.inventory.includes(item))return {error:'Предмета нет в снаряжении.'};
 p.lastItemUse??={};p.itemUses??={};p.vitals??=freshVitals();
 if(now-(p.lastItemUse[item]??-Infinity)<rule.cooldown)return {error:'Подожди окончания действия.'};
 if(item==='barrel')return {error:'Подойди к колодцу и нажми E или ЛКМ.'};
 if(item==='tar'||item==='planks')return {error:'Подойди к плотнику и передай припасы.'};
 if(rule.servings){
  const left=p.itemUses[item]??rule.servings;
  if(left<=0)return {error:'Пусто.'};
  p.itemUses[item]=left-1;
  if(p.itemUses[item]===0){
   p.inventory.splice(p.inventory.indexOf(item),1);delete p.itemUses[item];
   if(item==='barrel_full')p.inventory.push('barrel');
  }
 }
 if(rule.effect==='drink'){
  const active=p.vitals.drunkUntil>now;
  p.vitals.drunkUntil=Math.min(now+60000,Math.max(now,p.vitals.drunkUntil)+rule.drunkMs);
  p.vitals.drunkStrength=Math.min(1,(active?p.vitals.drunkStrength:0)+rule.strength);
 }
 if(rule.energy)p.vitals.stamina=Math.min(100,p.vitals.stamina+rule.energy);
 p.lastItemUse[item]=now;
 return {item,effect:rule.effect,cooldownUntil:now+rule.cooldown,serverNow:now,
  uses:p.itemUses[item]??(p.inventory.includes(item)?rule.servings:0),money:p.money,vitals:{...p.vitals}};
}
export function advanceStamina(p,seconds,now=Date.now()){
 p.vitals??=freshVitals();
 const sprinting=p.a==='run'&&now-(p.lastMoveAt??0)<1500;
 p.vitals.stamina=Math.max(0,Math.min(100,p.vitals.stamina+(sprinting?-12:6)*Math.min(seconds,1.5)));
 if(p.vitals.drunkUntil<=now)p.vitals.drunkStrength=0;
 return p.vitals;
}
