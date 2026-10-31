import * as THREE from 'three';
import { drawPage, drawCover } from './pages.js';

// Marco Polo's book lying on the table. Spine along local z at x = 0, pages face +y.
// open(k): 0 closed → 1 open. flip(k, from, to): one leaf turns right → left.

const PW = 0.235, PD = 0.31, BOARD = 0.007, BLOCK = 0.02;
const SPREADS = [['text1', 'palace'], ['text2', 'caravan'], ['text3', 'city']];

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// The top of a page block: rises from the outer edge, dips into the gutter at the spine.
function pageSurface(side) {
  const g = new THREE.PlaneGeometry(PW, PD, 40, 1);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i) + PW / 2; // 0 .. PW from the left edge of this plane
    const d = side < 0 ? PW - lx : lx; // distance from the spine
    const t = d / PW;
    const y = BOARD + BLOCK + 0.006 * Math.sin(Math.PI * Math.min(1, t * 1.1)) - 0.014 * Math.pow(Math.max(0, 0.16 - t) / 0.16, 2);
    p.setXYZ(i, side < 0 ? -(PW - lx) : lx, y, p.getZ(i));
    uv.setX(i, lx / PW);
  }
  g.computeVertexNormals();
  return g;
}

export class Book {
  constructor(M) {
    this.group = new THREE.Group();
    this.tex = {};
    for (const s of SPREADS.flat()) this.tex[s] = tex(drawPage(s));
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe6d6b0, roughness: 0.9 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x5a2e1a, roughness: 0.6 });
    const cover = new THREE.MeshStandardMaterial({ map: tex(drawCover()), roughness: 0.55 });
    const pageMat = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, side: THREE.DoubleSide });

    const H = BOARD + BLOCK;
    // right half stays on the table
    this.right = new THREE.Group();
    const rb = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.012, BOARD, PD + 0.016), leather);
    rb.position.set((PW + 0.012) / 2, BOARD / 2, 0);
    const rblock = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.004, BLOCK, PD - 0.006), edgeMat);
    rblock.position.set(PW / 2, BOARD + BLOCK / 2 - 0.002, 0);
    this.rightPage = new THREE.Mesh(pageSurface(1), pageMat(this.tex.palace));
    this.right.add(rb, rblock, this.rightPage);

    // left half: the front cover and its pages; turns about the top of the spine (y = H) to open,
    // so at 180° it lies exactly on top of the right half
    this.left = new THREE.Group();
    this.left.position.y = H;
    const lb = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.012, BOARD, PD + 0.016), [leather, leather, leather, cover, leather, leather]);
    lb.position.set(-(PW + 0.012) / 2, BOARD / 2 - H, 0);
    const lblock = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.004, BLOCK, PD - 0.006), edgeMat);
    lblock.position.set(-PW / 2, BOARD + BLOCK / 2 - 0.002 - H, 0);
    this.leftPage = new THREE.Mesh(pageSurface(-1), pageMat(this.tex.text1));
    this.leftPage.position.y = -H;
    this.left.add(lb, lblock, this.leftPage);
    // the cover image lies on the board's underside (-y); seen from above once the book is closed
    cover.map.center.set(0.5, 0.5); cover.map.rotation = Math.PI;

    // spine: the rounded back on the −x side of the closed book; out of sight once it lies open
    const sg = new THREE.CylinderGeometry(H, H, PD + 0.016, 16, 1, true, Math.PI, Math.PI);
    sg.rotateX(Math.PI / 2); sg.translate(0, H, 0);
    const spine = new THREE.Mesh(sg, leather);
    this.spine = spine;

    // the turning leaf: front shows the old right page, back the new left page
    this.leafGeo = new THREE.PlaneGeometry(PW, PD, 32, 1);
    this.leafGeo.rotateX(-Math.PI / 2);
    this.leafBase = this.leafGeo.attributes.position.array.slice();
    this.leafFront = new THREE.Mesh(this.leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.FrontSide }));
    this.leafBack = new THREE.Mesh(this.leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.BackSide }));
    this.leaf = new THREE.Group(); this.leaf.add(this.leafFront, this.leafBack); this.leaf.visible = false;

    this.group.add(this.right, this.left, spine, this.leaf);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.spread = 0;
    this.open(0);
  }

  // 0 closed → 1 open
  open(k) {
    this.left.rotation.z = -Math.PI * (1 - k);
    this.spine.visible = k < 0.3;
  }

  setSpread(i) {
    this.spread = i;
    this.leftPage.material.map = this.tex[SPREADS[i][0]];
    this.rightPage.material.map = this.tex[SPREADS[i][1]];
    this.leaf.visible = false;
  }

  // turning from spread i to i + 1; k 0 → 1
  flip(i, k) {
    const [, oldRight] = SPREADS[i], [newLeft, newRight] = SPREADS[i + 1];
    this.rightPage.material.map = this.tex[newRight];
    this.leftPage.material.map = this.tex[k < 1 ? SPREADS[i][0] : newLeft];
    this.leafFront.material.map = this.tex[oldRight];
    const back = this.tex[newLeft];
    if (!this.leafBackTex || this.leafBackTex.source !== back.source) {
      // the back side is seen mirrored: flip U
      this.leafBackTex = back.clone(); this.leafBackTex.wrapS = THREE.RepeatWrapping; this.leafBackTex.repeat.x = -1; this.leafBackTex.needsUpdate = true;
    }
    this.leafBack.material.map = this.leafBackTex;
    this.leafFront.material.needsUpdate = this.leafBack.material.needsUpdate = true;
    this.leaf.visible = k > 0 && k < 1;
    // the leaf bends: its free edge lags behind the part at the spine
    const e = k * k * (3 - 2 * k), a = Math.PI * e, p = this.leafGeo.attributes.position, base = this.leafBase;
    const lift = Math.sin(a);
    for (let j = 0; j < p.count; j++) {
      const d = base[j * 3] + PW / 2, z = base[j * 3 + 2], t = d / PW;
      const ang = a - 0.55 * lift * Math.pow(t, 1.4);
      p.setXYZ(j, Math.cos(ang) * d, BOARD + BLOCK + 0.004 + Math.sin(ang) * d, z);
    }
    p.needsUpdate = true;
    this.leafGeo.computeVertexNormals();
    if (k >= 1) this.setSpread(i + 1);
  }
}
