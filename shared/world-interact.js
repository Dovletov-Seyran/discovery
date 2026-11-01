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
// Resolve an upright capsule (or a sphere, height=0) against an oriented door leaf.
export function boxContact(p,radius,box,height=0){
  const c=Math.cos(box.r),s=Math.sin(box.r),dx=p[0]-box.p[0],dz=p[2]-box.p[2];
  const local=[dx*c-dz*s,p[1]-box.p[1]+height/2,dx*s+dz*c],half=[box.half[0],box.half[1]+height/2,box.half[2]];
  const near=local.map((x,i)=>Math.max(-half[i],Math.min(half[i],x))),delta=local.map((x,i)=>x-near[i]);
  const len=Math.hypot(...delta);if(len>=radius)return p;
  if(len<1e-8){let axis=0;for(let i=1;i<3;i++)if(half[i]-Math.abs(local[i])<half[axis]-Math.abs(local[axis]))axis=i;delta[axis]=(local[axis]<0?-1:1)*(half[axis]-Math.abs(local[axis])+radius);}
  else for(let i=0;i<3;i++)delta[i]*=(radius-len)/len;
  return [p[0]+delta[0]*c+delta[2]*s,p[1]+delta[1],p[2]-delta[0]*s+delta[2]*c];
}

// Ray against a door's oriented box. Used for occlusion on both sides of the connection.
export function rayBox(origin,direction,box,maxDistance){
  const c=Math.cos(box.r),s=Math.sin(box.r),dx=origin[0]-box.p[0],dz=origin[2]-box.p[2];
  const o=[dx*c-dz*s,origin[1]-box.p[1],dx*s+dz*c],d=[direction[0]*c-direction[2]*s,direction[1],direction[0]*s+direction[2]*c];
  let near=0,far=maxDistance,axis=0,sign=1;
  for(let i=0;i<3;i++){
    if(Math.abs(d[i])<1e-8){if(Math.abs(o[i])>box.half[i])return null;continue;}
    let a=(-box.half[i]-o[i])/d[i],b=(box.half[i]-o[i])/d[i],n=-1;
    if(a>b){[a,b]=[b,a];n=1;}
    if(a>near){near=a;axis=i;sign=n;}far=Math.min(far,b);if(near>far)return null;
  }
  const normal=[0,0,0];normal[axis]=sign;
  return {distance:near,p:origin.map((x,i)=>x+near*direction[i]),normal:[normal[0]*c+normal[2]*s,normal[1],-normal[0]*s+normal[2]*c]};
}
