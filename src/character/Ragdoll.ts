import * as THREE from 'three';
import { RAPIER, G, groups, PHYSICS_DT, type PhysicsWorld } from '../physics/PhysicsWorld';
import { RAGDOLL, type PartDef, type PartName } from './RagdollDef';
import { POSES, type PoseName, type Rot } from './Poses';
import type { DamageTarget } from '../combat/DamageSystem';

export interface PartRuntime {
  def: PartDef;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  /** Joint to the parent part, null for the root or once severed. */
  joint: RAPIER.ImpulseJoint | null;
  parent: PartRuntime | null;
  children: PartRuntime[];
  /** Still connected (through any chain) to the pelvis. */
  attached: boolean;
  severed: boolean;
  broken: boolean;
  /** Remaining joint integrity before severing. */
  jointHp: number;
  inertia: number;
  swingLimit: number;
}

// Controller gains (per unit inertia, i.e. angular acceleration).
const KP = 520;
const KD = 42;
const LIMIT_KP = 900;
const UPRIGHT_KP = 380;
const UPRIGHT_KD = 34;
const MAX_ALPHA = 900;
const STAND_HEIGHT = 0.995;
const ARENA_SOFT_BOUND = { x: 3.6, zMin: -2.2, zMax: 2.2 };

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qT = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _e = new THREE.Euler();

function toQuat(r: { x: number; y: number; z: number; w: number }, out: THREE.Quaternion): THREE.Quaternion {
  return out.set(r.x, r.y, r.z, r.w);
}

/** Axis-angle vector (axis * angle) of a quaternion, taking the shortest path. */
function quatToRotVec(q: THREE.Quaternion, out: THREE.Vector3): THREE.Vector3 {
  let { x, y, z, w } = q;
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  const sinHalf = Math.sqrt(x * x + y * y + z * z);
  if (sinHalf < 1e-6) return out.set(x * 2, y * 2, z * 2);
  const angle = 2 * Math.atan2(sinHalf, w);
  const k = angle / sinHalf;
  return out.set(x * k, y * k, z * k);
}

const _sdp = { elements: new Float32Array(6) } as unknown as RAPIER.SdpMatrix3;

/** nᵀ · I⁻¹ · n using the body's world-space inverse inertia tensor. */
function invInertiaAlong(body: RAPIER.RigidBody, n: THREE.Vector3): number {
  const m = body.effectiveWorldInvInertia(_sdp).elements;
  const { x, y, z } = n;
  return m[0] * x * x + m[3] * y * y + m[5] * z * z + 2 * (m[1] * x * y + m[2] * x * z + m[4] * y * z);
}

/**
 * Apply an angular acceleration `alpha` as an equal/opposite torque impulse between two bodies,
 * scaled by the reduced inertia along its axis so explicit PD stays stable for any mass ratio.
 */
function applyRelativeAlpha(child: RAPIER.RigidBody, parent: RAPIER.RigidBody | null, alpha: THREE.Vector3, dt: number): void {
  const len = alpha.length();
  if (len < 1e-6) return;
  const n = _v3.copy(alpha).multiplyScalar(1 / len);
  const inv = invInertiaAlong(child, n) + (parent ? invInertiaAlong(parent, n) : 0);
  if (inv < 1e-9) return;
  const k = (len * dt) / inv;
  child.applyTorqueImpulse({ x: n.x * k, y: n.y * k, z: n.z * k }, true);
  parent?.applyTorqueImpulse({ x: -n.x * k, y: -n.y * k, z: -n.z * k }, true);
}

function rotToQuat(r: Rot | undefined, out: THREE.Quaternion): THREE.Quaternion {
  if (!r) return out.identity();
  return out.setFromEuler(_e.set(r[0], r[1], r[2]));
}

/**
 * Physics-only active ragdoll. Holds a procedural pose with PD torques between parts, keeps the
 * torso upright and supported while it has "strength", and goes limp when staggered or dead.
 */
export class Ragdoll implements DamageTarget {
  readonly parts = new Map<PartName, PartRuntime>();
  readonly byCollider = new Map<number, PartRuntime>();
  /** 0 = limp, 1 = fully in control. */
  strength = 1;
  dead = false;
  grabbed = false;
  faceYaw = 0;
  readonly home = new THREE.Vector3();

  private time = 0;
  private recoverDelay = 0;
  private pose: PoseName = 'idle';
  private prevPose: PoseName = 'idle';
  private poseBlend = 1;
  private poseBlendRate = 4;
  private poseTimer = 0;
  private readonly removeStep: () => void;

