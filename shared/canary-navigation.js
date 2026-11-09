// A small visibility graph built once per population. No meshes, terrain data or network traffic.
const sizes={house:[7,5.5],house_governor:[11,8],warehouse:[12,7],church:[8,18]};
export function buildingObstacles(layout,margin=.55){
 const out=[];
 for(const o of layout.objects??[]){const size=sizes[o.m];if(!size)continue;
  out.push({x:o.p[0],z:o.p.at(-1),r:o.r??0,half:size.map(v=>v*(o.s??1)/2+margin)});
  if(o.m==='church'){const r=o.r??0,x=6.2,z=6.8;out.push({x:o.p[0]+x*Math.cos(r)+z*Math.sin(r),z:o.p.at(-1)-x*Math.sin(r)+z*Math.cos(r),r,half:[2.65,2.65]});}
 }
 return out;
}
const local=(p,b)=>{const x=p[0]-b.x,z=p[1]-b.z,c=Math.cos(b.r),s=Math.sin(b.r);return [x*c-z*s,x*s+z*c];};
const world=(p,b)=>[b.x+p[0]*Math.cos(b.r)+p[1]*Math.sin(b.r),b.z-p[0]*Math.sin(b.r)+p[1]*Math.cos(b.r)];
export const insideBuilding=(p,b)=>{const q=local(p,b);return Math.abs(q[0])<b.half[0]-1e-5&&Math.abs(q[1])<b.half[1]-1e-5;};
export function outsideBuildings(point,boxes){
 let p=[...point];
 for(let pass=0;pass<4;pass++){let changed=false;for(const b of boxes)if(insideBuilding(p,b)){
  changed=true;
  const q=local(p,b),axis=b.half[0]-Math.abs(q[0])<b.half[1]-Math.abs(q[1])?0:1;
  q[axis]=(q[axis]<0?-1:1)*(b.half[axis]+.02);p=world(q,b);
 }if(!changed)break;}
 return p;
}
export function segmentBlocked(a,b,boxes){
 return boxes.some(box=>{
  const p=local(a,box),q=local(b,box);let lo=0,hi=1;
  for(let i=0;i<2;i++){
   const d=q[i]-p[i],h=box.half[i]-1e-5;
   if(Math.abs(d)<1e-9){if(Math.abs(p[i])>=h)return false;continue;}
   let u=(-h-p[i])/d,v=(h-p[i])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>=hi)return false;
  }
  return hi>0&&lo<1;
 });
}
export function canaryNavigator(layout){
 const boxes=buildingObstacles(layout),corners=boxes.flatMap(b=>[-1,1].flatMap(x=>[-1,1].map(z=>world([x*(b.half[0]+.03),z*(b.half[1]+.03)],b)))).filter(p=>!boxes.some(b=>insideBuilding(p,b)));
 const graph=corners.map(()=>[]),dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 for(let i=0;i<corners.length;i++)for(let j=i+1;j<corners.length;j++)if(!segmentBlocked(corners[i],corners[j],boxes)){const d=dist(corners[i],corners[j]);graph[i].push([j,d]);graph[j].push([i,d]);}
 function path(a,b){
  a=outsideBuildings(a,boxes);b=outsideBuildings(b,boxes);if(!segmentBlocked(a,b,boxes))return [a,b];
  const nodes=[...corners,a,b],n=nodes.length,start=n-2,end=n-1,edges=graph.map(v=>[...v]);edges.push([],[]);
  for(const k of [start,end])for(let i=0;i<k;i++)if(!segmentBlocked(nodes[k],nodes[i],boxes)){const d=dist(nodes[k],nodes[i]);edges[k].push([i,d]);edges[i].push([k,d]);}
  const cost=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),visited=new Set();cost[start]=0;
  for(let step=0;step<n;step++){
   let u=-1;for(let i=0;i<n;i++)if(!visited.has(i)&&(u<0||cost[i]<cost[u]))u=i;
   if(!Number.isFinite(cost[u]))break;if(u===end){const out=[];for(let k=end;k!==-1;k=prev[k])out.unshift(nodes[k]);return out;}
   visited.add(u);for(const [v,d]of edges[u])if(cost[u]+d<cost[v]){cost[v]=cost[u]+d;prev[v]=u;}
  }
  return [a,a]; // An unreachable destination never becomes a route through a wall.
 }
 return {boxes,path};
}
