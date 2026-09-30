import * as THREE from 'three';
import type { WeaponDef } from './types';

/**
 * The weapon held at the bottom-right of the screen (guns, sprays, throwables). It is parented to
 * the camera, turns to face the aim point and kicks back on each shot.
 */
export class ViewModel {
  readonly root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private muzzleLocal = new THREE.Vector3(0, 0, 0.3);
  private kick = 0;
  private bob = 0;
  private readonly rest = new THREE.Vector3(0.3, -0.19, -0.72);
  private current: string | null = null;

  constructor(private readonly camera: THREE.Camera) {
    camera.add(this.root);
    this.root.position.copy(this.rest);
  }

  show(def: WeaponDef | null): void {
    if (def?.id === this.current) return;
    this.current = def?.id ?? null;
    if (this.model) {
      this.root.remove(this.model);
      this.model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.model = null;
    }
    if (!def) return;
    const m = def.model();
    m.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.frustumCulled = false;
      }
    });
    const box = new THREE.Box3().setFromObject(m);
    this.muzzleLocal.set(0, (box.min.y + box.max.y) / 2 + 0.01, box.max.z);
    // Throwables are shown a bit bigger and closer.
    const scale = def.archetype === 'thrown' ? 1.1 : 0.85;
    m.scale.setScalar(scale);
    this.muzzleLocal.multiplyScalar(scale);
    this.model = m;
    this.root.add(m);
    this.kick = 1;
  }

  get visible(): boolean {
    return !!this.model && this.root.visible;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** World position of the muzzle / hand. */
  muzzle(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateWorldMatrix(true, false);
    return out.copy(this.muzzleLocal).applyMatrix4(this.root.matrixWorld);
  }

  /** A named sub-object of the held model (e.g. the minigun's 'barrels'). */
  part(name: string): THREE.Object3D | null {
    return this.model?.getObjectByName(name) ?? null;
  }

  recoil(amount = 1): void {
    this.kick = Math.min(1.5, this.kick + amount);
  }

  update(dt: number, aimPoint: THREE.Vector3): void {
    if (!this.model) return;
    this.kick = Math.max(0, this.kick - dt * 6);
    this.bob += dt;
    this.root.position.copy(this.rest);
    this.root.position.z += this.kick * 0.12;
    this.root.position.y += Math.sin(this.bob * 2) * 0.006 - this.kick * 0.02;
    // Aim: point +Z of the model at the target, expressed in camera space.
    const local = this.camera.worldToLocal(aimPoint.clone());
    const m = new THREE.Matrix4().lookAt(local, this.root.position, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.kick * 0.35));
    this.root.quaternion.slerp(q, Math.min(1, dt * 18));
  }
}
