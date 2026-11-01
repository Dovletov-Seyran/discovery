import * as THREE from 'three';

const own=(color,roughness=.5,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});m.userData.equipmentOwned=true;return m;};
const part=(root,geometry,material,p=[0,0,0],rotation=[0,0,0])=>{
  const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(p);mesh.rotation.set(...rotation);root.add(mesh);return mesh;
};

// Item presentation. The forged sword is shared by held and dropped copies; NPCs stay in world/people.js.
export function sword(){
  const root=new THREE.Group();root.name='held-sword';
  const steel=own(0xd5dde4,.23,.72),edge=own(0xf0f3f5,.17,.82),brass=own(0xb69352,.34,.7),leather=own(0x36251e,.85),dark=own(0x46505a,.4,.65);
  // A tapered diamond section: broad blade, raised central ridge, distinct cutting edges.
  const levels=[[.18,.043,.009],[.24,.046,.010],[.93,.030,.007],[1.12,0,0]];
  const vertices=[],indices=[];
  for(const [y,w,d]of levels)vertices.push(-w,y,0, 0,y,d, w,y,0, 0,y,-d);
  for(let i=0;i<levels.length-1;i++)for(let j=0;j<4;j++){
    const a=i*4+j,b=i*4+(j+1)%4,c=a+4,d=b+4;indices.push(a,b,c,b,d,c);
  }
  const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));blade.setIndex(indices);blade.computeVertexNormals();
  part(root,blade,steel);
  // Narrow fuller and ricasso make the blade read as forged steel rather than a flat rod.
  part(root,new THREE.BoxGeometry(.010,.59,.001),dark,[0,.55,.0105]);
  part(root,new THREE.BoxGeometry(.075,.06,.022),edge,[0,.21,0]);
  const guardPath=new THREE.CatmullRomCurve3([new THREE.Vector3(-.16,.15,.025),new THREE.Vector3(-.09,.18,0),new THREE.Vector3(0,.18,0),new THREE.Vector3(.09,.18,0),new THREE.Vector3(.16,.15,.025)]);
  part(root,new THREE.TubeGeometry(guardPath,24,.014,8,false),brass);
  for(const x of [-.16,.16])part(root,new THREE.SphereGeometry(.020,12,8),brass,[x,.15,.025]);
  part(root,new THREE.CylinderGeometry(.023,.027,.18,12),leather,[0,.075,0]);
  for(let i=0;i<9;i++)part(root,new THREE.TorusGeometry(.024,.0022,4,12),dark,[0,.005+i*.017,0],[Math.PI/2,0,.16]);
  part(root,new THREE.CylinderGeometry(.029,.029,.018,16),brass,[0,-.024,0]);
  const pommel=part(root,new THREE.SphereGeometry(.038,16,12),brass,[0,-.065,0]);pommel.scale.set(1,1.15,.65);
  part(root,new THREE.SphereGeometry(.012,12,8),dark,[0,-.065,.025]);
  return {obj:root};
}

export function hand(){
  const root=new THREE.Group(),skin=own(0xb88d69,.95),sleeve=own(0x45483a,.95),cuff=own(0x6d5140,.9);
  part(root,new THREE.CylinderGeometry(.049,.073,.24,12),sleeve,[.025,-.22,.07],[.15,0,-.12]);
  part(root,new THREE.CylinderGeometry(.052,.052,.04,12),cuff,[.012,-.09,.05]);
  const palm=part(root,new THREE.SphereGeometry(.048,14,10),skin,[0,-.025,.035]);palm.scale.set(1,.95,.65);
  for(let i=0;i<4;i++)part(root,new THREE.CapsuleGeometry(.011,.048,3,7),skin,[-.031+i*.020,.009,.025],[0,0,Math.PI/2]);
  part(root,new THREE.CapsuleGeometry(.014,.045,3,7),skin,[.036,-.018,-.002],[.8,0,-.5]);
  return root;
}

function provisions(id){
  const g=new THREE.Group(),cloth=own(0x8c7050,.95),food=own(id==='cheese'?0xddb956:id==='meat'?0x865848:0xb68c53,.85);
  if(id==='purse'){
    const bag=part(g,new THREE.SphereGeometry(.13,20,16),cloth,[0,.11,0]);bag.scale.set(1,.95,.75);
    part(g,new THREE.CylinderGeometry(.035,.075,.07,14),cloth,[0,.25,0]);
    part(g,new THREE.TorusGeometry(.04,.007,5,16),own(0x3c2b1c),[0,.25,0],[Math.PI/2,0,0]);
  }else if(id==='cheese'){
    const shape=new THREE.Shape();shape.moveTo(-.16,-.09);shape.lineTo(.16,-.09);shape.lineTo(.06,.12);shape.closePath();
    part(g,new THREE.ExtrudeGeometry(shape,{depth:.10,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:2,steps:1}),food,[0,.10,-.05],[-Math.PI/2,0,0]);
    const holes=own(0x9c752e);
    for(const [x,y]of [[-.07,.09],[.04,.12],[.11,.07]])part(g,new THREE.SphereGeometry(.014,10,8),holes,[x,y,.055]);
  }else if(id==='biscuit'){
    for(let i=0;i<3;i++)part(g,new THREE.CylinderGeometry(.095,.10,.03,18),food,[i*.015,.03+i*.033,0],[0,i*.2,.05]);
  }else{
    const meat=part(g,new THREE.SphereGeometry(.14,20,12),food,[0,.1,0]);meat.scale.set(1.5,.65,.8);
    for(let i=0;i<3;i++)part(g,new THREE.TorusGeometry(.09,.006,5,18),cloth,[-.08+i*.08,.1,0],[0,Math.PI/2,0]);
  }
  return {obj:g};
}
function rumBottle(){
 const g=new THREE.Group(),glass=own(0x70421c,.23,.08),label=own(0xe4d1a0,.9),cork=own(0x68492d,.9);
 part(g,new THREE.CylinderGeometry(.07,.064,.23,24),glass,[0,.12,0]);
 part(g,new THREE.CylinderGeometry(.025,.07,.07,24),glass,[0,.27,0]);
 part(g,new THREE.CylinderGeometry(.025,.025,.10,20),glass,[0,.35,0]);
 part(g,new THREE.TorusGeometry(.027,.005,6,20),glass,[0,.395,0],[Math.PI/2,0,0]);
 part(g,new THREE.CylinderGeometry(.026,.026,.035,16),cork,[0,.407,0]);
 part(g,new THREE.CylinderGeometry(.071,.071,.10,24,1,true),label,[0,.14,0]);
 for(let i=0;i<3;i++)part(g,new THREE.BoxGeometry(.06-i*.01,.006,.003),cork,[0,.16-i*.018,.072]);
 return {obj:g};
}
export const HELD_MODELS={sword,rum:rumBottle,purse:()=>provisions('purse'),cheese:()=>provisions('cheese'),meat:()=>provisions('meat'),biscuit:()=>provisions('biscuit')};

export function releaseModel(obj){
  const geometries=new Set(),materials=new Set();
  obj?.traverse(child=>{if(child.geometry)geometries.add(child.geometry);for(const m of [].concat(child.material||[]))if(m.userData.equipmentOwned)materials.add(m);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
