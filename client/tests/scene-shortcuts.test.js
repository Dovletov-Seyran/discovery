import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sceneShortcut,SCENE_SHORTCUTS} from '../src/game/scene-shortcuts.js';
import {makeSceneShortcuts} from '../../server/game/scene-shortcuts.js';
test('Ctrl/Alt digits send one checkpoint intent, never equip items, and ignore editors',()=>{
 const sent=[],context={connected:true,send:(t,p)=>{sent.push({t,...p});return true;},notify(){}};
 const event={code:'Digit1',ctrlKey:true,target:{tagName:'CANVAS'},preventDefault(){},stopPropagation(){}};
 assert.equal(sceneShortcut(event,context),true);assert.deepEqual(sent,[{t:'scene_shortcut',index:1}]);
 sceneShortcut({...event,repeat:true},context);assert.equal(sent.length,1);
 for(const target of [{tagName:'INPUT'},{isContentEditable:true}])assert.equal(sceneShortcut({...event,target},context),false);
 assert.equal(sceneShortcut({...event,ctrlKey:false,altKey:true,code:'Digit3'},context),true);
});
test('only active players can jump; targets preserve cinematics and repeats are party-wide throttled',()=>{
 let time=1000;const targets=[],messages=[],p={connected:true,role:'piloto',name:'Sanjar'},peer={connected:true,role:'grumete'};
 const jump=makeSceneShortcuts({director:{setScene:id=>{targets.push(id);return true;}},players:{connected:()=>[p,peer],broadcast:m=>messages.push(m)},now:()=>time});
 assert.equal(jump({...p},{index:1}),false);assert.equal(jump(p,{index:'1'}),false);assert.equal(jump(p,{index:99}),false);
 assert.equal(jump(p,{index:1}),true);assert.deepEqual(targets,['ship_day']);assert.equal(jump(peer,{index:2}),false);
 time+=1500;assert.equal(jump(peer,{index:2}),true);assert.equal(targets[1],'cut_canary');assert.equal(messages.length,2);
 assert.equal(SCENE_SHORTCUTS[4].id,'cut_night');
});
