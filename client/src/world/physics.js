import {Vector3,Ray} from 'three';
import {doorBox,rayBox} from '../../../shared/world-interact.js';
import {createBody,advanceBody,stepBody,PHYSICS_STEP} from '../../../shared/object-physics.js';
export {createBody,advanceBody,stepBody,PHYSICS_STEP};

// Physics uses the same static collider as walking, without NPC/shore rescue or step climbing.
export function sphereContact(world,p,radius,from=p){
  const start=new Vector3().fromArray(from),end=new Vector3().fromArray(p);
  const capsule={start,end,radius};
  if(world.zone==='ship')world.collider?.collide(capsule);
  else for(const c of world.island.chunks.values()){
    if(!c.visible)continue;
    const b=c.bounds;
    if(start.x<b.min.x-radius||start.x>b.max.x+radius||start.z<b.min.z-radius||start.z>b.max.z+radius)continue;
    c.collider.collide(capsule);
  }
  world.objects?.collide(capsule);
  return end.toArray();
}
export function surfaceHit(world,origin,direction,maxDistance=3){
  const ray=new Ray(origin,direction),colliders=world.zone==='ship'?[world.collider]:[...world.island.chunks.values()].filter(c=>c.visible).map(c=>c.collider);
  let best=null;
  for(const c of colliders){
    const hit=c?.bvh.raycastFirst(ray,2);
    if(hit&&hit.distance<=maxDistance&&(!best||hit.distance<best.distance))best=hit;
  }
  for(const record of world.objects?.records.values()??[])if(record.data.toggleType==='door'&&record.state.visible!==false){
    const hit=rayBox(origin.toArray(),direction.toArray(),doorBox(record.data,record.state.open),maxDistance);
    if(hit&&(!best||hit.distance<best.distance))best={point:new Vector3().fromArray(hit.p),distance:hit.distance,face:{normal:new Vector3().fromArray(hit.normal)}};
  }
  return best;
}
