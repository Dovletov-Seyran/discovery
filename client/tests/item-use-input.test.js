import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ITEM_RULES} from '../../shared/item-actions.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
// Exercise the actual UI handler without constructing WebGL, a connection or the login screen.
const handler=main.slice(main.indexOf('function useEquipped(){'),main.indexOf('// Каждый раз другой день пути:'));
function use(item,target){
 const sent=[],context={equipped:item,currentTarget:target,inventory:[item],itemId:x=>x,connected:true,modal:'',chatOpen:false,PLAY_SCENES:new Set(['ship_day']),scene:{id:'ship_day'},sceneProgress:null,itemCooldowns:new Map(),throwMode:false,ITEM_RULES,net:{send:(t,data)=>sent.push({t,...data})}};
 runInNewContext(handler+'\nuseEquipped();',context);return JSON.parse(JSON.stringify(sent));
}
test('the real click handler uses held items while looking at empty space, scenery or a person',()=>{
 for(const item of ['astrolabe','espingarda','wine','map','compass','sword'])for(const target of [null,undefined,{id:'mast'},{id:'cook'}])assert.deepEqual(use(item,target),[{t:'use',item}]);
});
test('only a matching supply destination is sent as an interaction target',()=>{
 assert.deepEqual(use('barrel',{id:'well'}),[{t:'use',item:'barrel',target:'well'}]);
 assert.deepEqual(use('barrel',null),[{t:'use',item:'barrel'}]);
 assert.deepEqual(use('barrel',{id:'cook'}),[{t:'use',item:'barrel'}]);
});
