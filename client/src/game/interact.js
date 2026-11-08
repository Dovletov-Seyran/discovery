import {Raycaster, Vector2, DoubleSide} from 'three';
import {CONFIG} from '../../../shared/config.js';
export class Interaction {
  // Луч идёт от глаз (1,6 м), поэтому он чуть длиннее серверных 3 м по горизонтали (сервер прощает +1 м):
  // с пристани достаёт до шлюпки внизу у её борта
  constructor(world) { this.world=world; this.ray=new Raycaster();this.ray.far=35;this.center=new Vector2(); }
  target() {
    this.ray.setFromCamera(this.center,this.world.camera);
    const candidates=(this.world.interactables || []).filter(object=>object.visible);
    // On the ship nothing is reached through a deck or a wall between rooms (hold, cabins)
    const wall=this.world.zone==='ship'?this.world.barrier?.bvh.raycastFirst(this.ray.ray,DoubleSide):null;
    for (const hit of this.ray.intersectObjects(candidates,true)) {
      if(wall&&hit.distance>wall.distance+0.02)break;
      let object=hit.object;
      while(object&&!object.userData?.id) object=object.parent;
      if (!object) continue;
      for(let parent=hit.object;parent;parent=parent.parent) if(!parent.visible){object=null;break;}
      if(object){const data=object.userData;return {...data,distance:hit.distance};}
    }
    return null;
  }
}
