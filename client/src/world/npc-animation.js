import * as THREE from 'three';
import { pose, strum } from './people.js';
import { bake } from './geom.js';
import { npcActivity, npcScene } from '../../../shared/npc-activity.js';

// Merge rigid details within each joint, retaining the articulated skeleton.
export function prepareNpc(npc) {
  const rig = npc.userData.rig;
  if (!rig) return;
  // Неподбираемые реквизит и табуреты принадлежат персонажу, а не раскладке предметов.
  const wood = new THREE.MeshStandardMaterial({ color: 0x6d472d, roughness: 0.9 });
  const stool = new THREE.Group(); stool.userData.noBake = true;
  for (const [radius, height, y] of [[0.23, 0.08, 0.43], [0.14, 0.4, 0.2]]) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), wood);
    mesh.position.y = y; mesh.castShadow = mesh.receiveShadow = true; stool.add(mesh);
  }
  stool.visible = false; rig.root.add(stool); rig.stool = stool;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.1, 10), wood);
  cup.position.set(0, -0.28, 0.05); cup.visible = false; cup.userData.noBake = true;
  rig.arms[0].fa.add(cup); rig.cup = cup;
  // Тряпка в руке у того, кто моет палубу (kneel), и кусок паруса на коленях у того, кто его чинит (mend)
  const rag = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.025, 0.13), new THREE.MeshStandardMaterial({ color: 0x8f877a, roughness: 1 }));
  rag.position.set(0, -0.3, 0.03); rag.visible = false; rag.userData.noBake = true;
  rig.arms[1].fa.add(rag); rig.rag = rag;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42, 4, 3), new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.95, side: THREE.DoubleSide }));
  cloth.rotation.x = -Math.PI / 2 + 0.12; cloth.position.set(0, 0.06, 0.26); cloth.visible = false; cloth.userData.noBake = true;
  rig.hip.add(cloth); rig.cloth = cloth;
  if (npc.userData.id === 'cook') {
    const tray = new THREE.Group(); tray.userData.noBake = true;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 12), wood);
    tray.add(plate);
    const food = new THREE.MeshStandardMaterial({color: 0xd8b772, roughness: 1});
    for (let i = 0; i < 4; i++) {
      const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), food);
      loaf.scale.set(1, 0.45, 0.65); loaf.position.set((i % 2 - 0.5) * 0.17, 0.05, (Math.floor(i / 2) - 0.5) * 0.15); tray.add(loaf);
    }
    tray.position.set(0, 0.12, 0.43); tray.visible = false; rig.torso.add(tray); rig.tray = tray;
  }
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

// A chart in the hands, shown when he charts at the table but the table's chart was taken by a player.
// It is part of the NPC, not an item: nothing to pick up.
export function giveChart(npc, chart) {
  const rig = npc.userData.rig;
  if (!rig) return;
  chart.scale.setScalar(0.62);
  chart.rotation.x = -0.95; // the drawn side tilted up toward his eyes
  chart.position.set(0, 0.34, 0.34);
  chart.visible = false;
  rig.torso.add(chart);
  npc.userData.chart = chart;
}

