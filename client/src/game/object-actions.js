import {DoubleSide,Ray,Vector3} from 'three';
import {supportHeight} from '../../../shared/object-physics.js';
import {chestAround} from '../../../shared/world-interact.js';
import {surfaceHit} from '../world/physics.js';

export function placement(world,item){
  const origin=world.camera.getWorldPosition(new Vector3()),direction=world.camera.getWorldDirection(new Vector3());
  const hit=surfaceHit(world,origin,direction,3.2);
  if(!hit||hit.face.normal.y<.5)return null;
  return {item,p:hit.point.clone().add(new Vector3(0,supportHeight(item)+.015,0)).toArray(),r:world.camera.rotation.y};
}
export function launch(world,item){
  const origin=world.camera.getWorldPosition(new Vector3()),direction=world.camera.getWorldDirection(new Vector3());
  return {item,p:origin.addScaledVector(direction,.35).toArray(),v:direction.multiplyScalar(6).add(new Vector3(0,2,0)).toArray(),r:world.camera.rotation.y};
}
// The empty spot of the ship's layout under the crosshair that the item in hand can go back to (the server has the last word).
export function homeSlot(world,item,you){
  if(world.zone!=='ship')return null;
  const origin=world.camera.getWorldPosition(new Vector3()),direction=world.camera.getWorldDirection(new Vector3()),to=new Vector3();
  let best=null,nearest=.35;
  for(const obj of world.shipInteractables){
    const u=obj.userData,holder=u.state?.holder;
    if(u.kind!=='item'||u.item!==item||obj.visible||(holder!=='placed'&&holder!==you))continue;
    to.copy(obj.position).sub(origin);
    const along=to.dot(direction),off=Math.sqrt(Math.max(0,to.lengthSq()-along*along));
    if(along<=0||to.length()>3.4||off>=nearest)continue;
    const wall=world.barrier?.bvh.raycastFirst(new Ray(origin,to.clone().normalize()),DoubleSide);
    if(wall&&wall.distance<to.length()-.1)continue;
    best=obj;nearest=off;
  }
  if(!best)return null;
  const chests=world.shipInteractables.filter(o=>o.userData.lidDef),chest=chestAround(chests.map(o=>o.userData.lidDef),best.position.toArray());
  const closed=!!chest&&!chests.find(o=>o.userData.id===chest.id).userData.state?.open;
  return {id:best.userData.id,closed};
}
