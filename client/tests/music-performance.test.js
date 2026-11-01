import {test}from'node:test';import assert from'node:assert/strict';
import{WorldAudio}from'../src/audio/world-audio.js';

test('a shared performance starts once, changes on request, stops and ignores other scenes',t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);
 const audio=Object.create(WorldAudio.prototype),calls=[];audio.scene={id:'ship_day',startAt:1000};audio.setMusic=(...args)=>calls.push(args);audio.setAmbience=()=>{};
 const p={scene:'ship_day@1000',song:'quiet',startAt:now,until:now+30000};
 try{
  audio.onPerformance(p);assert.equal(calls.length,1);assert.equal(calls[0][0].id,'amb_intro_lute');assert.equal(calls[0][0].duration,30);
  audio.onPerformance({...p});assert.equal(calls.length,1);
  audio.onPerformance({...p,song:'cheerful'});assert.equal(calls.at(-1)[0].id,'amb_feast_folia');
  audio.onPerformance(null);assert.equal(calls.at(-1)[0],null);
  audio.onPerformance({...p,scene:'night_story@1000'});assert.equal(calls.length,3);
  now=p.until+1;audio.onPerformance(p);assert.equal(calls.length,3);
 }finally{clearTimeout(audio.performanceEnd);}
});

test('joining an ongoing tune seeks to server time and stops at the shared ending',async t=>{
 t.mock.method(Date,'now',()=>100000);const starts=[],stops=[];
 const gain=()=>({gain:{cancelScheduledValues(){},setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){return this;}});
 const ctx={currentTime:10,createGain:gain,createBufferSource:()=>({connect:()=>gain(),start:(...args)=>starts.push(args),stop:at=>stops.push(at)})};
 const audio=Object.create(WorldAudio.prototype);audio.context=()=>ctx;audio.buffer=async()=>({duration:75});audio.clockOffset=5000;
 await audio.setMusic({id:'amb_intro_lute',volume:.7,duration:30},100000);
 assert.deepEqual(starts,[[10,5]]);assert.ok(Math.abs(stops[0]-35.02)<.001);
});
