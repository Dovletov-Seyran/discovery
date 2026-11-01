import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { buildShip, furlSails, slackSails } from './ship.js';
import { WATER_Y } from './hullShape.js';

// Time-of-day keys (F1.3). Everything in between is interpolated.
// el/az: sun; lel/laz: the shadow-casting light (the moon once the sun is down).
const KEYS = [
  { t: 0.40, el: 40, az: 135, lel: 40, laz: 135, light: 0xfff0da, li: 7, exp: 0.56, turb: 1.8, ray: 2.2, mie: 0.003, mieG: 0.82,
    fog: 0xb9cbd6, fogD: 0.0011, domeH: 0, domeT: 0, water: 0x15607e, dist: 2.6, env: 0.3, flow: 2.6, rock: 1, stars: 0, lamps: 0, cloud: 0.35, bloom: 0 },
  { t: 0.58, el: 24, az: 105, lel: 24, laz: 105, light: 0xffe2b8, li: 6.5, exp: 0.55, turb: 2.5, ray: 2.4, mie: 0.004, mieG: 0.85,
    fog: 0xc6c6c4, fogD: 0.0011, domeH: 0, domeT: 0, water: 0x145470, dist: 2.5, env: 0.3, flow: 2.4, rock: 0.9, stars: 0, lamps: 0, cloud: 0.4, bloom: 0 },
  { t: 0.72, el: 2.5, az: 12, lel: 7, laz: 14, light: 0xff9a55, li: 5, exp: 0.55, turb: 5, ray: 2.8, mie: 0.006, mieG: 0.9,
    fog: 0xc89a7a, fogD: 0.0012, domeH: 0.1, domeT: 0, water: 0x123a4c, dist: 2.0, env: 0.3, flow: 2.0, rock: 0.8, stars: 0, lamps: 1, cloud: 0.45, bloom: 0.25 },
  { t: 0.85, el: -3, az: 8, lel: 28, laz: -40, light: 0x7c7ab8, li: 1.0, exp: 0.9, turb: 3, ray: 3, mie: 0.005, mieG: 0.85,
    fog: 0x3c3a58, fogD: 0.004, domeH: 0.55, domeT: 0.2, water: 0x0c2030, dist: 1.0, env: 0.4, flow: 0.6, rock: 0.4, stars: 0.6, lamps: 1, cloud: 0.3, bloom: 0.5 },
  { t: 0.95, el: -20, az: 0, lel: 35, laz: -50, light: 0x6a7fa8, li: 0.6, exp: 1.0, turb: 2, ray: 1, mie: 0.005, mieG: 0.8,
    fog: 0x232c38, fogD: 0.028, domeH: 0.97, domeT: 0.85, water: 0x081620, dist: 0.2, env: 0.3, flow: 0, rock: 0.08, stars: 0.25, lamps: 1, cloud: 0, bloom: 0.6 },
];
const COLORS = ['light', 'fog', 'water'];

function sample(t) {
  const k = KEYS;
  t = THREE.MathUtils.clamp(t, k[0].t, k[k.length - 1].t);
  let i = 0;
  while (i < k.length - 2 && k[i + 1].t < t) i++;
  const a = k[i], b = k[i + 1], f = (t - a.t) / (b.t - a.t), s = f * f * (3 - 2 * f), out = {};
  for (const key of Object.keys(a)) {
    out[key] = COLORS.includes(key) ? new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), s) : a[key] + (b[key] - a[key]) * s;
  }
  return out;
}

const dirFrom = (el, az, out = new THREE.Vector3()) => {
  const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
};

