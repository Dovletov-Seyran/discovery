// Shared sprint budget: 400 seconds of continuous running, ten seconds to refill.
export const STAMINA={max:300,drain:.75,regen:30,resume:20};
export const staminaStep=(value,sprinting,seconds)=>Math.max(0,Math.min(STAMINA.max,value+(sprinting?-STAMINA.drain:STAMINA.regen)*Math.max(0,seconds)));
export function restoreVitals(v){
 const out={stamina:STAMINA.max,drunkUntil:0,drunkStrength:0,...v};
 const oldMax=Number.isFinite(v?.staminaMax)&&v.staminaMax>0?v.staminaMax:100;
 out.stamina=Number.isFinite(v?.stamina)?Math.max(0,Math.min(STAMINA.max,v.stamina/oldMax*STAMINA.max)):STAMINA.max;
 out.staminaMax=STAMINA.max;return out;
}
