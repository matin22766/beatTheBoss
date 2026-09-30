import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { disposeObject } from './Melee';
import { floorTarget, glow, nearestPart } from './common';
import { hitFeedback } from '../hitFeedback';
import { models } from '../models';

interface Coil {
  obj: THREE.Object3D;
  top: THREE.Vector3;
  aura: THREE.Mesh;
  age: number;
  life: number;
  zap: number;
}

const MAX_COILS = 2;
const RANGE = 3.6;

/** A Tesla coil planted on the floor that arcs lightning into the boss (and furniture) every beat. */
export class Turret implements WeaponBehavior {
  private coils: Coil[] = [];
  private cooldown = 0;
  private stopLoop: (() => void) | null = null;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {}

  down(aim: Aim): void {
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    const at = floorTarget(aim.point);
    const boss = this.ctx.boss();
    // Aimed at the boss: plant it beside him (towards the middle of the room), not in the line of sight.
    if (aim.hit && boss) {
      const p = boss.ragdoll.position('pelvis');
      const toCam = this.ctx.rig.camera.position.clone().sub(p).setY(0).normalize();
      const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
      if (side.dot(p) > 0) side.negate();
      at.copy(floorTarget(p.addScaledVector(side, 1.3).addScaledVector(toCam, -0.3)));
    }
    const obj = models.teslaCoil();
    obj.position.copy(at);
    obj.scale.set(1, 0.01, 1);
    this.ctx.scene.add(obj);
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glow(0xdff6ff, 0.9));
    aura.position.set(at.x, 1.35, at.z);
    this.ctx.scene.add(aura);
    this.coils.push({ obj, top: new THREE.Vector3(at.x, 1.35, at.z), aura, age: 0, life: this.def.opts?.duration ?? 12, zap: 0.6 });
    while (this.coils.length > MAX_COILS) this.remove(this.coils[0]);
    audio.play('thunk', { intensity: 1, pitch: 0.5 });
    audio.play('zap', { intensity: 0.6 });
    this.ctx.fx.dustPuff(at.clone().setY(0.05), new THREE.Vector3(0, 1, 0), 0xcccccc, 0.6);
    this.ctx.viewModel.recoil(1);
    if (!this.stopLoop) this.stopLoop = audio.loop('tesla', 0.7);
  }

  update(dt: number): void {
    this.cooldown -= dt;
    for (const c of [...this.coils]) {
      c.age += dt;
      c.obj.scale.y = Math.min(1, c.age / 0.25);
      c.aura.scale.setScalar(Math.min(1, c.age / 0.25) * (0.8 + Math.sin(c.age * 25) * 0.2 + Math.random() * 0.2));
      // Idle crackle on the torus.
      if (Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        this.ctx.fx.arc(c.top, c.top.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, Math.random() * 0.4, Math.sin(a) * 0.5)), 0xbfe6ff);
      }
      c.zap -= dt;
      if (c.zap <= 0) {
        c.zap = 0.55 + Math.random() * 0.25;
        this.fire(c);
      }
      if (c.age > c.life) {
        c.obj.scale.setScalar(Math.max(0.001, 1 - (c.age - c.life) * 3));
        if (c.age > c.life + 0.33) this.remove(c);
      }
    }
    if (!this.coils.length && this.stopLoop) {
      this.stopLoop();
      this.stopLoop = null;
    }
  }

  private fire(c: Coil): void {
    const target = nearestPart(this.ctx, c.top, RANGE);
    if (target) {
      for (let i = 0; i < 3; i++) this.ctx.fx.arc(c.top, target.pos, i ? 0x7fc8ff : 0xffffff);
      this.ctx.fx.flash(target.pos, 0x9be7ff, 10, 0.06);
      const dir = target.pos.clone().sub(c.top).normalize();
      const amount = this.def.damage * (0.8 + Math.random() * 0.4);
      const r = this.ctx.hitBoss({ part: target.part.def.name, amount, type: 'electric', point: target.pos, dir, impulse: this.def.impulse, source: this.def.id });
      audio.play('zap', { intensity: 0.8, pitch: 0.8 + Math.random() * 0.4 });
      if (r && Math.random() < 0.5) hitFeedback(this.ctx, this.def, target.pos, dir, amount, r);
      return;
    }
    // Nothing alive in range: zap a piece of furniture instead.
    for (const p of this.ctx.props.props) {
      if (p.broken) continue;
      const t = p.body.translation();
      const pos = new THREE.Vector3(t.x, t.y, t.z);
      if (pos.distanceTo(c.top) > RANGE) continue;
      this.ctx.fx.arc(c.top, pos);
      this.ctx.fx.arc(c.top, pos, 0xffffff);
      this.ctx.props.damage(p, 8, pos, pos.clone().sub(c.top).normalize());
      audio.play('zap', { intensity: 0.4 });
      return;
    }
  }

  private remove(c: Coil): void {
    for (const o of [c.obj, c.aura]) {
      this.ctx.scene.remove(o);
      disposeObject(o);
    }
    this.coils = this.coils.filter((x) => x !== c);
  }

  dispose(): void {
    for (const c of [...this.coils]) this.remove(c);
    this.stopLoop?.();
    this.stopLoop = null;
  }
}
