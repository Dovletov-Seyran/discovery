import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIslandActivities} from '../game/canary-activities.js';
test('island work completes once after its duration, refuses duplicate start and cancels on distance/scene/disconnect',()=>{
 let time=0,near=true,count=0;const messages=[],p={id:1,scene:'canary@1',connected:true};
 const jobs=createIslandActivities({now:()=>time,valid:()=>near,send:(_,m)=>messages.push(m)}),job={kind:'water',label:'Вода',duration:3500,target:'well',finish:()=>count++};
 assert.equal(jobs.start(p,job),true);assert.equal(jobs.start(p,job),false);jobs.tick(3499);assert.equal(count,0);jobs.tick(3500);jobs.tick(9000);assert.equal(count,1);
 for(const cancel of [()=>near=false,()=>p.scene='ship_day@2',()=>p.connected=false]){
  near=true;p.scene='canary@1';p.connected=true;time+=10000;jobs.start(p,job);cancel();jobs.tick(time+4000);assert.equal(count,1);assert.equal(messages.at(-1).status,'cancelled');
 }
});
