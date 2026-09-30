import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DamageSystem, MAX_HP } from '../src/combat/DamageSystem';
import type { DamageTarget } from '../src/combat/DamageSystem';
import { RAGDOLL, type PartName } from '../src/character/RagdollDef';
import type { HitInfo } from '../src/core/types';
import { pickDeathStyle } from '../src/death/pickDeathStyle';

/** In-memory ragdoll stand-in. */
function fakeTarget() {
  const state = new Map(
    RAGDOLL.map((def) => [def.name, { def, attached: true, severed: false, broken: false, jointHp: def.joint?.severHp ?? Infinity }]),
  );
  const target: DamageTarget & { severs: PartName[] } = {
    severs: [],
    partState: (n) => state.get(n)!,
    setJointHp: (n, hp) => {
      state.get(n)!.jointHp = hp;
    },
    sever: (n) => {
      const out = RAGDOLL.filter((d) => d.name === n || d.parent === n).map((d) => d.name);
      out.forEach((p) => (state.get(p)!.attached = false));
      state.get(n)!.severed = true;
      target.severs.push(n);
      return out;
    },
    breakBone: (n) => {
      state.get(n)!.broken = true;
      return true;
    },
    nearestChildJoint: (n) => (n === 'chest' ? 'head' : null),
  };
  return target;
}

const hit = (part: PartName, amount: number, type: HitInfo['type'], source = 'test'): HitInfo => ({
  part,
  amount,
  type,
  point: new THREE.Vector3(),
  dir: new THREE.Vector3(0, 0, -1),
  impulse: 0,
  source,
});

describe('DamageSystem', () => {
  it('reduces HP scaled by vitality and type', () => {
    const d = new DamageSystem(fakeTarget());
    const r = d.apply(hit('head', 10, 'blunt'));
    expect(r.dealt).toBeCloseTo(16);
    expect(d.hp).toBeCloseTo(MAX_HP - 16);
  });

  it('blunt damage never severs but breaks bones above threshold', () => {
    const t = fakeTarget();
    const d = new DamageSystem(t);
    const small = d.apply(hit('lowerArmL', 10, 'blunt'));
    expect(small.broke).toEqual([]);
    const big = d.apply(hit('lowerArmL', 25, 'blunt'));
    expect(big.broke).toEqual(['lowerArmL']);
    expect(big.severed).toEqual([]);
  });

  it('sharp damage accumulates on the joint until it severs', () => {
    const t = fakeTarget();
    const d = new DamageSystem(t);
    expect(d.apply(hit('handL', 20, 'sharp')).severed).toEqual([]);
    expect(d.apply(hit('handL', 15, 'sharp')).severed).toEqual(['handL']);
  });

  it('cutting the chest near the neck decapitates and kills', () => {
    const t = fakeTarget();
    const d = new DamageSystem(t);
    const r = d.apply(hit('chest', 70, 'sharp'));
    expect(r.severed).toContain('head');
    expect(r.killed).toBe(true);
    expect(pickDeathStyle(hit('chest', 70, 'sharp'), r)).toBe('decapitate');
  });

  it('kills exactly once when HP runs out', () => {
    const d = new DamageSystem(fakeTarget());
    let kills = 0;
    for (let i = 0; i < 100; i++) if (d.apply(hit('chest', 20, 'blunt')).killed) kills++;
    expect(kills).toBe(1);
    expect(d.dead).toBe(true);
  });

  it('severed parts no longer drain HP', () => {
    const t = fakeTarget();
    const d = new DamageSystem(t);
    d.apply(hit('handL', 40, 'sharp'));
    const hpBefore = d.hp;
    d.apply(hit('handL', 40, 'blunt'));
    expect(d.hp).toBe(hpBefore);
  });

  it('tougher bosses have more HP', () => {
    const d = new DamageSystem(fakeTarget(), 800);
    expect(d.hp).toBe(800);
    d.apply(hit('chest', 100, 'blunt'));
    expect(d.hpFraction).toBeCloseTo((800 - d.partDamage.get('chest')! * 1.2) / 800, 1);
    expect(d.dead).toBe(false);
    d.reset();
    expect(d.hp).toBe(800);
  });
});

describe('pickDeathStyle', () => {
  const none = { dealt: 1, severed: [], broke: [], killed: true };
  it('maps damage types to styles', () => {
    expect(pickDeathStyle(hit('chest', 5, 'cold'), none)).toBe('shatter');
    expect(pickDeathStyle(hit('chest', 5, 'fire'), none)).toBe('charcoal');
    expect(pickDeathStyle(hit('chest', 5, 'electric'), none)).toBe('xray');
    expect(pickDeathStyle(hit('chest', 5, 'explosive'), none)).toBe('dismember');
    expect(pickDeathStyle(hit('chest', 5, 'blunt', 'anvil'), none)).toBe('flatten');
    expect(pickDeathStyle(hit('chest', 5, 'blunt'), none, () => 0.9)).toBe('crumple');
    expect(pickDeathStyle(hit('chest', 50, 'blunt', 'wall'), none)).toBe('orbit');
  });
});
