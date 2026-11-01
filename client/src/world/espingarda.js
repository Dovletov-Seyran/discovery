import * as THREE from 'three';
// Shared held, inventory and world model. Grip is the origin; muzzle points +Y.
export function espingarda(){
 const root=new THREE.Group();root.name='espingarda';root.userData.muzzle=[0,1.18,0];
 const material=(color,roughness,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});m.userData.equipmentOwned=true;return m;};
 const wood=material(0x70472c,.77),grain=material(0x4a2b1c,.88),steel=material(0x646c70,.35,.72),edge=material(0xa4a7a2,.30,.7),black=material(0x101414,.8),brass=material(0x9d7b41,.5,.6),cord=material(0x6d5740,.95);
 const add=(name,g,m,p=[0,0,0],r=[0,0,0])=>{const o=new THREE.Mesh(g,m);o.name=name;o.position.fromArray(p);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;root.add(o);return o;};
 const outline=new THREE.Shape();outline.moveTo(.13,-.38);outline.lineTo(-.06,-.38);outline.lineTo(-.055,-.22);outline.lineTo(-.025,-.05);outline.lineTo(-.032,.2);outline.lineTo(-.035,.65);outline.lineTo(.04,.65);outline.lineTo(.055,.18);outline.quadraticCurveTo(.065,-.05,.14,-.19);outline.closePath();
 const stock=new THREE.ExtrudeGeometry(outline,{depth:.075,bevelEnabled:true,bevelThickness:.008,bevelSize:.012,bevelSegments:2,steps:1});stock.translate(0,0,-.0375);stock.rotateY(Math.PI/2);
 add('wooden-stock',stock,wood);
 for(const y of [.38,.65,.98])add('barrel-band',new THREE.CylinderGeometry(.039,.039,.024,12),brass,[0,y,0]);
 add('octagonal-barrel',new THREE.CylinderGeometry(.031,.035,.99,8,1,true),steel,[0,.685,0]);
 add('muzzle-rim',new THREE.TorusGeometry(.028,.005,6,16),edge,[0,1.18,0],[Math.PI/2,0,0]);
 add('dark-bore',new THREE.CircleGeometry(.024,16),black,[0,1.165,0],[-Math.PI/2,0,0]);
 add('breech',new THREE.BoxGeometry(.077,.11,.07),steel,[0,.17,.015]);
 add('lock-plate',new THREE.BoxGeometry(.014,.19,.085),steel,[.051,.13,.015]);
 for(const y of [.06,.21])add('lock-rivet',new THREE.SphereGeometry(.008,8,6),brass,[.062,y,.018]);
 const curve=points=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
 add('match-holder',new THREE.TubeGeometry(curve([[.067,.10,.016],[.075,.20,.035],[.072,.27,-.025],[.065,.29,-.04]]),14,.009,6,false),edge);
 add('match-cord',new THREE.TubeGeometry(curve([[.068,.29,-.055],[.06,.30,-.085],[.053,.25,-.10]]),10,.005,5,false),cord);
 add('priming-pan',new THREE.BoxGeometry(.044,.02,.035),brass,[.058,.24,-.025]);
 add('trigger',new THREE.TubeGeometry(curve([[.012,.06,.075],[.012,-.015,.105],[.012,-.04,.075]]),10,.006,5,false),steel);
 add('trigger-guard',new THREE.TorusGeometry(.058,.006,5,16,Math.PI*1.65),steel,[0,-.01,.11],[0,Math.PI/2,.5]);
 add('ramrod',new THREE.CylinderGeometry(.006,.006,.83,8),grain,[0,.62,.055]);
 add('butt-plate',new THREE.BoxGeometry(.087,.025,.21),brass,[0,-.38,-.025],[.12,0,0]);
 for(const y of [-.26,-.21,-.16])add('stock-carving',new THREE.BoxGeometry(.003,.008,.08),grain,[.047,y,-.005],[.15,0,0]);
 return {obj:root};
}
