import {Controller} from './controller.js';
import {Interaction} from './interact.js';

// Front 1 owns scene construction and the render loop; call update before render.
export class GameplayRuntime {
  constructor(world, canvas, {send,onTarget,eyeHeight} = {}) {
    if (!world?.camera || typeof world.collide !== 'function' || typeof world.groundHeight !== 'function') {
      throw new TypeError('attachWorld: ожидаются camera, collide(capsule), groundHeight(x,z)');
    }
    this.world=world;
    this.controller=new Controller(world,canvas,{eyeHeight});
    this.interaction=new Interaction(world);
    this.send=send;
    this.onTarget=onTarget;
    this.mode='blocked';
    this.lastSent=-Infinity;
    this.lastMove='';
  }
  setMode(mode){this.mode=mode;this.controller.setMode(mode);}
  teleport(p,r){this.controller.teleport(p,r);this.lastMove='';}
  update(delta,time){
    this.controller.update(delta,time);
    const target=this.mode==='play'?this.interaction.target():null;
    this.onTarget?.(target);
    if(this.mode!=='play'&&this.mode!=='seated')return;
    if(time-this.lastSent<1/15)return;
    const payload={p:this.controller.position.toArray(),r:this.controller.yaw,a:this.controller.animation};
    const key=JSON.stringify(payload);
    if(key!==this.lastMove&&this.send('move',payload)){this.lastMove=key;this.lastSent=time;}
  }
  dispose(){this.controller.dispose();this.onTarget?.(null);}
}
