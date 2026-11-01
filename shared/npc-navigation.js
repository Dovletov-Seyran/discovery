// Только точки и рёбра из доверенной раскладки. Модель выбирает id занятия, не координаты.
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
export function npcRoute(graph, from, target) {
  if (!graph.nodes[target]) return null;
  const edges=graph.edges??[],nodes=graph.nodes;
  let start=0,best=Infinity;
  nodes.forEach((p,i)=>{const d=distance(from,p);if(d<best){best=d;start=i;}});
  let attachment=[start];
  // NPC мог стоять посреди ребра предыдущего маршрута.
  for(const [a,b] of edges){
    const p=nodes[a],q=nodes[b],ab=q.map((v,i)=>v-p[i]),den=ab.reduce((s,v)=>s+v*v,0);
    const t=Math.max(0,Math.min(1,from.reduce((s,v,i)=>s+(v-p[i])*ab[i],0)/(den||1)));
    const projection=p.map((v,i)=>v+ab[i]*t),d=distance(from,projection);
    if(d<best){best=d;attachment=[a,b];}
  }
  if(best>0.8)return null; // Нет безопасного подключения — оставить прежнее занятие.
  const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>null),pending=new Set(nodes.map((_,i)=>i));
  for(const i of attachment)costs[i]=distance(from,nodes[i]);
  while(pending.size){
    const u=[...pending].reduce((a,b)=>costs[a]<costs[b]?a:b);pending.delete(u);
    if(!Number.isFinite(costs[u]))break;if(u===target)break;
    for(const [a,b]of edges){const v=a===u?b:b===u?a:null;if(v==null||!pending.has(v))continue;
      const cost=costs[u]+distance(nodes[u],nodes[v]);if(cost<costs[v]){costs[v]=cost;previous[v]=u;}
    }
  }
  if(!Number.isFinite(costs[target]))return null;
  const path=[];for(let at=target;at!=null;at=previous[at])path.unshift(nodes[at]);
  const points=[[...from],...path.map(p=>[...p])];
  return points.filter((p,i)=>!i||distance(p,points[i-1])>1e-5);
}

export function routineState(behavior, seconds) {
  const path=behavior.path, speed=0.55;
  let remaining=Math.max(0,seconds-behavior.start)*speed;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=distance(a,b);
    if(remaining<length){const f=remaining/length;
      return {p:a.map((v,j)=>v+(b[j]-v)*f),r:Math.atan2(a[0]-b[0],a[2]-b[2]),action:'walk',walking:true,seat:false};
    }
    remaining-=length;
  }
  return {p:path.at(-1),r:behavior.r??0,action:behavior.pose,walking:false,seat:!!behavior.seat};
}
export const routeLength = path => path.reduce((sum,p,i)=>sum+(i?distance(p,path[i-1]):0),0);
