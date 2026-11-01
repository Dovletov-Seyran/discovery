// Deterministic shape support physics. Positions and orientations use the model centre.
// No renderer, timers or network access.
export const PHYSICS_STEP = 1 / 120;
export const PHYSICS_MAX_SECONDS = 8;
export const OBJECT_LIMIT = 96;
// Half-extents of the actual centred pickup model, not a bounding sphere used as a floor offset.
export const OBJECT_PROFILES = {
 compass:{radius:.18,half:[.15,.025,.15]},map:{radius:.5,half:[.48,.025,.32],bounce:0,friction:15},
 astrolabe:{radius:.12,half:[.12,.025,.12]},sword:{radius:.6,half:[.13,.018,.60],bounce:.02},
 espingarda:{radius:.65,half:[.09,.06,.65],bounce:.03},wine:{radius:.17,half:[.10,.17,.10],bounce:.07},rum:{radius:.13,half:[.09,.20,.09],bounce:.07},
 barrel:{radius:.27,half:[.20,.28,.20],roll:true,bounce:.08},barrel_full:{radius:.27,half:[.20,.28,.20],bounce:.04},
 cup:{radius:.1,half:[.075,.09,.075],bounce:.03},tar:{radius:.2,half:[.16,.18,.16]},planks:{radius:.45,half:[.15,.055,.45],bounce:.01},
 purse:{radius:.14,half:[.13,.12,.10],bounce:0},cheese:{radius:.15,half:[.15,.09,.12],bounce:0},meat:{radius:.18,half:[.18,.07,.12],bounce:0},biscuit:{radius:.1,half:[.1,.025,.08],bounce:0},
};
export const objectProfile = item => OBJECT_PROFILES[item] ?? {radius:.15,half:[.1,.1,.1]};
export const supportHeight = item => {const p=objectProfile(item);return p.roll?p.half[0]:p.half[1];};
export const finiteVec = v => Array.isArray(v) && v.length === 3 && v.every(n=>Number.isFinite(n)&&Math.abs(n)<10000);
export function createBody({p,v=[0,0,0],item,startedAt=0,roll=false,r=0}) {
 return {version:3,p:[...p],v:[...v],radius:objectProfile(item).radius,roll:roll&&!!objectProfile(item).roll,item,r,angle:0,startedAt,step:0,rest:0,sleeping:false};
}
// Cylinder roll is derived from fixed-step travel; replaying a snapshot never adds a visual spin.
export function bodyQuaternion(body){
 const yaw=body.r??0,half=yaw/2,sy=Math.sin(half),cy=Math.cos(half);
 if(!objectProfile(body.item).roll)return [0,sy,0,cy];
 const spin=(body.angle??0)/2,s=Math.sin(spin),c=Math.cos(spin),h=Math.SQRT1_2;
 const x=h*c,y=h*s,z=h*s,w=h*c;
 return [cy*x+sy*z,cy*y+sy*w,cy*z-sy*x,cy*w-sy*y];
}
export function rotatePoint(p,q){
 const [x,y,z]=p,[qx,qy,qz,qw]=q;
 const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
 return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
}
export function supportPoints(body){
 const profile=objectProfile(body.item),[x,y,z]=profile.half,q=bodyQuaternion(body),points=[];
 if(profile.roll){
  for(const a of [-y,0,y])for(let i=0;i<12;i++){const t=i*Math.PI/6;points.push(rotatePoint([Math.cos(t)*x,a,Math.sin(t)*z],q));}
 }else for(const a of [-x,0,x])for(const b of [-y,y])for(const c of [-z,0,z])points.push(rotatePoint([a,b,c],q));
 return points;
}
export function resolveBody(body,p,contact,from=null){
 let result=[...p];const points=supportPoints(body),skin=.006;
 // Multiple passes also handle a long map resting across two sloping triangles.
 for(let pass=0;pass<2;pass++)for(const offset of points){
  const sample=result.map((v,i)=>v+offset[i]),previous=pass===0&&from?from.map((v,i)=>v+offset[i]):undefined,resolved=contact(sample,skin,previous)??sample;
  result=result.map((v,i)=>v+resolved[i]-sample[i]);
 }
 return result;
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
  const travel=Math.hypot(...v)*h,steps=Math.max(1,Math.ceil(travel/.02));
  let resolved=[...body.p];
  for(let i=0;i<steps;i++)resolved=resolveBody(body,resolved.map((n,j)=>n+v[j]*h/steps),contact,resolved);
  const delta=resolved.map((n,i)=>n-next[i]),depth=Math.hypot(...delta);
  let grounded=false;
  if(depth>1e-7){
    const n=delta.map(d=>d/depth),vn=v.reduce((sum,x,i)=>sum+x*n[i],0);
    grounded=n[1]>.5;
    if(vn<0){const bounce=Math.abs(vn)<.8?0:(objectProfile(body.item).bounce??.04);for(let i=0;i<3;i++)v[i]-=(1+bounce)*vn*n[i];}
    if(grounded){const friction=Math.exp(-(body.roll?1.8:(objectProfile(body.item).friction??9))*h);v[0]*=friction;v[2]*=friction;}
  }
  if(objectProfile(body.item).roll){
    const dx=resolved[0]-body.p[0],dz=resolved[2]-body.p[2],r=body.r??0;
    body.angle=(body.angle??0)-(dx*Math.cos(r)-dz*Math.sin(r))/objectProfile(body.item).half[0];
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
