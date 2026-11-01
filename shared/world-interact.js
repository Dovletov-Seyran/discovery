// Stable object ids shared by the server registry and procedural model builders.
export function doorSpecs(model) {
  switch(model){
    case 'house':return [{p:[-.6,0,2.78],w:1.1,h:2.1}];
    case 'house_governor':return [{p:[0,0,4.03],w:1.5,h:2.6}];
    case 'warehouse':return [{p:[0,0,3.53],w:2.6,h:3}];
    default:return [];
  }
}
export function layoutToggles(layout,zone){
  return (layout.objects??[]).flatMap(o=>{
    if(o.m==='nav_chest'||o.m==='arms_chest')return [{...o,zone,kind:'toggle',label:'Сундук',toggleType:'lid'}];
    return doorSpecs(o.m).map((spec,i)=>{
      const [x,y,z]=spec.p,r=o.r??0,s=o.s??1;
      return {id:`${o.id}:door:${i}`,zone,kind:'toggle',toggleType:'door',label:'Дверь',
        p:[o.p[0]+(x*Math.cos(r)+z*Math.sin(r))*s,o.p[1]+y*s,o.p[2]+(-x*Math.sin(r)+z*Math.cos(r))*s],r,w:spec.w*s,h:spec.h*s};
    });
  });
}

export function doorBox(d,open=false){
  const a=open?-1.45:0,r=d.r??0,w=d.w,h=d.h;
  const x=-w/2+Math.cos(a)*w/2,z=-Math.sin(a)*w/2;
  return {p:[d.p[0]+x*Math.cos(r)+z*Math.sin(r),d.p[1]+h/2,d.p[2]-x*Math.sin(r)+z*Math.cos(r)],r:r+a,half:[w/2,h/2,.065]};
}
// Chest body stays in the static BVH; only its hinged lid changes with state.
export function chestSpec(model){
 if(model==='nav_chest')return {w:.95,h:.45,d:.55,arched:true};
 if(model==='arms_chest')return {w:1.3,h:.5,d:.5,arched:false};
 return null;
}
function toLocal(v,box){
 const c=Math.cos(box.r??0),s=Math.sin(box.r??0),a=box.rx??0,ca=Math.cos(a),sa=Math.sin(a);
 const x=v[0]*c-v[2]*s,z=v[0]*s+v[2]*c;
 return [x,v[1]*ca+z*sa,-v[1]*sa+z*ca];
}
function toWorld(v,box){
 const c=Math.cos(box.r??0),s=Math.sin(box.r??0),a=box.rx??0,ca=Math.cos(a),sa=Math.sin(a);
 const y=v[1]*ca-v[2]*sa,z=v[1]*sa+v[2]*ca;
 return [v[0]*c+z*s,y,-v[0]*s+z*c];
}
export function interactionBoxes(def,open=false){
 if(def.toggleType==='door')return [doorBox(def,open)];
 const spec=chestSpec(def.m??def.model);if(def.toggleType!=='lid'||!spec)return [];
 const scale=def.s??1,{w,h,d,arched}=spec,r=def.r??0,rx=open?-1.65:0,boxes=[];
 const count=arched?8:1;
 for(let i=0;i<count;i++){
  const z=-d/2+(i+.5)*d/count;
  const height=arched?Math.sqrt(Math.max(0,(d/2)**2-z*z)):.065;
  const local=toWorld([0,height/2,z+d/2],{r,rx});
  const hinge=toWorld([0,h,-d/2],{r});
  boxes.push({p:def.p.map((n,j)=>n+(hinge[j]+local[j])*scale),r,rx,half:[(w/2+.02)*scale,height/2*scale,(d/count/2+.002)*scale]});
 }
 return boxes;
}
// Sphere/capsule contact with a box rotated about yaw and, for a lid, its hinge.
export function boxContact(p,radius,box,height=0){
 if(height>0&&box.rx){
  let result=[...p];const count=Math.max(1,Math.ceil(height/Math.max(radius,.05)));
  for(let i=0;i<=count;i++){
   const sample=[result[0],result[1]+height*i/count,result[2]],resolved=boxContact(sample,radius,box);
   result=result.map((n,j)=>n+resolved[j]-sample[j]);
  }
  return result;
 }
 const local=toLocal(p.map((n,i)=>n-box.p[i]),box);local[1]+=height/2;
 const half=[box.half[0],box.half[1]+height/2,box.half[2]];
 const near=local.map((x,i)=>Math.max(-half[i],Math.min(half[i],x))),delta=local.map((x,i)=>x-near[i]);
 const len=Math.hypot(...delta);if(len>=radius)return p;
 if(len<1e-8){let axis=0;for(let i=1;i<3;i++)if(half[i]-Math.abs(local[i])<half[axis]-Math.abs(local[axis]))axis=i;delta[axis]=(local[axis]<0?-1:1)*(half[axis]-Math.abs(local[axis])+radius);}
 else for(let i=0;i<3;i++)delta[i]*=(radius-len)/len;
 const correction=toWorld(delta,box);return p.map((n,i)=>n+correction[i]);
}
export function rayBox(origin,direction,box,maxDistance){
 const o=toLocal(origin.map((n,i)=>n-box.p[i]),box),d=toLocal(direction,box);
 let near=0,far=maxDistance,axis=0,sign=1;
 for(let i=0;i<3;i++){
  if(Math.abs(d[i])<1e-8){if(Math.abs(o[i])>box.half[i])return null;continue;}
  let a=(-box.half[i]-o[i])/d[i],b=(box.half[i]-o[i])/d[i],n=-1;
  if(a>b){[a,b]=[b,a];n=1;}
  if(a>near){near=a;axis=i;sign=n;}far=Math.min(far,b);if(near>far)return null;
 }
 const normal=[0,0,0];normal[axis]=sign;
 return {distance:near,p:origin.map((x,i)=>x+near*direction[i]),normal:toWorld(normal,box)};
}
