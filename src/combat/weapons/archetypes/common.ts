import * as THREE from 'three';
import type { WeaponCtx } from '../types';
import type { PartRuntime } from '../../../character/Ragdoll';
import { ROOM } from '../../../physics/ArenaColliders';

/** Unlit additive-looking material for magic and energy effects (no cel outline). */
export function glow(color: number, opacity = 0.8, additive = false): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  m.userData.outlineParameters = { visible: false };
  return m;
}

const _y = new THREE.Vector3(0, 1, 0);

/** Stretch a unit-height, Y-aligned mesh (cylinder) between two points. */
export function orientBetween(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, thickness = 1): void {
  const d = b.clone().sub(a);
  const len = Math.max(1e-4, d.length());
  obj.position.copy(a).addScaledVector(d, 0.5);
  obj.quaternion.setFromUnitVectors(_y, d.multiplyScalar(1 / len));
  obj.scale.set(thickness, len, thickness);
}

/** Thin rope/beam cylinder, one unit tall, for `orientBetween`. */
export function strand(color: number, radius = 0.012, opacity = 1): THREE.Mesh {
  const m = opacity < 1 ? glow(color, opacity) : new THREE.MeshBasicMaterial({ color });
  m.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true), m);
  mesh.frustumCulled = false;
  return mesh;
}

/** Attached, living boss parts with their world positions. */
export function liveParts(ctx: WeaponCtx): Array<{ part: PartRuntime; pos: THREE.Vector3 }> {
  const boss = ctx.boss();
  if (!boss) return [];
  const out: Array<{ part: PartRuntime; pos: THREE.Vector3 }> = [];
  for (const part of boss.ragdoll.parts.values()) {
    const t = part.body.translation();
    out.push({ part, pos: new THREE.Vector3(t.x, t.y, t.z) });
  }
  return out;
}

/** Closest boss part to a point (attached parts first). */
export function nearestPart(ctx: WeaponCtx, point: THREE.Vector3, maxDist = Infinity, attachedOnly = true): { part: PartRuntime; pos: THREE.Vector3; dist: number } | null {
  let best: { part: PartRuntime; pos: THREE.Vector3; dist: number } | null = null;
  for (const { part, pos } of liveParts(ctx)) {
    if (attachedOnly && !part.attached) continue;
    const d = pos.distanceTo(point);
    if (d < maxDist && (!best || d < best.dist)) best = { part, pos, dist: d };
  }
  return best;
}

/** Keep a point inside the physical room. */
export function clampToRoom(p: THREE.Vector3, margin = 0.3): THREE.Vector3 {
  p.x = THREE.MathUtils.clamp(p.x, -ROOM.halfWidth + margin, ROOM.halfWidth - margin);
  p.y = THREE.MathUtils.clamp(p.y, margin, ROOM.height - margin);
  p.z = THREE.MathUtils.clamp(p.z, ROOM.back + margin, ROOM.front - margin);
  return p;
}

/** Where on the floor an attack aimed at `aim` should land (under the boss part if one was hit). */
export function floorTarget(point: THREE.Vector3): THREE.Vector3 {
  return clampToRoom(point.clone(), 0.4).setY(0);
}

/** Outward normal of the room surface a point lies on (for ricochets and decals). */
export function roomNormal(p: THREE.Vector3): THREE.Vector3 {
  const cands: Array<[number, THREE.Vector3]> = [
    [Math.abs(p.y), new THREE.Vector3(0, 1, 0)],
    [Math.abs(ROOM.height - p.y), new THREE.Vector3(0, -1, 0)],
    [Math.abs(ROOM.halfWidth - p.x), new THREE.Vector3(-1, 0, 0)],
    [Math.abs(ROOM.halfWidth + p.x), new THREE.Vector3(1, 0, 0)],
    [Math.abs(p.z - ROOM.back), new THREE.Vector3(0, 0, 1)],
    [Math.abs(ROOM.front - p.z), new THREE.Vector3(0, 0, -1)],
  ];
  cands.sort((a, b) => a[0] - b[0]);
  return cands[0][1];
}

/** A flat telegraph ring on the floor that pulses and then fades. */
export class FloorMarker {
  readonly mesh: THREE.Mesh;
  private t = 0;

  constructor(
    private readonly scene: THREE.Scene,
    at: THREE.Vector3,
    color: number,
    radius: number,
    private readonly life: number,
  ) {
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 32), glow(color, 0.8));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(at.x, 0.02, at.z);
    scene.add(this.mesh);
  }

  /** Returns false once expired (and removed). */
  update(dt: number): boolean {
    this.t += dt;
    const k = this.t / this.life;
    this.mesh.scale.setScalar(1 + Math.sin(this.t * 20) * 0.08);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k * k);
    if (k < 1) return true;
    this.dispose();
    return false;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
