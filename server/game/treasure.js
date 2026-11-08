import {players} from './players.js';
import * as entities from './entities.js';
import * as director from './director.js';
import {heldItem} from '../../shared/player-presentation.js';
import {performAction} from './player-actions.js';
import {createIslandActivities} from './canary-activities.js';
export function treasureHunt(event){
 const tell=(p,text)=>players.send(p,{t:'notice',text});
 const broadcast=(id,patch)=>players.broadcast({t:'entity',id,state:entities.setState(id,patch)},p=>p.zone==='canary');
 const work=createIslandActivities({valid:(p,id)=>director.scene().id==='canary'&&entities.isNear(p,id),send:(p,m)=>players.send(p,m)});
 return {
  tick:now=>work.tick(now),
  dig(p){
   if(director.scene().id!=='canary'||!entities.isNear(p,'treasure_site')){tell(p,'Копать нужно у пальмы, указанной на карте.');return false;}
   if(!p.inventory.includes('treasure_map')){tell(p,'Сначала найди карту в доме у городского колодца.');return false;}
   event(p,{type:'pickup',item:'treasure_map'});
   if(entities.stateOf('treasure_site')?.open){event(p,{type:'interact',target:'treasure_site'});tell(p,'Сундук уже откопан. Открой его.');return true;}
   if(heldItem(p)!=='shovel'){tell(p,'Возьми лопату в руки. Её можно найти на складе.');return false;}
   const started=work.start(p,{kind:'dig',label:'Раскапываем тайник',duration:3500,target:'treasure_site',finish:()=>{
    if(!p.inventory.includes('shovel')||!p.inventory.includes('treasure_map'))return;
    broadcast('treasure_site',{open:true,changedAt:Date.now()});broadcast('treasure_chest',{visible:true});
    event(p,{type:'interact',target:'treasure_site'});tell(p,'Под землёй оказался сундук!');
   }});if(started)performAction(p,'fill','shovel',{duration:3500});return started;
  },
  open(p){
   if(director.scene().id!=='canary'||!entities.isNear(p,'treasure_chest')||!entities.stateOf('treasure_site')?.open)return false;
   broadcast('treasure_chest',{open:true,changedAt:Date.now()});
   if(!p.inventory.includes('treasure_map')){tell(p,'Покажи находку тому, у кого карта.');return true;}
   event(p,{type:'interact',target:'treasure_site'});
   if(p.trade?.treasure_claimed){tell(p,'Письмо моряка и медальон уже у тебя.');return true;}
   broadcast('treasure_chest',{looted:true});
   p.trade??={};p.trade.treasure_claimed=true;p.money+=75;p.inventory.push('medallion');players.sendInventory(p);
   event(p,{type:'interact',target:'treasure_chest'});players.save(p,{now:true});director.persistNow();
   tell(p,'Медальон, 75 мараведи и письмо моряка найдены. Прочти письмо в журнале J.');return true;
  },
 };
}
