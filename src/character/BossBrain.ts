import * as THREE from 'three';
import type { PoseName } from './Poses';

export interface Seat {
  id: string;
  /** World point to sit on. */
  point(): THREE.Vector3;
  /** Direction the seat faces (yaw, radians). */
  yaw(): number;
  valid(): boolean;
}

/** Everything the brain needs from the body. Implemented by Boss (and fakes in tests). */
export interface BrainHost {
  /** Healthy, standing, not grabbed/frozen/getting up. */
  canAct(): boolean;
  position(): THREE.Vector3;
  walkTo(x: number, z: number, speed?: number): void;
  stopWalking(): void;
  isWalking(): boolean;
  setPose(p: PoseName, blend: number, hold: number): void;
  setLookYaw(y: number | null): void;
  setHeightOffset(h: number): void;
  /** Sidestep: push the whole body with this velocity change. */
  sidestep(dv: THREE.Vector3): void;
  findSeat(): Seat | null;
  weld(seat: Seat): boolean;
  unweld(): void;
  welded(): boolean;
  say(kind: 'babble' | 'hum' | 'miss' | 'taunt' | 'yawn'): void;
  rand(): number;
}

export type Activity = 'wander' | 'sit' | 'phone' | 'dance' | 'stretch' | 'watch' | 'taunt' | 'idle';
export type BrainState = 'idle' | 'wander' | 'goSit' | 'sitting' | 'activity' | 'flee' | 'recover';
export type DodgeKind = 'fist' | 'melee' | 'bullet' | 'projectile';

export const DODGE_CHANCE: Record<DodgeKind, number> = { fist: 0.25, melee: 0.2, bullet: 0.1, projectile: 0.3 };
export const DODGE_COOLDOWN = 1.5;

const WEIGHTS: Array<[Activity, number]> = [
  ['wander', 30],
  ['sit', 20],
  ['phone', 12],
  ['watch', 10],
  ['dance', 8],
  ['stretch', 8],
  ['taunt', 8],
  ['idle', 4],
];

const ACTIVITY_POSE: Partial<Record<Activity, PoseName>> = {
  phone: 'phone',
  dance: 'dance',
  stretch: 'stretch',
  watch: 'watch',
  taunt: 'taunt',
};

/**
 * The boss's little life: wandering, sitting on furniture, phone calls, dancing… and dodging.
 * Everything pauses while he is being beaten up, and he recovers before doing anything else.
 */
export class BossBrain {
  state: BrainState = 'idle';
  activity: Activity = 'idle';
  private timer = 2;
  private dodgeCooldown = 0;
  private dodgeT = 0;
  private sayTimer = 0;
  private seat: Seat | null = null;
  private approachTries = 0;
  /** Multiplier on dodge chances (tests / difficulty). */
  dodgeScale = 1;

  constructor(private readonly host: BrainHost) {}

  /** Pick a weighted random activity, skipping sitting when there is nowhere to sit. */
  pickActivity(): Activity {
    const hasSeat = !!this.host.findSeat();
    const options = WEIGHTS.filter(([a]) => a !== 'sit' || hasSeat);
    const total = options.reduce((s, [, w]) => s + w, 0);
    let r = this.host.rand() * total;
    for (const [a, w] of options) {
      r -= w;
      if (r <= 0) return a;
    }
    return 'idle';
  }

  private start(a: Activity): void {
    this.activity = a;
    const h = this.host;
    switch (a) {
      case 'wander': {
        const x = (h.rand() - 0.5) * 6.4;
        const z = -1.8 + h.rand() * 3.6;
        h.walkTo(x, z, 0.7 + h.rand() * 0.5);
        this.state = 'wander';
        this.timer = 8;
        break;
      }
      case 'sit': {
        const seat = h.findSeat();
        if (!seat) return this.start('idle');
        this.seat = seat;
        const p = seat.point();
        const yaw = seat.yaw();
        // Approach from the front of the seat.
        h.walkTo(p.x + Math.sin(yaw) * 0.35, p.z + Math.cos(yaw) * 0.35, 0.9);
        this.state = 'goSit';
        this.timer = 12;
        this.approachTries = 0;
        break;
      }
      case 'idle':
        this.state = 'idle';
        this.timer = 2 + h.rand() * 3;
        break;
      default: {
        const pose = ACTIVITY_POSE[a]!;
        const dur = a === 'taunt' ? 2 : 4 + h.rand() * 4;
        h.setPose(pose, 0.35, dur);
        this.state = 'activity';
        this.timer = dur;
        this.sayTimer = 0.3;
        if (a === 'taunt') h.say('taunt');
        if (a === 'stretch') h.say('yawn');
      }
    }
  }

