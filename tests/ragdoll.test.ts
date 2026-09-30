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

describe('Ragdoll locomotion & grounding', () => {
  beforeAll(async () => {
    await initRapier();
  });

  it('stands with his weight on his feet', () => {
    const { boss, run } = setup();
    run(3);
    expect(boss.position('footL').y).toBeLessThan(0.07);
    expect(boss.position('footR').y).toBeLessThan(0.07);
    expect(Math.abs(boss.position('pelvis').y - 0.995)).toBeLessThan(0.05);
  });

  it('walks to a point and stops there', () => {
    const { boss, run } = setup();
    run(1);
    let steps = 0;
    boss.onStep = () => steps++;
    boss.walkTo(2, 0.5);
    run(6);
    const p = boss.position('pelvis');
    expect(Math.hypot(p.x - 2, p.z - 0.5)).toBeLessThan(0.35);
    expect(boss.walking).toBe(false);
    expect(steps).toBeGreaterThanOrEqual(3);
    expect(boss.position('head').y).toBeGreaterThan(1.6);
  });

  it('falls instead of hovering when thrown up', () => {
    const { boss, run } = setup();
    run(1);
    for (const p of boss.parts.values()) p.body.setLinvel({ x: 0, y: 7, z: 0 }, true);
    run(0.4);
    const peak = boss.position('pelvis').y;
    run(1.2);
    expect(boss.position('pelvis').y).toBeLessThan(peak);
  });

  it('gets up gradually rather than levitating', () => {
    const { boss, physics, run } = setup();
    run(1);
    boss.stagger(1);
    boss.applyImpulseAt('chest', new THREE.Vector3(0, 0, -300), boss.position('chest'));
    run(1.5);
    let maxRise = 0;
    let prev = boss.position('pelvis').y;
    for (let i = 0; i < 6 / PHYSICS_DT; i++) {
      physics.step(PHYSICS_DT);
      const y = boss.position('pelvis').y;
      maxRise = Math.max(maxRise, (y - prev) / PHYSICS_DT);
      prev = y;
    }
    expect(boss.position('head').y).toBeGreaterThan(1.55);
    expect(maxRise).toBeLessThan(3);
  });
});
