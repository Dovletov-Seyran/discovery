// Run ONLY against a disposable DEV=1 database. Creates two fixture users, resets test progress, changes scenes and grants items.
// SUNDAY_SMOKE_URL=http://localhost:3103 node server/scripts/smoke-objects.js
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base=process.env.SUNDAY_SMOKE_URL;
if(!base)throw new Error('Set SUNDAY_SMOKE_URL to an isolated DEV server with a disposable DB.');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label,timeout=12000)=>{const until=Date.now()+timeout;while(Date.now()<until){const result=fn();if(result)return result;await sleep(30);}throw new Error(`Timeout: ${label}`);};
const clients=[];
async function client(index){
 const login=`sunday-objects-${index}`,password='fixture-objects-local-only';
 let response=await fetch(`${base}/api/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});
 if(response.status===409)response=await fetch(`${base}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});
 assert.equal(response.status,200);const {token}=await response.json();
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages=[];
 ws.on('message',raw=>messages.push(JSON.parse(raw)));ws.on('error',()=>{});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const c={ws,messages,send:(t,payload={})=>ws.send(JSON.stringify({t,...payload}))};clients.push(c);c.send('auth',{token});await wait(()=>messages.find(m=>m.t==='auth_ok'),'auth');return c;
}
try{
 const health=await (await fetch(`${base}/api/health`)).json();assert.equal(health.dev,true,'This smoke needs DEV=1 and a disposable database.');
 const a=await client(1),b=await client(2);
 a.send('chat',{text:'/reset'});await wait(()=>a.messages.some(m=>m.t==='scene'&&m.id==='lobby'),'fixture lobby');
 a.send('interact',{id:'role:piloto'});b.send('interact',{id:'role:grumete'});a.send('chat',{text:'/scene ship_day'});
 const scene=await wait(()=>a.messages.findLast(m=>m.t==='scene'&&m.id==='ship_day'),'scene');
 const spawn=scene.spawn;
 a.send('chat',{text:'/give wine'});a.send('chat',{text:'/give cup'});
 await wait(()=>a.messages.findLast(m=>m.t==='inventory'&&m.items.includes('wine')&&m.items.includes('cup')),'inventory');
 a.messages.length=b.messages.length=0;
 a.send('place',{item:'wine',p:[spawn[0]+.5,spawn[1]+.185,spawn[2]-.8],r:0});
 const drop=await wait(()=>a.messages.flatMap(m=>m.t==='world_patch'?m.ops:[]).find(op=>op.id.startsWith('drop:')&&op.item==='wine'),'placed wine');
 await wait(()=>b.messages.some(m=>m.t==='world_patch'&&m.ops.some(op=>op.id===drop.id)),'peer receives placement');
 assert.equal(a.messages.findLast(m=>m.t==='inventory').items.includes('wine'),false);
 a.send('pickup',{id:drop.id});await wait(()=>a.messages.findLast(m=>m.t==='inventory')?.items.includes('wine'),'pickup dropped wine');
 a.send('pickup',{id:drop.id});await sleep(100);assert.equal(a.messages.findLast(m=>m.t==='inventory').items.filter(i=>i==='wine').length,1);
 await sleep(400);a.messages.length=b.messages.length=0;
 a.send('throw',{item:'cup',p:[spawn[0],spawn[1]+1.6,spawn[2]-.35],v:[0,2,-4],r:0});
 const thrown=await wait(()=>a.messages.find(m=>m.t==='world_event'&&m.type==='throw'),'throw event');
 const flight=await wait(()=>a.messages.flatMap(m=>m.t==='world_patch'?m.ops:[]).find(op=>op.id===thrown.id&&op.state?.body),'flight');
 const peer=await wait(()=>b.messages.flatMap(m=>m.t==='world_patch'?m.ops:[]).find(op=>op.id===flight.id&&op.state?.body),'peer flight');
 assert.deepEqual(peer.state.body,flight.state.body);
 await wait(()=>a.messages.some(m=>m.t==='world_event'&&m.type==='throw'),'throw event');
 const final=await wait(()=>a.messages.flatMap(m=>m.t==='world_patch'?m.ops:[]).findLast(op=>op.id===flight.id&&op.state?.body?.sleeping),'final rest');
 const peerFinal=await wait(()=>b.messages.flatMap(m=>m.t==='world_patch'?m.ops:[]).findLast(op=>op.id===flight.id&&op.state?.body?.sleeping),'peer final rest');
 assert.deepEqual(final.state.p,peerFinal.state.p);
 a.send('toggle',{id:'nav_chest'});
 await wait(()=>a.messages.some(m=>m.t==='world_patch'&&m.ops.some(op=>op.id==='nav_chest'&&op.state?.open===true)),'chest opens');
 await wait(()=>b.messages.some(m=>m.t==='world_patch'&&m.ops.some(op=>op.id==='nav_chest'&&op.state?.open===true)),'peer chest opens');
 console.log('PASS: two authenticated WebSocket clients; place, pickup without duplication, identical launch, authoritative landing, throw event and shared chest.');
}finally{for(const c of clients)c.ws.close();}
