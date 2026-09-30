import type * as THREE from 'three';
import type { PartName } from '../character/RagdollDef';

export type DamageType = 'blunt' | 'sharp' | 'pierce' | 'explosive' | 'fire' | 'electric' | 'cold';

export type DeathStyle =
  | 'crumple'
  | 'dismember'
  | 'decapitate'
  | 'shatter'
  | 'charcoal'
  | 'xray'
  | 'flatten'
  | 'orbit';

export interface HitInfo {
  part: PartName;
  amount: number;
  type: DamageType;
  point: THREE.Vector3;
  /** Direction the hit travels (unit). Used for impulses, blood direction and decal orientation. */
  dir: THREE.Vector3;
  /** Linear impulse (N·s) to apply at the hit point. 0 = none. */
  impulse: number;
  /** Source label, e.g. weapon id or "wall". */
  source: string;
  /** Scales the HP loss (explosions hit every part at once, so each part counts for less). */
  hpScale?: number;
}

export interface HitResult {
  dealt: number;
  severed: PartName[];
  broke: PartName[];
  killed: boolean;
}

export interface GameEvents {
  hit: { hit: HitInfo; result: HitResult };
  sever: { part: PartName; point: THREE.Vector3; type: DamageType };
  boneBreak: { part: PartName; point: THREE.Vector3 };
  impact: { part: PartName; point: THREE.Vector3; speed: number; normal: THREE.Vector3 };
  death: { style: DeathStyle; cause: HitInfo };
  respawn: Record<string, never>;
  coins: { amount: number; total: number; at?: THREE.Vector3; label?: string };
  grab: { part: PartName };
  release: { part: PartName };
  weaponFire: { weapon: string };
}
