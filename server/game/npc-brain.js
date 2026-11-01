// ИИ выбирает занятия команды одним редким запросом. Координаты и путь решает сервер.
import {Vector3} from 'three';
import {loadContent} from '../content.js';
import {chat,queueStats} from '../ai/llm.js';
import {npcActivity} from '../../shared/npc-activity.js';
import {npcRoute,legSeconds} from '../../shared/npc-navigation.js';
import {shipCollision} from '../world/object-collision.js';
import * as entities from './entities.js';
import * as director from './director.js';
import {players} from './players.js';
import * as world from './world-state.js';

const routines=loadContent('npc-routines.json',{});
// Работа выбирается сразу, как только прежняя кончилась; модель спрашиваем не чаще раза в 45 с
// и только когда она свободна — иначе берём следующую работу из списка, и экипаж не стоит без дела.
const CHECK_MS=2000,MODEL_MS=45000,WORK_S=55;
let busy=false,nextAttempt=0,nextModel=0;
export const resetNpcBrain=()=>{nextAttempt=Date.now()+3000;nextModel=Date.now()+12000;};
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

// Работа из шагов content/npc-routines.json (job.steps: node, pose, wait, r, carry, hold) → ноги маршрута.
// Одиночная работа (job.node без steps) — один переход и поза. Только узлы и рёбра раскладки.
export function planJob(graph, from, job) {
  const steps=job.steps??[{node:job.node,pose:job.pose,r:job.r,seat:job.seat}];
  const legs=[];let at=from;
  const leg=step=>{
    const path=npcRoute(graph,at,step.node);if(!path)return null;
    at=path.at(-1);
    return {path,wait:step.wait??0,pose:step.pose,r:step.r??0,seat:!!step.seat,carry:step.carry??null,hold:step.hold??null};
  };
  for(const step of steps){const l=leg(step);if(!l)return null;legs.push(l);}
  if(steps.length<2)return {legs,loop:null};
  const back=leg(steps[0]);if(!back)return null;
  legs.push(back);
  return {legs,loop:1};
}

export async function tickNpcBrain(now=Date.now(), choose=chooseNpcJobs) {
  if(process.env.NPC_AI==='0'||busy||now<nextAttempt)return;
  nextAttempt=now+CHECK_MS;
  const current=director.scene(),scene={id:current.id,startAt:director.startAt()};
  const party=players.connected();
  if(current.zone!=='ship'||current.type!=='play'||!party.length||director.isTransitioning())return;
  const modelFree=process.env.AI!=='0'&&now>=nextModel&&!queueStats().busy&&!queueStats().waiting
    &&!party.some(p=>p.npcRequest||p.dialogue?.until>now);
  const generation=entities.generation(),candidates=[];
  for(const [id,profile]of Object.entries(routines)){
    const graph=profile.scenes[scene.id],def=entities.def(id),state=entities.stateOf(id);
    if(!graph||!def||state?.paused?.at!=null)continue;
    if(state?.behavior?.scene===sceneKey(scene)&&clock(scene,state.paused,now)<state.behavior.until)continue;
    candidates.push({id,profession:profile.profession,jobs:graph.jobs,previous:state?.behavior?.job,graph,def});
  }
  if(!candidates.length)return;
  busy=true;
  let choices={},source='routine';
  if(modelFree){
    nextModel=now+MODEL_MS;
    try{choices=await choose(candidates,scene);source='llm';}catch(error){console.warn('[npc-ai]',error.message);}
  }
  try{
    const appliedAt=Date.now();
    if(director.scene().id!==scene.id||director.startAt()!==scene.startAt||generation!==entities.generation())return;
    const reserved=[];
    for(const c of candidates){
      const state=entities.stateOf(c.id);
      if(state?.paused?.at!=null||players.connected().some(p=>p.dialogue?.npc===c.id&&p.dialogue.until>appliedAt))continue;
      const current=npcPosition(c.def,scene,appliedAt),old=state?.behavior?.job;
      const suggested=c.jobs.find(j=>j.id===choices?.[c.id]);
      // Невалидный выбор модели не превращается в координаты; безопасный вариант — из того же списка:
      // следующая по кругу работа после прежней, чтобы занятия чередовались и без модели.
      const after=c.jobs.findIndex(j=>j.id===old)+1,turn=[...c.jobs.slice(after),...c.jobs.slice(0,after)];
      const options=[...(suggested&&suggested.id!==old?[suggested]:[]),...turn.filter(j=>j.id!==old&&j!==suggested),...turn.filter(j=>j.id===old)];
      const others=entities.allDefs().filter(d=>d.kind==='npc'&&d.zone==='ship'&&d.id!==c.id).map(d=>npcPosition(d,scene,appliedAt).p);
      for(const job of options){
        const plan=planJob(c.graph,current.p,job);if(!plan)continue;
        const spots=plan.legs.map(l=>l.path.at(-1));
        const near=(a,b,r)=>Math.abs(a[1]-b[1])<1&&Math.hypot(a[0]-b[0],a[2]-b[2])<r;
        const occupied=spots.some(s=>reserved.some(p=>near(p,s,.8))||others.some(p=>near(p,s,.7)));
        if(occupied||!plan.legs.every(l=>routeIsClear(l.path,scene,players.connected())))continue;
        const start=clock(scene,state?.paused,appliedAt)+.2,times=plan.legs.map(legSeconds);
        const once=times.reduce((a,b)=>a+b,0),cycle=plan.loop==null?0:times.slice(plan.loop).reduce((a,b)=>a+b,0);
        // одна работа — около минуты: целое число кругов, чтобы следующая начиналась с её первого места
        const until=start+(cycle?once+cycle*Math.max(0,Math.ceil((WORK_S-once)/cycle)):once+35+(c.id.length%4)*6);
        const behavior={scene:sceneKey(scene),job:job.id,...plan,start,until,pose:job.pose??job.steps?.[0]?.pose,r:job.r??plan.legs.at(-1).r,seat:!!job.seat,source:job===suggested?source:'routine'};
        const patch=entities.setState(c.id,{behavior});players.broadcast({t:'entity',id:c.id,state:patch});reserved.push(...spots);break;
      }
    }
  }finally{busy=false;}
}
