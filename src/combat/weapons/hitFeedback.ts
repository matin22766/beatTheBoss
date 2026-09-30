import type * as THREE from 'three';
import type { HitResult } from '../../core/types';
import type { WeaponCtx, WeaponDef } from './types';
import { audio } from '../../audio/AudioEngine';

const DEFAULT_WORDS: Record<string, string[]> = {
  blunt: ['POW!', 'BAM!', 'WHACK!', 'BONK!', 'SMACK!'],
  sharp: ['SLASH!', 'SHNK!', 'CHOP!'],
  pierce: ['BANG!', 'PEW!', 'THWIP!'],
  explosive: ['KABOOM!', 'BOOM!'],
  fire: ['FWOOSH!', 'SIZZLE!'],
  electric: ['ZZZAP!', 'BZZT!'],
  cold: ['BRRR!', 'CRACKLE!'],
};

/** Shared audiovisual response to a weapon hit: sound, blood, sparks, comic word, shake, hitstop. */
export function hitFeedback(ctx: WeaponCtx, def: WeaponDef, point: THREE.Vector3, dir: THREE.Vector3, amount: number, result: HitResult): void {
  const k = Math.min(1.2, amount / 30);
  audio.play(def.hitSound ?? 'punch', { intensity: 0.5 + k * 0.6 });
  if (def.type === 'blunt') {
    ctx.fx.stars(point, 3 + Math.round(k * 5));
    if (amount > 14) ctx.fx.bleed(point, dir, amount * 0.35);
  } else if (def.type === 'sharp' || def.type === 'pierce') {
    ctx.fx.bleed(point, dir, amount * 0.9);
    audio.play('splat', { intensity: 0.3 + k * 0.4 });
  }
  if (def.hitSound === 'clang') ctx.fx.impactSparks(point, dir, 14);
  const words = def.words ?? DEFAULT_WORDS[def.type];
  if (words && (Math.random() < 0.35 + k * 0.4 || result.killed)) ctx.fx.word(words[Math.floor(Math.random() * words.length)], point, '#ff3b30', 0.45 + k * 0.25);
  ctx.rig.shake(0.12 + k * 0.35);
  if (amount > 12) ctx.hitstop(Math.min(0.09, 0.02 + amount * 0.0015));
}
