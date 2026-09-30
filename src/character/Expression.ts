import type * as THREE from 'three';

/** Normalised facial expression channels shared by the cartoon face and the photo face. */
export interface Expression {
  /** 0 calm … 1 agony (squeezed eyes, grimace). */
  pain: number;
  mouthOpen: number;
  /** Extra lid closure on top of blinking. */
  eyesClosed: number;
  /** -1 angry … +1 worried/scared. */
  brows: number;
  /** Spinning pupils / wobble. */
  dizzy: number;
  /** One-sided grin for taunts. */
  smirk: number;
  dead: boolean;
}

export const NEUTRAL: Expression = {
  pain: 0,
  mouthOpen: 0,
  eyesClosed: 0,
  brows: 0,
  dizzy: 0,
  smirk: 0,
  dead: false,
};

export interface FaceRig {
  /** Parented to the head part mesh (head-local frame, face looks down +Z). */
  readonly group: THREE.Group;
  /** Target expression; the rig eases toward it. */
  target: Expression;
  update(dt: number, time: number): void;
  dispose(): void;
}

export function blendExpression(cur: Expression, target: Expression, k: number): void {
  cur.pain += (target.pain - cur.pain) * k;
  cur.mouthOpen += (target.mouthOpen - cur.mouthOpen) * k;
  cur.eyesClosed += (target.eyesClosed - cur.eyesClosed) * k;
  cur.brows += (target.brows - cur.brows) * k;
  cur.dizzy += (target.dizzy - cur.dizzy) * k;
  cur.smirk += (target.smirk - cur.smirk) * k;
  cur.dead = target.dead;
}
