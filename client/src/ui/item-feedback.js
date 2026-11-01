import {Vector3} from 'three';
let audio;
export function unlockItemAudio(){
 const AudioCtx=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!AudioCtx)return;
 audio??=new AudioCtx();audio.resume().catch(()=>{});
}
export function playShot(){
 if(!audio||audio.state!=='running')return;
 const duration=.32,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++){const t=i/data.length;data[i]=(Math.random()*2-1)*Math.exp(-t*11);}
 const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
 source.buffer=buffer;filter.type='lowpass';filter.frequency.value=1800;gain.gain.value=.25;
 source.connect(filter).connect(gain).connect(audio.destination);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
}

// Samples only already loaded terrain/objects. No full-world download or secondary cache.
export function drawLocalMap(canvas,world,position,yaw,zone){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.fillStyle='#d3bf8f';ctx.fillRect(0,0,w,h);
 const ship=zone==='ship',scale=ship?11:w/120,cx=ship?0:position[0],cz=ship?0:position[2];
 const point=(x,z)=>[w/2+(x-cx)*scale,h/2+(z-cz)*scale];
 if(!ship){
  const cell=6;
  for(let x=cx-w/scale/2;x<cx+w/scale/2;x+=cell)for(let z=cz-h/scale/2;z<cz+h/scale/2;z+=cell){
   const height=world?.island?.heightAt(x,z),[px,py]=point(x,z);
   ctx.fillStyle=height==null?'#bdad89':height<0?'#73969a':'#b4b180';ctx.fillRect(px,py,cell*scale+1,cell*scale+1);
  }
 }else{
  ctx.fillStyle='#77999b';ctx.fillRect(0,0,w,h);ctx.fillStyle='#d5c194';ctx.strokeStyle='#5b4529';ctx.lineWidth=2;
  const outline=[[0,-13],[3,-10],[4,6],[3,11],[-3,11],[-4,6],[-3,-10]];
  ctx.beginPath();outline.forEach(([x,z],i)=>{const p=point(x,z);if(i)ctx.lineTo(...p);else ctx.moveTo(...p);});ctx.closePath();ctx.fill();ctx.stroke();
 }
 ctx.strokeStyle='#51442935';ctx.lineWidth=1;
 for(let x=20;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 for(let y=20;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 ctx.font='16px Georgia';ctx.fillStyle='#352a1b';ctx.fillText('С ↑',16,25);
 const landmarks=(world?.interactables||[]).filter(o=>o.visible&&['npc','well','boat','hourglass'].includes(o.userData?.kind)).slice(0,12);
 const v=new Vector3();
 for(const object of landmarks){
  object.getWorldPosition(v);const [x,y]=point(v.x,v.z);if(x<10||x>w-10||y<35||y>h-10)continue;
  ctx.fillStyle='#61472c';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
  if(!ship){ctx.font='13px Georgia';ctx.fillText(object.userData.label||'',Math.min(w-90,x+7),y-5);}
 }
 const [x,y]=point(position[0],position[2]);ctx.strokeStyle='#a12f24';ctx.fillStyle='#a12f24';ctx.lineWidth=3;
 ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.sin(yaw)*23,y-Math.cos(yaw)*23);ctx.stroke();
 ctx.font='14px Georgia';ctx.fillStyle='#352a1b';ctx.fillText('Красная отметка — вы',14,h-14);
}
