import * as THREE from 'three';
import type { Boss } from '../character/Boss';
import type { DeathStyle, HitInfo } from '../core/types';
import type { Effects } from '../fx/Effects';
import type { CameraRig } from '../core/CameraRig';
import { audio } from '../audio/AudioEngine';
import { RAGDOLL } from '../character/RagdollDef';
import { buildPancake } from './Pancake';

export interface DeathCtx {
  scene: THREE.Scene;
  fx: Effects;
  rig: CameraRig;
  slowmo(scale: number, seconds: number): void;
  banner(text: string): void;
  /** Toggle the ceiling collider (for launching the boss into orbit). */
  setCeiling(enabled: boolean): void;
}

interface Timed {
  at: number;
  fn: () => void;
}

const BANNERS: Record<DeathStyle, string[]> = {
  crumple: ['K.O.!', 'FLAWLESS!', 'DOWN HE GOES!'],
  dismember: ['TOTAL CARNAGE!', 'PIECES!', 'KABOOM!'],
  decapitate: ['HEADS UP!', 'OFF WITH HIS HEAD!'],
  shatter: ['ICE COLD!', 'SHATTERED!'],
  charcoal: ['WELL DONE!', 'EXTRA CRISPY!'],
  xray: ['SHOCKING!', 'FRIED!'],
  flatten: ['PANCAKED!', 'FLAT OUT!'],
  orbit: ['SEE YA!', 'HOME RUN!'],
};

/** Choreographs each of the eight ways the boss can die. */
export class DeathDirector {
  private queue: Timed[] = [];
  private t = 0;
  private boss: Boss | null = null;
  private xrayUntil = 0;
  private pancake: THREE.Group | null = null;

  constructor(private readonly ctx: DeathCtx) {}

  /** Seconds before the next boss should spawn. */
  play(style: DeathStyle, boss: Boss, _cause: HitInfo): number {
    this.boss = boss;
    this.queue = [];
    this.t = 0;
    const { fx, rig } = this.ctx;
    const r = boss.ragdoll;
    const list = BANNERS[style];
    this.ctx.banner(list[Math.floor(Math.random() * list.length)]);
    const at = (s: number, fn: () => void) => this.queue.push({ at: s, fn });
    const chest = r.position('chest');

    switch (style) {
      case 'crumple':
        this.ctx.slowmo(0.3, 1.2);
        rig.focusOn(boss.headPosition(), 3.4, 1.5);
        audio.play('thud', { intensity: 1 });
        return 3.8;

      case 'dismember': {
        this.ctx.slowmo(0.25, 1.4);
        rig.shake(1);
        for (const def of RAGDOLL) {
          if (!def.joint || !isFinite(def.joint.severHp)) continue;
          const part = r.get(def.name);
          if (part.severed) continue;
          r.sever(def.name);
          boss.mesh.addStumps(def.name);
        }
        for (const p of r.parts.values()) {
          const pos = p.body.translation();
          const dir = new THREE.Vector3(pos.x - chest.x, pos.y - chest.y + 0.6, pos.z - chest.z).normalize();
          const k = p.def.mass * (5 + Math.random() * 4);
          p.body.applyImpulse({ x: dir.x * k, y: dir.y * k, z: dir.z * k }, true);
          p.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * k * 0.05, y: (Math.random() - 0.5) * k * 0.05, z: (Math.random() - 0.5) * k * 0.05 }, true);
          fx.bleed(new THREE.Vector3(pos.x, pos.y, pos.z), dir.clone().negate(), 25);
          const name = p.def.name;
          const def = p.def;
          if (def.joint) {
            const local = new THREE.Vector3(...def.joint.anchor).sub(new THREE.Vector3(...def.pos));
            fx.addSpurt(boss.mesh.parts.get(name)!, local, local.clone().normalize(), 2.5, 25);
          }
        }
        audio.play('splat', { intensity: 1.3 });
        audio.play('crunch', { intensity: 1.3 });
        return 4.5;
      }

      case 'decapitate': {
        const head = r.get('head').body;
        head.applyImpulse({ x: (Math.random() - 0.5) * 8, y: 26, z: 4 }, true);
        head.applyTorqueImpulse({ x: 0.6, y: 0.4, z: 0.2 }, true);
        this.ctx.slowmo(0.3, 1.6);
        rig.focusOn(r.position('head'), 3.2, 2);
        audio.play('scream', { intensity: 1, pitch: 1.3 });
        return 4.5;
      }