  constructor(
    private readonly physics: PhysicsWorld,
    origin = new THREE.Vector3(),
  ) {
    this.home.copy(origin);
    const world = physics.world;
    for (const def of RAGDOLL) {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(def.pos[0] + origin.x, def.pos[1] + origin.y, def.pos[2] + origin.z)
        .setLinearDamping(0.05)
        .setAngularDamping(0.6)
        .setCcdEnabled(true);
      const body = world.createRigidBody(bodyDesc);
      const cd = colliderDesc(def)
        .setMass(def.mass)
        .setFriction(0.9)
        .setRestitution(0.05)
        .setCollisionGroups(groups(G.BOSS, G.ARENA | G.BOSS | G.WEAPON | G.PROJECTILE | G.PROP))
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold((def.mass * 2.0) / PHYSICS_DT);
      const collider = world.createCollider(cd, body);
      const pi = body.principalInertia();
      const part: PartRuntime = {
        def,
        body,
        collider,
        joint: null,
        parent: null,
        children: [],
        attached: true,
        severed: false,
        broken: false,
        jointHp: def.joint?.severHp ?? Infinity,
        inertia: (pi.x + pi.y + pi.z) / 3,
        swingLimit: def.joint?.swingLimit ?? Math.PI,
      };
      this.parts.set(def.name, part);
      this.byCollider.set(collider.handle, part);
    }
    for (const part of this.parts.values()) {
      const { def } = part;
      if (!def.parent || !def.joint) continue;
      const parent = this.parts.get(def.parent)!;
      const j = def.joint;
      const a1 = { x: j.anchor[0] - parent.def.pos[0], y: j.anchor[1] - parent.def.pos[1], z: j.anchor[2] - parent.def.pos[2] };
      const a2 = { x: j.anchor[0] - def.pos[0], y: j.anchor[1] - def.pos[1], z: j.anchor[2] - def.pos[2] };
      let data: RAPIER.JointData;
      if (j.kind === 'revolute') {
        const ax = j.axis ?? [1, 0, 0];
        data = RAPIER.JointData.revolute(a1, a2, { x: ax[0], y: ax[1], z: ax[2] });
        if (j.limits) {
          data.limitsEnabled = true;
          data.limits = [j.limits[0], j.limits[1]];
        }
      } else {
        data = RAPIER.JointData.spherical(a1, a2);
      }
      const joint = world.createImpulseJoint(data, parent.body, part.body, true);
      joint.setContactsEnabled(false);
      part.joint = joint;
      part.parent = parent;
      parent.children.push(part);
    }
    this.removeStep = physics.onBeforeStep((dt) => this.update(dt));
  }

  get(name: PartName): PartRuntime {
    return this.parts.get(name)!;
  }

  position(name: PartName, out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.get(name).body.translation();
    return out.set(t.x, t.y, t.z);
  }

  totalAttachedMass(): number {
    let m = 0;
    for (const p of this.parts.values()) if (p.attached) m += p.def.mass;
    return m;
  }

  setPose(name: PoseName, blendTime = 0.25, holdFor = 0): void {
    if (name !== this.pose) {
      this.prevPose = this.pose;
      this.pose = name;
      this.poseBlend = 0;
      this.poseBlendRate = 1 / Math.max(0.01, blendTime);
    }
    this.poseTimer = holdFor;
  }

  currentPose(): PoseName {
    return this.pose;
  }

  /** Knock the boss off balance proportional to hit strength. */
  stagger(amount: number): void {
    if (this.dead) return;
    this.strength = Math.max(0, this.strength - amount);
    this.recoverDelay = Math.max(this.recoverDelay, 0.25 + amount * 1.2);
  }

  kill(): void {
    this.dead = true;
    this.strength = 0;
    for (const p of this.parts.values()) p.body.setAngularDamping(1.2);
  }

  isStanding(): boolean {
    const y = this.get('pelvis').body.translation().y;
    return !this.dead && this.strength > 0.6 && Math.abs(y - this.home.y - STAND_HEIGHT) < 0.2;
  }

  /** Cut the joint between `name` and its parent. Returns every part that became detached. */
  sever(name: PartName): PartName[] {
    const part = this.get(name);
    if (!part.joint || !part.parent) return [];
    this.physics.world.removeImpulseJoint(part.joint, true);
    part.joint = null;
    part.severed = true;
    part.parent.children = part.parent.children.filter((c) => c !== part);
    part.parent = null;
    const detached: PartName[] = [];
    const walk = (p: PartRuntime) => {
      p.attached = false;
      detached.push(p.def.name);
      p.body.setAngularDamping(0.3);
      p.children.forEach(walk);
    };
    walk(part);
    return detached;
  }

