import * as THREE from 'three';
export function shovel(M){
 const obj=new THREE.Group(),add=(g,m,p)=>{const mesh=new THREE.Mesh(g,M.get(m));mesh.position.fromArray(p);obj.add(mesh);return mesh;};
 add(new THREE.CylinderGeometry(.018,.023,1.0,10),'wood',[0,.55,0]);
 const shape=new THREE.Shape();shape.moveTo(-.10,.18);shape.lineTo(-.12,.02);shape.quadraticCurveTo(0,-.10,.12,.02);shape.lineTo(.10,.18);shape.closePath();
 const blade=new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelThickness:.005,bevelSize:.005,bevelSegments:1,steps:1});blade.translate(0,0,-.0125);add(blade,'iron',[0,0,0]);
 add(new THREE.TorusGeometry(.06,.012,5,16),'trim',[0,1.10,0]);for(const child of obj.children)child.position.y+=.05;return {obj};
}
export function medallion(M){
 const obj=new THREE.Group(),body=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.018,24),M.get('brass'));body.rotation.x=Math.PI/2;obj.add(body);
 for(const [x,angle]of [[-.012,-.35],[.012,.35]]){const stroke=new THREE.Mesh(new THREE.BoxGeometry(.004,.05,.002),M.get('iron'));stroke.position.set(x,0,.011);stroke.rotation.z=angle;obj.add(stroke);}
 const cross=new THREE.Mesh(new THREE.BoxGeometry(.028,.004,.002),M.get('iron'));cross.position.set(0,-.004,.011);obj.add(cross);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.018,.005,5,12),M.get('brass'));ring.position.y=.08;obj.add(ring);
 const seal=new THREE.Mesh(new THREE.TorusGeometry(.04,.004,4,18),M.get('iron'));seal.position.z=.011;obj.add(seal);return {obj};
}
export function digSite(M){
 const obj=new THREE.Group(),soil=M.canvas('dug-soil',256,(ctx,n)=>{ctx.fillStyle='#5a3822';ctx.fillRect(0,0,n,n);let seed=1492;for(let i=0;i<220;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%n;seed=(seed*1664525+1013904223)>>>0;ctx.fillStyle=i%2?'#332014':'#8c6540';ctx.fillRect(x,seed%n,9,3);}});
 const hole=new THREE.Mesh(new THREE.CircleGeometry(1.05,32),soil);hole.rotation.x=-Math.PI/2;hole.position.y=.018;hole.visible=false;hole.userData.noBake=true;obj.add(hole);
 const mound=new THREE.Mesh(new THREE.TorusGeometry(1.0,.14,6,32),soil);mound.rotation.x=Math.PI/2;mound.scale.z=.45;mound.position.y=.06;mound.visible=false;mound.userData.noBake=true;obj.add(mound);
 // A subtle marker, not a floating chest or an exposed cache.
 const marker=new THREE.Mesh(new THREE.BoxGeometry(.18,.04,.13),M.get('stone'));marker.position.set(.45,.025,.30);obj.add(marker);
 obj.userData.setOpen=v=>{hole.visible=mound.visible=v>.5;};return {obj};
}
