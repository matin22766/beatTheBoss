import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WEAPONS, CATEGORIES } from '../src/combat/weapons/weaponDefs';

describe('weapon roster', () => {
  it('has at least 20 weapons with unique ids', () => {
    expect(WEAPONS.length).toBeGreaterThanOrEqual(20);
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
});
