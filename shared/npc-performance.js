// The model chooses a catalog id. Tracks, duration and timing are owned by the game.
export const SONGS={
 cheerful:{title:'Весёлая морская мелодия',description:'a cheerful sea melody',track:'amb_feast_folia',duration:32},
 quiet:{title:'Тихая мелодия о доме',description:'a quiet melody about home',track:'amb_intro_lute',duration:30},
};
export function activePerformance(performance,scene,now=Date.now()){
 const key=typeof scene==='string'?scene:`${scene.id}@${scene.startAt??0}`;
 return !!(performance&&SONGS[performance.song]&&performance.scene===key&&now>=performance.startAt&&now<performance.until);
}