export function animateNpc(npc, dt, seconds, night = false, scene = 'ship_day', chartTaken = false) {
  const { rig, definition, motion } = npc.userData;
  if (!rig || !motion) return;
  const state = npcActivity(definition, seconds, scene, npc.userData.paused);
  const current = npcScene(definition, scene);
  const sceneId = typeof scene === 'string' ? scene : scene?.id;
  if (motion.sceneId !== sceneId) { motion.initialized = false; motion.sceneId = sceneId; }
  rig.stool.visible = !!current.seat || state.action === 'guitar' && sceneId === 'ship_evening';
  rig.cup.visible = state.action === 'toast';
  rig.rag.visible = state.action === 'kneel';
  rig.cloth.visible = state.action === 'mend';
  if (rig.tray) rig.tray.visible = state.action === 'serve' || state.walking && current.pose === 'serve';
  if (rig.guitar) rig.guitar.visible = state.action === 'guitar';
  rig.torso.position.y = 0;
  const ownChart = state.action === 'chart' && chartTaken && !!npc.userData.chart;
  if (npc.userData.chart) npc.userData.chart.visible = ownChart;
  npc.position.fromArray(state.p);
  const yaw = state.r + Math.PI;
  const angle = Math.atan2(Math.sin(yaw - npc.rotation.y), Math.cos(yaw - npc.rotation.y));
  npc.rotation.y += motion.initialized ? angle * (1 - Math.exp(-dt * 5)) : angle;
  motion.joints.forEach((j, i) => motion.previous[i].copy(j.quaternion));
  motion.hipY = rig.hip.position.y;
  const t = seconds + motion.phase, slow = Math.sin(t * 1.3), beat = Math.sin(t * 2.4);
  pose(rig, state.action, seconds * 5);
  if (state.action === 'guitar') {
    pose(rig, 'sit');
    strum(rig, t, !night);
  } else {
    switch (state.action) {
      case 'talk': // stopped for a player: faces him, nods and gestures now and then
        rig.head.rotation.set(0.08 + Math.max(0, beat) * 0.05, Math.sin(t * 0.5) * 0.12, 0);
        rig.arms[1].ua.rotation.x = -0.35 - Math.max(0, Math.sin(t * 0.9)) * 0.35;
        rig.arms[1].fa.rotation.x = -0.7 - Math.max(0, Math.sin(t * 0.9)) * 0.3;
        break;
      case 'kneel': // моет палубу: тряпка ходит взад-вперёд, корпус покачивается в такт
        rig.arms[1].ua.rotation.x = -1.7 + Math.sin(t * 3.2) * 0.28;
        rig.arms[1].fa.rotation.x = -0.4 + Math.sin(t * 3.2 + 0.6) * 0.18;
        rig.torso.rotation.y = Math.sin(t * 3.2) * 0.08;
        break;
      case 'mend': // чинит парус на коленях: правая рука с иглой тянет нить, левая держит ткань
        pose(rig, 'sit');
        rig.head.rotation.set(0.55, Math.sin(t * 0.4) * 0.1, 0);
        rig.arms[0].ua.rotation.x = -0.55; rig.arms[0].fa.rotation.x = -0.9;
        rig.arms[1].ua.rotation.x = -0.5 - Math.max(0, Math.sin(t * 1.6)) * 0.45;
        rig.arms[1].fa.rotation.x = -1.0 + Math.sin(t * 1.6) * 0.3;
        break;
      case 'walk':
        if (current.pose === 'serve') for (const arm of rig.arms) { arm.ua.rotation.x = -0.8; arm.fa.rotation.x = -0.9; }
        break;
      case 'dance':
        rig.hip.position.y -= 0.04 + Math.sin(t * 4.8) * 0.035;
        rig.hip.rotation.z = beat * 0.08; rig.torso.rotation.y = slow * 0.15;
        rig.legs.forEach((leg, i) => { leg.th.rotation.x = Math.sin(t * 2.4 + i * Math.PI) * 0.2; leg.sh.rotation.x = 0.15; });
        rig.arms.forEach((arm, i) => { arm.ua.rotation.set(-0.35, 0, arm.s * (0.6 + 0.2 * beat)); arm.fa.rotation.x = -0.9 + Math.sin(t * 2.4 + i) * 0.25; });
        rig.head.rotation.y = slow * 0.2;
        break;
      case 'serve':
        rig.head.rotation.y = slow * 0.2;
        for (const arm of rig.arms) { arm.ua.rotation.x = -0.8; arm.fa.rotation.x = -0.9; }
        break;
      case 'toast': case 'greet':
        rig.head.rotation.y = slow * 0.25;
        rig.arms[0].ua.rotation.x = -0.9 + slow * 0.15;
        rig.arms[0].fa.rotation.x = -1.25 + slow * 0.15;
        break;
      case 'listen': case 'tell':
        pose(rig, 'sit');
        rig.head.rotation.set(0.08, Math.sin(t * 0.45) * 0.08, 0);
        if (state.action === 'tell') {
          rig.arms[0].ua.rotation.x = -0.7 + slow * 0.12;
          rig.arms[0].fa.rotation.x = -0.9 + beat * 0.16;
          rig.arms[1].fa.rotation.x = -0.6 + slow * 0.1;
        }
        break;
      case 'chart':
        if (ownChart) { // reads his own chart, held in both hands
          rig.torso.rotation.x = 0.08;
          rig.head.rotation.set(0.5 + slow * 0.03, Math.sin(t * 0.4) * 0.12, 0);
          for (const arm of rig.arms) { arm.ua.rotation.set(-0.85, 0, -arm.s * 0.28); arm.fa.rotation.set(-0.95, 0, 0); }
          break;
        }
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
