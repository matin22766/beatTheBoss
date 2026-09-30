import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BossBrain, DODGE_COOLDOWN, type BrainHost, type Seat } from '../src/character/BossBrain';

function fake(opts: { seat?: boolean; rand?: () => number } = {}) {
  const log: string[] = [];
  let walking = false;
  let welded = false;
  let canAct = true;
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const seat: Seat = { id: 's', point: () => new THREE.Vector3(1, 0.5, 1), yaw: () => 0, valid: () => true };
  const host: BrainHost & { setCanAct(v: boolean): void; arrive(): void } = {
    canAct: () => canAct,
    position: () => pos.clone(),
    walkTo: (x, z) => {
      walking = true;
      target.set(x, 0, z);
      log.push(`walk ${x.toFixed(1)} ${z.toFixed(1)}`);
    },
    stopWalking: () => (walking = false),
    isWalking: () => walking,
    setPose: (p) => log.push(`pose ${p}`),
    setLookYaw: () => {},
    setHeightOffset: () => {},
    sidestep: () => log.push('sidestep'),
    findSeat: () => (opts.seat ? seat : null),
    weld: () => (welded = true),
    unweld: () => {
      welded = false;
      log.push('unweld');
    },
    welded: () => welded,
    say: (k) => log.push(`say ${k}`),
    rand: opts.rand ?? Math.random,
    setCanAct: (v) => (canAct = v),
    arrive: () => {
      walking = false;
      pos.copy(target);
    },
  };
  return { host, log, brain: new BossBrain(host) };
}

describe('BossBrain', () => {
  it('never tries to sit when there is nothing to sit on', () => {
    const { brain } = fake({ seat: false });
    for (let i = 0; i < 200; i++) expect(brain.pickActivity()).not.toBe('sit');
  });

  it('walks to a seat, sits (welds) and gets up when interrupted', () => {
    const { host, brain, log } = fake({ seat: true, rand: () => 0.35 });
    // rand 0.35 of the weighted table lands on "sit".
    expect(brain.pickActivity()).toBe('sit');
    brain.update(3);
    expect(brain.state).toBe('goSit');
    host.arrive();
    brain.update(0.1);
    expect(brain.state).toBe('sitting');
    expect(host.welded()).toBe(true);
    expect(log).toContain('pose sit');
    brain.onHit(new THREE.Vector3(0, 1, 3));
    expect(host.welded()).toBe(false);
    expect(log).toContain('unweld');
  });

  it('dodges only when able, and respects the cooldown', () => {
    const { host, brain } = fake({ rand: () => 0 });
    const dir = new THREE.Vector3(0, 0, -1);
    expect(brain.tryDodge('fist', dir)).toBe(true);
    expect(brain.tryDodge('fist', dir)).toBe(false);
    brain.update(DODGE_COOLDOWN + 0.1);
    expect(brain.tryDodge('melee', dir)).toBe(true);
    brain.update(DODGE_COOLDOWN + 0.1);
    host.setCanAct(false);
    expect(brain.tryDodge('projectile', dir)).toBe(false);
  });

  it('never dodges when the roll fails', () => {
    const { brain } = fake({ rand: () => 0.99 });
    expect(brain.tryDodge('bullet', new THREE.Vector3(0, 0, -1))).toBe(false);
  });

  it('stops everything while he cannot act', () => {
    const { host, brain } = fake({ rand: () => 0.1 });
    brain.update(5);
    expect(brain.state).toBe('wander');
    host.setCanAct(false);
    brain.update(0.1);
    expect(brain.state).toBe('recover');
    expect(host.isWalking()).toBe(false);
  });
});
