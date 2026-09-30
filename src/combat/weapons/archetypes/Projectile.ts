import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { hitFeedback } from '../hitFeedback';
import { explode } from '../../explosion';
import { roomPoint } from '../../../core/roomPoint';
import { disposeObject } from './Melee';
import type { PartName } from '../../../character/RagdollDef';

interface Shot {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
  life: number;
  stuck: boolean;
  fade: number;
  dodgeChecked: boolean;
  ignoreBoss: boolean;
}

const _up = new THREE.Vector3(0, 0, 1);

/**
 * Visible ballistic projectiles (bolts, nails, rockets, knives, cleavers) stepped kinematically and
 * swept with raycasts each frame, so fast shots never tunnel. They embed in the boss or the walls,
 * or explode.
 */
export class Projectile implements WeaponBehavior {
  private shots: Shot[] = [];
  private cooldown = 0;
  private queued: Aim | null = null;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {}

  down(aim: Aim): void {
    if (this.cooldown > 0) this.queued = this.cooldown < 0.2 ? aim : null;
    else this.fire(aim);
  }

  hold(aim: Aim): void {
    if (this.def.auto && this.cooldown <= 0) this.fire(aim);
  }

  private fire(aim: Aim): void {
    this.cooldown = this.def.cooldown;
    const o = this.def.opts ?? {};
    const speed = o.speed ?? 30;
    const count = o.count ?? 1;
    const muzzle = this.ctx.viewModel.muzzle();
    const target = aim.hit?.point ?? aim.point;
    audio.play(this.def.sound, { intensity: 0.8 });
    this.ctx.viewModel.recoil(o.radius ? 1.4 : 0.6);
    if (o.radius) {
      this.ctx.fx.smokePuff(muzzle, 6, 0xdddddd, 0.08);
      this.ctx.rig.shake(0.2);
    }
    for (let i = 0; i < count; i++) {
      const dir = target.clone().sub(muzzle).normalize();
      if (count > 1) {
        // Fan throw for knives.
        const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        dir.addScaledVector(side, (i - (count - 1) / 2) * 0.06).normalize();
      }
      const obj = (this.def.projectile ?? this.def.model)();
      obj.position.copy(muzzle);
      obj.quaternion.setFromUnitVectors(_up, dir);
      this.ctx.scene.add(obj);
      const g = (o.gravity ?? 0.15) * 9.81;
      // Aim slightly high to compensate for drop over the distance.
      const dist = target.distanceTo(muzzle);
      const vel = dir.clone().multiplyScalar(speed);
      vel.y += (g * dist) / speed / 2;
      this.shots.push({ obj, pos: muzzle.clone(), vel, spin: o.spin ?? 0, life: 6, stuck: false, fade: 0, dodgeChecked: false, ignoreBoss: false });
    }
    if (this.shots.length > 40) this.remove(this.shots[0]);
  }

  update(dt: number): void {
    this.cooldown -= dt;
    if (this.queued && this.cooldown <= 0) {
      const a = this.queued;
      this.queued = null;
      this.fire(a);
    }
    const o = this.def.opts ?? {};
    const g = (o.gravity ?? 0.15) * 9.81;
    for (const s of [...this.shots]) {
      s.life -= dt;
      if (s.stuck) {
        if (s.life < 1) s.obj.scale.setScalar(Math.max(0.001, s.life));
        if (s.life <= 0) this.remove(s);
        continue;
      }
      const prev = s.pos.clone();
      s.vel.y -= g * dt;
      s.pos.addScaledVector(s.vel, dt);
      const seg = s.pos.clone().sub(prev);
      const len = seg.length();
      if (len < 1e-5) continue;
      const ray = new THREE.Ray(prev, seg.clone().multiplyScalar(1 / len));
      // Incoming! When it gets close he may sidestep.
      const boss = this.ctx.boss();
      if (!s.dodgeChecked && boss) {
        const chest = boss.ragdoll.position('chest');
        if (chest.distanceTo(s.pos) < 2.5 && s.vel.dot(chest.clone().sub(s.pos)) > 0) {
          s.dodgeChecked = true;
          s.ignoreBoss = this.ctx.tryDodge('projectile', s.vel.clone().normalize());
        }
      }
      const hit = s.ignoreBoss ? null : this.ctx.raycastBoss(ray, len);
      const dir = ray.direction.clone();
      const prop = this.ctx.raycastProp(ray, len);
      if (prop && (!hit || prop.distance < hit.point.distanceTo(ray.origin))) {
        this.ctx.props.hit(prop.prop, this.def.damage, prop.point, dir, this.def.impulse);
        this.onHitWall(s, prop.point, dir);
        continue;
      }
      if (hit) {
        this.onHitBoss(s, hit.part, hit.point, dir);
        continue;
      }
      // Room collision within this segment.
      const wall = roomPoint(ray);
      if (wall.distanceTo(prev) <= len) {
        this.onHitWall(s, wall, dir);
        continue;
      }
      s.obj.position.copy(s.pos);
      if (s.spin) s.obj.rotateX(s.spin * dt);
      else s.obj.quaternion.setFromUnitVectors(_up, dir);
      if (o.radius) this.ctx.fx.flame(s.pos.clone(), dir.clone().multiplyScalar(-2));
      if (s.life <= 0) this.remove(s);
    }
  }

  private onHitBoss(s: Shot, part: PartName, point: THREE.Vector3, dir: THREE.Vector3): void {
    const o = this.def.opts ?? {};
    if (o.radius) {
      this.remove(s);
      explode(this.ctx, point, o.radius, this.def.damage, this.def.id);
      return;
    }
    const amount = this.def.damage * (0.9 + Math.random() * 0.2);
    const result = this.ctx.hitBoss({ part, amount, type: this.def.type, point: point.clone(), dir, impulse: this.def.impulse, source: this.def.id });
    if (result) hitFeedback(this.ctx, this.def, point, dir, amount, result);
    audio.play('stab', { intensity: 0.7 });
    const boss = this.ctx.boss();
    if (o.embed !== false && boss && !boss.ragdoll.get(part).severed) {
      // Embed: sink the tip slightly into the body and parent it to the part.
      this.ctx.scene.remove(s.obj);
      const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
      if (s.spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.random() * 0.6));
      boss.attachAtWorld(part, s.obj, point.clone().addScaledVector(dir, 0.04), q);
      this.shots = this.shots.filter((x) => x !== s);
    } else {
      this.remove(s);
    }
  }

  private onHitWall(s: Shot, point: THREE.Vector3, dir: THREE.Vector3): void {
    const o = this.def.opts ?? {};
    if (o.radius) {
      this.remove(s);
      explode(this.ctx, point.clone().addScaledVector(dir, -0.15), o.radius, this.def.damage, this.def.id);
      return;
    }
    audio.play('thunk', { intensity: 0.5 });
    this.ctx.fx.impactSparks(point, dir, 5);
    this.ctx.fx.dustPuff(point, dir.clone().negate(), 0xcccccc, 0.2);
    s.stuck = true;
    s.life = 8;
    s.obj.position.copy(point).addScaledVector(dir, 0.03);
    s.obj.quaternion.setFromUnitVectors(_up, dir);
  }

  private remove(s: Shot): void {
    this.ctx.scene.remove(s.obj);
    disposeObject(s.obj);
    this.shots = this.shots.filter((x) => x !== s);
  }

  dispose(): void {
    for (const s of [...this.shots]) this.remove(s);
  }
}
