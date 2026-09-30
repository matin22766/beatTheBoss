import type { PartName } from './RagdollDef';

/** Euler XYZ (radians) of a part relative to its parent, bind pose = [0,0,0]. */
export type Rot = [number, number, number];
export type Pose = Partial<Record<PartName, Rot>>;
export type PoseName =
  | 'idle'
  | 'guard'
  | 'flail'
  | 'taunt'
  | 'hurt'
  | 'cower'
  | 'dizzy'
  | 'walk'
  | 'getup'
  | 'sit'
  | 'phone'
  | 'dance'
  | 'stretch'
  | 'watch'
  | 'dodgeLeft'
  | 'dodgeRight'
  | 'duck'
  | 'matrix';

/** Mirror left-side rotations to the right side (reflection across the YZ plane). */
function mirror(left: Partial<Record<'upperArm' | 'lowerArm' | 'hand' | 'thigh' | 'shin' | 'foot', Rot>>): Pose {
  const out: Pose = {};
  for (const [k, r] of Object.entries(left) as [string, Rot][]) {
    out[`${k}L` as PartName] = r;
    out[`${k}R` as PartName] = [r[0], -r[1], -r[2]];
  }
  return out;
}

const s = Math.sin;

export const POSES: Record<PoseName, (t: number) => Pose> = {
  idle: (t) => ({
    // Gentle breathing and weight shift.
    chest: [0.03 * s(t * 1.6), 0.04 * s(t * 0.5), 0.02 * s(t * 0.7)],
    head: [0.05 * s(t * 1.1 + 1), 0.15 * s(t * 0.45), 0.04 * s(t * 0.8)],
    ...mirror({
      upperArm: [-0.12 + 0.04 * s(t * 1.6), 0, 0.14],
      lowerArm: [-0.35, 0, 0],
      hand: [0, 0, 0],
    }),
  }),
  guard: (t) => ({
    chest: [0.12, 0, 0],
    head: [0.08, 0.1 * s(t * 2), 0],
    ...mirror({
      upperArm: [-1.0 + 0.08 * s(t * 5), 0, 0.35],
      lowerArm: [-2.0, 0, 0],
      hand: [0.3, 0, 0],
      thigh: [-0.15, 0, 0.05],
      shin: [0.3, 0, 0],
    }),
  }),
  flail: (t) => ({
    chest: [0.15 * s(t * 9), 0.2 * s(t * 7), 0.1 * s(t * 11)],
    head: [0.3 * s(t * 8), 0.4 * s(t * 6), 0.2 * s(t * 10)],
    upperArmL: [-1.2 + 0.9 * s(t * 12), 0, 0.9 + 0.5 * s(t * 9)],
    upperArmR: [-1.2 + 0.9 * s(t * 12 + 2), 0, -0.9 - 0.5 * s(t * 9 + 1)],
    lowerArmL: [-1.0 - 0.8 * s(t * 14), 0, 0],
    lowerArmR: [-1.0 - 0.8 * s(t * 14 + 1.5), 0, 0],
    thighL: [-0.6 * s(t * 10), 0, 0.2],
    thighR: [0.6 * s(t * 10), 0, -0.2],
    shinL: [0.9 + 0.6 * s(t * 10 + 1), 0, 0],
    shinR: [0.9 + 0.6 * s(t * 10 + 2), 0, 0],
  }),
  taunt: (t) => ({
    chest: [-0.1, 0.25 * s(t * 3), 0],
    head: [-0.2, 0.3 * s(t * 3), 0.15 * s(t * 6)],
    upperArmL: [-0.2, 0, 1.2 + 0.2 * s(t * 8)],
    lowerArmL: [-1.6 + 0.4 * s(t * 8), 0, 0],
    upperArmR: [-0.2, 0, -1.2 - 0.2 * s(t * 8 + 1)],
    lowerArmR: [-1.6 + 0.4 * s(t * 8 + 1), 0, 0],
  }),
  hurt: (t) => ({
    chest: [0.35, 0.05 * s(t * 3), 0],
    head: [0.3, 0.1 * s(t * 2), 0.1],
    ...mirror({
      upperArm: [-0.5, 0, 0.1],
      lowerArm: [-1.2, 0, 0],
      thigh: [-0.2, 0, 0],
      shin: [0.4, 0, 0],
    }),
  }),
  cower: (t) => ({
    chest: [0.4, 0, 0],
    head: [0.45, 0.1 * s(t * 15), 0],
    ...mirror({
      upperArm: [-2.2, 0, 0.5 + 0.05 * s(t * 20)],
      lowerArm: [-2.2, 0, 0],
      hand: [0.4, 0, 0],
      thigh: [-0.25, 0, 0],
      shin: [0.5, 0, 0],
    }),
  }),
  /** t = gait phase (radians), advanced by distance walked. */
  walk: (p) => ({
    chest: [0.06, 0.12 * s(p), 0],
    head: [-0.04, -0.08 * s(p), 0],
    upperArmL: [0.45 * s(p), 0, 0.12],
    upperArmR: [-0.45 * s(p), 0, -0.12],
    lowerArmL: [-0.45, 0, 0],
    lowerArmR: [-0.45, 0, 0],
    thighL: [-0.55 * s(p), 0, 0.03],
    thighR: [0.55 * s(p), 0, -0.03],
    shinL: [0.15 + Math.max(0, -Math.cos(p)) * 0.8, 0, 0],
    shinR: [0.15 + Math.max(0, Math.cos(p)) * 0.8, 0, 0],
    footL: [-0.15 * s(p), 0, 0],
    footR: [0.15 * s(p), 0, 0],
  }),
  /** t = get-up progress 0 (on the floor) … 1 (standing). */
  getup: (k) => {
    const c = Math.max(0, Math.min(1, k));
    const crouch = 1 - c;
    return {
      chest: [0.9 * crouch, 0, 0],
      head: [-0.5 * crouch, 0, 0],
      ...mirror({
        upperArm: [-1.1 * crouch, 0, 0.2],
        lowerArm: [-0.3 * crouch, 0, 0],
        thigh: [-1.5 * crouch, 0, 0.12 * crouch],
        shin: [1.9 * crouch, 0, 0],
        foot: [-0.3 * crouch, 0, 0],
      }),
    };
  },
  sit: (t) => ({
    chest: [-0.05, 0.05 * s(t * 0.4), 0],
    head: [0.05, 0.25 * s(t * 0.35), 0],
    ...mirror({
      thigh: [-1.5, 0, 0.12],
      shin: [1.45, 0, 0],
      upperArm: [-0.5, 0, 0.2],
      lowerArm: [-0.9, 0, 0],
    }),
  }),
  phone: (t) => ({
    chest: [0.02, 0.15 * s(t * 0.7), 0],
    head: [0.08, 0.2 * s(t * 0.9), -0.15],
    upperArmR: [-0.4, 0, -1.35],
    lowerArmR: [-2.3, 0, 0],
    handR: [0, 0, 0.4],
    upperArmL: [-0.4 + 0.25 * s(t * 2.2), 0, 0.5 + 0.2 * s(t * 1.7)],
    lowerArmL: [-1.2 - 0.3 * s(t * 2.2), 0, 0],
  }),
  dance: (t) => ({
    chest: [0.08 * s(t * 8), 0.35 * s(t * 4), 0.15 * s(t * 4)],
    head: [0.15 * s(t * 8), 0.2 * s(t * 4 + 1), 0.2 * s(t * 4)],
    upperArmL: [-1.6 + 0.8 * s(t * 4), 0, 0.9 + 0.5 * s(t * 8)],
    upperArmR: [-1.6 - 0.8 * s(t * 4), 0, -0.9 - 0.5 * s(t * 8)],
    lowerArmL: [-1.2, 0, 0],
    lowerArmR: [-1.2, 0, 0],
    thighL: [-0.35 * Math.max(0, s(t * 4)), 0, 0.1],
    thighR: [-0.35 * Math.max(0, -s(t * 4)), 0, -0.1],
    shinL: [0.6 * Math.max(0, s(t * 4)), 0, 0],
    shinR: [0.6 * Math.max(0, -s(t * 4)), 0, 0],
  }),
  stretch: (t) => ({
    chest: [-0.25, 0, 0.25 * s(t * 0.9)],
    head: [-0.35, 0, 0.2 * s(t * 0.9)],
    ...mirror({ upperArm: [-0.2, 0, 2.7], lowerArm: [-0.3, 0, 0] }),
  }),
  watch: (t) => ({
    head: [0.45, 0.25, 0],
    chest: [0.1, 0.1, 0],
    upperArmL: [-1.3, 0, 0.35],
    lowerArmL: [-1.4 - 0.05 * s(t * 6), 0, 0],
    handL: [0.4, 0, 0],
  }),
  dodgeLeft: () => ({
    chest: [0.15, 0, 0.55],
    head: [0, 0, 0.35],
    ...mirror({ upperArm: [-0.6, 0, 0.9], lowerArm: [-1.2, 0, 0] }),
    thighL: [-0.3, 0, 0.35],
    thighR: [0, 0, 0.25],
    shinL: [0.6, 0, 0],
  }),
  dodgeRight: () => ({
    chest: [0.15, 0, -0.55],
    head: [0, 0, -0.35],
    ...mirror({ upperArm: [-0.6, 0, 0.9], lowerArm: [-1.2, 0, 0] }),
    thighR: [-0.3, 0, -0.35],
    thighL: [0, 0, -0.25],
    shinR: [0.6, 0, 0],
  }),
  duck: () => ({
    chest: [0.9, 0, 0],
    head: [0.4, 0, 0],
    ...mirror({ upperArm: [-2.4, 0, 0.4], lowerArm: [-2.1, 0, 0], thigh: [-1.3, 0, 0.1], shin: [1.8, 0, 0], foot: [-0.4, 0, 0] }),
  }),
  matrix: () => ({
    chest: [-0.85, 0, 0],
    head: [-0.4, 0, 0],
    ...mirror({ upperArm: [0.4, 0, 1.3], lowerArm: [-0.4, 0, 0], thigh: [0.25, 0, 0.12], shin: [1.1, 0, 0], foot: [-0.5, 0, 0] }),
  }),
  dizzy: (t) => ({
    chest: [0.1 * s(t * 2), 0, 0.2 * s(t * 2.5)],
    head: [0.35 * s(t * 3), 0.3 * s(t * 2), 0.35 * s(t * 3 + 1.5)],
    ...mirror({
      upperArm: [-0.2 + 0.3 * s(t * 2), 0, 0.45],
      lowerArm: [-0.5, 0, 0],
      thigh: [0, 0, 0.05],
    }),
  }),
};