// Shallows: over an island's coarse height map (islandLod data) the sea turns turquoise where it is shallow and
// pales to sand at the water's edge; deep water keeps the reflective blue. shoreRect: x0, z0, size, 0 = off.
const SHALLOW = /* glsl */ `
  if (shoreRect.z > 0.0) {
    vec2 suv = (worldPosition.xz - shoreRect.xy) / shoreRect.z;
    if (all(greaterThan(suv, vec2(0.0))) && all(lessThan(suv, vec2(1.0)))) {
      float depth = -(texture2D(shoreMap, suv).r * 30.0 - 10.0);
      float k = 1.0 - smoothstep(0.3, 7.0, depth);
      vec3 shallow = mix(shallowDeep, shallowEdge, 1.0 - smoothstep(0.1, 1.8, depth)) * (diffuseLight * 0.8 + 0.2);
      outgoingLight = mix(albedo, shallow + reflectionSample * 0.3 * reflectance + specularLight, k * 0.9);
    }
  }`;

function patchWater(water) {
  const u = water.material.uniforms;
  u.flow = { value: new THREE.Vector2() };
  u.shoreMap = { value: null }; u.shoreRect = { value: new THREE.Vector4() };
  u.shallowDeep = { value: new THREE.Color(0x1aa39b) }; u.shallowEdge = { value: new THREE.Color(0x9fd6c4) };
  const before = water.material.fragmentShader;
  water.material.fragmentShader = before
    .replace('varying vec4 worldPosition;', 'varying vec4 worldPosition;\nuniform vec2 flow;\nuniform sampler2D shoreMap;\nuniform vec4 shoreRect;\nuniform vec3 shallowDeep, shallowEdge;')
    .replace('vec3 outgoingLight = albedo;', 'vec3 outgoingLight = albedo;' + SHALLOW)
    .replace('getNoise( worldPosition.xz * size )', 'getNoise( ( worldPosition.xz + flow ) * size )')
    // the stock diffuse term greys the sea out; tint it with the water colour instead
    .replace('( sunColor * diffuseLight * 0.3 + scatter )', '( waterColor * diffuseLight * 0.45 + scatter )')
    .replace('reflectionSample + specularLight, reflectance', 'reflectionSample * 0.55 + specularLight, reflectance');
  if (water.material.fragmentShader.split('flow').length < 3 || !water.material.fragmentShader.includes('shoreRect.z')) console.warn('[world] Water shader patch did not apply');
}

