import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { hitFeedback } from '../hitFeedback';
import { roomPoint } from '../../../core/roomPoint';

/** Instant-hit guns (pistol, shotgun): rays from the camera with spread, tracers from the muzzle. */
export class Hitscan implements WeaponBehavior {
  private cooldown = 0;
  private queued: Aim | null = null;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {}

  down(aim: Aim): void {
    if (this.cooldown > 0) this.queued = this.cooldown < 0.15 ? aim : null;
    else this.fire(aim);
  }

  hold(aim: Aim): void {
    if (this.def.auto && this.cooldown <= 0) this.fire(aim);
  }

  private fire(aim: Aim): void {
    this.cooldown = this.def.cooldown;
    const pellets = this.def.opts?.pellets ?? 1;
    const spread = this.def.opts?.spread ?? 0.004;
    const muzzle = this.ctx.viewModel.muzzle();
    audio.play(this.def.sound, { intensity: 1 });
    this.ctx.viewModel.recoil(pellets > 1 ? 1.4 : 0.8);
    this.ctx.fx.flash(muzzle, 0xffd27a, pellets > 1 ? 30 : 18, 0.06);
    this.ctx.fx.impactSparks(muzzle, aim.ray.direction.clone().negate(), 5, 0xffe29a);
    this.ctx.rig.shake(pellets > 1 ? 0.25 : 0.1);

    // He might see the muzzle flash and lean out of the way.
    const dodged = !!this.ctx.raycastBoss(aim.ray) && this.ctx.tryDodge('bullet', aim.ray.direction);
    for (let i = 0; i < pellets; i++) {
      const dir = aim.ray.direction
        .clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(spread))
        .normalize();
      const ray = new THREE.Ray(aim.ray.origin.clone(), dir);
      const hit = dodged ? null : this.ctx.raycastBoss(ray);
      const prop = this.ctx.raycastProp(ray);
      if (prop && (!hit || prop.distance < hit.point.distanceTo(ray.origin))) {
        // Furniture in the way soaks the bullet.
        this.ctx.fx.tracer(muzzle, prop.point);
        this.ctx.props.hit(prop.prop, this.def.damage, prop.point, dir, this.def.impulse);
        this.ctx.fx.impactSparks(prop.point, dir, 5);
        continue;
      }
      const end = hit ? hit.point : roomPoint(ray);
      this.ctx.fx.tracer(muzzle, end);
      if (hit) {
        const amount = this.def.damage * (0.9 + Math.random() * 0.2);
        const result = this.ctx.hitBoss({ part: hit.part, amount, type: this.def.type, point: hit.point.clone(), dir, impulse: this.def.impulse, source: this.def.id });
        if (result && i === 0) hitFeedback(this.ctx, this.def, hit.point, dir, amount * pellets, result);
        else this.ctx.fx.bleed(hit.point, dir, amount * 0.6);
      } else {
        // Bullet hole + sparks in the wall.
        this.ctx.fx.impactSparks(end, dir, 6);
        this.ctx.fx.splat(end, dir.clone().negate(), new THREE.Color(0x1a1a1a), 0.035);
        this.ctx.fx.dustPuff(end, dir.clone().negate(), 0xbbbbbb, 0.2);
      }
    }
  }

  update(dt: number): void {
    this.cooldown -= dt;
    if (this.queued && this.cooldown <= 0) {
      const a = this.queued;
      this.queued = null;
      this.fire(a);
    }
  }

  dispose(): void {}
}
