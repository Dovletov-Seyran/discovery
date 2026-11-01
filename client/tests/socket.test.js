import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SocketClient,Events,forwardGameEvents} from '../src/net/socket.js';
class FakeSocket {static instances=[];constructor(url){this.url=url;this.readyState=1;this.sent=[];FakeSocket.instances.push(this);}send(data){this.sent.push(JSON.parse(data));}close(){}receive(data){this.onmessage({data:JSON.stringify(data)});} }
function setup(){const net=new SocketClient({url:'ws://localhost/ws',WebSocketImpl:FakeSocket});net.connect('secret');return {net,ws:FakeSocket.instances.at(-1)};}
test('auth is first and gameplay cannot be sent before auth_ok',()=>{const {net,ws}=setup();assert.equal(net.send('move',{p:[0,0,0]}),false);ws.onopen();assert.deepEqual(ws.sent,[{t:'auth',token:'secret'}]);ws.receive({t:'auth_ok'});assert.equal(net.send('move',{p:[1,0,0]}),true);assert.equal(ws.sent[1].t,'move');net.disconnect();});
test('4002 stops retries',()=>{const {net,ws}=setup();let status;net.on('connection',m=>status=m.status);ws.onclose({code:4002});assert.equal(status,'replaced');assert.equal(net.stopped,true);assert.equal(net.timer,undefined);});
test('position correction reaches subscribers unchanged',()=>{const {net,ws}=setup();let received;net.on('pos_correct',m=>received=m);ws.receive({t:'pos_correct',p:[3,0,5],r:1});assert.deepEqual(received.p,[3,0,5]);assert.equal(received.r,1);net.disconnect();});
test('auth failure prevents reconnect and malformed input is ignored',()=>{const {net,ws}=setup();ws.onmessage({data:'not-json'});ws.receive({t:'auth_fail'});ws.onclose({code:1008});assert.equal(net.stopped,true);assert.equal(net.timer,undefined);});
test('disconnect cancels a pending reconnect',()=>{const {net,ws}=setup();ws.onclose({code:1006});assert.ok(net.timer);net.disconnect();assert.equal(net.stopped,true);});
import {MockClient} from '../src/net/mock.js';
test('UI fixture pickup is idempotent',()=>{const net=new MockClient();let inventories=0;net.on('inventory',()=>inventories++);net.send('pickup',{id:'astrolabe'});net.send('pickup',{id:'astrolabe'});assert.equal(inventories,1);net.disconnect();});
test('4001 stops retries even without an auth_fail message',()=>{const {net,ws}=setup();let failed=false;net.on('auth_fail',()=>failed=true);ws.onclose({code:4001});assert.equal(net.stopped,true);assert.equal(failed,true);assert.equal(net.timer,undefined);});


test('world patches and server clock reach the world event bus through the real socket adapter',()=>{
 const {net,ws}=setup(),events=new Events(),received=[];
 forwardGameEvents(net,events);
 events.on('world_patch',m=>received.push(m));events.on('scene_progress',m=>received.push(m));
 const patch={t:'world_patch',full:true,ops:[{op:'spawn',id:'ration_1',kind:'item',model:'biscuit',p:[1,2,3]}]};
 const clock={t:'scene_progress',scene:'ship_day',serverNow:123};
 ws.receive(patch);ws.receive(clock);assert.deepEqual(received,[patch,clock]);net.disconnect();
});
