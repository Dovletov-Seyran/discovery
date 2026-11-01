import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chunks} from '../src/world/chunks.js';
function manager(){
 const c=new Chunks(),built=new Map(),sent=[];
 c.setBuilder('canary',{add:(key,data)=>built.set(key,data),remove:key=>built.delete(key),setVisible(){}});
 c.setSender(msg=>sent.push(msg));c.setWorldMeta({totalChunks:257,totalBytes:1000000,cacheLimit:25,zones:{canary:{chunks:256}}});
 c.setStaticData('lod',56000);c.setStaticData('ship',3500);c.setStaticData('paths',1500);c.setZone('canary');c.update({x:256,z:320});
 return {c,built,sent};
}
test('far island, ship data and nearby chunks together stay within 10%, including visible chunks',()=>{
 const {c,built}=manager();
 for(let z=8;z<=12;z++)for(let x=6;x<=10;x++){
  c.receive('canary',`${x},${z}`,{data:'x'.repeat(5000)});
  assert.ok(c.stats().bytes<=100000);assert.ok(c.stats().loaded<=25);
 }
 assert.equal(c.cache.size,built.size);assert.ok(c.cache.has('canary:8,10'));
});
test('requested ring shrinks to the reserved budget and prioritizes the player/boundary neighbour',()=>{
 const {c,sent}=manager();assert.ok(sent.find(m=>m.t==='chunk_req').keys.length<25);
 const wanted=c.wanted({x:287.9,z:335});assert.equal(wanted[0],'8,10');assert.ok(wanted.includes('9,10'));
});
test('byte budget handles dense chunks and Unicode; reconnect metadata cannot silently exceed it',()=>{
 const {c}=manager();for(let i=0;i<8;i++)c.receive('canary',`${i+5},10`,{text:'Ж'.repeat(8000)});
 assert.ok(c.stats().bytes<=100000);c.setWorldMeta({totalBytes:850000});assert.ok(c.stats().bytes<=85000);
});
