import type { DeathStyle, HitInfo, HitResult } from '../core/types';

/** Chooses how the boss dies from the blow that killed him. `rand` is injectable for tests. */
export function pickDeathStyle(hit: HitInfo, result: HitResult, rand: () => number = Math.random): DeathStyle {
  if (result.severed.includes('head')) return 'decapitate';
  if (hit.source === 'anvil' || hit.source === 'piano') return 'flatten';
  if (hit.source === 'blackhole') return 'dismember';
  switch (hit.type) {
    case 'cold':
      return 'shatter';
    case 'fire':
      return 'charcoal';
    case 'electric':
      return 'xray';
    case 'explosive':
      return 'dismember';
    case 'blunt':
      if (hit.source === 'wall' && hit.amount > 30) return 'orbit';
      return rand() < 0.2 ? 'orbit' : 'crumple';
    default:
      return 'crumple';
  }
}
