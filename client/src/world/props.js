import * as THREE from 'three';
import { V3, mesh, cylGeo, lenUV, boxGeo, lathe, bake } from './geom.js';
import { person, pose, guitarist, NPC_LOOK } from './people.js';
import {espingarda} from './espingarda.js';

// Builders for every model id (`m`) that content/ship_layout.json may use.
// Each returns { obj, col?: BufferGeometry[] (local space) }.

function barrelBody(M) {
  const h = 0.95, g = new THREE.Group(), prof = [];
  for (let i = 0; i <= 10; i++) prof.push([0.29 + 0.06 * Math.sin(Math.PI * i / 10), h * i / 10]);
  g.add(mesh(lenUV(lathe(prof, 22), h, 2.1), M.get('stave')));
  const lid = new THREE.CircleGeometry(0.285, 22); lid.rotateX(-Math.PI / 2); lid.translate(0, h - 0.03, 0);
  g.add(mesh(lid, M.get('stave')));
  for (const t of [0.1, 0.28, 0.72, 0.9]) {
    const tg = new THREE.TorusGeometry(0.29 + 0.06 * Math.sin(Math.PI * t) + 0.006, 0.014, 4, 24);
    tg.rotateX(Math.PI / 2); tg.translate(0, h * t, 0); g.add(mesh(tg, M.get('iron')));
  }
  return g;
}

function crate(M, s) {
  const g = new THREE.Group(), e = 0.06;
  g.add(mesh(boxGeo(s, s, s, 0, s / 2, 0), M.get('wall')));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(boxGeo(e, s + 0.01, e, x * s / 2, s / 2, z * s / 2), M.get('trim')));
  for (const y of [0, s]) {
    g.add(mesh(boxGeo(s + e, e, e, 0, y, s / 2), M.get('trim')), mesh(boxGeo(s + e, e, e, 0, y, -s / 2), M.get('trim')));
    g.add(mesh(boxGeo(e, e, s + e, s / 2, y, 0), M.get('trim')), mesh(boxGeo(e, e, s + e, -s / 2, y, 0), M.get('trim')));
  }
  return g;
}

function ropeCoil(M, r1 = 0.42, turns = 4.5) {
  const pts = [];
  for (let i = 0; i <= 160; i++) { const t = i / 160, a = t * Math.PI * 2 * turns, r = 0.08 + (r1 - 0.08) * t; pts.push(new V3(Math.cos(a) * r, 0.035, Math.sin(a) * r)); }
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.034, 7), M.get('rope'));
}

function lanternHead(M) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 6), M.get('iron')));
  const gl = new THREE.CylinderGeometry(0.13, 0.11, 0.3, 6, 1, true); gl.translate(0, 0.18, 0);
  g.add(mesh(gl, M.get('lampGlass'), false));
  const cap = new THREE.ConeGeometry(0.17, 0.16, 6); cap.translate(0, 0.41, 0); g.add(mesh(cap, M.get('iron')));
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, b = new THREE.BoxGeometry(0.02, 0.32, 0.02); b.translate(Math.cos(a) * 0.125, 0.18, Math.sin(a) * 0.125); g.add(mesh(b, M.get('iron'))); }
  const ring = new THREE.TorusGeometry(0.05, 0.01, 4, 10); ring.translate(0, 0.53, 0); g.add(mesh(ring, M.get('iron')));
  const light = new THREE.PointLight(0xffb45a, 0, 12, 2);
  light.position.y = 0.2; light.userData.lamp = true;
  g.add(light);
  return g;
}

function compassCard(ctx, S) {
  ctx.fillStyle = '#efe4c6'; ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, S * 0.46, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 32; i++) { ctx.rotate(Math.PI / 16); ctx.beginPath(); ctx.moveTo(0, -S * 0.39); ctx.lineTo(0, -S * 0.46); ctx.stroke(); }
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4); ctx.fillStyle = i % 2 ? '#2a3a6a' : '#8a1f1a';
    ctx.beginPath(); ctx.moveTo(0, i % 2 ? -S * 0.27 : -S * 0.39); ctx.lineTo(S * 0.04, 0); ctx.lineTo(-S * 0.04, 0); ctx.closePath(); ctx.fill();
  }
}

