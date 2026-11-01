import {SONGS} from '../../shared/npc-performance.js';
import * as director from './director.js';
import * as entities from './entities.js';
import {players} from './players.js';
export function canPerform(npc,song){
 const scene=director.scene();
 if(npc!=='musician'||!['ship_day','ship_evening'].includes(scene.id)||director.isTransitioning())return {ok:false,reason:'scene'};
 const current=entities.stateOf(npc)?.performance;
 const playing=current?.scene===`${scene.id}@${director.startAt()}`&&current.until>Date.now();
 if(song==='stop')return playing?{ok:true}:{ok:false,reason:'done'};
 if(!SONGS[song])return {ok:false,reason:'scene'};
 if(playing&&current.song===song)return {ok:false,reason:'playing'};
 return {ok:true};
}
export function perform(npc,song){
 const verdict=canPerform(npc,song);if(!verdict.ok)return verdict;
 const now=Date.now(),performance=song==='stop'?null:{song,scene:`${director.scene().id}@${director.startAt()}`,startAt:now+700,until:now+700+SONGS[song].duration*1000};
 const state=entities.setState(npc,{performance});players.broadcast({t:'entity',id:npc,state,serverNow:now});
 for(const patch of entities.syncNpcDialogues(players.connected(),{id:director.scene().id,startAt:director.startAt()},now))players.broadcast({t:'entity',...patch,serverNow:now});
 director.persistNow();return {ok:true};
}
