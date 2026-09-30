import type { HitResult } from '../core/types';

export const COMBO_WINDOW = 1.2;
export const SEVER_BONUS = 25;
export const BREAK_BONUS = 10;
export const DEFEAT_BONUS = 150;

/** Coin rules. Pure and clock-driven so it can be unit tested. */
export class Economy {
  coins = 0;
  combo = 0;
  /** Boss-level and promotion multiplier on every payout. */
  rewardScale = 1;
  /** Extra multiplier on the knockout bonus (milestone bosses). */
  koBonusScale = 1;
  private lastHitAt = -Infinity;

  constructor(initialCoins = 0) {
    this.coins = initialCoins;
  }

  get multiplier(): number {
    return 1 + Math.min(this.combo, 20) * 0.05;
  }

  /** Register a hit at time `now` (seconds). Returns coins earned. */
  onHit(result: HitResult, now: number): number {
    if (result.dealt <= 0 && result.severed.length === 0) return 0;
    this.combo = now - this.lastHitAt <= COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastHitAt = now;
    let earned = Math.max(1, Math.round(result.dealt * 0.5 * this.multiplier));
    earned += result.severed.length * SEVER_BONUS + result.broke.length * BREAK_BONUS;
    if (result.killed) earned += Math.round((DEFEAT_BONUS + result.severed.length * 10) * this.koBonusScale);
    earned = Math.max(1, Math.round(earned * this.rewardScale));
    this.coins += earned;
    return earned;
  }

  /** Decays the combo counter once the window lapses. */
  tick(now: number): void {
    if (this.combo > 0 && now - this.lastHitAt > COMBO_WINDOW) this.combo = 0;
  }

  canAfford(price: number): boolean {
    return this.coins >= price;
  }

  spend(price: number): boolean {
    if (!this.canAfford(price)) return false;
    this.coins -= price;
    return true;
  }
}