// Portolan-style chart: rhumb lines from compass roses, the known coast to the east, the unknown west.
function seaChart(ctx, S) {
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, '#ecdcb4'); g.addColorStop(1, '#c9ad78');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const roses = [[S * 0.62, S * 0.45], [S * 0.28, S * 0.55]];
  ctx.lineWidth = 1;
  for (const [cx, cy] of roses) for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(40,40,40,0.45)' : i % 2 ? 'rgba(160,40,30,0.35)' : 'rgba(40,90,50,0.35)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * S, cy + Math.sin(a) * S); ctx.stroke();
  }
  ctx.fillStyle = '#b89a62'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
  ctx.beginPath();
  const coast = [[0.86, 0], [0.8, 0.12], [0.84, 0.22], [0.78, 0.3], [0.8, 0.42], [0.74, 0.5], [0.78, 0.62], [0.72, 0.74], [0.76, 0.88], [0.7, 1], [1, 1], [1, 0]];
  coast.forEach(([x, y], i) => (i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)));
  ctx.fill(); ctx.stroke();
  for (const [x, y, r] of [[0.66, 0.62, 0.012], [0.63, 0.64, 0.01], [0.6, 0.6, 0.014], [0.2, 0.36, 0.035], [0.12, 0.6, 0.025]]) {
    ctx.beginPath(); ctx.ellipse(x * S, y * S, r * S * 1.4, r * S, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(60,35,20,0.85)'; ctx.font = `italic ${S * 0.045}px serif`; ctx.textAlign = 'center';
  ctx.fillText('Mare Tenebrosum', S * 0.42, S * 0.3);
  ctx.font = `italic ${S * 0.03}px serif`; ctx.fillText('Antillia', S * 0.2, S * 0.43); ctx.fillText('Insulae Canariae', S * 0.6, S * 0.7);
}

function chest(M,w,h,d,arched){
  const g=new THREE.Group(),wall=M.get('wall'),iron=M.get('iron');
  // Actual hollow body, so opening the lid reveals an interior.
  g.add(mesh(boxGeo(w,.06,d,0,.03,0),wall));
  for(const side of [-1,1]){
    g.add(mesh(boxGeo(.06,h,d,side*(w/2-.03),h/2,0),wall));
    g.add(mesh(boxGeo(w,h,.06,0,h/2,side*(d/2-.03)),wall));
  }
  const pivot=new THREE.Group();pivot.position.set(0,h,-d/2);pivot.userData.noBake=true;g.add(pivot);
  if(arched){
    const outline=new THREE.Shape();outline.moveTo(-d/2,0);
    for(let i=0;i<=24;i++){const t=Math.PI-i*Math.PI/24;outline.lineTo(Math.cos(t)*d/2,Math.sin(t)*d/2);}
    outline.closePath();
    const cap=new THREE.ExtrudeGeometry(outline,{depth:w,steps:1,bevelEnabled:false});
    // Shape X becomes chest Z; extrusion Z becomes chest X.
    cap.rotateY(-Math.PI/2);cap.translate(w/2,0,d/2);
    pivot.add(mesh(cap,wall));
    for(const x of [-w*.33,w*.33]){
      const points=[];for(let i=0;i<=24;i++){const t=Math.PI-i*Math.PI/24;points.push(new THREE.Vector3(x,Math.sin(t)*(d/2+.009),d/2+Math.cos(t)*(d/2+.009)));}
      pivot.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.014,5,false),iron));
    }
  }else{
    pivot.add(mesh(boxGeo(w+.04,.065,d+.04,0,.03,d/2),M.get('trim')));
    for(const x of [-w*.33,w*.33])pivot.add(mesh(boxGeo(.045,.073,d+.05,x,.035,d/2),iron));
  }
  g.add(mesh(boxGeo(.1,.12,.03,0,h-.08,d/2+.02),M.get('brass')));
  g.userData.setOpen=value=>{pivot.rotation.x=-value*1.65;};
  const col=[boxGeo(w,.06,d,0,.03,0)];
  for(const side of [-1,1])col.push(boxGeo(.06,h,d,side*(w/2-.03),h/2,0),boxGeo(w,h,.06,0,h/2,side*(d/2-.03)));
  return {obj:g,col};
}

