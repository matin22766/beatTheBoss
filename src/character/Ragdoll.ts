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
  /**
   * How much harder this joint's motor must push than the part's own inertia suggests: turning a
   * thigh swings the whole leg below it (bind-pose inertia of the chain about the joint / own).
   */
  chainFactor: number;
  swingLimit: number;
}

// Controller gains (per unit inertia, i.e. angular acceleration).
const KP = 520;
const KD = 42;
const LIMIT_KP = 900;
const UPRIGHT_KP = 380;
const UPRIGHT_KD = 34;
const SPINE_KP = 160;
const SPINE_KD = 22;
const MAX_ALPHA = 900;
const CHAIN_CAP: Record<string, number> = { thigh: 5, shin: 3, foot: 3 };
/** Pelvis height when standing: a touch below straight-leg height, so his weight sits on his feet. */
const STAND_HEIGHT = 0.985;
/** Pelvis dip while walking (the stance knee stays soft). */
const WALK_DIP = 0.04;
/** A foot this close to the floor carries weight (full at contact, none at this height). */
const FOOT_CONTACT = 0.06;
/** Horizontal speed that makes him take a catch step instead of sliding. */
const CATCH_SPEED = 0.6;
/** Shoved faster than this, no catch step can save him. */
const FALL_SPEED = 2.2;
/** Chest this far (horizontally) outside his feet: he can't hold it and topples. */
const TOPPLE_OFFSET = 0.5;
const FEET: PartName[] = ['footL', 'footR'];
/** Parts that can push on the floor while getting up (knees, hands). */
const CRAWL: PartName[] = ['footL', 'footR', 'shinL', 'shinR', 'handL', 'handR', 'lowerArmL', 'lowerArmR'];
/** Upper body "muscle tone" helps the pose motors; pelvis and legs get none, so ~80% of his weight is on his feet. */
const TONED = new Set<PartName>(['chest', 'head', 'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR']);
const TONE = 0.4;
/** Soft knees for any pose that doesn't say what the legs do. */
const STANCE: Partial<Record<PartName, Rot>> = {
  thighL: [-0.08, 0, 0],
  thighR: [-0.08, 0, 0],
  shinL: [0.16, 0, 0],
  shinR: [0.16, 0, 0],
  footL: [-0.08, 0, 0],
  footR: [-0.08, 0, 0],
};
/** Poses that lean on purpose (no toppling mid-dodge). */
const LEANING = new Set<PoseName>(['matrix', 'dodgeLeft', 'dodgeRight', 'duck', 'flail', 'getup', 'sit', 'sitFloor']);
const ARENA_SOFT_BOUND = { x: 3.8, zMin: -2.2, zMax: 2.4 };
/** A part this close to the floor counts as touching it. */
const GROUND_EPS = 0.14;
const WALK_SPEED = 0.95;
const STRIDE = 0.55;

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
  /** When set, overrides faceYaw (activities turn him toward things). */
  lookYaw: number | null = null;
  readonly home = new THREE.Vector3();
  /** Where he is walking to, if anywhere. */
  walkTarget: THREE.Vector3 | null = null;
  walkSpeed = WALK_SPEED;
  /** Lowers the standing height (ducking, sitting). */
  heightOffset = 0;
  /** Gait phase in radians (advances with distance travelled, not time). */
  walkPhase = 0;
  /** Footstep callback (sound): fires when a foot lands. */
  onStep: ((foot: PartName) => void) | null = null;
  /** Sitting on something (a chair, the floor): whatever he sits on carries him, not his legs. */
  sitting = false;
  /** Lowering himself to sit on the floor (seconds in), 0 = not. */
  private floorSitT = 0;
  /** Rising support height while getting up (no instant levitation). */
  private supportY = STAND_HEIGHT;
  private gettingUp = false;
  private airTime = 0;
  /** Seconds left of a stumble (catch step) or landing crouch. */
  private stumbleT = 0;
  private landT = 0;
  private toppleT = 0;
  /** Seconds since he was last hit or shoved (catch steps only happen right after one). */
  private sinceShove = 10;
  private footDown: Record<string, boolean> = { footL: true, footR: true };
  /** Where each foot lifted off for its current swing. */
  private swingFrom: Record<string, THREE.Vector3 | null> = { footL: null, footR: null };

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
        .setFriction(def.name.startsWith('foot') ? 1.3 : 0.9)
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
        chainFactor: 1,
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
    for (const part of this.parts.values()) {
      const j = part.def.joint;
      if (!j) continue;
      const anchor = new THREE.Vector3(...j.anchor);
      let chain = 0;
      for (const n of this.subtree(part.def.name)) {
        const q = this.get(n);
        chain += q.inertia + q.def.mass * anchor.distanceToSquared(new THREE.Vector3(...q.def.pos));
      }
      // Only the legs need it (they carry him now); arms and head get muscle tone instead.
      const cap = CHAIN_CAP[part.def.name.replace(/[LR]$/, '')] ?? 1;
      part.chainFactor = Math.min(cap, chain / part.inertia);
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
    this.sinceShove = 0;
    this.recoverDelay = Math.max(this.recoverDelay, 0.25 + amount * 1.2);
    if (amount > 0.25) this.walkTarget = null;
  }

  kill(): void {
    this.dead = true;
    this.strength = 0;
    for (const p of this.parts.values()) p.body.setAngularDamping(1.2);
  }

  /** Sit down on the floor (lowering himself first), or get back up. */
  sitOnFloor(on: boolean): void {
    if (on) {
      if (!this.sitting && this.floorSitT === 0) this.floorSitT = 1e-3;
      this.walkTarget = null;
      return;
    }
    if (this.floorSitT > 0 || this.sitting) {
      this.floorSitT = 0;
      this.sitting = false;
      this.heightOffset = 0;
    }
  }

  /** Sitting, or on the way down to sit. */
  get seated(): boolean {
    return this.sitting || this.floorSitT > 0;
  }

  /** Walk to a point on the floor. */
  walkTo(x: number, z: number, speed = WALK_SPEED): void {
    this.walkTarget = new THREE.Vector3(
      THREE.MathUtils.clamp(x, -ARENA_SOFT_BOUND.x, ARENA_SOFT_BOUND.x),
      0,
      THREE.MathUtils.clamp(z, ARENA_SOFT_BOUND.zMin, ARENA_SOFT_BOUND.zMax),
    );
    this.walkSpeed = speed;
  }

  get walking(): boolean {
    return this.walkTarget !== null;
  }

  get isGettingUp(): boolean {
    return this.gettingUp;
  }

  /** World-space height of a part's lowest point, from its shape and current rotation. */
  lowestPoint(p: PartRuntime): number {
    const t = p.body.translation();
    const q = toQuat(p.body.rotation(), _q3);
    const s = p.def.shape;
    const axisY = (x: number, y: number, z: number) => Math.abs(_v3.set(x, y, z).applyQuaternion(q).y);
    let ext: number;
    if (s.kind === 'ball') ext = s.radius;
    else if (s.kind === 'capsule') ext = axisY(0, 1, 0) * s.halfHeight + s.radius;
    else ext = axisY(1, 0, 0) * s.hx + axisY(0, 1, 0) * s.hy + axisY(0, 0, 1) * s.hz;
    return t.y - ext;
  }

  /** Is any attached part touching (or nearly touching) the floor? */
  grounded(): boolean {
    for (const p of this.parts.values()) {
      if (p.attached && this.lowestPoint(p) - this.home.y < GROUND_EPS - 0.06) return true;
    }
    return false;
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
      const desired: PoseName = this.grabbed
        ? 'flail'
        : this.gettingUp
          ? 'getup'
          : this.strength < 0.45
            ? 'dizzy'
            : this.walkTarget
              ? this.stumbleT > 0
                ? 'stumble'
                : 'walk'
              : 'idle';
      this.setPose(desired, desired === 'walk' || desired === 'stumble' ? 0.15 : 0.3);
    }
    this.poseBlend = Math.min(1, this.poseBlend + dt * this.poseBlendRate);
    const clock = (p: PoseName) => (p === 'walk' || p === 'stumble' ? this.walkPhase : p === 'getup' ? (this.supportY - 0.2) / (STAND_HEIGHT - 0.2) : this.time);
    const poseA = { ...STANCE, ...POSES[this.prevPose](clock(this.prevPose)) };
    const poseB = { ...STANCE, ...POSES[this.pose](clock(this.pose)) };

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

      // Pose-holding PD. Walking, the stance hip goes soft so his body pivots over the planted foot
      // (instead of the leg dragging the foot along); the swing leg stays strong to lift and reach.
      let gaitK = 1;
      if (this.walkTarget && (part.def.name === 'thighL' || part.def.name === 'thighR')) gaitK = 0.35;
      const stiffness = part.broken ? 0 : (part.def.joint?.stiffness ?? 1) * gain * gaitK;
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
      applyRelativeAlpha(cb, pb, alpha.multiplyScalar(part.chainFactor), dt);
    }

    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.sinceShove += dt;
    if (this.floorSitT > 0 && !this.sitting) {
      // Bend the knees and lower himself; once his seat is nearly down, let the floor take him.
      this.floorSitT += dt;
      this.heightOffset = -0.85 * Math.min(1, this.floorSitT / 0.9);
      if (this.floorSitT > 0.9) this.sitting = true;
    }
    this.landT = Math.max(0, this.landT - dt);
    const grounded = this.grounded();
    // Landing from a throw or a fall: soak it up with the knees.
    if (grounded && this.airTime > 0.3 && !dead) {
      this.landT = 0.35;
      if (this.strength > 0.5) this.setPose('hurt', 0.08, 0.35);
    }
    this.airTime = grounded ? 0 : this.airTime + dt;
    this.detectFootfalls();
    if (dead || gain < 0.01) return;

    const pelvis = this.get('pelvis');
    const pbody = pelvis.body;
    const t = pbody.translation();
    const v = pbody.linvel();
    const m = this.totalAttachedMass();
    const g = -this.physics.world.gravity.y;
    // No self-righting or support in mid-air: he just falls.
    if (this.airTime > 0.15) {
      if (this.airTime > 0.4) this.walkTarget = null;
      return;
    }

    // --- Balance: keep the pelvis upright and facing where he's going ---
    const q = toQuat(pbody.rotation(), _q1);
    const yaw = this.walkTarget ? this.headingYaw() : (this.lookYaw ?? this.faceYaw);
    const qUp = _q2.setFromAxisAngle(_v1.set(0, 1, 0), yaw);
    const err = quatToRotVec(qUp.multiply(q.clone().invert()), new THREE.Vector3());
    const w = pbody.angvel();
    const upAlpha = err.multiplyScalar(UPRIGHT_KP * gain).sub(_v2.set(w.x, w.y, w.z).multiplyScalar(UPRIGHT_KD * Math.sqrt(gain)));
    // The pelvis drags the whole attached body round with it, so push harder than its own inertia.
    applyRelativeAlpha(pbody, null, upAlpha.multiplyScalar(3), dt);

    // Spine: hold the chest at its posed lean in world space (torque only, so it can't lift him).
    // Without this a bent-over torso is too heavy for the waist motor to straighten.
    const chest = this.get('chest');
    if (chest.attached && !chest.broken) {
      const lean = rotToQuat(poseA.chest, _qT).slerp(rotToQuat(poseB.chest, _q3), this.poseBlend);
      const qWant = new THREE.Quaternion().setFromAxisAngle(_v1.set(0, 1, 0), yaw).multiply(lean);
      const qc = toQuat(chest.body.rotation(), _q2);
      const cErr = quatToRotVec(qWant.multiply(qc.invert()), new THREE.Vector3());
      const cw = chest.body.angvel();
      const cAlpha = cErr.multiplyScalar(SPINE_KP * gain).sub(_v2.set(cw.x, cw.y, cw.z).multiplyScalar(SPINE_KD * Math.sqrt(gain)));
      applyRelativeAlpha(chest.body, null, cAlpha.multiplyScalar(4), dt);
    }

    // "Muscle tone" only for arms and head, so poses stay crisp. The rest of his weight is his legs' job.
    // Getting up he pushes himself off the floor with his arms, so the torso gets help too.
    const comp = gain * (this.gettingUp ? 0.85 : TONE) * g * dt;
    for (const p of this.parts.values()) {
      if (p.attached && TONED.has(p.def.name)) p.body.applyImpulse({ x: 0, y: p.def.mass * comp, z: 0 }, true);
    }

    // Sitting: the chair (or the floor) carries him.
    if (this.sitting) {
      this.walkTarget = null;
      this.gettingUp = false;
      return;
    }

    const legs = this.intactLegs();
    const height = t.y - this.home.y;
    // Knocked down: rise gradually through a get-up pose. (Ducking lowers the target on purpose.)
    if (height < STAND_HEIGHT + Math.min(0, this.heightOffset) - 0.3 && !this.gettingUp && legs > 0) {
      this.gettingUp = true;
      this.supportY = Math.max(0.15, height);
      this.walkTarget = null;
    }
    if (this.gettingUp) {
      if (gain > 0.35) this.supportY = Math.min(STAND_HEIGHT, this.supportY + dt * 0.75 * gain);
      const chestUp = this.position('chest', _v3).y - this.home.y > 1.2;
      if (this.supportY >= STAND_HEIGHT && height > STAND_HEIGHT - 0.1 && chestUp) this.gettingUp = false;
    } else {
      this.supportY = STAND_HEIGHT;
    }
    const dip = this.walkTarget ? WALK_DIP : 0;
    const crouch = this.landT > 0 ? 0.22 * (this.landT / 0.35) : 0;
    const targetY = this.home.y + this.supportY + (this.gettingUp ? 0 : this.heightOffset) - dip - crouch;

    // --- Support through the legs ---
    // An equal and opposite pair: the legs push the pelvis up by pushing the feet down. The net
    // force is zero, so only the floor pushing back can hold him up. He cannot float.
    const supports = this.supportParts(this.gettingUp ? CRAWL : FEET);
    if (this.walkTarget && !this.gettingUp) {
      // Walking: the stance leg carries him, the swing leg is free to lift. Left is in stance while
      // its thigh sweeps back (cos(phase) < 0).
      const gaitW = supports.map((sp) => sp.w * this.stanceOf(sp.part.def.name));
      // If the stance foot hasn't landed yet, whatever foot is down takes the weight.
      if (gaitW.reduce((a, w) => a + w, 0) > 0.25) supports.forEach((sp, i) => (sp.w = gaitW[i]));
    }
    let total = 0;
    for (const s of supports) total += s.w;
    const toneMass = [...TONED].reduce((sum, n) => sum + (this.get(n).attached ? this.get(n).def.mass * (this.gettingUp ? 0.85 : TONE) : 0), 0);
    const legK = legs === 2 ? 1 : legs === 1 ? 0.8 : 0;
    if (legK > 0 && total > 0) {
      const accel = THREE.MathUtils.clamp(((m - toneMass * gain) * g) / m + 90 * (targetY - t.y) - 12 * v.y, 0, g + 14);
      const f = gain * legK * m * accel * dt;
      pbody.applyImpulse({ x: 0, y: f, z: 0 }, true);
      for (const s of supports) s.part.body.applyImpulse({ x: 0, y: (-f * s.w) / total, z: 0 }, true);
    } else if (this.gettingUp && legK > 0 && height < 0.5) {
      // Flat on his back with nothing to push on yet: a little help to roll up onto his knees.
      pbody.applyImpulse({ x: 0, y: 0.35 * g * m * gain * dt, z: 0 }, true);
    }

    // --- Horizontal: plant, catch-step, or walk — also pushed through the stance feet ---
    const standY = this.home.y + STAND_HEIGHT;
    if (legs === 2 && t.y > standY - 0.35 && !this.gettingUp && total > 0) {
      const speed = Math.hypot(v.x, v.z);
      // Shoved: step into it instead of sliding like a statue.
      if (speed > FALL_SPEED && this.sinceShove < 0.5) {
        // Too hard to step out of: over he goes.
        this.stagger(0.9);
      } else if (!this.walkTarget && speed > CATCH_SPEED && this.sinceShove < 1 && this.strength > 0.6 && this.heightOffset === 0) {
        const k = Math.min(0.8, 0.35 + speed * 0.3);
        this.walkTo(t.x + (v.x / speed) * k, t.z + (v.z / speed) * k, Math.max(1.4, speed * 1.3));
        this.stumbleT = 0.6;
      }
      if (!this.walkTarget && (Math.abs(t.x) > ARENA_SOFT_BOUND.x || t.z < ARENA_SOFT_BOUND.zMin || t.z > ARENA_SOFT_BOUND.zMax)) {
        this.walkTo(t.x * 0.7, t.z * 0.7);
      }
      // Standing still: keep the hips over the feet (ankle strategy), not just stop them moving.
      const mid = this.feetMid();
      let dvx = -v.x;
      let dvz = -v.z;
      if (mid && !this.walkTarget) {
        dvx += THREE.MathUtils.clamp((mid.x - t.x) * 4, -0.6, 0.6);
        dvz += THREE.MathUtils.clamp((mid.z - t.z) * 4, -0.6, 0.6);
      }
      if (this.walkTarget) {
        const dx = this.walkTarget.x - t.x;
        const dz = this.walkTarget.z - t.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.12) {
          this.walkTarget = null;
          this.stumbleT = 0;
        } else {
          const sp = this.walkSpeed * Math.min(1, dist / 0.4);
          dvx = (dx / dist) * sp - v.x;
          dvz = (dz / dist) * sp - v.z;
          // Cadence follows the intended speed (half a cycle per stride), so his legs lead the way
          // and the planted foot pushes him along.
          this.walkPhase += (Math.max(sp, 0.35) * dt * Math.PI) / STRIDE;
        }
      }
      // Traction: only a loaded foot on the floor can push him along (friction-limited), so the
      // planted leg pivots under him like a real stance leg instead of skating.
      const k = 5 * m * gain * Math.min(1, total) * dt;
      const maxK = 1.2 * g * m * dt * Math.min(1, total);
      const len = Math.hypot(dvx, dvz) * k;
      const scale = len > maxK ? maxK / len : 1;
      pbody.applyImpulse({ x: dvx * k * scale, y: 0, z: dvz * k * scale }, true);
      if (this.walkTarget) this.stepFeet(dt, gain);
      else this.plantFeet();
    }

    // --- Topple: chest held too far outside his feet for too long ---
    const mid = this.feetMid();
    if (mid && !this.gettingUp && !this.walkTarget && !LEANING.has(this.pose) && this.heightOffset === 0) {
      const c = this.position('chest', _v3);
      this.toppleT = Math.hypot(c.x - mid.x, c.z - mid.z) > TOPPLE_OFFSET ? this.toppleT + dt : 0;
      if (this.toppleT > 0.3) {
        this.toppleT = 0;
        this.stagger(0.8);
      }
    } else this.toppleT = 0;
  }

  /**
   * Stepping controller: the swing foot is pulled along an arc to a landing spot ahead of the hips,
   * with an equal and opposite pull on the pelvis (so it moves the leg, never the whole body).
   * The stance foot stays planted by friction.
   */
  private stepFeet(dt: number, gain: number): void {
    const pel = this.get('pelvis');
    const t = pel.body.translation();
    const v = pel.body.linvel();
    const yaw = this.headingYaw();
    const fwd = _v1.set(Math.sin(yaw), 0, Math.cos(yaw));
    const speed = Math.hypot(v.x, v.z);
    // Wrap the phase to (-π, π]: the left foot swings while cos > 0, the right while cos < 0.
    const p = Math.atan2(Math.sin(this.walkPhase), Math.cos(this.walkPhase));
    for (const n of FEET) {
      const foot = this.get(n);
      const shin = this.get(n === 'footL' ? 'shinL' : 'shinR');
      if (!foot.attached || !shin.attached) continue;
      const q = n === 'footL' ? p : Math.atan2(Math.sin(p + Math.PI), Math.cos(p + Math.PI));
      const swinging = q > -Math.PI / 2 && q < Math.PI / 2;
      // Drive the ankle (not the foot's centre, which would just tip the foot over).
      const ankle = this.jointWorldAnchor(n, new THREE.Vector3())!;
      // A swinging sole slides instead of catching the floor; a planted one grips.
      foot.collider.setFriction(swinging ? 0.15 : 1.3);
      if (!swinging) {
        this.swingFrom[n] = null;
        continue;
      }
      if (!this.swingFrom[n]) this.swingFrom[n] = new THREE.Vector3(ankle.x, 0, ankle.z);
      const u = (q + Math.PI / 2) / Math.PI;
      const side = (n === 'footL' ? 1 : -1) * 0.12;
      const reach = 0.2 + speed * 0.18;
      const target = new THREE.Vector3(t.x + fwd.x * reach + fwd.z * side, 0, t.z + fwd.z * reach - fwd.x * side);
      const e = u * u * (3 - 2 * u);
      const want = this.swingFrom[n]!.clone().lerp(target, e);
      want.y = this.home.y + 0.11 + Math.sin(Math.PI * u) * 0.15;
      const sv = shin.body.linvel();
      const m = 5.2; // shin + foot
      const k = 260;
      const c = 26;
      const fx = m * (k * (want.x - ankle.x) - c * (sv.x - v.x)) * gain;
      const fy = m * (k * (want.y - ankle.y) - c * sv.y) * gain;
      const fz = m * (k * (want.z - ankle.z) - c * (sv.z - v.z)) * gain;
      const lim = 900;
      const len = Math.hypot(fx, fy, fz);
      const sc = len > lim ? (lim / len) * dt : dt;
      shin.body.applyImpulseAtPoint({ x: fx * sc, y: fy * sc, z: fz * sc }, ankle, true);
      pel.body.applyImpulse({ x: -fx * sc, y: -fy * sc, z: -fz * sc }, true);
    }
  }

  /** Standing: both soles grip. */
  private plantFeet(): void {
    for (const n of FEET) {
      this.swingFrom[n] = null;
      this.get(n).collider.setFriction(1.3);
    }
  }

  /** 1 = this foot is the stance foot in the current gait phase, 0 = swinging. */
  private stanceOf(foot: PartName): number {
    const c = Math.cos(this.walkPhase);
    // A brief double-support moment at each hand-over, then the swing foot is fully unloaded.
    return THREE.MathUtils.clamp(0.5 + (foot === 'footL' ? -c : c) * 6, 0, 1);
  }

  /** Midpoint between his attached feet (horizontal). */
  private feetMid(): THREE.Vector3 | null {
    const feet = FEET.filter((n) => this.get(n).attached);
    if (!feet.length) return null;
    const mid = new THREE.Vector3();
    for (const n of feet) mid.add(this.position(n, _v3));
    return mid.multiplyScalar(1 / feet.length);
  }

  /** Attached parts touching the floor, weighted by how firmly (1 = in contact). */
  private supportParts(names: PartName[]): Array<{ part: PartRuntime; w: number }> {
    const out: Array<{ part: PartRuntime; w: number }> = [];
    for (const n of names) {
      const p = this.get(n);
      if (!p.attached) continue;
      const h = this.lowestPoint(p) - this.home.y;
      const w = THREE.MathUtils.clamp((FOOT_CONTACT - h) / FOOT_CONTACT, 0, 1);
      if (w > 0) out.push({ part: p, w });
    }
    return out;
  }

  /** Heel-strike: fire a footstep when a foot comes down onto the floor while walking. */
  private detectFootfalls(): void {
    for (const n of FEET) {
      const p = this.get(n);
      if (!p.attached) continue;
      const h = this.lowestPoint(p) - this.home.y;
      const was = this.footDown[n];
      if (was && h > 0.025) this.footDown[n] = false;
      else if (!was && h < 0.015) {
        this.footDown[n] = true;
        if (this.walkTarget && !this.dead) this.onStep?.(n);
      }
    }
  }

  private headingYaw(): number {
    const t = this.get('pelvis').body.translation();
    const w = this.walkTarget!;
    return Math.atan2(w.x - t.x, w.z - t.z);
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
