import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mesh, boxGeo, cylGeo, lathe } from '../world/geom.js';
import { MODELS } from '../world/props.js';
import { Book } from './book.js';
import { buildColumbus, poseLean } from './columbus.js';
import { drawWorldChart, drawUnknownLand, drawGlobe } from './pages.js';

// Columbus's study for panels 1–5: a table under a window, a candle, the book, the chart, a globe.
// Built from Фронт 1's materials (procedural wood, brass, iron), so it matches the ship.
// Table top at y = TABLE; x across the table, Columbus stands at −z facing +z, the camera is on the +z side.

export const TABLE = 0.9;

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function chart(map, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 30, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), e = Math.abs(x) / (w / 2);
    p.setZ(i, Math.pow(Math.max(0, e - 0.86) / 0.14, 2) * 0.03); // the ends curl up
  }
  g.computeVertexNormals(); g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, roughness: 0.88, side: THREE.DoubleSide }));
}

function candle(M) {
  const g = new THREE.Group();
  const dish = lathe([[0, 0], [0.07, 0.004], [0.075, 0.012], [0.02, 0.014], [0.02, 0.03], [0, 0.03]], 24);
  g.add(mesh(dish, M.get('brass')));
  const wax = new THREE.MeshStandardMaterial({ color: 0xefe3c8, roughness: 0.55, emissive: 0x6a3a10, emissiveIntensity: 0.25 });
  g.add(mesh(cylGeo(0.018, 0.019, 0.17, 20).translate(0, 0.115, 0), wax));
  const drip = new THREE.SphereGeometry(0.008, 8, 6); drip.scale(1, 2.2, 1); drip.translate(0.017, 0.17, 0.004);
  g.add(mesh(drip, wax));
  g.add(mesh(cylGeo(0.0015, 0.0015, 0.012, 4).translate(0, 0.205, 0), M.get('black')));
  const flame = new THREE.SphereGeometry(0.009, 12, 10); flame.scale(1, 2.6, 1); flame.translate(0, 0.226, 0);
  const fm = mesh(flame, M.get('flame'), false, false);
  g.add(fm);
  const light = new THREE.PointLight(0xffa850, 2.2, 5, 1.6);
  light.position.set(0, 0.25, 0); light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.002;
  g.add(light);
  g.userData = { flame: fm, light };
  return g;
}

// Brass dividers: two legs hinged at the top; spread(a) opens them, the hinge stays put.
function dividers(M) {
  const g = new THREE.Group(), legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.add(mesh(cylGeo(0.0035, 0.0012, 0.17, 8).translate(0, -0.085, 0), M.get('iron')));
    legs.push(leg); g.add(leg);
    leg.userData.s = s;
  }
  g.add(mesh(new THREE.SphereGeometry(0.009, 12, 8), M.get('brass')));
  g.userData.spread = (a) => { for (const l of legs) l.rotation.z = l.userData.s * a; };
  g.userData.spread(0.25);
  return g;
}

function globe(M) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.11, 0], [0.11, 0.02], [0.05, 0.04], [0.025, 0.12], [0.03, 0.14], [0, 0.14]], 28), M.get('wood')));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 48, 32), new THREE.MeshStandardMaterial({ map: canvasTex(drawGlobe()), roughness: 0.5 }));
  ball.position.y = 0.29; ball.rotation.z = 0.4; ball.castShadow = true;
  g.add(ball);
  const ring = new THREE.TorusGeometry(0.142, 0.006, 8, 64); ring.rotateY(Math.PI / 2); ring.rotateX(0.4);
  const rm = mesh(ring, M.get('brass')); rm.position.y = 0.29; g.add(rm);
  g.userData.ball = ball;
  return g;
}

function inkwell(M) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.035, 0], [0.04, 0.03], [0.02, 0.05], [0.014, 0.06], [0, 0.06]], 20), M.get('black')));
  const quill = new THREE.ConeGeometry(0.012, 0.3, 6); quill.scale(1, 1, 0.25); quill.translate(0, 0.15, 0);
  const q = mesh(quill, new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.7, side: THREE.DoubleSide }));
  q.position.set(0, 0.04, 0); q.rotation.set(0.35, 0, -0.45);
  g.add(q);
  return g;
}

