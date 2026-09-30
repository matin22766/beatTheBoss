/**
 * Data-only description of the boss ragdoll in its bind pose (standing, arms down, facing +Z).
 * All bodies are created with identity rotation, so a joint's relative rotation is identity
 * in the bind pose and pose targets are simple local rotations.
 * Units: metres, kilograms. The boss's left side is +X (he faces the camera on +Z).
 */

export type PartName =
  | 'pelvis'
  | 'chest'
  | 'head'
  | 'upperArmL'
  | 'lowerArmL'
  | 'handL'
  | 'upperArmR'
  | 'lowerArmR'
  | 'handR'
  | 'thighL'
  | 'shinL'
  | 'footL'
  | 'thighR'
  | 'shinR'
  | 'footR';

export type ShapeDef =
  | { kind: 'box'; hx: number; hy: number; hz: number }
  | { kind: 'capsule'; halfHeight: number; radius: number }
  | { kind: 'ball'; radius: number };

export type Vec3Tuple = [number, number, number];

export interface JointDef {
  kind: 'spherical' | 'revolute';
  /** World-space anchor in bind pose. */
  anchor: Vec3Tuple;
  /** Revolute: local hinge axis and angle limits (radians). */
  axis?: Vec3Tuple;
  limits?: [number, number];
  /** Spherical: soft cone limit on total rotation away from bind pose (radians). */
  swingLimit?: number;
  /** Multiplier on the pose-holding motor strength. */
  stiffness: number;
  /** Damage the joint absorbs from cutting/explosive damage before it severs. Infinity = never. */
  severHp: number;
}

export interface PartDef {
  name: PartName;
  shape: ShapeDef;
  /** Bind-pose world centre. */
  pos: Vec3Tuple;
  mass: number;
  parent?: PartName;
  joint?: JointDef;
  /** Blunt damage in a single hit that breaks this part's bone. Infinity = unbreakable. */
  breakHp: number;
  /** Multiplier on damage dealt to the boss's total HP when this part is hit. */
  vital: number;
  side?: 'L' | 'R';
}

const armX = 0.3;
const legX = 0.11;

function side<T extends PartDef>(def: T, s: 'L' | 'R'): T {
  // Mirror a left-side definition to the right side (flip X, swap L/R in names).
  if (s === 'L') return { ...def, side: 'L' };
  const flip = (v: Vec3Tuple): Vec3Tuple => [-v[0], v[1], v[2]];
  const rename = <N extends string>(n: N) => n.replace(/L$/, 'R') as N;
  return {
    ...def,
    side: 'R',
    name: rename(def.name),
    pos: flip(def.pos),
    parent: def.parent && def.parent.endsWith('L') ? rename(def.parent) : def.parent,
    joint: def.joint && { ...def.joint, anchor: flip(def.joint.anchor) },
  };
}

const leftArm: PartDef[] = [
  {
    name: 'upperArmL',
    shape: { kind: 'capsule', halfHeight: 0.12, radius: 0.07 },
    pos: [armX, 1.36, 0],
    mass: 2.5,
    parent: 'chest',
    joint: { kind: 'spherical', anchor: [armX - 0.02, 1.52, 0], swingLimit: 2.7, stiffness: 0.6, severHp: 55 },
    breakHp: 22,
    vital: 0.6,
  },
  {
    name: 'lowerArmL',
    shape: { kind: 'capsule', halfHeight: 0.1, radius: 0.06 },
    pos: [armX, 1.05, 0],
    mass: 1.8,
    parent: 'upperArmL',
    // Rotation about +X by a negative angle swings the forearm forward (+Z).
    joint: { kind: 'revolute', anchor: [armX, 1.19, 0], axis: [1, 0, 0], limits: [-2.5, 0.05], stiffness: 0.5, severHp: 40 },
    breakHp: 18,
    vital: 0.5,
  },
  {
    name: 'handL',
    shape: { kind: 'ball', radius: 0.075 },
    pos: [armX, 0.83, 0],
    mass: 0.6,
    parent: 'lowerArmL',
    joint: { kind: 'spherical', anchor: [armX, 0.9, 0], swingLimit: 1.2, stiffness: 0.3, severHp: 30 },
    breakHp: 14,
    vital: 0.4,
  },
];

const leftLeg: PartDef[] = [
  {
    name: 'thighL',
    shape: { kind: 'capsule', halfHeight: 0.15, radius: 0.085 },
    pos: [legX, 0.72, 0],
    mass: 8,
    parent: 'pelvis',
    joint: { kind: 'spherical', anchor: [legX, 0.93, 0], swingLimit: 1.9, stiffness: 1.2, severHp: 70 },
    breakHp: 30,
    vital: 0.7,
  },
  {
    name: 'shinL',
    shape: { kind: 'capsule', halfHeight: 0.14, radius: 0.07 },
    pos: [legX, 0.3, 0],
    mass: 4,
    parent: 'thighL',
    // Knee bends backwards: positive rotation about +X swings the shin toward -Z.
    joint: { kind: 'revolute', anchor: [legX, 0.5, 0], axis: [1, 0, 0], limits: [-0.05, 2.4], stiffness: 1.2, severHp: 50 },
    breakHp: 24,
    vital: 0.6,
  },
  {
    name: 'footL',
    shape: { kind: 'box', hx: 0.065, hy: 0.045, hz: 0.13 },
    pos: [legX, 0.045, 0.04],
    mass: 1.2,
    parent: 'shinL',
    joint: { kind: 'spherical', anchor: [legX, 0.11, 0], swingLimit: 0.7, stiffness: 0.8, severHp: 35 },
    breakHp: 16,
    vital: 0.4,
  },
];

export const RAGDOLL: PartDef[] = [
  {
    name: 'pelvis',
    shape: { kind: 'box', hx: 0.18, hy: 0.1, hz: 0.12 },
    pos: [0, 1.0, 0],
    mass: 12,
    breakHp: Infinity,
    vital: 1,
  },
  {
    name: 'chest',
    shape: { kind: 'box', hx: 0.21, hy: 0.23, hz: 0.14 },
    pos: [0, 1.35, 0],
    mass: 22,
    parent: 'pelvis',
    joint: { kind: 'spherical', anchor: [0, 1.11, 0], swingLimit: 0.8, stiffness: 1.5, severHp: Infinity },
    breakHp: Infinity,
    vital: 1.2,
  },
  {
    name: 'head',
    shape: { kind: 'ball', radius: 0.25 },
    pos: [0, 1.88, 0],
    mass: 6,
    parent: 'chest',
    joint: { kind: 'spherical', anchor: [0, 1.6, 0], swingLimit: 0.9, stiffness: 0.7, severHp: 60 },
    breakHp: Infinity,
    vital: 1.6,
  },
  ...leftArm.map((d) => side(d, 'L')),
  ...leftArm.map((d) => side(d, 'R')),
  ...leftLeg.map((d) => side(d, 'L')),
  ...leftLeg.map((d) => side(d, 'R')),
];

export const PART_NAMES: PartName[] = RAGDOLL.map((d) => d.name);

export function getPartDef(name: PartName): PartDef {
  const d = RAGDOLL.find((p) => p.name === name);
  if (!d) throw new Error(`Unknown part ${name}`);
  return d;
}

/** Parts whose loss removes a supporting leg. */
export const LEG_CHAINS: Record<'L' | 'R', PartName[]> = {
  L: ['thighL', 'shinL', 'footL'],
  R: ['thighR', 'shinR', 'footR'],
};

export const TOTAL_MASS = RAGDOLL.reduce((s, p) => s + p.mass, 0);