export const MODELS = {
  cup: M=>{
    const obj=new THREE.Group();
    obj.add(mesh(lathe([[.06,0],[.075,.02],[.085,.18],[.073,.18],[.064,.03],[0,.03]],16),M.get('wood')));
    const handle=mesh(new THREE.TorusGeometry(.055,.012,6,16),M.get('trim'));handle.position.set(.085,.105,0);obj.add(handle);
    return {obj};
  },
  barrel: (M) => ({ obj: barrelBody(M), col: [boxGeo(0.66, 0.95, 0.66, 0, 0.475, 0)] }),
  barrel_lying: (M) => {
    const b = barrelBody(M); b.rotation.x = Math.PI / 2; b.position.set(0, 0.33, -0.475);
    const g = new THREE.Group(); g.add(b);
    return { obj: g, col: [boxGeo(0.66, 0.66, 0.95, 0, 0.33, 0)] };
  },
  crate: (M) => ({ obj: crate(M, 0.85), col: [boxGeo(0.85, 0.85, 0.85, 0, 0.425, 0)] }),
  crate_small: (M) => ({ obj: crate(M, 0.65), col: [boxGeo(0.65, 0.65, 0.65, 0, 0.325, 0)] }),
  keg: (M) => { const b = barrelBody(M); b.scale.set(0.8, 0.5, 0.8); const g = new THREE.Group(); g.add(b); return { obj: g, col: [boxGeo(0.55, 0.47, 0.55, 0, 0.235, 0)] }; },
  rope_coil: (M) => ({ obj: ropeCoil(M) }),
  rope_coil_small: (M) => ({ obj: ropeCoil(M, 0.32, 3.5) }),
  grating: (M) => {
    const w = 1.8, d = 2.3, e = 0.12, g = new THREE.Group();
    g.add(mesh(boxGeo(w, 0.25, e, 0, 0.12, d / 2), M.get('trim')), mesh(boxGeo(w, 0.25, e, 0, 0.12, -d / 2), M.get('trim')));
    g.add(mesh(boxGeo(e, 0.25, d, w / 2, 0.12, 0), M.get('trim')), mesh(boxGeo(e, 0.25, d, -w / 2, 0.12, 0), M.get('trim')));
    g.add(mesh(boxGeo(w - e, 0.05, d - e, 0, 0.12, 0), M.get('black')));
    for (let x = -w / 2 + 0.14; x < w / 2 - 0.05; x += 0.14) g.add(mesh(boxGeo(0.045, 0.06, d - e, x, 0.22, 0), M.get('wood')));
    for (let z = -d / 2 + 0.14; z < d / 2 - 0.05; z += 0.14) g.add(mesh(boxGeo(w - e, 0.04, 0.045, 0, 0.2, z), M.get('wood')));
    // collider lower than the coaming so people can step over it
    return { obj: g, col: [boxGeo(w + e, 0.12, d + e, 0, 0.06, 0)] };
  },
  hearth: (M) => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(1.2, 0.35, 0.9, 0, 0.175, 0), M.get('wall')), mesh(boxGeo(1.0, 0.5, 0.05, 0, 0.6, -0.4), M.get('iron')));
    g.add(mesh(boxGeo(0.05, 0.5, 0.75, -0.48, 0.6, 0), M.get('iron')), mesh(boxGeo(0.05, 0.5, 0.75, 0.48, 0.6, 0), M.get('iron')));
    g.add(mesh(boxGeo(0.9, 0.04, 0.72, 0, 0.37, 0), M.get('sand')));
    for (let i = 0; i < 9; i++) { const e = new THREE.IcosahedronGeometry(0.05 + (i % 3) * 0.015, 0); e.translate(Math.sin(i * 2.3) * 0.25, 0.42, Math.cos(i * 1.7) * 0.2); g.add(mesh(e, M.get('ember'), false)); }
    for (let i = 0; i < 4; i++) { const f = new THREE.ConeGeometry(0.06, 0.25 + (i % 2) * 0.12, 5); f.translate(Math.sin(i * 2.1) * 0.14, 0.55, Math.cos(i * 1.3) * 0.12); g.add(mesh(f, M.get('flame'), false)); }
    const pot = lathe([[0.0, 0], [0.18, 0.02], [0.26, 0.15], [0.27, 0.3], [0.25, 0.36], [0.27, 0.37]], 20); pot.translate(0, 0.7, 0);
    g.add(mesh(pot, M.get('iron')), mesh(boxGeo(0.06, 0.06, 0.8, 0, 0.66, 0), M.get('iron')));
    g.userData.smoke = new V3(0, 1.2, -0.15);
    return { obj: g, col: [boxGeo(1.2, 1.1, 0.9, 0, 0.55, 0)] };
  },
  bucket: (M) => {
    const g = new THREE.Group(), b = lenUV(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 16, 1, true), 0.3, 1);
    b.translate(0, 0.15, 0); g.add(mesh(b, M.get('staveDouble')));
    const w = new THREE.CircleGeometry(0.155, 16); w.rotateX(-Math.PI / 2); w.translate(0, 0.22, 0); g.add(mesh(w, M.get('water')));
    return { obj: g };
  },
  swivel_gun: (M) => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(0.06, 0.25, 0.06, 0, 0.12, 0), M.get('iron')));
    const b = cylGeo(0.07, 0.05, 1.1, 12); b.rotateX(Math.PI / 2); b.translate(0, 0.3, -0.2); g.add(mesh(b, M.get('iron')));
    const t = cylGeo(0.02, 0.02, 0.6, 5); t.rotateX(Math.PI / 2); t.translate(0, 0.3, 0.6); g.add(mesh(t, M.get('trim')));
    return { obj: g };
  },
  lantern_post: (M) => {
    const g = new THREE.Group(); g.add(mesh(boxGeo(0.12, 1.0, 0.12, 0, 0.5, 0), M.get('trim')));
    const l = lanternHead(M); l.position.y = 1.0; g.add(l);
    return { obj: g, col: [boxGeo(0.25, 1.5, 0.25, 0, 0.75, 0)] };
  },
  binnacle: (M) => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(0.56, 0.9, 0.5, 0, 0.45, 0), M.get('wall')), mesh(boxGeo(0.62, 0.06, 0.56, 0, 0.92, 0), M.get('trim')));
    return { obj: g, col: [boxGeo(0.62, 1.05, 0.56, 0, 0.52, 0)] };
  },
  nav_chest: (M) => chest(M, .95, .45, .55, true),
  arms_chest: (M) => chest(M, 1.3, .5, .5, false),
  map_table: (M) => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(1.25, 0.06, 0.85, 0, 0.86, 0), M.get('wood')));
    for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) g.add(mesh(boxGeo(0.07, 0.83, 0.07, x, 0.415, z), M.get('trim')));
    g.add(mesh(boxGeo(1.1, 0.05, 0.05, 0, 0.25, 0.35), M.get('trim')), mesh(boxGeo(1.1, 0.05, 0.05, 0, 0.25, -0.35), M.get('trim')));
    return { obj: g, col: [boxGeo(1.25, 0.9, 0.85, 0, 0.45, 0)] };
  },

  // interactables
  hourglass: (M) => {
    const g = new THREE.Group();
    g.add(mesh(lenUV(lathe([[0.12, 0], [0.13, 0.05], [0.07, 0.12], [0.08, 0.5], [0.06, 0.85], [0.1, 0.95], [0.1, 1.0]], 16), 1, 0.6), M.get('wood')));
    g.add(mesh(boxGeo(0.42, 0.05, 0.42, 0, 1.02, 0), M.get('wood')));
    const pivot = new THREE.Group(); pivot.position.y=1.225; g.add(pivot);
    const hg = new THREE.Group(); hg.position.y = -.18; pivot.userData.noBake=true; pivot.add(hg);
    g.userData.flipPivot=pivot;
    for (const y of [0, 0.34]) { const d = cylGeo(0.1, 0.1, 0.028, 18); d.translate(0, y + 0.014, 0); hg.add(mesh(d, M.get('trim'))); }
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, s = cylGeo(0.011, 0.011, 0.32, 5); s.translate(Math.cos(a) * 0.085, 0.18, Math.sin(a) * 0.085); hg.add(mesh(s, M.get('trim'))); }
    const bulb = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; bulb.push([Math.max(0.008, 0.008 + 0.062 * Math.pow(Math.abs(Math.sin(Math.PI * t * 2)), 0.75)), 0.03 + t * 0.3]); }
    // sand lives in its own group so it survives baking and can be animated
    const sand = new THREE.Group(); sand.userData.noBake = true; hg.add(sand);
    const top = new THREE.ConeGeometry(0.05, 0.07, 16); top.rotateX(Math.PI); top.translate(0, -0.035, 0);
    const bot = new THREE.ConeGeometry(0.058, 0.06, 16); bot.translate(0, 0.03, 0);
    const sandMat=M.get('sand').clone();sandMat.color?.setHex(0xf5d391);
    const topM = mesh(top, sandMat), botM = mesh(bot, sandMat), stream = mesh(cylGeo(0.004, 0.004, 0.12, 6), sandMat, false);
    g.userData.sandParts={top:topM,bottom:botM,stream};
    topM.position.y = 0.25; botM.position.y = 0.03; stream.position.y = 0.13;
    sand.add(topM, botM, stream);
    hg.add(mesh(lathe(bulb, 20), M.get('glass'), false, false));
    g.userData.setFill = (f) => {
      // f: 1 = top full (just turned), 0 = run out
      topM.scale.setScalar(Math.max(0.001, Math.cbrt(f))); botM.scale.setScalar(Math.max(0.001, Math.cbrt(1 - f)));
      stream.visible = f > 0.001;
    };
    bake(hg);
    g.userData.setFill(0.7);
    return { obj: g, col: [boxGeo(0.42, 1.4, 0.42, 0, 0.7, 0)] };
  },
  compass: (M) => {
    const g = new THREE.Group();
    const bowl = cylGeo(0.17, 0.2, 0.1, 24); bowl.translate(0, 0.05, 0); g.add(mesh(bowl, M.get('brass')));
    const card = new THREE.CircleGeometry(0.16, 32); card.rotateX(-Math.PI / 2); card.translate(0, 0.102, 0);
    g.add(mesh(card, M.canvas('compass', 256, compassCard)));
    const dome = new THREE.SphereGeometry(0.165, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.35, 1); dome.translate(0, 0.1, 0);
    g.add(mesh(dome, M.get('glass'), false, false));
    return { obj: g };
  },
  map: (M) => {
    const g = new THREE.Group(), p = new THREE.PlaneGeometry(0.95, 0.66, 12, 1), pos = p.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), e = Math.abs(x) / 0.475; pos.setZ(i, Math.pow(Math.max(0, e - 0.82) / 0.18, 2) * 0.04); }
    p.computeVertexNormals(); p.rotateX(-Math.PI / 2); p.translate(0, 0.005, 0);
    g.add(mesh(p, M.canvas('chart', 1024, seaChart, { side: THREE.DoubleSide, rough: 0.85 })));
    for (const x of [-0.5, 0.5]) { const r = cylGeo(0.025, 0.025, 0.68, 10); r.rotateX(Math.PI / 2); r.translate(x, 0.03, 0); g.add(mesh(r, M.canvas('chart', 1024, seaChart))); }
    g.add(mesh(cylGeo(0.035, 0.035, 0.05, 10).translate(0.2, 0.025, 0.2), M.get('iron')));
    return { obj: g };
  },
  astrolabe: (M) => {
    const g = new THREE.Group(), a = new THREE.Group();
    a.add(mesh(new THREE.TorusGeometry(0.11, 0.014, 8, 40), M.get('brass')));
    const disc = new THREE.CircleGeometry(0.1, 32); a.add(mesh(disc, M.get('brass')));
    a.add(mesh(boxGeo(0.21, 0.016, 0.012, 0, 0, 0.01).rotateZ(0.5), M.get('brass')));
    for (const s of [-1, 1]) a.add(mesh(boxGeo(0.012, 0.21, 0.006, 0, 0, s * 0.006), M.get('brass')));
    const ring = new THREE.TorusGeometry(0.022, 0.006, 6, 16); ring.translate(0, 0.135, 0); a.add(mesh(ring, M.get('brass')));
    a.rotation.x = -Math.PI / 2; a.position.y = 0.02;
    g.add(a);
    return { obj: g };
  },
  sword: (M) => {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(0.82, 0.006, 0.04, 0.3, 0.012, 0), M.get('steel')));
    g.add(mesh(boxGeo(0.025, 0.02, 0.2, -0.12, 0.015, 0), M.get('iron')));
    g.add(mesh(cylGeo(0.016, 0.018, 0.14, 8).rotateZ(Math.PI / 2).translate(-0.2, 0.018, 0), M.get('leather')));
    g.add(mesh(new THREE.SphereGeometry(0.025, 10, 8).translate(-0.29, 0.02, 0), M.get('brass')));
    return { obj: g };
  },
  wine: (M) => {
    const g = new THREE.Group(), bag = new THREE.SphereGeometry(0.15, 16, 12);
    bag.scale(1, 0.55, 1.3); bag.translate(0, 0.08, 0); g.add(mesh(bag, M.get('leather')));
    g.add(mesh(cylGeo(0.025, 0.03, 0.1, 8).rotateX(-1.1).translate(0, 0.12, 0.2), M.get('black')));
    const strap = new THREE.TorusGeometry(0.17, 0.008, 4, 24, Math.PI); strap.rotateY(Math.PI / 2); strap.translate(0, 0.1, 0); g.add(mesh(strap, M.get('leather')));
    return { obj: g };
  },
  espingarda,
  none: () => ({ obj: new THREE.Group() }),
  cards: (M) => {
    const g = new THREE.Group(), faces = [0xf2ead8, 0xf2ead8, 0x9a2a22, 0xf2ead8, 0x2a3f6a];
    for (let i = 0; i < 9; i++) {
      const c = boxGeo(0.07, 0.003, 0.1); c.rotateY(i * 0.7); c.translate(Math.sin(i * 2.4) * 0.16, 0.002 + i * 0.002, Math.cos(i * 1.7) * 0.12);
      g.add(mesh(c, M.canvas('card' + (i % 5), 16, (x) => { x.fillStyle = '#' + faces[i % 5].toString(16).padStart(6, '0'); x.fillRect(0, 0, 16, 16); })));
    }
    for (let i = 0; i < 5; i++) g.add(mesh(cylGeo(0.016, 0.016, 0.004, 10).translate(0.2 + i * 0.012, 0.004 * i + 0.002, -0.1), M.get('brass')));
    return { obj: g };
  },
  lantern: (M) => {
    const g = new THREE.Group(), l = lanternHead(M);
    l.scale.setScalar(1.15); g.add(l);
    return { obj: g, col: [boxGeo(0.35, 0.6, 0.35, 0, 0.3, 0)] };
  },
};

