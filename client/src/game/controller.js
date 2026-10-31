import {Vector3, MathUtils} from 'three';
const UP = new Vector3(0,1,0);

// Only input and camera control. Camera, collisions and floor come from Front 1.
export class Controller {
  constructor(world, canvas, {eyeHeight = 1.6} = {}) {
    this.world = world;
    this.canvas = canvas;
    this.eyeHeight = eyeHeight;
    this.position = new Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;
    this.lookOnly = false;
    this.anchorYaw = 0;
    this.sensitivity = 0.002;
    this.animation = 'idle';
    this.velocityY = 0;
    this.capsule = {start:new Vector3(),end:new Vector3(),radius:0.35};
    this.keys = new Set();
    this.abort = new AbortController();
    const options = {signal:this.abort.signal};
    window.addEventListener('keydown', event => {
      if (!this.enabled || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      this.keys.add(event.code);
      if (['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code)) event.preventDefault();
    }, options);
    window.addEventListener('keyup', event => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.keys.clear(), options);
    document.addEventListener('pointerlockchange', () => this.keys.clear(), options);
    document.addEventListener('mousemove', event => {
      if (!this.enabled || document.pointerLockElement !== canvas) return;
      this.yaw -= event.movementX * this.sensitivity;
      if (this.lookOnly) this.yaw = MathUtils.clamp(this.yaw, this.anchorYaw - MathUtils.degToRad(100), this.anchorYaw + MathUtils.degToRad(100));
      this.pitch = MathUtils.clamp(this.pitch - event.movementY * this.sensitivity, -1.35, 1.35);
    }, options);
  }

  setMode(mode) {
    const nextLookOnly = mode === 'seated';
    if (nextLookOnly && !this.lookOnly) this.anchorYaw = this.yaw;
    this.lookOnly = nextLookOnly;
    this.enabled = mode === 'play' || nextLookOnly;
    this.keys.clear();
    if (!this.enabled && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  lock() { this.canvas.requestPointerLock?.()?.catch?.(() => {}); }
  teleport(position, yaw = this.yaw) {
    if (Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)) this.position.fromArray(position);
    if (Number.isFinite(yaw)) this.yaw = yaw;
    this.anchorYaw = this.yaw;
    this.velocityY = 0;
    this.applyCamera(0);
  }
  applyCamera(bob) {
    this.world.camera.position.copy(this.position);
    this.world.camera.position.y += this.eyeHeight + bob;
    this.world.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.world.camera.updateMatrixWorld();
  }
  update(delta, time) {
    let x=0, z=0;
    if (this.enabled && !this.lookOnly && document.pointerLockElement === this.canvas) {
      x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
      z = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    }
    const moving = x !== 0 || z !== 0;
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.animation = this.lookOnly ? 'sit' : moving ? running ? 'run' : 'walk' : 'idle';
    if (this.enabled && !this.lookOnly) {
      const dt=Math.min(Math.max(delta,0),0.05);
      const offset=new Vector3(x,0,z);
      if(moving)offset.normalize().applyAxisAngle(UP,this.yaw).multiplyScalar(running?6:3);
      // Прыжок — пробел, только стоя на палубе или земле (onGround с прошлого кадра)
      const wasGrounded=this.onGround, from=this.position.clone();
      let jumped=false;
      if(this.keys.has('Space')&&this.onGround&&document.pointerLockElement===this.canvas){this.velocityY=5.5;this.onGround=false;jumped=true;}
      this.velocityY-=20*dt;
      const step=dt/4;
      let grounded=false;
      for(let index=0;index<4;index++){
        this.position.addScaledVector(offset,step);
        this.position.y+=this.velocityY*step;
        const capsule=this.capsule;
        capsule.start.set(this.position.x,this.position.y+capsule.radius,this.position.z);
        capsule.end.set(this.position.x,this.position.y+1.7-capsule.radius,this.position.z);
        const result=this.world.collide(capsule);
        this.position.set(capsule.start.x,capsule.start.y-capsule.radius,capsule.start.z);
        if(result?.onGround){grounded=true;this.velocityY=Math.max(0,this.velocityY);}
        // удар головой — только толчок в основном вниз (потолок, край палубы над головой); прижавшись
        // к жителю или стене, столкновение толкает вбок и чуть вниз, и раньше прыжок гас на первом кадре
        else if(result?.delta&&result.delta.y<-1e-3&&-result.delta.y>Math.hypot(result.delta.x,result.delta.z))this.velocityY=Math.min(0,this.velocityY);
      }
      // Прилипание к земле каждый кадр, пока не прыгаем: без него на бегу под гору игрок отрывался
      // от склона, пробел не срабатывал, а высота шла лесенкой — камера дрожала. Опускаем капсулу
      // на высоту шага; если она встала на опору — ставим игрока на эту высоту. Склон выталкивает
      // по нормали (и вбок), поэтому возвращаем капсулу под игрока и уточняем высоту ещё дважды.
      if((grounded||wasGrounded)&&!jumped&&this.velocityY<=0){
        const capsule=this.capsule, snap=0.1+offset.length()*dt*1.5;
        let y=this.position.y-snap, standing=false;
        for(let pass=0;pass<3;pass++){
          capsule.start.set(this.position.x,y+capsule.radius,this.position.z);
          capsule.end.set(this.position.x,y+1.7-capsule.radius,this.position.z);
          const result=this.world.collide(capsule);
          if(pass===0&&!result?.onGround)break;
          standing=true;y=capsule.start.y-capsule.radius;
        }
        if(standing&&y<=this.position.y+0.02){this.position.y=y;grounded=true;this.velocityY=0;}
      }
      // Трение: кто стоит на опоре и не идёт, тот не сползает. Склон выталкивает по нормали,
      // и на 40° игрок съезжал вниз на 0,2–0,3 м в секунду, просто стоя на месте.
      if(grounded&&wasGrounded&&!jumped&&offset.lengthSq()===0&&this.position.distanceTo(from)<0.05)this.position.copy(from);
      this.onGround=grounded;
    }
    if (this.enabled) this.applyCamera(moving ? Math.sin(time*10)*0.02 : 0);
  }
  dispose() { this.setMode('blocked'); this.abort.abort(); }
}
