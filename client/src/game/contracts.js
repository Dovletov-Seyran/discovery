export function layoutForWorld(data){
  return {...data,interactables:data.interactables||data.interact||[],spawn:data.spawn||data.spawns};
}
export function entityPatch(state){
  const patch={};
  if('holder' in state)patch.visible=!state.holder;
  if('visible' in state)patch.visible=state.visible;
  if(Number.isFinite(state.fill))patch.fill=state.fill;
  if('paused' in state)patch.paused=state.paused; // NPC стоит, пока с ним говорят (server/game/npc-pause.js)
  return patch;
}

