import{test}from'node:test';import assert from'node:assert/strict';
import{cardMarkup,cardsMarkup,FeastUI}from'../src/ui/feast-games.js';
import{person,pose,ROLE_LOOK}from'../src/world/people.js';
import{RemoteEquipment}from'../src/game/remote-equipment.js';
import{MeshStandardMaterial}from'three';
import{DANCE_BEAT}from'../../shared/feast-games.js';

test('hidden cards stay blank and participant names are escaped in the actual table view',()=>{
 const s={phase:'playing',round:1,players:[{id:1,name:'<script>bad</script>',cards:['cups:A','coins:10'],total:21,points:0},{id:2,name:'B',cards:[null,null],total:null,points:0}],dealer:{cards:['clubs:6',null],total:6},turnId:2,commentary:'Хуан ждёт'};
 const html=cardsMarkup(s,1);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.equal((html.match(/aria-label="Закрытая карта"/g)??[]).length,3);
 assert.match(html,/Открыто: 6/);assert.match(html,/Сумма: <strong>21/);assert.match(cardMarkup('cups:A'),/>Т</);
});

test('dance keys send one bounded intent per press, held keys and unrelated keys do not send scores',()=>{
 const ui=Object.create(FeastUI.prototype),sent=[];ui.getModal=()=> 'dance';ui.now=()=>1000+DANCE_BEAT*.5;ui.send=(...args)=>sent.push(args);ui.dance={id:'dance-1',phase:'dancing',startAt:1000,steps:['left','right']};
 const e={code:'KeyA',preventDefault(){},repeat:false};assert.equal(ui.handleKey(e),true);assert.deepEqual(sent,[['dance',{action:'hit',sessionId:'dance-1',index:0,direction:'left'}]]);
 ui.handleKey({...e,repeat:true});assert.equal(sent.length,1);assert.equal(ui.handleKey({...e,code:'Escape'}),false);
 ui.now=()=>-10000;ui.handleKey(e);assert.equal(sent.length,1);
});

test('a full server dance is visible beyond four seconds, hides held tools, claps and clears on cancellation',()=>{
 const material=new MeshStandardMaterial({vertexColors:true}),M={person:material,get:()=>material,canvas:()=>material},rig=person(material,ROLE_LOOK.grumete),eq=new RemoteEquipment(rig,M);
 eq.setEquipment('sword',1);const action={kind:'dance',seq:1,equipmentRev:1,startedAt:1000,danceStartAt:3500,duration:22500,beatMs:DANCE_BEAT,steps:Array.from({length:24},()=> 'left')};eq.setAction(action);
 pose(rig,'stand');eq.update(13000);assert.equal(eq.action.kind,'dance');assert.equal(eq.item,null);assert.ok(Math.abs(rig.arms[0].ua.rotation.z)>.1);
 const at=rig.legs[0].th.rotation.x;pose(rig,'stand');eq.update(13400);assert.notEqual(rig.legs[0].th.rotation.x,at);
 eq.setAction(null);pose(rig,'stand');eq.update(13401);assert.equal(eq.item,'sword');assert.equal(rig.hip.position.x,0);eq.dispose();material.dispose();
});
