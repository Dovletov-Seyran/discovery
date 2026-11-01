import {players} from './players.js';
import {S2C} from '../../shared/protocol.js';
const types=new Set(['talk','eat','drink','run','swing','scare','dance','throw']);
// One entry point for item actions and the future admin/NPC integrations.
// No client can submit an arbitrary world_event.
export function emitWorldEvent(p,type,extra={}){
  if(!types.has(type)||!p.p)return;
  const message={...extra,t:S2C.WORLD_EVENT,type,who:p.id,p:[...p.p],zone:p.zone,serverNow:Date.now()};
  players.broadcast(message,other=>other.zone===p.zone&&other.p&&Math.hypot(other.p[0]-p.p[0],other.p[2]-p.p[2])<64);
}
