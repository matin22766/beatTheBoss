import type * as THREE from 'three';
import { ROOM } from '../physics/ArenaColliders';

/** Where a ray hits the inside of the room box (for aiming at empty space). */
export function roomPoint(ray: THREE.Ray): THREE.Vector3 {
  let best = 30;
  const o = ray.origin;
  const d = ray.direction;
  const test = (t: number) => {
    if (t > 0.01 && t < best) best = t;
  };
  if (d.y < 0) test(-o.y / d.y);
  if (d.x > 0) test((ROOM.halfWidth - o.x) / d.x);
  if (d.x < 0) test((-ROOM.halfWidth - o.x) / d.x);
  if (d.z < 0) test((ROOM.back - o.z) / d.z);
  if (d.y > 0) test((ROOM.height - o.y) / d.y);
  return o.clone().addScaledVector(d, best);
}
