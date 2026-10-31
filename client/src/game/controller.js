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
    this.focused=false;this.dragging=false;this.wasLocked=false;
    canvas.tabIndex=0;
    this.abort = new AbortController();
    const options = {signal:this.abort.signal};
    window.addEventListener('keydown', event => {
      if (!this.enabled || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      this.keys.add(event.code);
      if (['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code)) event.preventDefault();
    }, options);
    window.addEventListener('keyup', event => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => {this.keys.clear();this.focused=false;this.dragging=false;}, options);
    canvas.addEventListener?.('blur',()=>{this.focused=false;this.dragging=false;this.keys.clear();},options);
    canvas.addEventListener?.('mousedown',event=>{
      if(!this.enabled)return;
      if(event.button===2){event.preventDefault();this.focused=true;canvas.focus?.({preventScroll:true});this.dragging=true;}
    },options);
    canvas.addEventListener?.('contextmenu',event=>{if(this.enabled)event.preventDefault();},options);
    window.addEventListener('mouseup',()=>this.dragging=false,options);
    document.addEventListener('pointerlockchange', () => {
      const locked=document.pointerLockElement===canvas;
      if(this.wasLocked&&!locked)this.focused=false;
      this.wasLocked=locked;this.keys.clear();
    }, options);
    document.addEventListener('mousemove', event => {
      if (!this.enabled || !(document.pointerLockElement===canvas||(this.focused&&this.dragging))) return;
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
    if(!this.enabled){this.focused=false;this.dragging=false;}
    if (!this.enabled && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  get hasControl(){return document.pointerLockElement===this.canvas||this.focused;}
  lock() {
    if(!this.enabled)return;
    this.focused=true;this.canvas.focus?.({preventScroll:true});
    // Embedded browsers can reject Pointer Lock. Keyboard + right-drag remain usable.
    try{this.canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{}
  }
  teleport(position, yaw = this.yaw) {
    if (Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)) this.position.fromArray(position);
    if (Number.isFinite(yaw)) this.yaw = yaw;
    this.anchorYaw = this.yaw;
    this.velocityY = 0;
    this.onGround = false;
    this.awaitingGround = true;
    this.applyCamera(0);
  }
  applyCamera(bob) {
    this.world.camera.position.copy(this.position);
    this.world.camera.position.y += this.eyeHeight + bob;
    this.world.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.world.camera.updateMatrixWorld();
  }
  terrainHeight(x,z) {
    return this.world.island?.heightAt ? this.world.island.heightAt(x,z) : this.world.groundHeight(x,z,80);
  }
  update(delta, time) {
    let x=0, z=0;
    if (this.enabled && !this.lookOnly && this.hasControl) {
      x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
      z = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    }
    const moving = x !== 0 || z !== 0;
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.animation = this.lookOnly ? 'sit' : moving ? running ? 'run' : 'walk' : 'idle';
    if (this.enabled && !this.lookOnly) {
      // Island chunks arrive asynchronously. Never simulate gravity over an absent collider.
      if (this.world.zone === 'canary') {
        const floor = this.terrainHeight(this.position.x,this.position.z);
        if (!Number.isFinite(floor)) { this.velocityY=0; this.animation='idle'; this.applyCamera(0); return; }
        if (this.awaitingGround || this.position.y < floor - 0.4) {
          this.position.y=Math.max(this.position.y, floor + 0.02); this.velocityY=0; this.awaitingGround=false;
        }
      }
      const dt=Math.min(Math.max(delta,0),0.05);
      const offset=new Vector3(x,0,z);
      if(moving)offset.normalize().applyAxisAngle(UP,this.yaw).multiplyScalar(running?6:3);
      // Прыжок — пробел, только стоя на палубе или земле (onGround с прошлого кадра)
      const wasGrounded=this.onGround;
      let jumped=false;
      if(this.keys.has('Space')&&this.onGround&&this.hasControl){this.velocityY=5.5;this.onGround=false;jumped=true;}

      this.velocityY-=20*dt;
      const step=dt/4;
      let grounded=false;
      for(let index=0;index<4;index++){
        if (this.world.zone === 'canary') {
          const nx=this.position.x+offset.x*step, nz=this.position.z+offset.z*step;
          const radius=this.capsule.radius;
          const ready=[[nx,nz],[nx-radius,nz],[nx+radius,nz],[nx,nz-radius],[nx,nz+radius]]
            .every(([px,pz])=>Number.isFinite(this.terrainHeight(px,pz)));
          if (!ready) { this.velocityY=0; break; }
        }
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
      // Спуск по склону или ступеньке: без этого на бегу вниз игрок отрывается от земли
      // и пробел не срабатывает. Опускаем капсулу на высоту шага и оставляем, только если она встала на опору;
      // берём только высоту — боковой толчок от склона разгонял бы под гору.
      if(!grounded&&wasGrounded&&!jumped&&this.velocityY<=0){
        const capsule=this.capsule, snap=0.1+offset.length()*dt*1.5;
        capsule.start.set(this.position.x,this.position.y-snap+capsule.radius,this.position.z);
        capsule.end.set(this.position.x,this.position.y-snap+1.7-capsule.radius,this.position.z);
        if(this.world.collide(capsule)?.onGround&&capsule.start.y-capsule.radius<=this.position.y+0.02){
          this.position.y=capsule.start.y-capsule.radius;
          grounded=true;this.velocityY=0;
        }
      }
      this.onGround=grounded;
    }
    if (this.enabled) this.applyCamera(moving ? Math.sin(time*10)*0.02 : 0);
  }
  dispose() { this.setMode('blocked'); this.abort.abort(); }
}
