import type { DamageType, HitInfo, HitResult } from '../core/types';
import type { PartDef, PartName } from '../character/RagdollDef';

/** What the damage rules need to know about a body. Implemented by Ragdoll (and fakes in tests). */
export interface DamageTarget {
  partState(name: PartName): { def: PartDef; attached: boolean; severed: boolean; broken: boolean; jointHp: number };
  setJointHp(name: PartName, hp: number): void;
  sever(name: PartName): PartName[];
  breakBone(name: PartName): boolean;
  /** For torso hits: the attached child whose joint anchor is nearest the point, if within reach. */
  nearestChildJoint(name: PartName, point: { x: number; y: number; z: number }, reach: number): PartName | null;
}

export const MAX_HP = 400;

/** How much each damage type hurts overall HP. */
export const HP_MULT: Record<DamageType, number> = {
  blunt: 1,
  sharp: 1.1,
  pierce: 1.2,
  explosive: 1.3,
  fire: 0.8,
  electric: 0.9,
  cold: 0.7,
};

/** How much each damage type eats into joint integrity (i.e. can cut limbs off). */
export const SEVER_MULT: Record<DamageType, number> = {
  blunt: 0,
  sharp: 1,
  pierce: 0.25,
  explosive: 0.8,
  fire: 0,
  electric: 0,
  cold: 0,
};

/** Blunt-ish types that can snap bones. */
const BREAKS: Partial<Record<DamageType, number>> = { blunt: 1, explosive: 0.7, cold: 0.5 };

export class DamageSystem {
  hp = MAX_HP;
  dead = false;
  /** Accumulated damage per part, drives bruising and expression intensity. */
  readonly partDamage = new Map<PartName, number>();

  constructor(private readonly target: DamageTarget) {}

  get hpFraction(): number {
    return Math.max(0, this.hp / MAX_HP);
  }

  apply(hit: HitInfo): HitResult {
    const result: HitResult = { dealt: 0, severed: [], broke: [], killed: false };
    const state = this.target.partState(hit.part);
    const amount = Math.max(0, hit.amount);
    if (amount <= 0) return result;

    // Detached pieces take cosmetic damage only.
    const vital = state.attached ? state.def.vital : 0;
    const headshot = hit.part === 'head' && hit.type === 'pierce' ? 1.8 : 1;
    const dealt = amount * HP_MULT[hit.type] * vital * headshot;
    result.dealt = dealt;
    this.partDamage.set(hit.part, (this.partDamage.get(hit.part) ?? 0) + amount);

    // Severing: torso hits cut the nearest limb joint, limb hits cut their own joint.
    const sev = SEVER_MULT[hit.type];
    if (sev > 0) {
      let victim: PartName | null = hit.part;
      if (!isFinite(state.jointHp) || !state.def.joint) {
        victim = this.target.nearestChildJoint(hit.part, hit.point, 0.2);
      }
      if (victim) {
        const v = this.target.partState(victim);
        if (!v.severed && isFinite(v.jointHp)) {
          const hp = v.jointHp - amount * sev;
          this.target.setJointHp(victim, hp);
          if (hp <= 0) result.severed.push(...this.target.sever(victim));
        }
      }
    }

    // Bone breaks: a single hard blunt hit above the part's threshold.
    const brk = BREAKS[hit.type] ?? 0;
    if (brk > 0 && !state.broken && state.attached && amount * brk >= state.def.breakHp) {
      if (this.target.breakBone(hit.part)) result.broke.push(hit.part);
    }

    if (!this.dead) {
      this.hp -= dealt;
      const decapitated = result.severed.includes('head');
      if (this.hp <= 0 || decapitated) {
        this.hp = Math.min(this.hp, 0);
        this.dead = true;
        result.killed = true;
      }
    }
    return result;
  }

  reset(): void {
    this.hp = MAX_HP;
    this.dead = false;
    this.partDamage.clear();
  }
}
