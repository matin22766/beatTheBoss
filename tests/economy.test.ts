import { describe, it, expect } from 'vitest';
import { Economy, DEFEAT_BONUS, SEVER_BONUS, COMBO_WINDOW } from '../src/economy/Economy';

const res = (dealt: number, extra: Partial<{ severed: never[]; broke: never[]; killed: boolean }> = {}) => ({
  dealt,
  severed: [],
  broke: [],
  killed: false,
  ...extra,
});

describe('Economy', () => {
  it('pays at least one coin per damaging hit', () => {
    const e = new Economy();
    expect(e.onHit(res(0.5), 0)).toBe(1);
    expect(e.coins).toBe(1);
  });

  it('ignores zero-damage hits', () => {
    const e = new Economy();
    expect(e.onHit(res(0), 0)).toBe(0);
  });

  it('builds a combo within the window and resets after it', () => {
    const e = new Economy();
    e.onHit(res(10), 0);
    e.onHit(res(10), 0.5);
    e.onHit(res(10), 1.0);
    expect(e.combo).toBe(3);
    e.tick(1.0 + COMBO_WINDOW + 0.01);
    expect(e.combo).toBe(0);
  });

  it('adds sever and defeat bonuses', () => {
    const e = new Economy();
    const earned = e.onHit({ dealt: 0, severed: ['handL'], broke: [], killed: true }, 0);
    expect(earned).toBe(1 + SEVER_BONUS + DEFEAT_BONUS + 10);
  });

  it('spends only when affordable', () => {
    const e = new Economy(100);
    expect(e.spend(150)).toBe(false);
    expect(e.spend(60)).toBe(true);
    expect(e.coins).toBe(40);
  });
});