// Entity state from the server: { holder } — somebody picked the item up; { emptyAt } — hourglass.
export function applyState(obj, state = {}) {
  obj.userData.state={...obj.userData.state,...state};
  // offScene: объекта нет в этой сцене (island.setScene, часть 2)
  if('holder' in state){obj.userData.held=!!state.holder;obj.visible=!state.holder&&!obj.userData.offScene;}
  if('visible' in state)obj.visible=state.visible;
  if(state.p)obj.position.fromArray(state.p);
  if(Number.isFinite(state.r))obj.rotation.y=state.r;
  if(Number.isFinite(state.emptyAt)&&obj.userData.setFill){
    obj.userData.emptyAt=state.emptyAt;
    obj.userData.turnSpan=(state.duration??((state.startedAt!==undefined)?state.emptyAt-state.startedAt:obj.userData.period*1000))||60000;
    obj.userData.flipAt=state.turnedBy?state.startedAt:null;
  }
  if('open' in state){obj.userData.openTarget=state.open?1:0;obj.userData.changedAt=state.changedAt??0;}
}

export function animateProp(obj,now){
  const u=obj.userData;
  // Колодец: 4 с после набора воды ворот крутится, ведро уходит вниз до воды и возвращается
  if(u.winch&&u.winchAt!=null){
    const k=THREE.MathUtils.clamp((now-u.winchAt)/4000,0,1),depth=Math.sin(k*Math.PI)*0.75,w=u.winch;
    w.axle.rotation.x=-k*Math.PI*6;w.bucket.position.y=1.1-depth;w.rope.scale.y=0.9+depth;
    if(k>=1)u.winchAt=null;
  }
  if(u.emptyAt&&u.setFill){
    u.setFill(THREE.MathUtils.clamp((u.emptyAt-now)/u.turnSpan,0,1));
    if(u.flipPivot){const t=u.flipAt==null?1:THREE.MathUtils.clamp((now-u.flipAt)/650,0,1);u.flipPivot.rotation.z=t<1?Math.PI*t*t*(3-2*t):0;}
  }
  if(u.setOpen&&u.openTarget!==undefined){
    const t=THREE.MathUtils.clamp((now-u.changedAt)/450,0,1),k=t*t*(3-2*t);
    u.setOpen(u.openTarget?k:1-k);
  }
}

