import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {SocketClient} from '../src/net/socket.js';

function once(client, type) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{unsubscribe();reject(new Error(`Нет ${type}`));},5000);
    const unsubscribe=client.on(type,message=>{clearTimeout(timer);unsubscribe();resolve(message);});
  });
}

test('actual backend: auth_ok.scene, role, chat and replacement code', {skip:!process.env.DISCOVERY_SERVER}, async()=>{
  const base=process.env.DISCOVERY_SERVER;
  const response=await fetch(`${base}/api/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:`f2_${randomBytes(5).toString('hex')}`,password:randomBytes(12).toString('hex')})});
  assert.equal(response.status,200);
  const {token}=await response.json();
  const url=base.replace(/^http/,'ws')+'/ws';
  const first=new SocketClient({url}),second=new SocketClient({url});
  try {
    const auth=once(first,'auth_ok');first.connect(token);
    const state=await auth;assert.equal(state.scene.id,'lobby');assert.equal(state.scene.progress.phase,'none');assert.ok(state.you.id);
    const lobby=once(first,'lobby');first.send('interact',{id:'role:piloto'});
    // Initial lobby may already be queued; subscribe until selected role appears.
    let message=await lobby;
    if(!message.players.some(player=>player.id===state.you.id&&player.role==='piloto'))message=await once(first,'lobby');
    assert.ok(message.players.some(player=>player.id===state.you.id&&player.role==='piloto'));
    const chat=once(first,'chat');first.send('chat',{text:'Проверка фронта 2'});
    assert.equal((await chat).from,state.you.id);
    const replaced=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{unsubscribe();reject(new Error('Нет replaced'));},5000);
      const unsubscribe=first.on('connection',message=>{if(message.status==='replaced'){clearTimeout(timer);unsubscribe();resolve();}});
    });
    const secondAuth=once(second,'auth_ok');second.connect(token);
    await Promise.all([replaced,secondAuth]);assert.equal(first.stopped,true);
  } finally {first.disconnect();second.disconnect();}
});
