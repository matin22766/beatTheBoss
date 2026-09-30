import * as THREE from 'three';
import { ROOM } from '../physics/ArenaColliders';

const INSET = 0.3;

/**
 * Largest t in (0, 1] such that from + (to - from) * t stays inside the room box: a camera boom
 * that pulls in instead of poking through walls.
 */
export function clipToRoom(from: THREE.Vector3, to: THREE.Vector3): number {
  const min = [-ROOM.halfWidth + INSET, INSET, ROOM.back + INSET];
  const max = [ROOM.halfWidth - INSET, ROOM.height - INSET, ROOM.visualFront - INSET];
  const o = [from.x, from.y, from.z];
  const d = [to.x - from.x, to.y - from.y, to.z - from.z];
  let t = 1;
  for (let a = 0; a < 3; a++) {
    if (d[a] > 1e-9) t = Math.min(t, (max[a] - o[a]) / d[a]);
    else if (d[a] < -1e-9) t = Math.min(t, (min[a] - o[a]) / d[a]);
  }
  return Math.max(0.05, t);
}

/** Damped orbit camera with trauma-based screen shake and a focus mode for finishers. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  azimuth = 0;
  polar = 1.42;
  radius = 5.4;
  readonly target = new THREE.Vector3(0, 1.15, 0);

  private cur = { azimuth: 0, polar: 1.42, radius: 5.4 };
  private curTarget = new THREE.Vector3(0, 1.15, 0);
  private trauma = 0;
  private time = 0;
  private focus: { point: THREE.Vector3; radius: number; time: number } | null = null;
  private readonly home = new THREE.Vector3(0, 1.15, 0);

  static readonly LIMITS = { azimuth: 1.0, polarMin: 1.05, polarMax: 1.62, radiusMin: 3.2, radiusMax: 8 };

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.05, 100);
    this.apply(0);
  }

  orbit(dx: number, dy: number): void {
    const L = CameraRig.LIMITS;
    this.azimuth = THREE.MathUtils.clamp(this.azimuth - dx * 0.005, -L.azimuth, L.azimuth);
    this.polar = THREE.MathUtils.clamp(this.polar - dy * 0.004, L.polarMin, L.polarMax);
  }

  zoom(delta: number): void {
    const L = CameraRig.LIMITS;
    this.radius = THREE.MathUtils.clamp(this.radius * Math.exp(delta * 0.001), L.radiusMin, L.radiusMax);
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Temporarily push in on a point (death finisher). */
  focusOn(point: THREE.Vector3, radius: number, seconds: number): void {
    this.focus = { point: point.clone(), radius, time: seconds };
  }

  /** Softly follow the boss so he stays framed when thrown around. */
  follow(p: THREE.Vector3): void {
    this.target.set(THREE.MathUtils.clamp(p.x * 0.35, -1.5, 1.5), THREE.MathUtils.clamp(this.home.y + (p.y - 1) * 0.25, 0.8, 2), p.z * 0.2);
  }

  update(dt: number): void {
    this.time += dt;
    let tgt = this.target;
    let radius = this.radius;
    if (this.focus) {
      this.focus.time -= dt;
      tgt = this.focus.point;
      radius = this.focus.radius;
      if (this.focus.time <= 0) this.focus = null;
    }
    const k = 1 - Math.exp(-dt * 6);
    this.cur.azimuth += (this.azimuth - this.cur.azimuth) * k;
    this.cur.polar += (this.polar - this.cur.polar) * k;
    this.cur.radius += (radius - this.cur.radius) * k;
    this.curTarget.lerp(tgt, k);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.apply(this.trauma * this.trauma);
  }

  private apply(shake: number): void {
    const { azimuth, polar, radius } = this.cur;
    const c = this.camera;
    c.position.set(
      this.curTarget.x + radius * Math.sin(polar) * Math.sin(azimuth),
      this.curTarget.y + radius * Math.cos(polar),
      this.curTarget.z + radius * Math.sin(polar) * Math.cos(azimuth),
    );
    const t = clipToRoom(this.curTarget, c.position);
    if (t < 1) c.position.lerpVectors(this.curTarget, c.position, t * 0.98);
    c.lookAt(this.curTarget);
    if (shake > 0) {
      const t = this.time * 40;
      c.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.08 * shake;
      c.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5) * 0.08 * shake;
      c.rotation.z += Math.sin(t * 0.9 + 2) * 0.03 * shake;
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
