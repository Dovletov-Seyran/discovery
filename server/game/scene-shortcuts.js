import {SCENE_SHORTCUTS} from '../../shared/scene-shortcuts.js';
// Fixed targets only; all peers receive the director's standard scene/spawn/time message.
export function makeSceneShortcuts({director,players,now=Date.now}){
 let lastAt=-Infinity;
 return (p,{index})=>{
  if(!p?.connected||!p.role||!players.connected().includes(p)||!Number.isInteger(index)||!Object.hasOwn(SCENE_SHORTCUTS,index))return false;
  const time=now();if(time-lastAt<1500)return false;
  const target=SCENE_SHORTCUTS[index];
  if(!director.setScene(target.id))return false;
  director.holdCompletedCheckpoint?.();
  lastAt=time;players.broadcast({t:'notice',text:`${p.name}: ${target.label} — с начала.`});return true;
 };
}