  breakBone(name: PartName): boolean {
    const part = this.get(name);
    if (part.broken || !isFinite(part.def.breakHp)) return false;
    part.broken = true;
    part.swingLimit *= 1.7;
    const j = part.joint;
    if (j && part.def.joint?.kind === 'revolute' && part.def.joint.limits) {
      const [lo, hi] = part.def.joint.limits;
      // A broken elbow/knee bends the wrong way: sickening, cartoonish.
      (j as RAPIER.RevoluteImpulseJoint).setLimits(lo - 1.2, hi + 1.2);
    }
    return true;
  }

  /** Children of `name` that are still connected to it (for cascading severs). */
  subtree(name: PartName): PartName[] {
    const out: PartName[] = [];
    const walk = (p: PartRuntime) => {
      out.push(p.def.name);
      p.children.forEach(walk);
    };
    walk(this.get(name));
    return out;
  }

  partState(name: PartName): PartRuntime {
    return this.get(name);
  }

  setJointHp(name: PartName, hp: number): void {
    this.get(name).jointHp = hp;
  }

  /** World position of the joint anchor between `name` and its parent (bind anchor moved with the child). */
  jointWorldAnchor(name: PartName, out = new THREE.Vector3()): THREE.Vector3 | null {
    const part = this.get(name);
    const j = part.def.joint;
    if (!j) return null;
    const t = part.body.translation();
    const q = toQuat(part.body.rotation(), _q1);
    return out
      .set(j.anchor[0] - part.def.pos[0], j.anchor[1] - part.def.pos[1], j.anchor[2] - part.def.pos[2])
      .applyQuaternion(q)
      .add(_v1.set(t.x, t.y, t.z));
  }

  nearestChildJoint(name: PartName, point: { x: number; y: number; z: number }, reach: number): PartName | null {
    let best: PartName | null = null;
    let bestD = reach;
    const p = new THREE.Vector3(point.x, point.y, point.z);
    const a = new THREE.Vector3();
    for (const child of this.get(name).children) {
      if (!isFinite(child.jointHp) || !this.jointWorldAnchor(child.def.name, a)) continue;
      const d = a.distanceTo(p);
      if (d < bestD) {
        bestD = d;
        best = child.def.name;
      }
    }
    return best;
  }

  applyImpulseAt(name: PartName, impulse: THREE.Vector3, point: THREE.Vector3): void {
    this.get(name).body.applyImpulseAtPoint(impulse, point, true);
  }

