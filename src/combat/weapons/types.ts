import type * as THREE from 'three';
import type { DamageType, HitInfo, HitResult } from '../../core/types';
import type { SoundName, LoopName } from '../../audio/AudioEngine';
import type { PartName } from '../../character/RagdollDef';
import type { Boss } from '../../character/Boss';
import type { Effects } from '../../fx/Effects';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';
import type { BodySync } from '../../core/BodySync';
import type { CameraRig } from '../../core/CameraRig';

export type WeaponCategory = 'blunt' | 'sharp' | 'gun' | 'explosive' | 'elemental' | 'drop';
export type Archetype = 'melee' | 'thrown' | 'hitscan' | 'projectile' | 'explosive' | 'spray' | 'drop' | 'saw';

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  archetype: Archetype;
  /** Emoji icon for the weapon bar. */
  icon: string;
  price: number;
  damage: number;
  type: DamageType;
  /** Knock-back impulse (N·s). */
  impulse: number;
  /** Seconds between uses. */
  cooldown: number;
  /** Keep firing while the button is held. */
  auto?: boolean;
  sound: SoundName;
  hitSound?: SoundName;
  loop?: LoopName;
  /** Comic words that may pop on hit. */
  words?: string[];
  /** Builds the visual model (weapon-local, pointing down −Z, handle at origin). */
  model: () => THREE.Object3D;
  /** Archetype tuning. */
  opts?: {
    swing?: 'overhead' | 'side' | 'jab' | 'stab';
    reach?: number;
    pellets?: number;
    spread?: number;
    speed?: number;
    mass?: number;
    fuse?: number;
    radius?: number;
    sticky?: boolean;
    range?: number;
    embed?: boolean;
    count?: number;
    size?: number;
    tint?: number;
  };
}

export interface BossHit {
  part: PartName;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface Aim {
  ray: THREE.Ray;
  /** Boss surface under the cursor, if any. */
  hit: BossHit | null;
  /** First world point under the cursor (boss or room). */
  point: THREE.Vector3;
}

export interface WeaponCtx {
  scene: THREE.Scene;
  rig: CameraRig;
  physics: PhysicsWorld;
  sync: BodySync;
  fx: Effects;
  boss(): Boss | null;
  /** Damage the boss (no-op if there is none). */
  hitBoss(info: HitInfo): HitResult | null;
  /** Raycast the boss meshes. */
  raycastBoss(ray: THREE.Ray, maxDist?: number): BossHit | null;
  /** Map a collider handle to a live boss part. */
  partForCollider(handle: number): PartName | null;
  hitstop(seconds: number): void;
}

export interface WeaponBehavior {
  down(aim: Aim): void;
  hold?(aim: Aim, dt: number): void;
  up?(): void;
  /** Called every rendered frame (real seconds, scaled for slow-mo). */
  update(dt: number): void;
  /** Called after each physics step with contact data (projectiles). */
  afterStep?(): void;
  dispose(): void;
}
