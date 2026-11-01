import * as THREE from 'three';
import {RemoteEquipment} from '../game/remote-equipment.js';
import { person, pose, makeLabel, ROLE_LOOK, ROLE_NAME, TAINO_ROLE_LOOK, TAINO_ROLE_NAME } from './people.js';

// part 1: the crew; part 2: villagers of Guanahani (world.setZone switches it)
const LOOKS = { crew: [ROLE_LOOK, ROLE_NAME], taino: [TAINO_ROLE_LOOK, TAINO_ROLE_NAME] };

const DELAY = 100; // ms: render remote players this far in the past and interpolate (F1.6)

// Remote players: upsert / snapshot / remove / say. Positions come from `snapshot` 15 times a second.
export class Players {
  constructor(scene, M, {labelFactory=makeLabel}={}) {
    this.labelFactory=labelFactory;this.zone='ship';this.clockOffset=0;
    this.M = M;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.map = new Map();
    this.kind = 'crew';
  }

  // 'crew' | 'taino': rebuilds everybody's figure, keeping where they are
  setLooks(kind) {
    if (kind === this.kind || !LOOKS[kind]) return;
    this.kind = kind;
    for (const p of this.map.values()) {
      const old = p.rig.root, rig = person(this.M.person, LOOKS[kind][0][p.role] ?? LOOKS[kind][0].grumete);
      rig.root.position.copy(old.position); rig.root.rotation.copy(old.rotation); rig.root.userData = old.userData;
      rig.root.add(p.label);
      old.removeFromParent(); old.traverse((o) => { if (o !== p.label && !o.isSprite) o.geometry?.dispose(); });
      this.group.add(rig.root);
      p.rig = rig;
      p.label.draw(p.name, LOOKS[kind][1][p.role] ?? '');
    }
  }

  upsert(id, data) {
    const {name,role}=data;
    let p = this.map.get(id);
    const previous=p&&role!==undefined&&role!==p.role?p:null;
    if(previous){this.remove(id);p=null;}
    if (!p) {
      const [looks] = LOOKS[this.kind], rig = person(this.M.person, looks[role] ?? looks.grumete);
      const label = this.labelFactory(); label.position.y = 2.3; rig.root.add(label);
      rig.root.userData = { id, kind: 'player' };
      this.group.add(rig.root);
      p = { rig, label, equipment:new RemoteEquipment(rig,this.M), buf: [], phase: 0, a: 'idle',pitch:data.pitch??0, bubbleUntil: 0,zone:data.zone??this.zone };
      if(previous){
        p.equipment.setEquipment(previous.equipment.equipped,previous.equipment.equipmentRev);
        p.equipment.action=previous.equipment.action;p.equipment.lastSeq=previous.equipment.lastSeq;
      }
      this.map.set(id, p);
    }
    p.name = name??p.name??''; p.role = role??p.role;
    if(data.zone)p.zone=data.zone;
    if(data.p)p.rig.root.position.fromArray(data.p);
    if(Number.isFinite(data.r))p.rig.root.rotation.y=data.r+Math.PI;
    if('equipped' in data)p.equipment.setEquipment(data.equipped,data.equipmentRev);
    if('action' in data)p.equipment.setAction(data.action);
    p.rig.root.visible=p.zone===this.zone;
    p.label.draw(p.name, LOOKS[this.kind][1][p.role] ?? '');
    return p.rig.root;
  }

  remove(id) {
    const p = this.map.get(id);
    if (!p) return;
    p.equipment.dispose();
    p.rig.root.removeFromParent();
    p.rig.root.traverse((o) => { o.geometry?.dispose(); if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
    this.map.delete(id);
  }

  // list: [{ id, p: [x,y,z], r, a }] — players that were not upserted yet are ignored
  snapshot(list, time, serverNow) {
    if(Number.isFinite(serverNow))this.clockOffset=serverNow-Date.now();
    const now = performance.now();
    for (const s of list) {
      const known=this.map.get(s.id);
      if(!known||(s.role!==undefined&&s.role!==known.role)||(s.name!==undefined&&s.name!==known.name))this.upsert(s.id,s);
      const p = this.map.get(s.id);
      if(s.zone&&p.zone!==s.zone){p.zone=s.zone;p.buf=[];}
      if('equipped' in s)p.equipment.setEquipment(s.equipped,s.equipmentRev);
      if('action' in s)p.equipment.setAction(s.action);
      p.buf.push({ at: now, p: s.p, r: s.r,pitch:s.pitch??0, a: s.a });
      if (p.buf.length > 20) p.buf.shift();
    }
  }

  syncClock(serverNow,receivedAt=Date.now()){if(Number.isFinite(serverNow))this.clockOffset=serverNow-receivedAt;}
  clearActions(){for(const p of this.map.values())p.equipment.action=null;}
  setZone(zone){this.zone=zone;for(const p of this.map.values())p.rig.root.visible=p.zone===zone;}
  equipment({id,item,equipmentRev,zone,serverNow}){
    if(Number.isFinite(serverNow))this.clockOffset=serverNow-Date.now();
    const p=this.map.get(id);if(!p)return;
    if(zone&&zone!==p.zone){p.zone=zone;p.buf=[];}
    p.equipment.setEquipment(item,equipmentRev);
  }
  action({id,action,serverNow}){
    if(Number.isFinite(serverNow))this.clockOffset=serverNow-Date.now();
    const p=this.map.get(id);if(!p||action?.zone!==p.zone)return;
    p.equipment.setAction(action);
  }

  say(id, text, seconds = 6) {
    const p = this.map.get(id);
    if (!p) return;
    p.label.draw(p.name, ROLE_NAME[p.role] ?? '', text);
    p.bubbleUntil = performance.now() + seconds * 1000;
  }

  update(dt) {
    const t = performance.now() - DELAY;
    for (const p of this.map.values()) {
      const b = p.buf;
      p.rig.root.visible=p.zone===this.zone;
      if(!p.rig.root.visible)continue;
      if (!b.length) {pose(p.rig,p.a==='idle'?'stand':p.a,p.phase);p.equipment.update(Date.now()+this.clockOffset-DELAY,p.pitch);continue;}
      let i = b.length - 1;
      while (i > 0 && b[i - 1].at > t) i--;
      const s1 = b[i], s0 = b[Math.max(0, i - 1)];
      const f = s1.at === s0.at ? 1 : THREE.MathUtils.clamp((t - s0.at) / (s1.at - s0.at), 0, 1);
      const root = p.rig.root;
      root.position.set(
        THREE.MathUtils.lerp(s0.p[0], s1.p[0], f), THREE.MathUtils.lerp(s0.p[1], s1.p[1], f), THREE.MathUtils.lerp(s0.p[2], s1.p[2], f));
      let dr = s1.r - s0.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      root.rotation.y = s0.r + dr * f + Math.PI; // r = camera-style yaw, the model faces +z
      p.a = s1.a;
      p.pitch=THREE.MathUtils.lerp(s0.pitch,s1.pitch,f);
      p.phase += dt * (p.a === 'run' ? 11 : 7);
      pose(p.rig, p.a === 'idle' ? 'stand' : p.a, p.phase);
      p.equipment.update(Date.now()+this.clockOffset-DELAY,p.pitch);
      if (p.bubbleUntil && performance.now() > p.bubbleUntil) { p.bubbleUntil = 0; p.label.draw(p.name, ROLE_NAME[p.role] ?? ''); }
    }
  }
}
