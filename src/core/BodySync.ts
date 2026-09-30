import * as THREE from 'three';
import type { RAPIER } from '../physics/PhysicsWorld';

interface SyncItem {
  body: RAPIER.RigidBody;
  obj: THREE.Object3D;
  prevP: THREE.Vector3;
  prevQ: THREE.Quaternion;
  curP: THREE.Vector3;
  curQ: THREE.Quaternion;
}

/**
 * Copies rigid-body transforms onto Object3Ds, interpolating between the last two fixed physics
 * steps so motion is smooth on high-refresh displays and during slow motion.
 * Objects must be direct children of the scene (world-space transforms).
 */
export class BodySync {
  private items: SyncItem[] = [];

  add(body: RAPIER.RigidBody, obj: THREE.Object3D): void {
    const t = body.translation();
    const r = body.rotation();
    const p = new THREE.Vector3(t.x, t.y, t.z);
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    this.items.push({ body, obj, prevP: p.clone(), prevQ: q.clone(), curP: p, curQ: q });
    obj.position.copy(p);
    obj.quaternion.copy(q);
  }

  remove(obj: THREE.Object3D): void {
    this.items = this.items.filter((i) => i.obj !== obj);
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.items = this.items.filter((i) => i.body !== body);
  }

  clear(): void {
    this.items = [];
  }

  /** Call after each physics step. */
  capture(): void {
    for (const i of this.items) {
      if (!i.body.isValid()) continue;
      i.prevP.copy(i.curP);
      i.prevQ.copy(i.curQ);
      const t = i.body.translation();
      const r = i.body.rotation();
      i.curP.set(t.x, t.y, t.z);
      i.curQ.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Call once per rendered frame with alpha = leftover accumulator / fixed dt. */
  apply(alpha: number): void {
    for (const i of this.items) {
      i.obj.position.lerpVectors(i.prevP, i.curP, alpha);
      i.obj.quaternion.slerpQuaternions(i.prevQ, i.curQ, alpha);
    }
  }
}
