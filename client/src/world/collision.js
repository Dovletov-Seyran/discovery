import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Static collider of a zone: one BVH over simplified geometry (decks, bulwarks, walls, ramps, props).
// Capsule-vs-triangles resolution follows the characterMovement example of three-mesh-bvh.
export class Collider {
  constructor(geometries) {
    const clean = geometries.map((g) => {
      const c = new THREE.BufferGeometry();
      c.setAttribute('position', g.attributes.position.clone());
      c.setIndex(g.index ? g.index.clone() : [...Array(g.attributes.position.count).keys()]);
      return c;
    });
    this.geometry = mergeGeometries(clean);
    this.bvh = new MeshBVH(this.geometry);
    this._box = new THREE.Box3();
    this._seg = new THREE.Line3();
    this._tri = new THREE.Vector3();
    this._cap = new THREE.Vector3();
    this._ray = new THREE.Ray();
  }

  // capsule = { start, end, radius }: world-space centres of the bottom and top spheres.
  // Pushes the capsule out of the geometry in place; returns { onGround, delta }.
  collide(capsule) {
    const { start, end, radius } = capsule, seg = this._seg, box = this._box;
    seg.start.copy(start); seg.end.copy(end);
    box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
    box.min.addScalar(-radius); box.max.addScalar(radius);
    for (let pass = 0; pass < 2; pass++) {
      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(seg, this._tri, this._cap);
          if (d < radius) {
            const dir = this._cap.sub(this._tri).normalize();
            seg.start.addScaledVector(dir, radius - d);
            seg.end.addScaledVector(dir, radius - d);
          }
        },
      });
    }
    const delta = seg.start.clone().sub(start);
    start.copy(seg.start); end.copy(seg.end);
    const horiz = Math.hypot(delta.x, delta.z);
    return { onGround: delta.y > 1e-5 && delta.y >= horiz * 0.7, delta };
  }

  // Height of the first surface below (x, fromY, z), or null.
  groundHeight(x, z, fromY = 40) {
    this._ray.origin.set(x, fromY, z);
    this._ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(this._ray, THREE.DoubleSide);
    return hit ? hit.point.y : null;
  }
}
