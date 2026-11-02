export const SUITS=['cups','coins','swords','clubs'];
export const RANKS=['6','7','8','9','10','J','Q','K','A'];
export const RANK_LABEL={J:'В',Q:'Д',K:'К',A:'Т'};
export function handValue(cards){
 let total=0,aces=0;
 for(const c of cards){const rank=typeof c==='string'?c.split(':')[1]:c.rank;if(rank==='A'){total+=11;aces++;}else total+=({J:2,Q:3,K:4})[rank]??Number(rank);}
 while(total>21&&aces-->0)total-=10;return total;
}
export const roundOutcome=(hand,dealer)=>handValue(hand)>21?'bust':handValue(dealer)>21||handValue(hand)>handValue(dealer)?'win':handValue(hand)===handValue(dealer)?'draw':'lose';
export const DANCE_BEAT=2500/3,DANCE_BEATS=24,DANCE_DURATION=20000,DANCE_WINDOW=260;
export const DIRECTIONS=['left','down','up','right'];
export const DANCE_KEYS={ArrowLeft:'left',KeyA:'left',ArrowDown:'down',KeyS:'down',ArrowUp:'up',KeyW:'up',ArrowRight:'right',KeyD:'right'};
export function danceJudgement(session,index,direction,now){
 if(!Number.isInteger(index)||index<0||index>=session.steps.length||!DIRECTIONS.includes(direction))return null;
 const error=Math.abs(now-(session.startAt+(index+.5)*DANCE_BEAT));
 if(error>DANCE_WINDOW||session.steps[index]!==direction)return {grade:'miss',points:0};
 return {grade:error<=110?'perfect':'good',points:error<=110?100:60};
}
