import { describe, it, expect } from 'vitest';
import {
  addXp,
  bossMaxHp,
  bossRewardScale,
  bossTitle,
  canPromote,
  isMilestone,
  MAX_BOSS_HP,
  masteryStars,
  promotionMultiplier,
  rankTitle,
  requiredRank,
  upgradeCost,
  upgradedDef,
  xpToNext,
} from '../src/progression/Progression';
import { WEAPONS, weaponById } from '../src/combat/weapons/weaponDefs';

describe('boss levels', () => {
  it('get tougher and pay more, within limits', () => {
    expect(bossMaxHp(1)).toBe(400);
    expect(bossMaxHp(10)).toBe(940);
    for (let l = 1; l < 60; l++) {
      expect(bossMaxHp(l + 1)).toBeGreaterThanOrEqual(bossMaxHp(l));
      expect(bossRewardScale(l + 1)).toBeGreaterThan(bossRewardScale(l));
    }
    expect(bossMaxHp(500)).toBe(MAX_BOSS_HP);
    expect(bossTitle(1)).toBe('Assistant Manager');
    expect(bossTitle(999)).toBe('Chairman of the Board');
  });

  it('crowns every fifth boss', () => {
    expect([1, 2, 3, 4, 5, 10, 11].map(isMilestone)).toEqual([false, false, false, false, true, true, false]);
  });
});

describe('rank and XP', () => {
  it('needs more XP for every rank', () => {
    for (let r = 1; r < 40; r++) expect(xpToNext(r + 1)).toBeGreaterThan(xpToNext(r));
    expect(rankTitle(1)).toBe('Intern');
    expect(rankTitle(12)).toMatch(/^Office Legend /);
  });

  it('handles several rank-ups at once and keeps the leftover XP', () => {
    const need = xpToNext(1) + xpToNext(2);
    const { state, rankUps } = addXp({ rank: 1, xp: 0 }, need + 7);
    expect(rankUps).toEqual([2, 3]);
    expect(state).toEqual({ rank: 3, xp: 7 });
    expect(addXp(state, -50).state).toEqual(state);
  });

  it('gates premium weapons behind a rank, never the free ones', () => {
    for (const w of WEAPONS.filter((x) => x.price === 0)) expect(requiredRank(w)).toBe(0);
    expect(requiredRank(weaponById('tornado'))).toBeGreaterThanOrEqual(10);
    expect(requiredRank(weaponById('blackhole'))).toBeGreaterThan(requiredRank(weaponById('katana')));
  });
});

describe('weapon tiers and mastery', () => {
  it('upgrades scale damage and cooldown without touching the original', () => {
    const katana = weaponById('katana');
    const before = { damage: katana.damage, cooldown: katana.cooldown };
    const t3 = upgradedDef(katana, 3);
    expect(t3.damage).toBeCloseTo(before.damage * 1.45);
    expect(t3.cooldown).toBeLessThan(before.cooldown);
    expect(katana.damage).toBe(before.damage);
    expect(katana.cooldown).toBe(before.cooldown);
    expect(upgradedDef(katana, 0)).toBe(katana);
    expect(upgradedDef(katana, 0, 2).damage).toBeCloseTo(before.damage * 1.1);
  });

  it('costs more for every tier, with a floor for free weapons, and caps at 5', () => {
    const fists = weaponById('fists');
    expect(upgradeCost(fists, 0)).toBeGreaterThanOrEqual(100);
    for (let t = 0; t < 4; t++) expect(upgradeCost(fists, t + 1)!).toBeGreaterThan(upgradeCost(fists, t)!);
    expect(upgradeCost(fists, 5)).toBeNull();
  });

  it('awards mastery stars at 10, 50 and 200 knockouts', () => {
    expect([0, 9, 10, 49, 50, 199, 200, 5000].map(masteryStars)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('promotion', () => {
  it('unlocks at boss level 20 and stacks +25% coins', () => {
    expect(canPromote(19)).toBe(false);
    expect(canPromote(20)).toBe(true);
    expect(promotionMultiplier(0)).toBe(1);
    expect(promotionMultiplier(2)).toBe(1.5);
  });
});
