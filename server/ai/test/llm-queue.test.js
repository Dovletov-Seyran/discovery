import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {chat,setTransport,queueStats} from '../llm.js';
after(()=>setTransport(null));

test('a player reply interrupts a running background plan and goes before queued plans',async()=>{
 const order=[];let started;
 const ready=new Promise(r=>started=r);
 setTransport(async(messages,{signal})=>{
  const id=messages[0].content;order.push(id);
  if(id==='background'){
   started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('interrupted')),{once:true}));
  }
  return {text:id};
 });
 const background=chat([{role:'user',content:'background'}],{priority:-2,preemptible:true});
 const rejected=assert.rejects(background,/interrupted/);await ready;
 const later=chat([{role:'user',content:'later'}],{priority:-2,preemptible:true});
 const reply=chat([{role:'user',content:'reply'}],{priority:1});
 await rejected;assert.equal((await reply).text,'reply');await later;
 assert.deepEqual(order,['background','reply','later']);assert.deepEqual(queueStats(),{busy:false,waiting:0});
});
