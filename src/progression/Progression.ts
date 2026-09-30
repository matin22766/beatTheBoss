import type { WeaponDef } from '../combat/weapons/types';

/**
 * Progression rules: boss levels, player rank and XP, weapon upgrade tiers, mastery and promotion.
 * Pure functions only (no DOM, no physics) so every curve is unit-tested.
 */

// ---------------------------------------------------------------- boss levels

export const BASE_BOSS_HP = 400;
export const MAX_BOSS_HP = 3000;

export function bossMaxHp(level: number): number {
  return Math.min(MAX_BOSS_HP, Math.round(BASE_BOSS_HP * (1 + 0.15 * (Math.max(1, level) - 1))));
}

/** Coin multiplier from the boss's level (hits and the knockout bonus). */
export function bossRewardScale(level: number): number {
  return 1 + 0.1 * (Math.max(1, level) - 1);
}

/** Higher-level bosses see more attacks coming. */
export function bossDodgeScale(level: number): number {
  return Math.min(2, 1 + 0.03 * Math.max(1, level));
}

/** Every fifth boss is a milestone: crowned, and pays triple for the knockout. */
export function isMilestone(level: number): boolean {
  return level > 0 && level % 5 === 0;
}

export const MILESTONE_BONUS = 3;

const BOSS_TITLES = ['Assistant Manager', 'Manager', 'Regional Manager', 'Director', 'Vice President', 'CEO', 'Chairman of the Board'];

export function bossTitle(level: number): string {
  return BOSS_TITLES[Math.min(BOSS_TITLES.length - 1, Math.floor((Math.max(1, level) - 1) / 4))];
}

// ---------------------------------------------------------------- player rank & XP

export const XP = {
  perDamage: 0.5,
  perSever: 15,
  perBreak: 8,
  koBase: 60,
  koPerLevel: 15,
};

export function koXp(bossLevel: number): number {
  return XP.koBase + XP.koPerLevel * Math.max(1, bossLevel);
}

/** XP needed to go from `rank` to `rank + 1`. */
export function xpToNext(rank: number): number {
  return Math.round(150 + 90 * Math.pow(Math.max(1, rank), 1.35));
}

const RANK_TITLES = ['Intern', 'Temp', 'Junior', 'Associate', 'Senior', 'Team Lead', 'Manager', 'Director', 'VP', 'C-Suite', 'Office Legend'];

export function rankTitle(rank: number): string {
  const r = Math.max(1, rank);
  if (r <= RANK_TITLES.length) return RANK_TITLES[r - 1];
  return `Office Legend ${toRoman(r - RANK_TITLES.length + 1)}`;
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let v = Math.min(39, n);
  for (const [k, s] of map)
    while (v >= k) {
      out += s;
      v -= k;
    }
  return out;
}

export interface RankState {
  rank: number;
  /** XP into the current rank. */
  xp: number;
}

/** Add XP; returns the new state and every rank reached on the way (for rewards and banners). */
export function addXp(state: RankState, amount: number): { state: RankState; rankUps: number[] } {
  let rank = Math.max(1, Math.floor(state.rank));
  let xp = Math.max(0, state.xp) + Math.max(0, amount);
  const rankUps: number[] = [];
  while (xp >= xpToNext(rank)) {
    xp -= xpToNext(rank);
    rank++;
    rankUps.push(rank);
  }
  return { state: { rank, xp }, rankUps };
}

/** Coins gifted on reaching a rank. */
export function rankReward(rank: number): number {
  return 100 * rank;
}

/** Premium weapons need a rank before they can be bought (free ones never do). */
export function requiredRank(def: Pick<WeaponDef, 'price'>): number {
  return def.price <= 0 ? 0 : Math.max(1, Math.round(def.price / 450));
}

// ---------------------------------------------------------------- weapon tiers & mastery

export const MAX_TIER = 5;
const TIER_COST = [0.4, 0.8, 1.4, 2.2, 3.5];

/** Price of upgrading from `tier` to `tier + 1` (null when maxed). */
export function upgradeCost(def: Pick<WeaponDef, 'price'>, tier: number): number | null {
  if (tier >= MAX_TIER) return null;
  return Math.round((Math.max(300, def.price) * TIER_COST[Math.max(0, tier)]) / 10) * 10;
}

export const MASTERY_STEPS = [10, 50, 200];

export function masteryStars(kills: number): number {
  return MASTERY_STEPS.filter((k) => kills >= k).length;
}

/** Damage multiplier from upgrade tier and mastery stars. */
export function damageScale(tier: number, stars: number): number {
  return (1 + 0.15 * tier) * (1 + 0.05 * stars);
}

export function cooldownScale(tier: number): number {
  return Math.max(0.5, 1 - 0.06 * tier);
}

/** The weapon as it fights after upgrades: a copy with scaled damage and cooldown. */
export function upgradedDef(def: WeaponDef, tier: number, stars = 0): WeaponDef {
  if (tier <= 0 && stars <= 0) return def;
  return { ...def, damage: def.damage * damageScale(tier, stars), cooldown: def.cooldown * cooldownScale(tier) };
}

export function stars(n: number, max: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}

// ---------------------------------------------------------------- promotion (prestige)

export const PROMOTE_AT = 20;

export function canPromote(bossLevel: number): boolean {
  return bossLevel >= PROMOTE_AT;
}

export function promotionMultiplier(promotions: number): number {
  return 1 + 0.25 * Math.max(0, promotions);
}
