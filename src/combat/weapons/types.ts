import type * as THREE from 'three';
import type { DamageType, HitInfo, HitResult } from '../../core/types';
import type { SoundName, LoopName } from '../../audio/AudioEngine';
import type { PartName } from '../../character/RagdollDef';
import type { Boss } from '../../character/Boss';
import type { Effects } from '../../fx/Effects';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';
import type { BodySync } from '../../core/BodySync';
import type { CameraRig } from '../../core/CameraRig';
import type { ViewModel } from './ViewModel';
import type { PropHit, PropSystem } from '../../props/PropSystem';

export type WeaponCategory = 'blunt' | 'sharp' | 'gun' | 'explosive' | 'elemental' | 'magic' | 'drop' | 'special';
export type Archetype = 'melee' | 'thrown' | 'hitscan' | 'projectile' | 'spray' | 'saw' | 'field' | 'summon' | 'strike' | 'turret' | 'tether' | 'gravity';

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
  /** Builds the visual model (grip at origin, pointing along +Z). */
  model: () => THREE.Object3D;
  /** Visual for the fired projectile, if different from the weapon itself. */
  projectile?: () => THREE.Object3D;
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
    /** Thrown: spawn above the target and let it fall. */
    drop?: boolean;
    /** Projectile spin (rad/s) around its local X axis. */
    spin?: number;
    /** Gravity multiplier for swept projectiles. */
    gravity?: number;
    /** Collider shape for physical throwables. */
    shape?: 'box' | 'ball';
    half?: [number, number, number];
    /** Projectile spin axis (default x). */
    spinAxis?: 'x' | 'y';
    /** Projectile: bounce off walls this many times (and fly on through the boss). */
    ricochet?: number;
    /** Projectile: curve back to the hand like a boomerang. */
    returns?: boolean;
    /** Projectile: particle trail colour instead of the rocket flame. */
    trail?: number;
    /** Thrown: hang from the ceiling on a chain and swing through the target. */
    pendulum?: boolean;
    /** Thrown: sound on the first hard landing. */
    landSound?: SoundName;
    /** Spray: draw a solid beam of this colour. */
    beam?: number;
    /** Hitscan: seconds of barrel spin before the first shot. */
    spinUp?: number;
    /** Melee: slam the floor with a knock-up shockwave of this radius. */
    shockwave?: number;
    /** Field / summon / turret lifetime (seconds). */
    duration?: number;
    /** Which variant of a multi-weapon archetype this is. */
    kind?: string;
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
  /** Arena object under the cursor, if it is closer than the boss. */
  prop?: PropHit | null;
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
  viewModel: ViewModel;
  props: PropSystem;
  /** Ask the boss to dodge an incoming attack; true = it will miss. */
  tryDodge(kind: 'fist' | 'melee' | 'bullet' | 'projectile', dir: THREE.Vector3): boolean;
  /** Nearest of boss/prop along a ray (props block shots aimed through them). */
  raycastProp(ray: THREE.Ray, maxDist?: number): PropHit | null;
  /** Current world time (seconds, slow-mo scaled). */
  now(): number;
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
