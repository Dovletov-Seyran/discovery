import * as THREE from 'three';
// Макана — плоская дубинка-меч таино из твёрдого пальмового дерева: рукоять с петлёй, расширяющийся клинок
// с тупыми кромками. Одна модель в руке игрока, у воинов на батее и в снаряжении. Начало — рукоять, клинок по +Y.
export function macana() {
  const root = new THREE.Group(); root.name = 'macana';
  const material = (color, roughness) => { const m = new THREE.MeshStandardMaterial({ color, roughness }); m.userData.equipmentOwned = true; return m; };
  const wood = material(0x3e2a1c, 0.72), grain = material(0x2a1b12, 0.85), cord = material(0xcdbf9c, 0.95), paint = material(0x8a2a1c, 0.8);
  const add = (geo, mat, p = [0, 0, 0], r = [0, 0, 0]) => { const o = new THREE.Mesh(geo, mat); o.position.fromArray(p); o.rotation.set(...r); o.castShadow = o.receiveShadow = true; root.add(o); return o; };
  // клинок: от узкой шейки над рукоятью к широкому скруглённому концу, толщина 3 см
  const blade = new THREE.Shape();
  blade.moveTo(-0.022, 0.12); blade.lineTo(-0.045, 0.45); blade.quadraticCurveTo(-0.075, 0.78, -0.05, 0.9);
  blade.quadraticCurveTo(0, 0.95, 0.05, 0.9); blade.quadraticCurveTo(0.075, 0.78, 0.045, 0.45); blade.lineTo(0.022, 0.12); blade.closePath();
  const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2, steps: 1 });
  geo.translate(0, 0, -0.015);
  add(geo, wood);
  add(new THREE.BoxGeometry(0.004, 0.62, 0.034), grain, [0, 0.55, 0]); // ребро посередине клинка
  for (const y of [0.62, 0.7]) add(new THREE.BoxGeometry(0.11, 0.012, 0.036), paint, [0, y, 0]); // красные полосы
  add(new THREE.CylinderGeometry(0.019, 0.021, 0.2, 10), wood, [0, 0.03, 0]); // рукоять
  for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(0.021, 0.004, 4, 10), cord, [0, -0.04 + i * 0.03, 0], [Math.PI / 2, 0, 0]); // обмотка
  add(new THREE.TorusGeometry(0.035, 0.005, 4, 12), cord, [0, -0.1, 0]); // петля на запястье
  return { obj: root };
}
