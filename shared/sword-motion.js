const smooth=t=>t*t*(3-2*t);
// Wind-up, quick cut, follow-through and a slower recovery, all within the server's 580 ms.
export function swordMotion(u){
 if(u<=0||u>=1)return {cut:0,lift:0};
 if(u<.18){const t=smooth(u/.18);return {cut:-.28*t,lift:.18*t};}
 if(u<.48){const t=smooth((u-.18)/.30);return {cut:-.28+1.73*t,lift:.18-.30*t};}
 const t=smooth((u-.48)/.52);return {cut:1.45*(1-t),lift:-.12*(1-t)};
}
