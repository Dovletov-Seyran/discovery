import {Raycaster, Vector2} from 'three';
export class Interaction {
  constructor(world) { this.world=world; this.ray=new Raycaster();this.ray.far=2.5;this.center=new Vector2(); }
  target() {
    this.ray.setFromCamera(this.center,this.world.camera);
    const candidates=(this.world.interactables || []).filter(object=>object.visible);
    for (const hit of this.ray.intersectObjects(candidates,true)) {
      let object=hit.object;
      while(object&&!object.userData?.id) object=object.parent;
      if (!object) continue;
      for(let parent=hit.object;parent;parent=parent.parent) if(!parent.visible){object=null;break;}
      if(object) return object.userData;
    }
    return null;
  }
}
