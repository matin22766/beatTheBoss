import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { initRapier, PhysicsWorld, PHYSICS_DT, RAPIER } from '../src/physics/PhysicsWorld';
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

  it('stands with his feet planted on the floor', () => {
    const { boss, run } = setup();
    run(3);
    for (const f of ['footL', 'footR'] as const) expect(boss.lowestPoint(boss.get(f))).toBeLessThan(0.01);
    expect(Math.abs(boss.position('pelvis').y - 0.985)).toBeLessThan(0.05);
  });

  it('cannot float: lifted off the floor he drops like a stone', () => {
    const { boss, physics, run } = setup();
    run(2);
    for (const p of boss.parts.values()) {
      const t = p.body.translation();
      p.body.setTranslation({ x: t.x, y: t.y + 0.3, z: t.z }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    const y0 = boss.position('pelvis').y;
    const steps = 9;
    for (let i = 0; i < steps; i++) physics.step(PHYSICS_DT);
    const t = steps * PHYSICS_DT;
    const accel = (2 * (y0 - boss.position('pelvis').y)) / (t * t);
    expect(accel).toBeGreaterThan(0.8 * 9.81);
  });

  it('walks to a point with real steps, always keeping a foot on the floor', () => {
    const { boss, physics, run } = setup();
    run(1);
    let steps = 0;
    boss.onStep = () => steps++;
    boss.walkTo(2, 0.5);
    let airborne = 0;
    for (let i = 0; i < 6 / PHYSICS_DT; i++) {
      physics.step(PHYSICS_DT);
      const low = Math.min(boss.lowestPoint(boss.get('footL')), boss.lowestPoint(boss.get('footR')));
      airborne = low > 0.03 ? airborne + 1 : 0;
      expect(airborne).toBeLessThan(6);
    }
    const p = boss.position('pelvis');
    expect(Math.hypot(p.x - 2, p.z - 0.5)).toBeLessThan(0.35);
    expect(boss.walking).toBe(false);
    expect(steps).toBeGreaterThanOrEqual(3);
    expect(boss.position('head').y).toBeGreaterThan(1.6);
  });

  it('takes a catch step when shoved, and falls when shoved too hard', () => {
    const light = setup();
    light.run(2);
    light.boss.stagger(0.2);
    light.boss.applyImpulseAt('chest', new THREE.Vector3(60, 0, 0), light.boss.position('chest'));
    let stepped = false;
    for (let i = 0; i < 60; i++) {
      light.run(PHYSICS_DT);
      stepped ||= light.boss.walking;
    }
    light.run(2);
    expect(stepped).toBe(true);
    expect(light.boss.isStanding()).toBe(true);

    const hard = setup();
    hard.run(2);
    hard.boss.stagger(0.2);
    hard.boss.applyImpulseAt('chest', new THREE.Vector3(250, 0, 0), hard.boss.position('chest'));
    hard.run(1.5);
    expect(hard.boss.position('head').y).toBeLessThan(1.2);
  });

  it('sits on the floor under his own weight, then gets back up', () => {
    const { boss, run } = setup();
    run(1);
    boss.sitOnFloor(true);
    boss.setPose('sitFloor', 0.5, 10);
    run(3);
    expect(boss.position('pelvis').y).toBeLessThan(0.35);
    expect(boss.position('head').y).toBeGreaterThan(0.8);
    boss.sitOnFloor(false);
    run(5);
    expect(boss.position('head').y).toBeGreaterThan(1.6);
  });

  it('sits on a chair: the seat carries him, feet on the floor', () => {
    const { boss, physics, run } = setup();
    run(1);
    const seatTop = 0.45;
    const chair = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, seatTop / 2, -0.35));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.22, seatTop / 2, 0.22), chair);
    const m = boss.totalAttachedMass();
    physics.world.createImpulseJoint(RAPIER.JointData.spring(0, m * 45, m * 10, { x: 0, y: 0, z: 0 }, { x: 0, y: seatTop / 2 + 0.12, z: 0 }), boss.get('pelvis').body, chair, true);
    boss.sitting = true;
    boss.setPose('sit', 0.4, 10);
    run(3);
    expect(Math.abs(boss.position('pelvis').y - (seatTop + 0.12))).toBeLessThan(0.15);
    expect(Math.min(boss.lowestPoint(boss.get('footL')), boss.lowestPoint(boss.get('footR')))).toBeLessThan(0.08);
    expect(boss.position('head').y).toBeGreaterThan(1.2);
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