  private update(dt: number): void {
    this.time += dt;
    const dead = this.dead;

    // --- Strength dynamics ---
    if (!dead) {
      if (this.recoverDelay > 0) this.recoverDelay -= dt;
      else {
        const max = this.grabbed ? 0.3 : 1;
        this.strength += (max - this.strength) * Math.min(1, dt * (this.strength < max ? 0.9 : 6));
      }
    }

    // --- Pose selection & blend ---
    if (this.poseTimer > 0) this.poseTimer -= dt;
    else if (!dead) {
      const desired: PoseName = this.grabbed ? 'flail' : this.strength < 0.45 ? 'dizzy' : 'idle';
      this.setPose(desired, 0.3);
    }
    this.poseBlend = Math.min(1, this.poseBlend + dt * this.poseBlendRate);
    const poseA = POSES[this.prevPose](this.time);
    const poseB = POSES[this.pose](this.time);

    const s = dead ? 0 : this.strength;
    const gain = s * s;

    for (const part of this.parts.values()) {
      const parent = part.parent;
      if (!parent) continue;
      const cb = part.body;
      const pb = parent.body;
      const qc = toQuat(cb.rotation(), _q1);
      const qp = toQuat(pb.rotation(), _q2);
      const wc = cb.angvel();
      const wp = pb.angvel();
      const wRel = _v2.set(wc.x - wp.x, wc.y - wp.y, wc.z - wp.z);
      const alpha = _v1.set(0, 0, 0);

      // Soft cone limit for spherical joints (always active, even when dead).
      if (part.def.joint?.kind === 'spherical') {
        const qRel = _q3.copy(qp).invert().multiply(qc);
        const rel = quatToRotVec(qRel, new THREE.Vector3());
        const angle = rel.length();
        if (angle > part.swingLimit) {
          const excess = angle - part.swingLimit;
          const axisWorld = rel.multiplyScalar(1 / angle).applyQuaternion(qp);
          const along = wRel.dot(axisWorld);
          alpha.addScaledVector(axisWorld, -LIMIT_KP * excess - Math.max(0, along) * 30);
        }
      }

      // Pose-holding PD.
      const stiffness = part.broken ? 0 : (part.def.joint?.stiffness ?? 1) * gain;
      if (stiffness > 0.001) {
        const ra = poseA[part.def.name];
        const rb = poseB[part.def.name];
        const target = rotToQuat(ra, _qT).slerp(rotToQuat(rb, _q3), this.poseBlend);
        const qTargetWorld = target.premultiply(qp);
        const qErr = qTargetWorld.multiply(_q3.copy(qc).invert());
        const err = quatToRotVec(qErr, new THREE.Vector3());
        alpha.addScaledVector(err, KP * stiffness);
        alpha.addScaledVector(wRel, -KD * Math.sqrt(stiffness));
      } else {
        alpha.addScaledVector(wRel, -1.5);
      }

      const len = alpha.length();
      if (len > MAX_ALPHA) alpha.multiplyScalar(MAX_ALPHA / len);
      applyRelativeAlpha(cb, pb, alpha, dt);
    }

    if (dead || gain < 0.01) return;

    // --- Balance: keep the pelvis upright, facing the camera, and supported at standing height ---
    const pelvis = this.get('pelvis');
    const pbody = pelvis.body;
    const q = toQuat(pbody.rotation(), _q1);
    const qUp = _q2.setFromAxisAngle(_v1.set(0, 1, 0), this.faceYaw);
    const err = quatToRotVec(qUp.multiply(q.clone().invert()), new THREE.Vector3());
    const w = pbody.angvel();
    const upAlpha = err.multiplyScalar(UPRIGHT_KP * gain).sub(_v2.set(w.x, w.y, w.z).multiplyScalar(UPRIGHT_KD * Math.sqrt(gain)));
    // The pelvis drags the whole attached body round with it, so push harder than its own inertia.
    applyRelativeAlpha(pbody, null, upAlpha.multiplyScalar(3), dt);

    const legs = this.intactLegs();
    const t = pbody.translation();
    const v = pbody.linvel();
    const targetY = this.home.y + STAND_HEIGHT;
    const m = this.totalAttachedMass();
    const g = -this.physics.world.gravity.y;

    // "Muscle tone": cancel most of gravity on every attached part so the pose motors only have to
    // pose, not lift. Without working legs the boss can't hold himself up, so he mostly slumps.
    const comp = gain * (legs > 0 ? 0.92 : 0.25) * g * dt;
    for (const p of this.parts.values()) {
      if (p.attached) p.body.applyImpulse({ x: 0, y: p.def.mass * comp, z: 0 }, true);
    }
    // Height spring on the pelvis carries the remaining weight and gets him back on his feet.
    if (legs > 0 && t.y < targetY + 0.06) {
      const accel = Math.min(g + 16, Math.max(0, 0.08 * g + 60 * (targetY - t.y) - 9 * v.y));
      const support = gain * (legs / 2) * m * accel;
      pbody.applyImpulse({ x: 0, y: support * dt, z: 0 }, true);
    }
    // Plant horizontally while standing and walk back inside the arena if near a wall.
    if (legs === 2 && t.y > targetY - 0.35) {
      let fx = -v.x * 5;
      let fz = -v.z * 5;
      if (Math.abs(t.x) > ARENA_SOFT_BOUND.x) fx += -Math.sign(t.x) * 3;
      if (t.z < ARENA_SOFT_BOUND.zMin) fz += 3;
      if (t.z > ARENA_SOFT_BOUND.zMax) fz -= 3;
      pbody.applyImpulse({ x: fx * m * gain * dt, y: 0, z: fz * m * gain * dt }, true);
    }
  }

  private intactLegs(): number {
    let n = 0;
    for (const s of ['L', 'R'] as const) {
      const thigh = this.get(`thigh${s}`);
      const shin = this.get(`shin${s}`);
      if (thigh.attached && shin.attached && !thigh.broken && !shin.broken) n++;
    }
    return n;
  }

  dispose(): void {
    this.removeStep();
    const world = this.physics.world;
    for (const p of this.parts.values()) {
      if (p.joint) world.removeImpulseJoint(p.joint, false);
    }
    for (const p of this.parts.values()) world.removeRigidBody(p.body);
    this.parts.clear();
    this.byCollider.clear();
  }
}

function colliderDesc(def: PartDef): RAPIER.ColliderDesc {
  const s = def.shape;
  switch (s.kind) {
    case 'box':
      return RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz);
    case 'capsule':
      return RAPIER.ColliderDesc.capsule(s.halfHeight, s.radius);
    case 'ball':
      return RAPIER.ColliderDesc.ball(s.radius);
  }
}
