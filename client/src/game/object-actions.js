import {Vector3} from 'three';
import {supportHeight} from '../../../shared/object-physics.js';
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
