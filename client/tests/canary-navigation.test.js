import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canaryNavigator,segmentBlocked,insideBuilding} from '../../shared/canary-navigation.js';
import {Fauna} from '../src/world/fauna.js';
import {Scene,Group,PerspectiveCamera} from 'three';
const layout=JSON.parse(readFileSync(new URL('../../content/canary_layout.json',import.meta.url)));
test('rotated houses are avoided by actual population routes, including the closing loop',()=>{
 const nav=canaryNavigator(layout),world={zone:'canary',scene:new Scene(),ship:new Group(),camera:new PerspectiveCamera(),island:{heightAt:()=>3},players:{map:new Map()}};
 const fauna=new Fauna(world,{layouts:{canary:layout}});fauna.update(.016);
 for(const a of fauna.herds.get('canary').agents)if(a.buildings)for(const leg of a.route.legs){
  assert.equal(segmentBlocked(leg.from,leg.to,nav.boxes),false,`${a.kind}: ${leg.from} -> ${leg.to}`);
  assert.equal(nav.boxes.some(b=>insideBuilding(leg.from,b)),false);
 }
});
test('a route crossing a rotated house gets a finite safe detour',()=>{
 const nav=canaryNavigator({objects:[{m:'house',p:[0,0],r:.6}]});const points=nav.path([-10,0],[10,0]);assert.ok(points.length>2);
 for(let i=1;i<points.length;i++)assert.equal(segmentBlocked(points[i-1],points[i],nav.boxes),false);
});
