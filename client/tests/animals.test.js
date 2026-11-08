import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Vector3,Box3,Matrix4,Color} from 'three';
import {ANIMALS,animalModel,CARCASS_LOOK} from '../src/world/animal-models.js';
import {Fauna,HUNT} from '../src/world/fauna.js';

test('every animal is built of coloured parts with eyes, the right size, standing on the ground',()=>{
  const size={hutia:[0.6,0.9],iguana:[1.1,1.6],crab:[0.3,0.5],goat:[0.9,1.3],chicken:[0.35,0.6],dog:[0.8,1.2],cat:[0.45,0.8],rat:[0.3,0.5],parrot:[0.5,0.9],gull:[1.0,1.5]}; // с хвостом, крылья раскрыты
  for(const [kind,parts] of Object.entries(ANIMALS)){
    assert.ok(parts.length>=2,kind);
    for(const p of parts){const geo=p.geo??parts.find(q=>q.key===p.key&&q.geo).geo;assert.ok(geo.attributes.color,`${kind}.${p.key} has vertex colours`);assert.ok(p.pos.every(Number.isFinite));}
    const m=animalModel(kind,{coat:new Color(0x806040),wing:new Color(0x206080),head:new Color(0xc03020)},{lying:false}),box=new Box3().setFromObject(m),s=box.getSize(new Vector3());
    const len=Math.max(s.x,s.z);assert.ok(len>=size[kind][0]&&len<=size[kind][1],`${kind} is ${len.toFixed(2)} m long`);
    if(!['parrot','gull'].includes(kind))assert.ok(box.min.y>-0.03&&box.min.y<0.05,`${kind} stands on the ground (${box.min.y.toFixed(3)})`);
    // глаза — тёмные вершины где-то в модели
    let dark=0;m.traverse(o=>{const c=o.geometry?.attributes.color;if(c)for(let i=0;i<c.count;i++)if(c.getX(i)<0.1&&c.getY(i)<0.1&&c.getZ(i)<0.1)dark++;});assert.ok(dark>0,`${kind} has eyes`);
  }
  for(const kind of Object.keys(CARCASS_LOOK)){const c=animalModel(kind,CARCASS_LOOK[kind]),b=new Box3().setFromObject(c);assert.ok(b.min.y>-0.05,`${kind} carcass lies on the ground`);}
});

function fakeWorld(){
  return {zone:'guanahani',scene:new Scene(),ship:new Scene(),camera:{position:new Vector3(170,3,255)},island:{heightAt:()=>2},players:{map:new Map()},npcClockOffset:0};
}

test('hunting: the crosshair finds a hutia, the killed one falls on its side and vanishes for everyone; it comes back when the server says',()=>{
  const world=fakeWorld(),fauna=new Fauna(world);
  fauna.update(1/30);
  const herd=fauna.herds.get('guanahani'),hutia=herd.agents.find(a=>a.kind==='hutia');
  assert.match(hutia.id,/^guanahani:\d+$/);
  // встать в 2 м и посмотреть на него
  world.camera.position.set(hutia.p[0]-2,3.4,hutia.p[1]);fauna.update(1/30);
  const origin=world.camera.position.clone(),target=new Vector3(hutia.p[0],hutia.y+0.2,hutia.p[1]),dir=target.clone().sub(origin).normalize();
  const prey=fauna.pick(origin,dir,3);
  assert.ok(prey,'in the crosshair');assert.equal(prey.kind,'hutia');assert.equal(prey.id,hutia.id);
  assert.equal(fauna.pick(origin,new Vector3(0,1,0),3),null,'looking at the sky');
  assert.equal(fauna.pick(origin,dir,0.5),null,'too far for a short reach');
  // людей и птиц не выбирает
  assert.ok(!HUNT.taino&&!HUNT.parrot);
  // убит: падает и пропадает
  fauna.applyDead({zone:'guanahani',killed:{id:hutia.id,kind:'hutia',p:[hutia.p[0],2,hutia.p[1]]},dead:[{id:hutia.id,p:[hutia.p[0],2,hutia.p[1]]}]});
  const m=new Matrix4(),slot=hutia.slots[0];
  fauna.update(1/30);slot.mesh.getMatrixAt(slot.slot,m);assert.ok(m.determinant()!==0,'still visible while falling');
  hutia.deathT-=1000;fauna.update(1/30);slot.mesh.getMatrixAt(slot.slot,m);assert.equal(m.determinant(),0,'gone, the carcass is a pickup now');
  assert.equal(fauna.pick(origin,dir,3)?.id===hutia.id,false,'cannot be killed twice');
  // сервер: появилось снова
  fauna.applyDead({zone:'guanahani',dead:[]});fauna.update(1/30);slot.mesh.getMatrixAt(slot.slot,m);assert.ok(m.determinant()!==0,'back');
});

test('shy animals run when you come too close; the iguana basks and lets you come up',()=>{
  const world=fakeWorld(),fauna=new Fauna(world);fauna.update(1/30);
  const herd=fauna.herds.get('guanahani'),hutia=herd.agents.find(a=>a.kind==='hutia'),iguana=herd.agents.find(a=>a.kind==='iguana');
  world.camera.position.set(hutia.p[0]+1,3.4,hutia.p[1]);fauna.update(1/30);
  assert.equal(hutia.mode,'flee');
  world.camera.position.set(iguana.p[0]+1,3.4,iguana.p[1]);fauna.update(1/30);
  assert.notEqual(iguana.mode,'flee');
});
