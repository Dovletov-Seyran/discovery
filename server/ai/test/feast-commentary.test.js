import{test,after}from'node:test';import assert from'node:assert/strict';
import{setTransport}from'../llm.js';import{feastCommentary}from'../feast-commentary.js';
after(()=>setTransport(null));
test('Juan gets public events and completed-hand statistics, never a supplied private deck or hands',async()=>{
 const previous=process.env.AI;process.env.AI='1';let user;
 setTransport(async(messages,opts)=>{user=JSON.parse(messages.at(-1).content);assert.ok(opts.signal);assert.ok(opts.maxTokens<=55);return{text:'Хуан: карты любят терпеливых.',ms:1};});
 try{const text=await feastCommentary({event:'Alpha draws a card',round:1,players:['Alpha'],previous:[{name:'Alpha',hands:2,busts:1}],deck:['SECRET_CARD'],hands:['PRIVATE_HAND']});assert.match(text,/Хуан/);assert.equal('deck'in user,false);assert.equal(JSON.stringify(user).includes('PRIVATE_HAND'),false);}finally{if(previous===undefined)delete process.env.AI;else process.env.AI=previous;}
});
