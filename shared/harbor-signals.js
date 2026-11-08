export const HARBOR_PATTERN=['low','high','middle','high'];
export function strikeSignal(state,tone){
 if(!['low','middle','high'].includes(tone))return {state,invalid:true};
 if(state.done)return {state,done:true};
 if(tone!==HARBOR_PATTERN[state.step??0])return {state:{step:tone===HARBOR_PATTERN[0]?1:0},wrong:true};
 const step=(state.step??0)+1;return {state:{step,done:step===HARBOR_PATTERN.length},done:step===HARBOR_PATTERN.length};
}
