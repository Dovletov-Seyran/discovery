import {test} from 'node:test';
import assert from 'node:assert/strict';
import {strikeSignal,HARBOR_PATTERN} from '../../shared/harbor-signals.js';
test('signals require the full pattern, a mistake restarts the sequence and completion is stable',()=>{
 let state={step:0};for(const tone of HARBOR_PATTERN)state=strikeSignal(state,tone).state;
 assert.equal(state.done,true);assert.deepEqual(strikeSignal(state,'low').state,state);
 assert.equal(strikeSignal({step:1},'middle').wrong,true);assert.equal(strikeSignal({step:1},'middle').state.step,0);
 assert.equal(strikeSignal({step:0},'forged').invalid,true);
});
