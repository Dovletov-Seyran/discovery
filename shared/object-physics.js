// Small deterministic sphere physics kernel. No renderer, timers or network access.
// Positions are centres of bounding spheres; renderers offset the model to its base.
export const PHYSICS_STEP = 1 / 120;
export const PHYSICS_MAX_SECONDS = 8;
export const OBJECT_LIMIT = 96;
export const OBJECT_PROFILES = {
  compass: {radius:.18}, map:{radius:.5}, astrolabe:{radius:.12},
  sword:{radius:.45}, espingarda:{radius:.65}, wine:{radius:.17}, rum:{radius:.13},
  barrel:{radius:.27,roll:true}, barrel_full:{radius:.27}, cup:{radius:.1,roll:true},
  tar:{radius:.2},planks:{radius:.2},purse:{radius:.14},cheese:{radius:.15},meat:{radius:.18},biscuit:{radius:.1},
};
export const objectProfile = item => OBJECT_PROFILES[item] ?? {radius:.15};
export const finiteVec = v => Array.isArray(v) && v.length === 3 && v.every(n=>Number.isFinite(n)&&Math.abs(n)<10000);
export function createBody({p,v=[0,0,0],item,startedAt=0,roll=false}) {
  return {p:[...p],v:[...v],radius:objectProfile(item).radius,roll,item,startedAt,step:0,rest:0,sleeping:false};
}
export function shipRoll(seconds) { return Math.sin(seconds*.65)*.045 + Math.sin(seconds*.31)*.018; }

// contact(p,radius) moves a sphere out of world geometry and returns the corrected position.
// Fixed substeps avoid tunnelling at the allowed 10 m/s launch speed even for a small cup.
export function stepBody(body,contact,seconds,{inertia=false}={}) {
  if(body.sleeping&&!inertia)return;
  const h=PHYSICS_STEP,v=body.v;
  if(inertia){v[0]+=Math.sin(shipRoll(seconds))*9.81*h;body.sleeping=false;}
  v[1]-=9.81*h;
  const next=body.p.map((n,i)=>n+v[i]*h);
  const resolved=contact(next,body.radius) ?? next;
  const delta=resolved.map((n,i)=>n-next[i]),depth=Math.hypot(...delta);
  let grounded=false;
  if(depth>1e-7){
    const n=delta.map(d=>d/depth),vn=v.reduce((sum,x,i)=>sum+x*n[i],0);
    grounded=n[1]>.5;
    if(vn<0){const bounce=Math.abs(vn)<.8?0:.28;for(let i=0;i<3;i++)v[i]-=(1+bounce)*vn*n[i];}
    if(grounded){const friction=Math.exp(-(body.roll?1.1:7)*h);v[0]*=friction;v[2]*=friction;}
  }
  body.p=[...resolved];body.step++;
  if(grounded&&Math.hypot(...v)<.13)body.rest++;else body.rest=0;
  if(body.rest>36&&!inertia){body.sleeping=true;body.v=[0,0,0];}
}
export function advanceBody(body,targetMs,contact,options) {
  const target=Math.min(Math.floor(Math.max(0,targetMs-body.startedAt)/1000/PHYSICS_STEP),PHYSICS_MAX_SECONDS/PHYSICS_STEP);
  while(body.step<target&&!body.sleeping)stepBody(body,contact,body.startedAt/1000+body.step*PHYSICS_STEP,options);
  return body;
}
