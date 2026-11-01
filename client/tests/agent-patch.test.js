import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,MeshStandardMaterial} from 'three';
import {WorldObjects} from '../src/world/objects.js';
import {readFileSync} from 'node:fs';
const mat=new MeshStandardMaterial();const M={get:()=>mat,canvas:()=>mat};
const agent=id=>JSON.parse(readFileSync(new URL(`../../content/agents/${id}.json`,import.meta.url),'utf8'));
function world(zone){
 const w={scene:new Scene(),zone,layout:{},M,shipInteractables:[],island:{interactables:[],chunks:new Map()},chunks:{setStaticData(){}}};w.objects=new WorldObjects(w);return w;
}
// Патчи агентов (server/game/world-state.js) рисуются тем же WorldObjects, что и предметы игроков
test('паёк Колумба: сухари появляются и их можно выбрать прицелом',()=>{
 const w=world('ship'),ops=agent('columbus').actions.find(a=>a.id==='give_rations').patch;
 w.objects.applyPatch({ops});
 assert.equal(w.objects.selectable.length,3);
 assert.equal(w.objects.selectable[0].userData.item,'biscuit');
 w.objects.applyPatch({ops:[{op:'remove',id:'ration_1'}]});
 assert.equal(w.objects.selectable.length,2);
});
test('товар торговца на прилавке рисуется и исчезает после покупки',()=>{
 const w=world('canary'),ops=agent('trader').actions[0].patch.map(({at,off,...op})=>({...op,zone:'canary',p:[268.4,3.95,292]}));
 w.objects.applyPatch({ops});
 assert.equal(w.objects.records.size,3);
 assert.ok([...w.objects.records.values()].every(r=>r.obj));
 w.objects.applyPatch({ops:[{op:'remove',id:'goods_cheese'}]});
 assert.equal(w.objects.records.has('goods_cheese'),false);
});
