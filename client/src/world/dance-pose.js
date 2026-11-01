// One synchronized routine for every observer; no per-frame messages.
export function dancePose(rig,now,action){
 const start=action.danceStartAt??action.startedAt,beatMs=action.beatMs??(2500/3),t=(now-start)/beatMs;
 if(t<0)return;
 const index=Math.floor(t),phase=t-index,pulse=Math.sin(phase*Math.PI),direction=action.steps?.[Math.min(index,23)]??'left';
 const side=direction==='left'?-1:direction==='right'?1:0,forward=direction==='up'?1:direction==='down'?-1:0;
 rig.hip.position.y=.95-pulse*.045;rig.hip.position.x=side*pulse*.045;rig.hip.rotation.y=side*pulse*.18;
 rig.torso.rotation.set(forward*pulse*.08,Math.sin(t*Math.PI)*.08,side*pulse*.08);
 rig.head.rotation.y=-side*pulse*.16;
 rig.legs.forEach((leg,i)=>{const step=Math.sin(t*Math.PI+i*Math.PI);leg.th.rotation.x=step*.32+forward*pulse*.18;leg.th.rotation.z=side*pulse*.10;leg.sh.rotation.x=Math.max(0,-step)*.35;});
 const clap=index%4===3;
 for(const arm of rig.arms){arm.ua.rotation.set(clap?-.95:-.35,0,clap?-arm.s*.42:arm.s*(.65+pulse*.15));arm.fa.rotation.set(clap?-1.05:-.8,clap?-arm.s*.35:0,0);}
}
