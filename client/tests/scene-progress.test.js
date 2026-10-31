import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatRemaining,sceneProgressView} from '../src/ui/scene-progress.js';
test('countdown rounds up, crosses a minute and never goes negative',()=>{
 assert.equal(formatRemaining(61000,0),'01:01');assert.equal(formatRemaining(61000,1001),'01:00');
 assert.equal(formatRemaining(61000,60999),'00:01');assert.equal(formatRemaining(61000,62000),'00:00');
});
test('play quests have a condition, not a fake timed deadline',()=>{
 const v=sceneProgressView({phase:'objectives',done:1,total:3,next:'cut_canary',endsAt:null},0);
 assert.equal(v.value,'');assert.match(v.label,/после заданий/);assert.match(v.detail,/1 \/ 3/);
});
test('active conversation postpones the countdown; checkpoint shows who boarded',()=>{
 assert.match(sceneProgressView({phase:'dialogue'},0).detail,/разговоров/);
 assert.equal(sceneProgressView({phase:'checkpoint',ready:1,total:2},0).value,'1 / 2');
});
test('server deadline restores the same remaining time after reconnect',()=>{
 const state={phase:'departing',endsAt:14000,next:'cut_night'};
 assert.equal(sceneProgressView(state,9000).value,'00:05');assert.equal(sceneProgressView({...state},12000).value,'00:02');
 assert.equal(sceneProgressView({phase:'none'}),null);
});
