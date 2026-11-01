// Authoritative placement, throwing, doors and dynamic objects. No client-authored patches.
import {performAction,equipForUse} from './player-actions.js';
import {randomUUID} from 'node:crypto';
import {loadContent} from '../content.js';
import {players} from './players.js';
import * as entities from './entities.js';
import * as director from './director.js';
import {S2C} from '../../shared/protocol.js';
import {ITEM_RULES} from '../../shared/item-actions.js';
import {createBody,advanceBody,objectProfile,finiteVec,PHYSICS_STEP,PHYSICS_MAX_SECONDS} from '../../shared/object-physics.js';
import {boxContact,doorBox} from '../../shared/world-interact.js';
import {contactAt,surfaceAt} from '../world/object-collision.js';
import {emitWorldEvent} from './world-events.js';
const items=new Map(loadContent('items.json',[]).map(i=>[i.id,i]));
const models={barrel_full:'barrel',tar:'tar_bucket'};
const active=new Map();
let epoch=entities.generation();
const notice=(p,text)=>players.send(p,{t:S2C.NOTICE,text});
const playable=()=>director.acceptsMove()&&!director.isTransitioning();
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));

export function contactWithDoors(zone,p,radius){
  p=contactAt(zone,p,radius);
  for(const d of entities.allDefs())if(d.zone===zone&&d.toggleType==='door'&&entities.stateOf(d.id)?.visible!==false)p=boxContact(p,radius,doorBox(d,entities.stateOf(d.id)?.open));
  return p;
}
function allowed(p,msg){
  if(epoch!==entities.generation()){active.clear();epoch=entities.generation();}
  if(active.size>=16)return false;
  if(!playable()||!p.p||!finiteVec(msg.p)||!Number.isFinite(msg.r??0)||!items.has(msg.item)||!p.inventory.includes(msg.item))return false;
  if(Date.now()-(p.lastObjectAction??0)<350)return false;
  return true;
}
function removeFromHand(p,item){
  const uses=p.itemUses?.[item]??ITEM_RULES[item]?.servings;
  p.inventory.splice(p.inventory.indexOf(item),1);
  if(!p.inventory.includes(item))delete p.itemUses?.[item];
  // The original static pickup must never become available again after dropping a new instance.
  const source=entities.allDefs().find(d=>d.kind==='item'&&d.item===item&&entities.stateOf(d.id)?.holder===p.id);
  if(source){entities.setState(source.id,{holder:'placed'});if(source.dynamic)entities.remove(source.id);}
  return uses;
}
function put(p,msg,body){
  if(epoch!==entities.generation()){active.clear();epoch=entities.generation();}
  const base=[msg.p[0],msg.p[1]-objectProfile(msg.item).radius,msg.p[2]];
  const id=`drop:${randomUUID()}`,d=entities.register({id,zone:p.zone,kind:'item',item:msg.item,m:models[msg.item]??msg.item,label:items.get(msg.item).name,p:base,r:msg.r??0});
  if(!d)return notice(p,'На палубе слишком много предметов. Сначала подбери лежащие.');
  equipForUse(p,msg.item);
  const uses=removeFromHand(p,msg.item);
  entities.setState(id,{holder:null,p:base,r:msg.r??0,uses,...(body?{body}:{} )});
  if(body)active.set(id,{body,zone:p.zone,safeP:[...p.p],last:Date.now()});
  p.lastObjectAction=Date.now();
  players.sendInventory(p);players.save(p,{now:true});director.persistNow();syncAll();
  return id;
}
function clearSight(zone,origin,target){
  const length=distance(origin,target);if(length<.05)return true;
  const hit=surfaceAt(zone,origin,target.map((x,i)=>(x-origin[i])/length),length);
  return !hit||hit.distance>=length-.08;
}
export function canPickup(p,id){
  const d=entities.def(id),st=entities.stateOf(id);
  if(!d?.dynamic)return true;
  const base=st?.p??d.p,target=st?.body?.p??[base[0],base[1]+objectProfile(d.item).radius,base[2]];
  const origin=[p.p[0],p.p[1]+1.6,p.p[2]];
  return distance(origin,target)<4&&clearSight(p.zone,origin,target);
}
export function place(p,msg){
  if(!allowed(p,msg))return;
  const radius=objectProfile(msg.item).radius,origin=[p.p[0],p.p[1]+1.6,p.p[2]];
  if(distance(origin,msg.p)>3.2)return notice(p,'Слишком далеко.');
  const surface=[msg.p[0],msg.p[1]-radius,msg.p[2]],len=distance(origin,surface);
  if(len<.1)return;
  const direction=surface.map((x,i)=>(x-origin[i])/len),hit=surfaceAt(p.zone,origin,direction,3.5);
  if(!hit||hit.face?.normal.y<.5||distance(hit.point.toArray(),surface)>.13)return notice(p,'Нужна свободная поверхность под прицелом.');
  const resolved=contactWithDoors(p.zone,msg.p,radius);
  if(distance(resolved,msg.p)>.08)return notice(p,'Здесь предмет не поместится.');
  const now=Date.now(),body=createBody({p:msg.p,item:msg.item,startedAt:now,roll:p.zone==='ship'&&!!objectProfile(msg.item).roll});
  if(put(p,msg,body))performAction(p,'place',msg.item);
}
export function throwItem(p,msg){
  if(!allowed(p,msg)||!finiteVec(msg.v))return;
  const origin=[p.p[0],p.p[1]+1.25,p.p[2]],speed=Math.hypot(...msg.v),radius=objectProfile(msg.item).radius;
  if(distance(origin,msg.p)>.9||speed<1||speed>10.1)return notice(p,'Недопустимый бросок.');
  if(!clearSight(p.zone,[p.p[0],p.p[1]+1.6,p.p[2]],msg.p))return notice(p,'Между рукой и местом броска есть препятствие.');
  if(distance(contactWithDoors(p.zone,msg.p,radius),msg.p)>.12)return notice(p,'Отойди от стены для броска.');
  if(active.size>=16)return notice(p,'Подожди, пока предметы упадут.');
  const body=createBody({p:msg.p,v:msg.v,item:msg.item,startedAt:Date.now(),roll:p.zone==='ship'&&!!objectProfile(msg.item).roll});
  const id=put(p,msg,body);if(id){performAction(p,'throw',msg.item);emitWorldEvent(p,'throw',{id,item:msg.item});}
}
export function toggle(p,{id}){
  const d=entities.def(id),now=Date.now();
  if(!playable()||d?.kind!=='toggle'||!entities.isNear(p,id))return;
  if(now-(entities.stateOf(id)?.changedAt??0)<500)return;
  const open=!entities.stateOf(id)?.open;
  // Do not close a door through another player: only the authoritative server decides.
  if(!open&&d.toggleType==='door'&&players.connected().some(other=>other.zone===d.zone&&other.p&&distance(boxContact(other.p,.35,doorBox(d,false),1),other.p)>.01))return notice(p,'В дверях кто-то стоит.');
  entities.setState(id,{open,changedAt:now});performAction(p,'toggle',null,{target:id});director.persistNow();syncAll();
}