export function place(o, { p, r = 0, s = 1 }) {
  o.position.fromArray(p); o.rotation.y = r; o.scale.setScalar(s);
  return o;
}

export function colliderFor(local, item) {
  const m = new THREE.Matrix4().compose(new V3().fromArray(item.p), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, item.r ?? 0, 0)), new V3().setScalar(item.s ?? 1));
  return local.map((g) => g.clone().applyMatrix4(m));
}

// One interactable object; `models` lets the island pass its own model set.
export function buildInteract(M, item, models = MODELS) {
  const make = models[item.m] ?? MODELS[item.m];
  if (!make) { console.warn('[world] unknown model', item.m); return null; }
  const { obj, col } = make(M);
  place(obj, item);
  const lamps = [];
  obj.traverse((o) => { if (o.userData.lamp) lamps.push(o); });
  bake(obj);
  obj.userData = { ...obj.userData, id: item.id, kind: item.kind, item: item.item, label: item.label, period: item.period, noBake: true };
  if(item.m==='nav_chest'||item.m==='arms_chest')obj.userData.lidDef={...item,toggleType:'lid',zone:'ship'};
  if (item.state) applyState(obj, item.state);
  return { obj, col: item.kind==='item'?[]:col ? colliderFor(col, item) : [], lamps };
}