// Sky, sea, light, fog, the other two ships and the rocking of the horizon.
// The ship itself never moves: rocking tilts the environment instead, so colliders and
// player coordinates stay put while the view looks the same.
export class Environment {
  constructor(scene, renderer, M, tex, quality) {
    this.scene = scene; this.renderer = renderer; this.M = M; this.tex = tex;
    this.root = new THREE.Group(); scene.add(this.root);
    this.t = 0.4; this.target = 0.4; this.time = 0; this.flowPos = new THREE.Vector2();
    this.sunDir = new THREE.Vector3(); this.lightDir = new THREE.Vector3();
    this.p = sample(0.4);
    this.lamps = [];
    this.sails = [];
    this.fleetIn = {};
    this.mirrorHide = []; // small things nobody sees reflected from the deck

    this.sky = new Sky(); this.sky.scale.setScalar(10000); this.root.add(this.sky);
    // look up the sky in the rocking frame, so its horizon tilts together with the sea
    this.sky.material.uniforms.skyRot = { value: new THREE.Matrix3() };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform float mieDirectionalG;', 'uniform float mieDirectionalG;\nuniform mat3 skyRot;')
      .replace('normalize( vWorldPosition - cameraPosition )', 'normalize( skyRot * ( vWorldPosition - cameraPosition ) )');
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      uniforms: { color: { value: new THREE.Color() }, aH: { value: 0 }, aT: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 color; uniform float aH, aT; varying vec3 vDir;
        void main(){ gl_FragColor = vec4(color, mix(aH, aT, smoothstep(0.0, 0.5, vDir.y)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.root.add(this.dome);

    // environment map is rendered from a copy of sky + dome
    this.envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(10000); sky2.material = this.sky.material;
    this.envScene.add(sky2, new THREE.Mesh(this.dome.geometry, this.dome.material));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.envAt = -1e9; this.envT = -1;

    const starPos = [];
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * Math.PI * 2, y = Math.random() * 0.95 + 0.05, r = Math.sqrt(1 - y * y);
      starPos.push(Math.cos(a) * r * 4000, y * 4000, Math.sin(a) * r * 4000);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.root.add(this.stars);

    this.light = new THREE.DirectionalLight(0xffffff, 3);
    this.light.shadow.mapSize.set(2048, 2048);
    Object.assign(this.light.shadow.camera, { left: -16, right: 16, top: 18, bottom: -18, near: 1, far: 120 });
    this.light.shadow.camera.updateProjectionMatrix();
    this.light.shadow.bias = -0.0004; this.light.shadow.normalBias = 0.03; this.light.shadow.radius = 3;
    this.light.target.position.set(0, 4, -1);
    this.root.add(this.light, this.light.target);

    this.scene.fog = new THREE.FogExp2(0xb9cbd6, 0.0011);


    // At sea «Пинта» and «Нинья» keep station with us; at La Gomera all three ride at anchor in the bay,
    // well off the pier: the crews go ashore in the boat.
    this.zone = 'ship';
    this.fleet = [];
    const FLEET = [
      { opts: {}, s: 0.85, sea: [62, -150, 0.06], bay: [298, 400, 0.5], guanahani: [36, 226, -1.45] },
      { opts: { lateen: true }, s: 0.72, sea: [-120, -280, -0.05], bay: [222, 404, -0.45], guanahani: [30, 288, -1.75] },
      { opts: {}, s: 1, sea: null, bay: [262, 412, -0.35], guanahani: [44, 256, -1.6] }, // the Santa María herself (starboard to the cutscene camera), seen from the island
    ];
    for (const f of FLEET) {
      const { group, sails } = buildShip(M, { far: true, ...f.opts });
      group.scale.setScalar(f.s);
      group.userData = { ...f, sails, phase: Math.random() * 10 };
      this.root.add(group); this.fleet.push(group);
    }
    this.focus = new THREE.Vector3();

    this.setQuality(quality);
    this.setZone('ship');
  }

  // 'ship' — open sea, the world is the deck; an island ('canary', 'guanahani') — island coordinates, sea level 0.
  // At La Gomera the fleet rides at anchor in the bay; off Guanahani only once setFleet('guanahani', true) says so
  // (on 11 October there are no ships yet).
  setZone(zone) {
    this.zone = zone;
    const sea = zone === 'ship', waterY = sea ? WATER_Y : 0;
    this.water.position.y = waterY;
    for (const f of this.fleet) {
      const u = f.userData, at = sea ? u.sea : zone === 'canary' ? u.bay : this.fleetIn[zone] ? u[zone] : null;
      f.visible = !!at;
      if (!at) continue;
      f.position.set(at[0], waterY + 2.25 * f.userData.s, at[1]); f.rotation.set(0, at[2], 0);
      f.userData.base = f.position.clone();
      furlSails(f.userData.sails, sea ? 0 : 1); // at anchor in the bay the sails are furled
    }
    if (sea) this.light.target.position.set(0, 4, -1);
    this.apply(true);
  }

  // A cutscene sails fleet[i] (0 Pinta, 1 Niña, 2 Santa María) to (x, z) with the bow turned by `heading`.
  // lod: { size, res, h } of the island under the sea here, or null on the open sea (see SHALLOW)
  setShore(lod) {
    this.shore = lod;
    if (lod && !lod.tex) {
      const n = lod.res, px = new Uint8Array(n * n * 4);
      lod.h.forEach((h, i) => { px[i * 4] = Math.round(THREE.MathUtils.clamp((h + 10) / 30, 0, 1) * 255); px[i * 4 + 3] = 255; });
      lod.tex = new THREE.DataTexture(px, n, n, THREE.RGBAFormat);
      lod.tex.magFilter = lod.tex.minFilter = THREE.LinearFilter;
      lod.tex.needsUpdate = true;
    }
    this.applyShore();
  }

  applyShore() {
    if (!this.water) return;
    const u = this.water.material.uniforms, l = this.shore;
    u.shoreMap.value = l?.tex ?? null;
    // texel centres: node i sits at i·step, so the map spans −step/2 … size + step/2
    if (l) { const step = l.size / (l.res - 1); u.shoreRect.value.set(-step / 2, -step / 2, l.size + step, 1); } else u.shoreRect.value.set(0, 0, 0, 0);
  }

  setFleet(zone, present) {
    this.fleetIn[zone] = present;
    if (this.zone === zone) this.setZone(zone);
  }

  placeShip(i, x, z, heading) {
    const f = this.fleet[i];
    if (!f.visible) { f.visible = true; f.position.y = 2.25 * f.userData.s; f.userData.base = f.position.clone(); }
    f.position.x = x; f.position.z = z; f.rotation.y = heading;
    f.userData.base.x = x; f.userData.base.z = z;
  }

  setQuality(q) {
    this.quality = q;
    if (this.water) { this.root.remove(this.water); this.water.geometry.dispose(); this.water.material.dispose(); }
    const size = q === 'low' ? 256 : 512;
    this.water = new Water(new THREE.PlaneGeometry(12000, 12000), {
      textureWidth: size, textureHeight: size, waterNormals: this.tex.water.normalMap,
      sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xfff1d6, waterColor: 0x15607e, distortionScale: 2.6, fog: true,
    });
    patchWater(this.water);
    this.applyShore();
    const reflect = this.water.onBeforeRender;
    this.water.onBeforeRender = (...args) => {
      const hidden = this.mirrorHide.filter((o) => o.visible);
      hidden.forEach((o) => (o.visible = false));
      reflect(...args);
      hidden.forEach((o) => (o.visible = true));
    };
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.zone === 'ship' ? WATER_Y : 0;
    this.water.material.uniforms.size.value = 1.3;
    this.root.add(this.water);
    this.light.castShadow = q !== 'low';
    this.apply(true);
  }

  setTimeOfDay(t, immediate = false) {
    this.target = t;
    if (immediate) { this.t = t; this.apply(true); }
  }

  addLamps(lights) { this.lamps.push(...lights); }
  addSails(sails) { this.sails.push(...sails); } // the player's ship; the fleet's own are in userData.sails

  apply(forceEnv = false) {
    const p = (this.p = sample(this.t)), q = this.root.quaternion;
    dirFrom(p.el, p.az, this.sunDir);
    dirFrom(p.lel, p.laz, this.lightDir);
    const sunW = this.sunDir.clone().applyQuaternion(q);
    const su = this.sky.material.uniforms;
    su.turbidity.value = p.turb; su.rayleigh.value = p.ray; su.mieCoefficient.value = p.mie; su.mieDirectionalG.value = p.mieG;
    su.sunPosition.value.copy(this.sunDir);
    su.skyRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert()));
    su.cloudCoverage.value = p.cloud;
    this.light.position.copy(this.light.target.position).addScaledVector(this.lightDir, 50);
    this.light.color.copy(p.light); this.light.intensity = p.li;
    this.renderer.toneMappingExposure = p.exp;
    // on the island a light coastal haze; the far side is the coarse island (islandLod.js), not an edge to hide
    this.scene.fog.color.copy(p.fog); this.scene.fog.density = this.zone !== 'ship' ? Math.max(p.fogD, 0.0035) : p.fogD;
    const du = this.dome.material.uniforms;
    du.color.value.copy(p.fog); du.aH.value = p.domeH; du.aT.value = p.domeT;
    this.dome.visible = p.domeH > 0.001;
    this.stars.material.opacity = p.stars; this.stars.visible = p.stars > 0.01;
    const wu = this.water.material.uniforms;
    wu.waterColor.value.copy(p.water); wu.distortionScale.value = p.dist;
    wu.sunDirection.value.copy(sunW.y > 0 ? sunW : this.lightDir.clone().applyQuaternion(q));
    wu.sunColor.value.copy(p.light);
    this.scene.environmentIntensity = p.env;
    this.M.get('lampGlass').emissiveIntensity = 0.3 + p.lamps * 3;
    // sails glow a little in daylight (translucent canvas), not in the dark
    this.daylight = THREE.MathUtils.clamp(p.li / 7, 0, 1);
    this.M.get('sail').emissiveIntensity = this.M.get('sailCross').emissiveIntensity = 0.09 * this.daylight;
    const now = performance.now();
    if (forceEnv || (Math.abs(this.t - this.envT) > 0.005 && now - this.envAt > 2000)) {
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 20000);
      this.scene.environment = this.envRT.texture;
      old?.dispose();
      this.envAt = now; this.envT = this.t;
    }
  }

  get bloom() { return this.p.bloom; }

  // focus: where the player is — on the island the shadow map follows it
  update(dt, focus) {
    this.time += dt;
    if (Math.abs(this.target - this.t) > 1e-4) this.t += (this.target - this.t) * Math.min(1, dt / 2);
    if (this.zone !== 'ship' && focus) {
      // snapped to half a metre so the shadow edges do not crawl
      this.light.target.position.set(Math.round(focus.x * 2) / 2, Math.round(focus.y * 2) / 2, Math.round(focus.z * 2) / 2);
    }
    // rocking: ≤ 1.5° roll, 6–8 s period, almost nothing at night; none on land
    const sea = this.zone === 'ship', a = sea ? this.p.rock : 0, T = this.time, bob = sea ? a : 0.35;
    const roll = THREE.MathUtils.degToRad(1.2) * a * Math.sin(T * Math.PI * 2 / 7.2);
    const pitch = THREE.MathUtils.degToRad(0.45) * a * Math.sin(T * Math.PI * 2 / 9.4 + 1.3);
    this.root.rotation.set(-pitch, 0, -roll);
    this.root.position.y = -0.12 * a * Math.sin(T * Math.PI * 2 / 6.1);
    for (const f of this.fleet) {
      if (!f.visible) continue; // the Santa María copy exists only for the view from the island
      const ph = f.userData.phase;
      f.rotation.z = THREE.MathUtils.degToRad(1.6) * bob * Math.sin(T * 0.9 + ph);
      f.rotation.x = THREE.MathUtils.degToRad(0.6) * bob * Math.sin(T * 0.67 + ph);
      f.position.y = f.userData.base.y + 0.15 * bob * Math.sin(T * 1.03 + ph);
    }
    // the sea runs past the hull; the ship "moves" west
    if (sea) this.flowPos.y -= this.p.flow * dt;
    const wu = this.water.material.uniforms;
    wu.flow.value.copy(this.flowPos);
    wu.time.value += dt * (0.25 + 0.35 * a);
    this.sky.material.uniforms.time.value += dt;
    const flick = 0.85 + 0.15 * Math.sin(T * 13.1) * Math.sin(T * 7.3 + 1);
    // switched-off lamps leave the shader entirely (one recompile at dusk instead of three lights every frame)
    // the wind dies with the evening (flow 2 → 0): sails go slack in the night calm
    const slack = THREE.MathUtils.clamp(1 - this.p.flow / 2, 0, 1);
    slackSails(this.sails, slack);
    for (const f of this.fleet) slackSails(f.userData.sails, slack);
    // a cutscene may light them one by one (lampScale per lamp); they stay in the shader meanwhile, no recompiles
    this.lamps.forEach((l, i) => {
      const k = this.lampScale ? this.lampScale[i] ?? 1 : 1;
      l.visible = this.p.lamps > 0.01; l.intensity = this.p.lamps * k * 4 * flick;
    });
    this.apply();
  }
}
