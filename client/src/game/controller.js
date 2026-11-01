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
    this.stamina=100;this.exhausted=false;
    this.capsule = {start:new Vector3(),end:new Vector3(),radius:0.35};
    this.keys = new Set();
    this.focused=false;this.dragging=false;this.wasLocked=false;
    this.dragButton=null;this.lookDistance=0;this.suppressClick=false;
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
      if(event.button===0||event.button===2){
        if(event.button===2)event.preventDefault();
        this.focused=true;canvas.focus?.({preventScroll:true});this.dragButton=event.button;
        this.lookDistance=0;this.suppressClick=false;this.dragging=event.button===2;
      }
    },options);
    canvas.addEventListener?.('contextmenu',event=>{if(this.enabled)event.preventDefault();},options);
    window.addEventListener('mouseup',()=>{this.suppressClick=this.dragButton===0&&this.dragging;this.dragging=false;this.dragButton=null;},options);
    document.addEventListener('pointerlockchange', () => {
      const locked=document.pointerLockElement===canvas;
      if(this.wasLocked&&!locked)this.focused=false;
      this.wasLocked=locked;this.keys.clear();
    }, options);
    document.addEventListener('mousemove', event => {
      if(this.enabled&&this.focused&&this.dragButton===0&&document.pointerLockElement!==canvas){
        this.lookDistance+=Math.hypot(event.movementX,event.movementY);
        if(this.lookDistance>=4)this.dragging=true;
      }
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
    if(!this.enabled){this.focused=false;this.dragging=false;this.dragButton=null;this.suppressClick=false;}
    if (!this.enabled && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  get hasControl(){return document.pointerLockElement===this.canvas||this.focused;}
  consumeLookClick(){const dragged=this.suppressClick;this.suppressClick=false;return dragged;}
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
    // WASD работают и без захвата мыши (после окна «Предмет получен» мышь отпущена): клавиши и так
    // ловятся, только когда игра не заблокирована окном и фокус не в поле ввода
    if (this.enabled && !this.lookOnly) {
      x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
      z = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    }
    const moving = x !== 0 || z !== 0;
    if(this.stamina<=0)this.exhausted=true;else if(this.stamina>=20)this.exhausted=false;
    const running = !this.exhausted&&(this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    if(this.enabled&&!this.lookOnly)this.stamina=Math.max(0,Math.min(100,this.stamina+(moving&&running?-12:6)*Math.min(delta,.05)));
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
      const wasGrounded=this.onGround, from=this.position.clone();
      let jumped=false;
      if(this.keys.has('Space')&&this.onGround){this.velocityY=5.5;this.onGround=false;jumped=true;}

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
