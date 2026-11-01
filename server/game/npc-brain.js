// ИИ выбирает занятия команды одним редким запросом. Координаты и путь решает сервер.
import {Vector3} from 'three';
import {loadContent} from '../content.js';
import {chat,queueStats} from '../ai/llm.js';
import {npcActivity} from '../../shared/npc-activity.js';
import {npcRoute,routeLength} from '../../shared/npc-navigation.js';
import {shipCollision} from '../world/object-collision.js';
import * as entities from './entities.js';
import * as director from './director.js';
import {players} from './players.js';
import * as world from './world-state.js';

const routines=loadContent('npc-routines.json',{});
let busy=false,nextAttempt=0;
export const resetNpcBrain=()=>{nextAttempt=Date.now()+12000;};
const sceneKey=s=>`${s.id}@${s.startAt}`;
const clock=(s,paused,now)=>(now-(paused?.scene===sceneKey(s)?paused.offset??0:0)-s.startAt)/1000;
export function npcPosition(def,scene,now=Date.now()) {
  const state=entities.stateOf(def.id);
  return npcActivity(def,now/1000,scene,state?.paused,state?.behavior);
}

export async function chooseNpcJobs(candidates, scene) {
  const schema={type:'object',properties:Object.fromEntries(candidates.map(c=>[c.id,{type:'string',enum:c.jobs.map(j=>j.id)}])),required:candidates.map(c=>c.id),additionalProperties:false};
  const descriptions=candidates.map(c=>`${c.id}: ${c.profession}. Previous: ${c.previous??'none'}. Options: ${c.jobs.map(j=>`${j.id} (${j.title})`).join('; ')}`);
  const result=await chat([
    {role:'system',content:'Plan ordinary crew life aboard the Santa Maria in 1492. Choose exactly one permitted job per sailor. Alternate work, inspection and rest; vary previous jobs. In the evening prefer music, food and company. Never invent jobs, locations, dialogue or changes to quests. Output only the JSON choices.'},
    {role:'user',content:`Scene: ${scene.id}.\n${descriptions.join('\n')}`},
  ],{priority:-2,preemptible:true,temperature:.35,maxTokens:180,timeoutMs:10000,format:schema});
  return JSON.parse(result.text);
}

export function routeIsClear(path, scene, party=[]) {
  if(path.length<2)return true;
  const collider=shipCollision();
  const dynamic=world.all().filter(o=>o.spawned&&!o.removed&&o.zone==='ship'&&o.id.startsWith('water_barrel_'));
  const points=[];
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(Math.hypot(...a.map((v,j)=>v-b[j]))/.25));
    for(let step=0;step<=n;step++)points.push(a.map((v,j)=>v+(b[j]-v)*step/n));
  }
  for(const p of points){
    const cap={start:new Vector3(p[0],p[1]+.45,p[2]),end:new Vector3(p[0],p[1]+1.45,p[2]),radius:.28};
    const hit=collider.collide(cap);
    if(Math.hypot(hit.delta.x,hit.delta.z)>.04)return false;
    const floor=collider.groundHeight(p[0],p[2],p[1]+.12);
    if(floor==null||Math.abs(floor-p[1])>.15)return false;
    if(dynamic.some(o=>Math.abs(o.p[1]-p[1])<.95&&Math.hypot(o.p[0]-p[0],o.p[2]-p[2])<.65))return false;
  }
  const target=path.at(-1);
  return !party.some(p=>p.connected&&p.zone==='ship'&&Math.abs(p.p[1]-target[1])<1&&Math.hypot(p.p[0]-target[0],p.p[2]-target[2])<.9);
}

export async function tickNpcBrain(now=Date.now(), choose=chooseNpcJobs) {
  if(process.env.NPC_AI==='0'||process.env.AI==='0'||busy||now<nextAttempt)return;
  const current=director.scene(),scene={id:current.id,startAt:director.startAt()};
  const party=players.connected();
  if(current.zone!=='ship'||current.type!=='play'||!party.length||director.isTransitioning())return;
  if(queueStats().busy||queueStats().waiting||party.some(p=>p.npcRequest||p.dialogue?.until>now))return;
  const generation=entities.generation(),candidates=[];
  for(const [id,profile]of Object.entries(routines)){
    const graph=profile.scenes[scene.id],def=entities.def(id),state=entities.stateOf(id);
    if(!graph||!def||state?.paused?.at!=null)continue;
    if(state?.behavior?.scene===sceneKey(scene)&&clock(scene,state.paused,now)<state.behavior.until)continue;
    candidates.push({id,profession:profile.profession,jobs:graph.jobs,previous:state?.behavior?.job,graph,def});
  }
  if(!candidates.length)return;
  busy=true;nextAttempt=now+45000;
  let choices={},source='routine';
  try{choices=await choose(candidates,scene);source='llm';}catch(error){console.warn('[npc-ai]',error.message);}
  try{
    const appliedAt=Date.now();
    if(director.scene().id!==scene.id||director.startAt()!==scene.startAt||generation!==entities.generation())return;
    const reserved=[];
    for(const c of candidates){
      const state=entities.stateOf(c.id);
      if(state?.paused?.at!=null||players.connected().some(p=>p.dialogue?.npc===c.id&&p.dialogue.until>appliedAt))continue;
      const current=npcPosition(c.def,scene,appliedAt),old=state?.behavior?.job;
      const suggested=c.jobs.find(j=>j.id===choices?.[c.id]);
      // Невалидный выбор модели не превращается в координаты; безопасный вариант — из того же списка.
      const options=[...(suggested&&suggested.id!==old?[suggested]:[]),...c.jobs.filter(j=>j.id!==old&&j!==suggested),...(suggested?[suggested]:[])];
      for(const job of options){
        const path=npcRoute(c.graph,current.p,job.node);if(!path)continue;
        const target=path.at(-1);
        const occupied=reserved.some(p=>Math.hypot(p[0]-target[0],p[2]-target[2])<.8&&Math.abs(p[1]-target[1])<1)
          ||entities.allDefs().some(d=>d.kind==='npc'&&d.zone==='ship'&&d.id!==c.id&&Math.abs(npcPosition(d,scene,appliedAt).p[1]-target[1])<1&&Math.hypot(npcPosition(d,scene,appliedAt).p[0]-target[0],npcPosition(d,scene,appliedAt).p[2]-target[2])<.7);
        if(occupied||!routeIsClear(path,scene,players.connected()))continue;
        const start=clock(scene,state?.paused,appliedAt)+.2;
        const behavior={scene:sceneKey(scene),job:job.id,path,start,until:start+routeLength(path)/.55+35+(c.id.length%4)*6,pose:job.pose,r:job.r,seat:job.seat,source:job===suggested?source:'routine'};
        const patch=entities.setState(c.id,{behavior});players.broadcast({t:'entity',id:c.id,state:patch});reserved.push(target);break;
      }
    }
  }finally{busy=false;}
}