  /** Stop whatever he was doing (hit, grabbed, knocked down). */
  interrupt(): void {
    if (this.host.welded()) this.host.unweld();
    this.host.setHeightOffset(0);
    this.host.setLookYaw(null);
    this.host.stopWalking();
    this.seat = null;
    this.state = 'recover';
    this.timer = 1.5 + this.host.rand();
  }

  /** Called when he is hit: sometimes he backs away from where the blow came from. */
  onHit(from: THREE.Vector3): void {
    this.interrupt();
    if (this.host.rand() < 0.35) {
      const p = this.host.position();
      const away = p.clone().sub(from).setY(0);
      if (away.lengthSq() < 1e-4) away.set(this.host.rand() - 0.5, 0, 0);
      away.normalize().multiplyScalar(1.5);
      this.state = 'flee';
      this.timer = 3;
      this.host.walkTo(p.x + away.x, p.z + away.z, 1.4);
    }
  }

  /**
   * Try to dodge an incoming attack travelling along `dir`. Returns true if he dodged (the attack
   * should then miss).
   */
  tryDodge(kind: DodgeKind, dir: THREE.Vector3): boolean {
    const h = this.host;
    if (this.dodgeCooldown > 0 || !h.canAct() || this.state === 'sitting') return false;
    if (h.rand() >= DODGE_CHANCE[kind] * this.dodgeScale) return false;
    this.dodgeCooldown = DODGE_COOLDOWN;
    h.stopWalking();
    const flat = dir.clone().setY(0);
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    const side = new THREE.Vector3().crossVectors(flat, new THREE.Vector3(0, 1, 0));
    const left = h.rand() < 0.5;
    if (kind === 'bullet') {
      h.setPose('matrix', 0.06, 0.7);
      h.setHeightOffset(-0.18);
    } else if (kind === 'fist' && h.rand() < 0.4) {
      h.setPose('duck', 0.06, 0.6);
      h.setHeightOffset(-0.35);
    } else {
      h.setPose(left ? 'dodgeLeft' : 'dodgeRight', 0.06, 0.55);
      h.sidestep(side.multiplyScalar(left ? 2.2 : -2.2));
    }
    this.dodgeT = 0.7;
    h.say('miss');
    return true;
  }

  update(dt: number): void {
    const h = this.host;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      if (this.dodgeT <= 0) {
        h.setHeightOffset(0);
        if (h.rand() < 0.3) h.say('taunt');
      }
      return;
    }
    if (!h.canAct()) {
      if (this.state !== 'recover') this.interrupt();
      return;
    }
    this.timer -= dt;
    switch (this.state) {
      case 'recover':
      case 'idle':
        if (this.timer <= 0) this.start(this.pickActivity());
        break;
      case 'wander':
      case 'flee':
        if (!h.isWalking() || this.timer <= 0) {
          h.stopWalking();
          this.state = 'idle';
          this.timer = 1 + h.rand() * 2;
        }
        break;
      case 'goSit': {
        const seat = this.seat;
        if (!seat || !seat.valid() || this.timer <= 0) {
          this.interrupt();
          break;
        }
        if (!h.isWalking()) {
          const p = seat.point();
          const yaw = seat.yaw();
          const ax = p.x + Math.sin(yaw) * 0.35;
          const az = p.z + Math.cos(yaw) * 0.35;
          const pos = h.position();
          if (Math.hypot(pos.x - ax, pos.z - az) > 0.6) {
            // Not there yet (stumbled or got bumped): keep going, but give up eventually.
            if (++this.approachTries > 4) this.interrupt();
            else h.walkTo(ax, az, 0.9);
            break;
          }
          if (h.weld(seat)) {
            this.state = 'sitting';
            this.timer = 6 + h.rand() * 7;
            h.setLookYaw(seat.yaw());
            h.setPose('sit', 0.4, this.timer);
          } else this.interrupt();
        }
        break;
      }
      case 'sitting':
        if (!this.seat?.valid() || !h.welded() || this.timer <= 0) {
          this.interrupt();
          this.state = 'idle';
          this.timer = 1;
        }
        break;
      case 'activity':
        this.sayTimer -= dt;
        if (this.sayTimer <= 0) {
          if (this.activity === 'phone') h.say('babble');
          if (this.activity === 'dance') h.say('hum');
          this.sayTimer = 1.2 + h.rand() * 1.5;
        }
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 1 + h.rand() * 3;
        }
        break;
    }
  }
}
