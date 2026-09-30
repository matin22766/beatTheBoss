import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { GrabController } from '../../../interaction/GrabController';
import { ROOM } from '../../../physics/ArenaColliders';
import { clampToRoom, glow } from './common';
import { disposeObject } from './Melee';

const BOSS_LAUNCH = 20;
const PROP_LAUNCH = 30;
const HOLD_DEPTH = 1.4;

/**
 * Gravity gun: hold to lift the boss (or any piece of furniture) from across the room and swing
 * it around at the cursor; let go to launch it where you are aiming.
 */
export class Gravity implements WeaponBehavior {
  private readonly grab: GrabController;
  private dir = new THREE.Vector3(0, 0, -1);
  private stopLoop: (() => void) | null = null;
  private cooldown = 0;
  private readonly orb: THREE.Mesh;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {
    this.grab = new GrabController(ctx.physics, () => ctx.boss());
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), glow(0x7ff6ff, 0.3));
    this.orb.visible = false;
    ctx.scene.add(this.orb);
  }

  private holdPoint(ray: THREE.Ray): THREE.Vector3 {
    // A point floating a little inside the room's open front, under the cursor.
    const planeZ = ROOM.front - HOLD_DEPTH;
    const t = Math.abs(ray.direction.z) > 1e-3 ? (planeZ - ray.origin.z) / ray.direction.z : 3;
    return clampToRoom(ray.at(Math.max(0.5, t), new THREE.Vector3()), 0.5);
  }

  down(aim: Aim): void {
    if (this.cooldown > 0) return;
    this.dir.copy(aim.ray.direction);
    const camera = this.ctx.rig.camera;
    const prop = aim.prop ?? this.ctx.raycastProp(aim.ray, 14);
    const bossDist = aim.hit ? aim.hit.point.distanceTo(aim.ray.origin) : Infinity;
    let ok = false;
    if (prop && prop.distance < bossDist && prop.prop.body.isDynamic()) {
      ok = this.grab.startBody(prop.prop.body, prop.prop.body.mass(), prop.point, camera);
    } else if (aim.hit) {
      ok = this.grab.start(aim.hit.part, aim.hit.point, camera);
      if (ok) {
        const boss = this.ctx.boss();
        boss?.brain.interrupt();
        this.ctx.fx.word('LIFT!', aim.hit.point, '#7ff6ff', 0.4);
      }
    }
    if (!ok) {
      audio.play('click', { intensity: 0.6 });
      this.ctx.fx.flash(this.ctx.viewModel.muzzle(), 0x7ff6ff, 6, 0.06);
      return;
    }
    this.grab.setTarget(this.holdPoint(aim.ray));
    audio.play('zap', { intensity: 0.5, pitch: 0.6 });
    this.stopLoop = audio.loop('gravity', 0.8);
  }

  hold(aim: Aim): void {
    this.dir.copy(aim.ray.direction);
    if (this.grab.active) this.grab.setTarget(this.holdPoint(aim.ray));
  }

  up(): void {
    if (!this.grab.active) return;
    const part = this.grab.part;
    const body = this.grab.body;
    this.grab.release();
    this.stopLoop?.();
    this.stopLoop = null;
    this.cooldown = this.def.cooldown;
    const dir = this.dir.clone();
    dir.y = Math.max(dir.y, -0.2);
    dir.normalize();
    const boss = this.ctx.boss();
    if (part && boss) {
      const v = dir.clone().multiplyScalar(BOSS_LAUNCH);
      // The whole body flies if the part is still on him; a loose limb flies alone.
      const flying = boss.ragdoll.get(part).attached ? [...boss.ragdoll.parts.values()].filter((p) => p.attached) : boss.ragdoll.subtree(part).map((n) => boss.ragdoll.get(n));
      for (const p of flying) p.body.setLinvel(v, true);
      boss.ragdoll.stagger(1);
      const at = boss.ragdoll.position(part);
      this.ctx.hitBoss({ part, amount: this.def.damage, type: 'blunt', point: at, dir, impulse: 0, source: this.def.id });
      this.ctx.fx.word('LAUNCH!', at, '#7ff6ff', 0.5);
    } else if (body && body.isValid()) {
      body.setLinvel(dir.clone().multiplyScalar(PROP_LAUNCH), true);
      body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
    }
    audio.play('plasma', { intensity: 1, pitch: 0.7 });
    audio.play('whoosh', { intensity: 1 });
    this.ctx.viewModel.recoil(1.5);
    this.ctx.rig.shake(0.35);
    this.ctx.fx.shockRing(this.ctx.viewModel.muzzle(), dir, 0.6, 0x7ff6ff);
  }

  update(dt: number): void {
    this.cooldown -= dt;
    if (!this.grab.active) {
      this.orb.visible = false;
      if (this.stopLoop) {
        this.stopLoop();
        this.stopLoop = null;
      }
      return;
    }
    const held = this.heldPosition();
    if (!held) return;
    const muzzle = this.ctx.viewModel.muzzle();
    this.ctx.fx.arc(muzzle, held, 0x7ff6ff);
    if (Math.random() < 0.5) this.ctx.fx.arc(muzzle, held, 0xf29e1f);
    this.orb.visible = true;
    this.orb.position.copy(held);
    this.orb.scale.setScalar(1 + Math.sin(performance.now() * 0.02) * 0.1);
  }

  private heldPosition(): THREE.Vector3 | null {
    if (this.grab.part) return this.ctx.boss()?.ragdoll.position(this.grab.part) ?? null;
    const b = this.grab.body;
    if (!b || !b.isValid()) return null;
    const t = b.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  dispose(): void {
    this.grab.dispose();
    this.stopLoop?.();
    this.stopLoop = null;
    this.ctx.scene.remove(this.orb);
    disposeObject(this.orb);
  }
}