function room(M) {
  const g = new THREE.Group();
  const floor = mesh(boxGeo(8, 0.1, 8, 0, -0.05, 0), M.get('deck'), false, true);
  g.add(floor);
  // back wall with a window on the left
  // the ship's plank texture, a little darker and cooler indoors
  const wallMat = M.get('wall').clone(); wallMat.color.set(0xa8988a);
  const W0 = -1.7, W1 = -0.7, Y0 = 1.15, Y1 = 2.45, Z = -1.7, T = 0.12;
  for (const [x0, x1, y0, y1] of [[-4, W0, 0, 3.4], [W1, 4, 0, 3.4], [W0, W1, 0, Y0], [W0, W1, Y1, 3.4]]) {
    g.add(mesh(boxGeo(x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, Z), wallMat, true, true));
  }
  // window: frame, mullions, bright glass
  const trim = M.get('trim');
  for (const [w, h, x, y] of [[W1 - W0 + 0.1, 0.07, (W0 + W1) / 2, Y0], [W1 - W0 + 0.1, 0.07, (W0 + W1) / 2, Y1], [0.07, Y1 - Y0, W0, (Y0 + Y1) / 2], [0.07, Y1 - Y0, W1, (Y0 + Y1) / 2], [0.04, Y1 - Y0, (W0 + W1) / 2, (Y0 + Y1) / 2], [W1 - W0, 0.04, (W0 + W1) / 2, (Y0 + Y1) / 2]]) {
    g.add(mesh(boxGeo(w, h, 0.14, x, y, Z), trim));
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W1 - W0, Y1 - Y0), new THREE.MeshBasicMaterial({ color: 0xffe2b0, fog: false }));
  glass.position.set((W0 + W1) / 2, (Y0 + Y1) / 2, Z - 0.03);
  g.add(glass);
  // side wall and a shelf with books
  g.add(mesh(boxGeo(T, 3.4, 6, 2.4, 1.7, 1.2), wallMat, false, true));
  g.add(mesh(boxGeo(0.35, 0.04, 1.6, 2.2, 1.6, -0.6), trim));
  const colors = [0x5a2e1a, 0x2f3a4a, 0x6a4a22, 0x3a2418, 0x4a1e1c, 0x2a3424];
  for (let i = 0; i < 14; i++) {
    const h = 0.22 + (i * 37 % 9) * 0.012, th = 0.04 + (i * 13 % 5) * 0.008;
    g.add(mesh(boxGeo(0.24, h, th, 2.2, 1.62 + h / 2, -1.3 + i * 0.075), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 })));
  }
  return g;
}

export class Study {
  constructor(M, renderer) {
    this.M = M;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x120c08);
    this.scene.fog = new THREE.Fog(0x120c08, 4, 9);
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    pm.dispose();

    this.scene.add(room(M));

    // the table
    const table = new THREE.Group();
    table.add(mesh(boxGeo(1.9, 0.07, 1.05, 0, TABLE - 0.035, 0), M.get('wood')));
    for (const [x, z] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) table.add(mesh(boxGeo(0.08, TABLE - 0.07, 0.08, x, (TABLE - 0.07) / 2, z), M.get('trim')));
    table.add(mesh(boxGeo(1.7, 0.1, 0.04, 0, TABLE - 0.12, 0.47), M.get('trim')), mesh(boxGeo(1.7, 0.1, 0.04, 0, TABLE - 0.12, -0.47), M.get('trim')));
    this.scene.add(table);

    // light: warm morning sun through the window, a candle, a little bounce
    const sun = new THREE.DirectionalLight(0xffe0b0, 3.2);
    sun.position.set(-1.6, 3.2, -4.2); sun.target.position.set(0, TABLE, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 10 });
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0x9a8a74, 0x1a120c, 0.5));
    const fill = new THREE.PointLight(0xffd8a8, 0.6, 6, 2); fill.position.set(0.6, 2.2, 1.6); this.scene.add(fill);
    // soft key light on Columbus's face from the camera's side (the window is behind him)
    const key = new THREE.SpotLight(0xffe6c8, 6, 4, 0.35, 0.8, 1.5);
    key.position.set(0.9, 2.1, 1.1); key.target.position.set(0.15, 1.55, -0.35);
    this.scene.add(key, key.target);

    // props on the table
    this.book = new Book(M);
    this.book.group.position.set(-0.45, TABLE, 0.12);
    this.book.group.rotation.y = 0.08;
    this.scene.add(this.book.group);

    this.chartMap = canvasTex(drawWorldChart());
    this.chart = chart(this.chartMap, 0.92, 0.61);
    this.chart.position.set(0.22, TABLE + 0.002, 0.02);
    this.chart.receiveShadow = true;
    this.scene.add(this.chart);
    this.unknown = new THREE.Mesh(this.chart.geometry, new THREE.MeshStandardMaterial({ map: canvasTex(drawUnknownLand()), transparent: true, opacity: 0, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.unknown.position.copy(this.chart.position).add(new THREE.Vector3(0, 0.0015, 0));
    this.scene.add(this.unknown);

    this.candle = candle(M); this.candle.position.set(-0.78, TABLE, -0.3); this.scene.add(this.candle);
    this.globe = globe(M); this.globe.position.set(0.78, TABLE, -0.28); this.scene.add(this.globe);
    const compass = MODELS.compass(M).obj; compass.position.set(0.66, TABLE, 0.32); compass.scale.setScalar(0.7); this.scene.add(compass);
    const astro = MODELS.astrolabe(M).obj; astro.position.set(-0.18, TABLE, -0.3); astro.rotation.y = 0.6; this.scene.add(astro);
    const ink = inkwell(M); ink.position.set(-0.62, TABLE, -0.2); this.scene.add(ink);
    this.dividers = dividers(M); this.dividers.position.set(0.4, TABLE + 0.165, 0.02); this.scene.add(this.dividers);

    // Columbus behind the table
    this.columbus = buildColumbus(M);
    this.columbus.root.position.set(0.15, 0, -0.62);
    poseLean(this.columbus);
    this.columbus.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(this.columbus.root);

    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    const T = this.time, f = 0.82 + 0.1 * Math.sin(T * 11.3) + 0.08 * Math.sin(T * 23.7 + 1.3);
    this.candle.userData.light.intensity = 2.2 * f;
    this.candle.userData.flame.scale.set(1, 0.9 + 0.15 * f, 1);
    this.candle.userData.flame.rotation.z = 0.05 * Math.sin(T * 3.1);
    this.globe.userData.ball.rotation.y = T * 0.08;
  }
}
