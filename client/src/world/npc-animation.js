import * as THREE from 'three';
import { pose, strum } from './people.js';
import { bake } from './geom.js';
import { npcActivity } from '../../../shared/npc-activity.js';

// Merge rigid details within each joint, retaining the articulated skeleton.
export function prepareNpc(npc) {
  const rig = npc.userData.rig;
  if (!rig) return;
  const groups = [];
  rig.root.traverse(o => { if (o.isGroup) { groups.push(o); o.userData.noBake = true; } });
  for (const group of groups.reverse()) {
    group.userData.noBake = false;
    bake(group);
    group.userData.noBake = true;
  }
  const joints = [rig.hip, rig.torso, rig.head, ...rig.legs.flatMap(l => [l.th, l.sh]), ...rig.arms.flatMap(a => [a.ua, a.fa])];
  npc.userData.motion = {
    joints, previous: joints.map(j => j.quaternion.clone()), hipY: rig.hip.position.y,
    phase: [...npc.userData.id].reduce((n, c) => n + c.charCodeAt(0), 0) * 0.37,
    initialized: false,
  };
}

export function animateNpc(npc, dt, seconds, night = false) {
  const { rig, definition, motion } = npc.userData;
  if (!rig || !motion) return;
  const state = npcActivity(definition, seconds);
  npc.position.fromArray(state.p);
  const yaw = state.r + Math.PI;
  const angle = Math.atan2(Math.sin(yaw - npc.rotation.y), Math.cos(yaw - npc.rotation.y));
  npc.rotation.y += motion.initialized ? angle * (1 - Math.exp(-dt * 5)) : angle;
  motion.joints.forEach((j, i) => motion.previous[i].copy(j.quaternion));
  motion.hipY = rig.hip.position.y;
  const t = seconds + motion.phase, slow = Math.sin(t * 1.3), beat = Math.sin(t * 2.4);
  pose(rig, state.action, seconds * 5);
  if (definition.pose === 'guitar') {
    pose(rig, 'sit');
    strum(rig, t, !night);
  } else {
    switch (state.action) {
      case 'walk': break;
      case 'chart':
        rig.torso.rotation.x = 0.38 + slow * 0.025;
        rig.head.rotation.set(0.42, Math.sin(t * 0.4) * 0.18, 0);
        rig.arms[0].ua.rotation.x = -1.15; rig.arms[0].fa.rotation.x = -0.35;
        rig.arms[1].ua.rotation.set(-1.05, 0.12 * slow, 0.1); rig.arms[1].fa.rotation.x = -0.3;
        break;
      case 'compass':
        rig.torso.rotation.x = 0.25; rig.head.rotation.x = 0.6;
        rig.arms[0].ua.rotation.x = -0.95; rig.arms[0].fa.rotation.x = -0.65 + slow * 0.12;
        break;
      case 'admiral':
        rig.head.rotation.y = 0.35 + Math.sin(t * 0.28) * 0.4;
        rig.torso.rotation.y = Math.sin(t * 0.28) * 0.06;
        break;
      case 'akimbo':
        rig.head.rotation.y = Math.sin(t * 0.55) * 0.45;
        rig.arms[0].ua.rotation.x += Math.max(0, Math.sin(t * 0.45)) * -0.7;
        rig.arms[0].fa.rotation.x -= 0.2 * beat;
        break;
      case 'stir':
        rig.torso.rotation.x += slow * 0.04; rig.head.rotation.x = 0.35;
        rig.arms[1].ua.rotation.y = Math.cos(t * 1.8) * 0.2;
        rig.arms[1].ua.rotation.x += Math.sin(t * 1.8) * 0.13;
        rig.arms[1].fa.rotation.x += Math.cos(t * 1.8) * 0.17;
        break;
      case 'kneel':
        rig.torso.rotation.x += beat * 0.06;
        rig.arms.forEach((arm, i) => { arm.ua.rotation.x += Math.sin(t * 2.4 + i) * 0.16; arm.fa.rotation.x += beat * 0.1; });
        rig.head.rotation.y = slow * 0.1;
        break;
      case 'haul':
        rig.torso.rotation.x += beat * 0.12;
        rig.arms.forEach(arm => { arm.ua.rotation.x += beat * 0.25; arm.fa.rotation.x -= beat * 0.3; });
        break;
      case 'sit':
        rig.head.rotation.y = Math.sin(t * 0.45) * 0.3;
        rig.arms[0].fa.rotation.x -= Math.max(0, Math.sin(t * 0.7)) * 0.5;
        rig.torso.rotation.z = slow * 0.025;
        break;
      default: // Lookout: hand shades the eyes, then rests between scans.
        rig.head.rotation.y = Math.sin(t * 0.35) * 0.6;
        { const scan = THREE.MathUtils.smoothstep(Math.sin(t * 0.24), -0.3, 0.4);
          rig.arms[0].ua.rotation.set(-1.8 * scan, 0, -0.4 * scan);
          rig.arms[0].fa.rotation.x = -1.3 * scan; }
    }
    if (!state.walking) {
      rig.torso.position.y = Math.sin(t * 1.8) * 0.006;
      rig.torso.rotation.z += Math.sin(t * 0.75) * 0.012;
    } else rig.torso.position.y = 0;
  }
  const blend = motion.initialized ? 1 - Math.exp(-dt * 9) : 1;
  motion.joints.forEach((j, i) => j.quaternion.slerp(motion.previous[i], 1 - blend));
  rig.hip.position.y = THREE.MathUtils.lerp(motion.hipY, rig.hip.position.y, blend);
  motion.initialized = true;
}

// Dynamic NPC bodies are separate from the static ship BVH: no invisible body left at home.
export function collideNpcs(npcs, capsule) {
  const delta = new THREE.Vector3();
  for (const npc of npcs) {
    if (!npc.visible) continue;
    const p = npc.position;
    if (capsule.end.y + capsule.radius < p.y || capsule.start.y - capsule.radius > p.y + 1.7) continue;
    const dx = capsule.start.x - p.x, dz = capsule.start.z - p.z;
    const distance = Math.hypot(dx, dz), radius = capsule.radius + 0.3;
    if (distance >= radius) continue;
    const push = radius - distance;
    const x = distance > 1e-6 ? dx / distance : 1, z = distance > 1e-6 ? dz / distance : 0;
    capsule.start.x += x * push; capsule.end.x += x * push;
    capsule.start.z += z * push; capsule.end.z += z * push;
    delta.x += x * push; delta.z += z * push;
  }
  return delta;
}
