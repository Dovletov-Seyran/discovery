// Only an isolated DEV=1 server with a disposable DB: resets progress and grants fixture inventory.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base=process.env.SUNDAY_SMOKE_URL;if(!base)throw new Error('Set SUNDAY_SMOKE_URL to a disposable DEV server.');
const clients=[],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label,timeout=6000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=fn();if(value)return value;await sleep(15);}throw new Error(`Timeout: ${label}`);};
async function token(index){
 const login=`equip-fixture-${index}`,password='fixture-equip-local';
 const request=path=>fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});
 let res=await request('register');if(res.status===409)res=await request('login');assert.equal(res.status,200);return (await res.json()).token;
}
async function connect(token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages=[];
 ws.on('message',raw=>messages.push(JSON.parse(raw)));ws.on('error',()=>{});
 const c={ws,messages,send:(t,p={})=>ws.send(JSON.stringify({t,...p}))};clients.push(c);
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});c.send('auth',{token});
 c.auth=await wait(()=>messages.find(m=>m.t==='auth_ok'),'authorization');return c;
}
try{
 assert.equal((await (await fetch(`${base}/api/health`)).json()).dev,true);
 const a=await connect(await token(1)),b=await connect(await token(2)),thirdToken=await token(3);
 a.send('chat',{text:'/reset'});await wait(()=>a.messages.some(m=>m.t==='scene'&&m.id==='lobby'),'reset fixture');
 a.send('interact',{id:'role:piloto'});b.send('interact',{id:'role:grumete'});a.send('chat',{text:'/scene ship_day'});
 const scene=await wait(()=>a.messages.find(m=>m.t==='scene'&&m.id==='ship_day'),'play scene');
 a.send('move',{p:scene.spawn,r:0,pitch:.6,a:'idle'});await wait(()=>b.messages.some(m=>m.t==='snapshot'&&m.players.some(p=>p.id===a.auth.you.id&&p.pitch===.6)),'shared aim pitch');
 for(const item of ['sword','wine','cheese','espingarda','compass','map','astrolabe','cup'])a.send('chat',{text:`/give ${item}`});
 await wait(()=>a.messages.findLast(m=>m.t==='inventory')?.items.includes('cup'),'fixture inventory');
 a.send('equip',{item:'sword'});
 const equipped=await wait(()=>b.messages.find(m=>m.t==='player_equipment'&&m.id===a.auth.you.id&&m.item==='sword'),'peer sees sword');
 await wait(()=>b.messages.some(m=>m.t==='snapshot'&&m.players.some(p=>p.id===a.auth.you.id&&p.equipped==='sword')),'snapshot holds sword');
 a.send('use',{item:'sword'});a.send('use',{item:'sword'});
 const swing=await wait(()=>b.messages.find(m=>m.t==='player_action'&&m.id===a.auth.you.id&&m.action.kind==='swing'),'sword action');
 const c=await connect(thirdToken);
 const late=await wait(()=>c.messages.find(m=>m.t==='player_join'&&m.id===a.auth.you.id),'late join state');
 assert.equal(late.equipped,'sword');assert.equal(late.action?.seq,swing.action.seq);assert.equal(late.action?.startedAt,swing.action.startedAt);
 await sleep(100);assert.equal(b.messages.filter(m=>m.t==='player_action'&&m.action.kind==='swing').length,1);
 a.send('equip',{item:'fake_sword'});await sleep(50);
 assert.equal(a.messages.findLast(m=>m.t==='player_equipment').item,'sword');
 for(const [item,kind] of [['wine','drink'],['cheese','eat'],['espingarda','shot'],['compass','inspect'],['map','inspect'],['astrolabe','inspect'],['cup','inspect']]){
   await sleep(110);a.send('equip',{item});await wait(()=>a.messages.findLast(m=>m.t==='player_equipment')?.item===item,`equip ${item}`);
   a.send('use',{item});const action=await wait(()=>b.messages.findLast(m=>m.t==='player_action'&&m.action.item===item&&m.action.kind===kind),`remote ${kind}`);
   assert.ok(action.action.duration>0);
   if(item==='cheese')await wait(()=>b.messages.findLast(m=>m.t==='player_equipment')?.item===null,'consumed item leaves hand');
 }
 a.send('equip',{item:null});await wait(()=>b.messages.findLast(m=>m.t==='player_equipment')?.item===null,'put tool away');
 console.log('PASS: three authenticated WebSocket clients; equipped sword and snapshots, late join during swing, cooldown rejects duplicate, invalid equip rejected, drink/eat/shot/all tools, consumed item and unequip.');
}finally{for(const c of clients)c.ws.close();}