function relevant(p,d){
  if(d.zone!==p.zone||!p.p)return false;
  const pos=entities.positionOf(d.id)??d.p;
  if(d.zone==='ship')return true;
  const key=`${d.zone}:${Math.floor(pos[0]/32)},${Math.floor(pos[2]/32)}`;
  return p.chunks?.has(key)&&Math.hypot(pos[0]-p.p[0],pos[2]-p.p[2])<64;
}
export function syncWorld(p,{reset=false}={}){
  if(!p.connected)return;
  if(reset)p.objectVersions=new Map();
  const versions=p.objectVersions??=new Map(),seen=new Set(),ops=[],now=Date.now();
  // Полный повтор состояния — страховка раз в 15 с (было 2 с: каждый раз все объекты раскладки летели
  // каждому игроку и клиент пересобирал кэш). Изменения по-прежнему уходят сразу — по версиям ниже.
  const refresh=now-(p.objectSnapshotAt??0)>15000;if(refresh)p.objectSnapshotAt=now;
  // Never send the entire world's dynamic registry to a client. Nearest instances win.
  const definitions=entities.allDefs().sort((a,b)=>{
    if(a.dynamic!==b.dynamic)return Number(!!a.dynamic)-Number(!!b.dynamic);
    const pa=entities.positionOf(a.id)??a.p,pb=entities.positionOf(b.id)??b.p;
    return p.p?distance(pa,p.p)-distance(pb,p.p):0;
  });let dynamicCount=0;
  for(const d of definitions){
    if(!relevant(p,d))continue;
    const state=entities.stateOf(d.id)??{};
    if(d.dynamic&&(state.holder||++dynamicCount>24))continue;
    seen.add(d.id);
    const version=JSON.stringify(state),old=versions.get(d.id);
    if(old===version&&!refresh)continue;
    ops.push({op:old===undefined?'spawn':'set',id:d.id,zone:d.zone,kind:d.kind,item:d.item,model:d.m,p:d.p,r:d.r??0,label:d.label,w:d.w,h:d.h,toggleType:d.toggleType,state});
    versions.set(d.id,version);
  }
  for(const id of versions.keys())if(!seen.has(id)){ops.push({op:'remove',id,unload:true});versions.delete(id);}
  if(ops.length)players.send(p,{t:S2C.WORLD_PATCH,ops,serverNow:Date.now()});
}
export function syncAll(){for(const p of players.connected())syncWorld(p);}
export function tickObjects(now=Date.now()){
  if(epoch!==entities.generation()){active.clear();epoch=entities.generation();}
  // Loose mugs/kegs already on the deck react to the same server-time roll as drops.
  if(playable())for(const d of entities.allDefs())if(d.loose&&!entities.stateOf(d.id)?.holder&&!entities.stateOf(d.id)?.body){
    const body=createBody({p:[d.p[0],d.p[1]+objectProfile(d.item).radius+.015,d.p[2]],item:d.item,startedAt:now,roll:d.zone==='ship'});
    entities.setState(d.id,{p:[body.p[0],body.p[1]-body.radius,body.p[2]],body});
  }
  // On reload, continue saved flights; long offline intervals finish within the bounded simulation.
  for(const d of entities.allDefs()){
    const st=entities.stateOf(d.id);
    if(st?.holder||!st?.body||active.has(d.id))continue;
    if(!st.body.sleeping&&(st.body.roll||st.body.step<PHYSICS_MAX_SECONDS/PHYSICS_STEP))active.set(d.id,{body:structuredClone(st.body),zone:d.zone,safeP:d.p,last:now});
  }
  for(const [id,entry] of active){
    const d=entities.def(id),st=entities.stateOf(id);
    if(!d||st?.holder){active.delete(id);continue;}
    const body=entry.body,inertia=entry.zone==='ship'&&body.roll;
    if(inertia&&body.step>=PHYSICS_MAX_SECONDS/PHYSICS_STEP){body.startedAt=now;body.step=0;body.sleeping=false;}
    // Work is bounded after a server pause. Never perform thousands of catch-up steps in one tick.
    const target=Math.min(now,body.startedAt+(body.step+36)*PHYSICS_STEP*1000);
    advanceBody(body,target,(pos,r)=>contactWithDoors(entry.zone,pos,r),{inertia});
    let final=body.sleeping||(!inertia&&body.step>=PHYSICS_MAX_SECONDS/PHYSICS_STEP);
    if(body.p[1]<(entry.zone==='ship'?-2:0)||body.p.some(n=>!Number.isFinite(n))){
      const safe=entry.safeP,hit=surfaceAt(entry.zone,[safe[0],safe[1]+2,safe[2]],[0,-1,0],5);
      body.p=[safe[0],(hit?.point.y??safe[1])+body.radius+.02,safe[2]];final=true;
    }
    if(final){body.sleeping=true;body.v=[0,0,0];}
    if(now-entry.last>=200||final){entities.setState(id,{p:[body.p[0],body.p[1]-body.radius,body.p[2]],body:structuredClone(body)});entry.last=now;}
    if(final){active.delete(id);director.persistNow();}
  }
  syncAll();
}
// Integration point for agents/admin: a server-validated pickup exists before world_patch is sent.
export function spawnWorldItem(data){
  if(!items.has(data?.item)||!finiteVec(data.p)||entities.def(data.id))return null;
  const d=entities.register({...data,kind:'item',m:data.model??data.m??models[data.item]??data.item,label:data.label??items.get(data.item).name});
  if(!d)return null;
  entities.setState(d.id,{holder:null,uses:data.uses??ITEM_RULES[data.item]?.servings,p:[...data.p]});
  director.persistNow();syncAll();return d;
}

export function removeWorldObject(id){
  const d=entities.def(id);if(!d)return false;
  active.delete(id);
  if(d.dynamic)entities.remove(id);else entities.setState(id,{visible:false,...(d.kind==='item'?{holder:'removed'}:{})});
  director.persistNow();syncAll();return true;
}
export function setWorldObject(id,patch){
  const d=entities.def(id);if(!d)return false;
  if(patch.p&&!finiteVec(patch.p))return false;
  if(patch.p){active.delete(id);patch={...patch,body:null};}
  entities.setState(id,patch);director.persistNow();syncAll();return true;
}