export function buildNpc(M, n, animated = false) {
  const look = NPC_LOOK[n.id] ?? NPC_LOOK.sailor_1;
  // Ship characters retain their joints; island characters keep the static mesh path.
  const rig = n.pose === 'guitar' ? guitarist(M.person, look) : person(M.person, look);
  if (n.pose !== 'guitar') pose(rig, n.pose ?? 'stand');
  const g = animated || n.pose === 'guitar' ? rig.root : bake(rig.root);
  place(g, n);
  g.rotation.y += Math.PI; // r = camera-style yaw, the model faces +z
  g.userData = { id: n.id, kind: 'npc', label: n.label, noBake: true, baseY: n.p[1], rig: animated || n.pose === 'guitar' ? rig : null, definition: n, behavior: n.state?.behavior ?? null, speaker: n.state?.speaker ?? null, paused: n.state?.paused ?? null, animated };
  return { obj: g, col: animated ? [] : colliderFor([new THREE.CylinderGeometry(0.3, 0.3, 1.7, 8).translate(0, 0.85, 0)], n) };
}

// Build everything a ship layout describes. Decor is baked into a few meshes; interactables and NPCs stay separate.
export function buildLayout(M, layout) {
  const decor = new THREE.Group(), interactables = [], npcs = [], col = [], smoke = [];
  for (const item of layout.objects) {
    const make = MODELS[item.m];
    if (!make) { console.warn('[world] unknown model', item.m); continue; }
    if(item.m==='nav_chest'||item.m==='arms_chest'){
      const built=buildInteract(M,{...item,kind:'toggle',label:'Сундук'});
      interactables.push(built.obj);col.push(...built.col);continue;
    }
    const { obj, col: c } = make(M);
    decor.add(place(obj, item));
    if (c) col.push(...colliderFor(c, item));
    if (obj.userData.smoke) smoke.push(obj.localToWorld(obj.userData.smoke.clone()));
  }
  // keep lamp lights out of the merge
  const lamps = [];
  decor.updateMatrixWorld(true);
  decor.traverse((o) => { if (o.userData.lamp) lamps.push(o); });
  for (const l of lamps) { const wp = l.getWorldPosition(new V3()); l.removeFromParent(); l.position.copy(wp); }
  bake(decor);
  for (const l of lamps) decor.add(l);

  for (const item of layout.interact ?? layout.interactables ?? []) {
    const built = buildInteract(M, item);
    if (!built) continue;
    interactables.push(built.obj); col.push(...built.col); lamps.push(...built.lamps);
  }
  for (const n of layout.npcs) {
    const { obj, col: c } = buildNpc(M, n, true);
    npcs.push(obj); col.push(...c);
  }
  return { decor, interactables, npcs, col, lamps, smoke };
}
