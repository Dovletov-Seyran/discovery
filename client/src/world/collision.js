import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GROUND = Math.sin(35 * Math.PI / 180);

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
    this._n = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  // capsule = { start, end, radius }: world-space centres of the bottom and top spheres.
  // Pushes the capsule out of the geometry in place; returns { onGround, delta }.
  collide(capsule) {
    const { start, end, radius } = capsule, seg = this._seg, box = this._box;
    seg.start.copy(start); seg.end.copy(end);
    box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
    box.min.addScalar(-radius); box.max.addScalar(radius);
    // Standing is decided per contact, not by the total push: pressed against a wall, a tree or the
    // bulwark the sideways push used to outweigh the floor's, and Space did nothing. A contact holds
    // the player up if it pushes up at 35° or steeper, i.e. the surface is at most 55° from level.
    let onGround = false;
    for (let pass = 0; pass < 3; pass++) {
      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(seg, this._tri, this._cap);
          if (d >= radius) return;
          if (d > 1e-5) {
            const dir = this._cap.sub(this._tri).normalize();
            if (dir.y >= GROUND) onGround = true;
            seg.start.addScaledVector(dir, radius - d);
            seg.end.addScaledVector(dir, radius - d);
            return;
          }
          // The capsule's axis goes right through the triangle (a big step, a spawn under the ground):
          // the direction above is zero and the capsule used to fall through. Push it out along the face
          // normal, the upward side for floors, by the depth of the lower end plus the radius.
          const n = tri.getNormal(this._n);
          if (n.y < 0) n.negate();
          if (n.y >= GROUND) onGround = true;
          const a = tri.a, below = Math.max(0, -n.dot(this._p.subVectors(seg.start, a)), -n.dot(this._p.subVectors(seg.end, a)));
          seg.start.addScaledVector(n, below + radius);
          seg.end.addScaledVector(n, below + radius);
        },
      });
    }
    const delta = seg.start.clone().sub(start);
    start.copy(seg.start); end.copy(seg.end);
    return { onGround, delta };
  }

  // Height of the first surface below (x, fromY, z), or null.
  groundHeight(x, z, fromY = 40) {
    this._ray.origin.set(x, fromY, z);
    this._ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(this._ray, THREE.DoubleSide);
    return hit ? hit.point.y : null;
  }
}
