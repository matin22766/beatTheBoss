import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { initRapier, PhysicsWorld, PHYSICS_DT } from '../src/physics/PhysicsWorld';
import { buildArenaColliders } from '../src/physics/ArenaColliders';
import { Ragdoll } from '../src/character/Ragdoll';

function setup() {
  const physics = new PhysicsWorld();
  buildArenaColliders(physics);
  const boss = new Ragdoll(physics, new THREE.Vector3(0, 0, 0));
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / PHYSICS_DT; i++) physics.step(PHYSICS_DT);
  };
  return { physics, boss, run };
}

describe('Ragdoll', () => {
  beforeAll(async () => {
    await initRapier();
  });

  it('stands upright on its own', () => {
    const { boss, run } = setup();
    run(4);
    const head = boss.position('head');
    const pelvis = boss.position('pelvis');
    expect(head.y).toBeGreaterThan(1.7);
    expect(Math.abs(pelvis.x)).toBeLessThan(0.3);
    expect(Math.abs(pelvis.z)).toBeLessThan(0.3);
    expect(boss.isStanding()).toBe(true);
  });

  it('collapses when killed and stays in the room', () => {
    const { boss, run } = setup();
    run(1);
    boss.kill();
    run(4);
    expect(boss.position('head').y).toBeLessThan(0.9);
    for (const p of boss.parts.values()) {
      const t = p.body.translation();
      expect(t.y).toBeGreaterThan(-0.05);
    }
  });

  it('gets back up after a heavy stagger', () => {
    const { boss, run } = setup();
    run(1);
    boss.stagger(1);
    boss.applyImpulseAt('chest', new THREE.Vector3(0, 0, -250), boss.position('chest'));
    run(1);
    run(6);
    expect(boss.position('head').y).toBeGreaterThan(1.6);
  });

  it('severs a limb and detaches its subtree', () => {
    const { boss, run } = setup();
    run(0.5);
    const detached = boss.sever('upperArmL');
    expect(detached).toEqual(['upperArmL', 'lowerArmL', 'handL']);
    run(3);
    expect(boss.position('handL').y).toBeLessThan(0.3);
    expect(boss.position('head').y).toBeGreaterThan(1.6);
  });
});
