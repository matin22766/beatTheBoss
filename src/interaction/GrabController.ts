import * as THREE from 'three';
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import { ROOM } from '../physics/ArenaColliders';
import type { Boss } from '../character/Boss';
import type { PartName } from '../character/RagdollDef';

const OMEGA = 14; // spring natural frequency (rad/s) → snappy but not rigid
const ZETA = 0.6;

/**
 * Grab any body part and drag it with an implicit spring joint to a kinematic "hand" that follows
 * the cursor on a camera-facing plane. Letting go throws the boss with whatever speed he had.
 */
export class GrabController {
  part: PartName | null = null;
  /** Non-boss body being held (props). */
  body: RAPIER.RigidBody | null = null;
  private hand: RAPIER.RigidBody | null = null;
  private joint: RAPIER.ImpulseJoint | null = null;
  private readonly plane = new THREE.Plane();
  private readonly target = new THREE.Vector3();
  private readonly smoothed = new THREE.Vector3();
  private readonly removeStep: () => void;
  /** World-space hand position (for the glove cursor). */
  readonly handPos = new THREE.Vector3();

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly getBoss: () => Boss | null,
  ) {
    this.removeStep = physics.onBeforeStep(() => this.step());
  }

  get active(): boolean {
    return this.hand !== null;
  }

  /** Grab a boss part. */
  start(part: PartName, point: THREE.Vector3, camera: THREE.Camera): boolean {
    const boss = this.getBoss();
    if (!boss) return false;
    const rt = boss.ragdoll.get(part);
    // Mass the hand has to move: the whole boss if the part is still attached, else the loose chunk.
    const mass = rt.attached ? boss.ragdoll.totalAttachedMass() : boss.ragdoll.subtree(part).reduce((s, p) => s + boss.ragdoll.get(p).def.mass, 0);
    if (!this.attach(rt.body, mass, point, camera)) return false;
    this.part = part;
    boss.ragdoll.grabbed = true;
    return true;
  }

  /** Grab any other rigid body (arena props). */
  startBody(body: RAPIER.RigidBody, mass: number, point: THREE.Vector3, camera: THREE.Camera): boolean {
    if (!body.isDynamic()) return false;
    if (!this.attach(body, mass, point, camera)) return false;
    this.body = body;
    return true;
  }

  private attach(body: RAPIER.RigidBody, mass: number, point: THREE.Vector3, camera: THREE.Camera): boolean {
    this.release();
    const t = body.translation();
    const r = body.rotation();
    const inv = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
    const local = point.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(inv);
    const stiffness = mass * OMEGA * OMEGA;
    const damping = 2 * ZETA * OMEGA * mass;
    const world = this.physics.world;
    this.hand = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x, point.y, point.z));
    this.joint = world.createImpulseJoint(RAPIER.JointData.spring(0, stiffness, damping, { x: 0, y: 0, z: 0 }, local), this.hand, body, true);
    this.target.copy(point);
    this.smoothed.copy(point);
    this.handPos.copy(point);
    const n = new THREE.Vector3();
    camera.getWorldDirection(n);
    this.plane.setFromNormalAndCoplanarPoint(n, point);
    return true;
  }

  /** Update the target from a camera ray. */
  aim(ray: THREE.Ray): void {
    if (!this.active) return;
    const p = ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!p) return;
    const m = 0.15;
    p.x = THREE.MathUtils.clamp(p.x, -ROOM.halfWidth + m, ROOM.halfWidth - m);
    p.y = THREE.MathUtils.clamp(p.y, m, ROOM.height - m);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.back + m, ROOM.front - m);
    this.target.copy(p);
  }

  /** Move the hand straight to a world point (gravity gun). */
  setTarget(p: THREE.Vector3): void {
    this.target.copy(p);
  }

  /** Push/pull the drag plane along its normal (mouse wheel). */
  depth(delta: number): void {
    if (!this.active) return;
    this.plane.constant += delta;
  }

  private step(): void {
    if (!this.hand) return;
    const boss = this.getBoss();
    const lost = this.part ? !boss : !this.body || !this.body.isValid();
    if (lost) {
      this.release();
      return;
    }
    // Light smoothing removes mouse jitter without adding noticeable lag.
    this.smoothed.lerp(this.target, 0.6);
    this.hand.setNextKinematicTranslation(this.smoothed);
    this.handPos.copy(this.smoothed);
  }

  release(): PartName | null {
    const released = this.part;
    const world = this.physics.world;
    if (this.joint && this.joint.isValid()) world.removeImpulseJoint(this.joint, true);
    if (this.hand) world.removeRigidBody(this.hand);
    this.joint = null;
    this.hand = null;
    const wasBoss = this.part !== null;
    this.part = null;
    this.body = null;
    const boss = this.getBoss();
    if (boss && wasBoss) boss.ragdoll.grabbed = false;
    return released;
  }

  dispose(): void {
    this.release();
    this.removeStep();
  }
}
