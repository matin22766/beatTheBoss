import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WEAPONS, CATEGORIES } from '../src/combat/weapons/weaponDefs';
import { createBehavior } from '../src/combat/weapons/WeaponSystem';
import type { WeaponCtx } from '../src/combat/weapons/types';

describe('weapon roster', () => {
  it('has at least 46 weapons with unique ids', () => {
    expect(WEAPONS.length).toBeGreaterThanOrEqual(46);
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(WEAPONS.length);
  });

  it('every weapon is well-formed and its models build', () => {
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const w of WEAPONS) {
      expect(cats.has(w.category), w.id).toBe(true);
      expect(w.damage, w.id).toBeGreaterThan(0);
      expect(w.price, w.id).toBeGreaterThanOrEqual(0);
      expect(w.cooldown, w.id).toBeGreaterThanOrEqual(0);
      const model = w.model();
      expect(model).toBeInstanceOf(THREE.Object3D);
      if (w.projectile) expect(w.projectile()).toBeInstanceOf(THREE.Object3D);
      if (w.archetype === 'spray' || w.archetype === 'saw') expect(w.loop, w.id).toBeDefined();
      if (w.opts?.fuse || w.opts?.radius) expect(w.type, w.id).toBe('explosive');
    }
  });

  it('offers free starter weapons in several categories', () => {
    const free = WEAPONS.filter((w) => w.price === 0);
    expect(free.length).toBeGreaterThanOrEqual(3);
    expect(new Set(free.map((w) => w.category)).size).toBeGreaterThanOrEqual(2);
  });

  it('uses every archetype, and every behaviour can be built and disposed', () => {
    const archetypes = new Set(WEAPONS.map((w) => w.archetype));
    for (const a of ['melee', 'thrown', 'hitscan', 'projectile', 'spray', 'saw', 'field', 'summon', 'strike', 'turret', 'tether', 'gravity']) {
      expect(archetypes.has(a as never), a).toBe(true);
    }
    const ctx = {
      scene: new THREE.Scene(),
      physics: { onBeforeStep: () => () => {}, world: {} },
      boss: () => null,
    } as unknown as WeaponCtx;
    for (const w of WEAPONS) {
      const b = createBehavior(w, ctx);
      expect(typeof b.down, w.id).toBe('function');
      b.dispose();
    }
  });

  it('prices the v2 arsenal in the premium range, and every category has weapons', () => {
    const v2 = WEAPONS.slice(24);
    expect(v2.length).toBe(22);
    for (const w of v2) {
      expect(w.price, w.id).toBeGreaterThanOrEqual(1500);
      expect(w.price, w.id).toBeLessThanOrEqual(6000);
    }
    for (const c of CATEGORIES) if (c.id !== 'all') expect(WEAPONS.some((w) => w.category === c.id), c.id).toBe(true);
  });
});
