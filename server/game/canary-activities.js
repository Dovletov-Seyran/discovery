// Timed island work is server-owned. Movement, disconnect or scene changes cancel it.
export function createIslandActivities({now=Date.now,valid,send}){
 const jobs=new Map();
 return {
  busy:p=>jobs.has(p.id),
  start(p,{kind,label,duration,target,finish}){
   if(jobs.has(p.id))return false;
   const job={p,scene:p.scene,kind,label,target,duration,startedAt:now(),finish};jobs.set(p.id,job);
   send(p,{t:'island_activity',kind,label,status:'started',duration,startedAt:job.startedAt,serverNow:now()});return true;
  },
  tick(time=now()){
   for(const [id,j]of jobs){
    if(!j.p.connected||j.p.scene!==j.scene||!valid(j.p,j.target)){jobs.delete(id);send(j.p,{t:'island_activity',status:'cancelled',label:'Работа прервана: подойди ближе и начни снова.'});continue;}
    if(time-j.startedAt<j.duration)continue;
    jobs.delete(id);j.finish();send(j.p,{t:'island_activity',status:'done',label:'Готово'});
   }
  },
 };
}
