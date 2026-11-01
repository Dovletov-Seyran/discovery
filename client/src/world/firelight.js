import * as THREE from 'three';

// Fire after dark on Guanahani (part 2): the player's own torch in hand, the other players' torches, the batey
// fire, and the fires and torches of the cutscenes.
// Every light comes from one fixed pool. three.js compiles the light count into every shader, so a light added
// or removed mid-game recompiled all materials and stalled the game for a moment (it did at each part 2
// cutscene). The pool is always there on Guanahani; a light not in use just has intensity 0.
const POOL = 6;
const HAND = new THREE.Vector3(-0.32, 1.5, 0.15); // a raised right hand, in the rig's own axes
const DARK = (t) => t >= 0.72 || t <= 0.22;

export class Firelight {
  constructor(world) {
    this.w = world;
    this.group = new THREE.Group();
    this.group.visible = false;
    world.scene.add(this.group);
    this.free = Array.from({ length: POOL }, () => {
      const l = new THREE.PointLight(0xff9a40, 0, 16, 2);
      this.group.add(l);
      return l;
    });
    this.flameMat = new THREE.SpriteMaterial({ map: world.smokeMat.map, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false });
    // the torch the player holds: down in the right of the view, leaning away
    this.held = this.torch(0.35);
    this.held.position.set(0.34, -0.42, -0.62);
    this.held.rotation.set(-0.35, 0, -0.25);
    world.camera.add(this.held);
    this.others = new Map(); // remote player id → torch
    this.fire = null;
  }

  setZone(zone) { this.group.visible = zone === 'guanahani'; }

  // → a pool light (its intensity is the caller's to set) or null when all are taken
  take(color = 0xff9a40, distance = 16, decay = 2) {
    const l = this.free.pop();
    if (!l) return null;
    l.color.set(color); l.distance = distance; l.decay = decay;
    return l;
  }

  give(l) {
    if (!l) return;
    l.intensity = 0;
    this.free.push(l);
  }

  // a torch: a stick with a resin head, a flickering flame; its light is borrowed while it burns
  torch(scale = 1) {
    const g = new THREE.Group(), M = this.w.M;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 6).translate(0, 0.35, 0), M.get('trim')));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 5).scale(1, 1.6, 1).translate(0, 0.72, 0), M.get('resin')));
    const flame = new THREE.Sprite(this.flameMat);
    flame.position.y = 0.82; flame.scale.setScalar(0.6);
    g.add(flame);
    g.scale.setScalar(scale);
    g.userData = { flame, light: null, tip: new THREE.Vector3(0, 0.9, 0) };
    return g;
  }

  // light a torch (or put it out): it keeps its pool light while lit
  burn(torch, on, intensity, t, i = 0) {
    const u = torch.userData;
    torch.visible = on;
    if (!on) { this.give(u.light); u.light = null; return; }
    u.light ??= this.take(0xff9a40, 18, 1.6);
    const k = 0.85 + 0.15 * Math.sin(t * 17 + i * 3) * Math.sin(t * 7.3 + 1 + i);
    u.flame.scale.setScalar(0.55 + 0.12 * k);
    if (u.light) { u.light.intensity = intensity * k; torch.localToWorld(u.light.position.copy(u.tip)); this.group.worldToLocal(u.light.position); }
  }

  update(t) {
    const w = this.w, night = this.group.visible && DARK(w.env.t);
    const playing = night && !w.cutscene.active; // a cutscene lights its own scene
    w.camera.updateMatrixWorld();
    this.burn(this.held, playing, 18, t);

    // the other players carry theirs in the raised right hand
    for (const [id, p] of w.players.map) {
      let tc = this.others.get(id);
      if (!tc) { tc = this.torch(); this.group.add(tc); this.others.set(id, tc); }
      const root = p.rig.root;
      root.updateMatrixWorld();
      tc.position.copy(HAND).applyMatrix4(root.matrixWorld); tc.quaternion.copy(root.quaternion);
      tc.updateMatrixWorld(true);
      this.burn(tc, playing && root.visible, 8, t, id);
    }
    for (const [id, tc] of this.others) if (!w.players.map.has(id)) { this.burn(tc, false); tc.removeFromParent(); this.others.delete(id); }

    // the batey fire (an interactable whose model has userData.flame): flames and light after dark
    const fire = playing ? w.island?.interactables.find((o) => o.userData.flame) : null;
    if (fire !== this.fire) {
      if (this.fireFx) { this.give(this.fireFx.light); this.fireFx.sprite.removeFromParent(); this.fireFx = null; }
      this.fire = fire;
      if (fire) {
        const sprite = new THREE.Sprite(this.flameMat);
        fire.updateWorldMatrix(true, false);
        sprite.position.copy(fire.userData.flame).applyMatrix4(fire.matrixWorld);
        this.group.add(sprite);
        const light = this.take(0xff8a3a, 26, 2);
        if (light) light.position.copy(sprite.position).y += 0.4;
        this.fireFx = { sprite, light };
      }
    }
    if (this.fireFx) {
      const k = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3 + 2);
      this.fireFx.sprite.scale.setScalar(1.3 + 0.3 * k);
      if (this.fireFx.light) this.fireFx.light.intensity = 30 * k;
    }
  }
}
