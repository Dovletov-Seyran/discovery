export const WEAPONS={sword:{range:2.65,damage:55,cone:.15,effect:'swing'},espingarda:{range:35,damage:100,cone:.985,effect:'shot'}};
export function inWeaponArc(p,target,weapon){
 const rule=WEAPONS[weapon];if(!rule||!p.p||!Array.isArray(target))return false;
 const dx=target[0]-p.p[0],dz=target[2]-p.p[2],d=Math.hypot(dx,dz);if(d>rule.range||Math.abs(target[1]-p.p[1])>3)return false;
 if(weapon==='espingarda'){const y=p.p[1]+1.4+Math.tan(p.pitch??0)*d;if(y<target[1]+.05||y>target[1]+2)return false;}
 return d<.2||(-Math.sin(p.r??0)*dx-Math.cos(p.r??0)*dz)/d>=rule.cone;
}