      case 'shatter': {
        boss.frozenSolid = true;
        boss.status.frost = 1.2;
        audio.play('freeze', { intensity: 1 });
        rig.focusOn(chest, 3.6, 1.2);
        at(0.9, () => {
          audio.play('shatter', { intensity: 1.3 });
          for (const p of r.parts.values()) {
            const t = p.body.translation();
            const pos = new THREE.Vector3(t.x, t.y, t.z);
            fx.iceShards(pos, Math.round(6 + p.def.mass * 0.8), 1.2);
            fx.debrisBurst(pos, new THREE.Vector3(0, 1, 0), 0x9fd8ff, 6, 0.05);
            p.collider.setEnabled(false);
          }
          boss.mesh.setVisible(false);
          rig.shake(0.6);
          fx.shockRing(new THREE.Vector3(chest.x, 0.02, chest.z), new THREE.Vector3(0, 1, 0), 2, 0xbde0fe);
        });
        return 3.4;
      }

      case 'charcoal': {
        boss.status.onFire = 1.5;
        audio.play('ignite', { intensity: 1 });
        rig.focusOn(chest, 3.8, 1.8);
        const start = boss.status.char;
        for (let i = 1; i <= 8; i++) at(i * 0.1, () => (boss.status.char = start + ((1 - start) * i) / 8));
        at(1.3, () => {
          audio.play('crunch', { intensity: 1 });
          for (const p of r.parts.values()) {
            const t = p.body.translation();
            const pos = new THREE.Vector3(t.x, t.y, t.z);
            fx.debrisBurst(pos, new THREE.Vector3(0, 0.3, 0), 0x1a1410, Math.round(5 + p.def.mass * 0.6), 0.035);
            fx.smokePuff(pos, 4, 0x222222, 0.14);
            p.collider.setEnabled(false);
          }
          boss.mesh.setVisible(false);
        });
        return 3.6;
      }

      case 'xray': {
        boss.status.shock = 1.5;
        this.xrayUntil = 1.6;
        const stop = audio.loop('electric', 1);
        rig.focusOn(chest, 3.6, 1.8);
        at(1.6, () => {
          stop();
          boss.status.char = Math.max(boss.status.char, 0.55);
          fx.smokePuff(r.position('head'), 10, 0x333333, 0.12);
          audio.play('thud', { intensity: 0.8 });
        });
        return 4;
      }

      case 'flatten': {
        // Swap the ragdoll for a flat cartoon pancake on the floor.
        const pelvis = r.position('pelvis');
        const pancake = buildPancake(boss.mesh.materials, !r.get('head').severed);
        pancake.position.set(pelvis.x, 0.002, pelvis.z);
        pancake.scale.set(0.6, 1, 0.6);
        this.ctx.scene.add(pancake);
        this.pancake = pancake;
        for (const p of r.parts.values()) p.collider.setEnabled(false);
        boss.mesh.setVisible(false);
        at(0.02, () => pancake.scale.set(1.25, 1, 1.25));
        at(0.12, () => pancake.scale.set(0.95, 1, 0.95));
        at(0.2, () => pancake.scale.set(1, 1, 1));
        fx.dustPuff(new THREE.Vector3(pelvis.x, 0.1, pelvis.z), new THREE.Vector3(0, 1, 0), 0xffffff, 1.5);
        audio.play('splat', { intensity: 1.2 });
        audio.play('boing', { intensity: 0.8, pitch: 0.6 });
        fx.stars(boss.headPosition(), 14);
        fx.shockRing(new THREE.Vector3(chest.x, 0.02, chest.z), new THREE.Vector3(0, 1, 0), 1.6);
        rig.shake(0.8);
        return 3.8;
      }

      case 'orbit': {
        this.ctx.setCeiling(false);
        const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12);
        for (const p of r.parts.values()) {
          p.body.setLinvel({ x: (Math.random() - 0.5) * 2, y: 26, z: -4 }, true);
          p.body.setAngvel(spin, true);
          p.body.setGravityScale(0.3, true);
        }
        audio.play('whoosh', { intensity: 1.2, pitch: 0.7 });
        rig.focusOn(new THREE.Vector3(0, 3.5, -1), 6, 1.6);
        at(1.4, () => {
          audio.play('twinkle', { intensity: 1 });
          fx.stars(new THREE.Vector3(0, 5.6, -2.5), 20);
        });
        at(3, () => this.ctx.setCeiling(true));
        return 3.2;
      }
    }
  }

  update(dt: number): void {
    this.t += dt;
    const due = this.queue.filter((q) => q.at <= this.t);
    this.queue = this.queue.filter((q) => q.at > this.t);
    due.forEach((q) => q.fn());
    if (this.xrayUntil > 0 && this.boss) {
      this.xrayUntil -= dt;
      this.boss.status.shock = Math.max(this.boss.status.shock, 1);
    }
  }

  reset(): void {
    if (this.pancake) {
      this.ctx.scene.remove(this.pancake);
      this.pancake.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.pancake = null;
    }
    this.queue = [];
    this.xrayUntil = 0;
    this.boss = null;
    this.ctx.setCeiling(true);
  }
}
