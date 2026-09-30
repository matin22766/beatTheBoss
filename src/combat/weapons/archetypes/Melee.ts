import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { hitFeedback } from '../hitFeedback';

interface Swing {
  pivot: THREE.Group;
  base: THREE.Quaternion;
  t: number;
  hit: boolean;
  aim: Aim;
  dir: THREE.Vector3;
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** The boss saw it coming. */
  dodged: boolean;
}

const SWING_TIME = 0.1;
const RECOVER_TIME = 0.28;

/** Tap-to-swing hand weapons: the weapon appears, swings into the cursor point, then fades away. */
export class Melee implements WeaponBehavior {
  private swings: Swing[] = [];
  private cooldown = 0;
  /** A click that arrived during cooldown fires as soon as it expires (input buffering). */
  private queued: Aim | null = null;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {}

  down(aim: Aim): void {
    if (this.cooldown > 0) this.queued = aim;
    else this.trySwing(aim);
  }

  hold(aim: Aim): void {
    if (this.def.auto) this.trySwing(aim);
  }

  private trySwing(aim: Aim): void {
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    const camPos = this.ctx.rig.camera.position;
    const target = (aim.hit?.point ?? aim.point).clone();
    const dir = target.clone().sub(camPos).normalize();
    const reach = this.def.opts?.reach ?? 0.6;
    const style = this.def.opts?.swing ?? 'overhead';

    const pivot = new THREE.Group();
    const model = this.def.model();
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    pivot.add(model);
    const hand = target.clone().addScaledVector(dir, -reach);
    pivot.position.copy(hand);
    pivot.lookAt(target);
    const base = pivot.quaternion.clone();
    const back = style === 'jab' || style === 'stab' ? 0.7 : 0.15;
    this.ctx.scene.add(pivot);
    this.swings.push({
      pivot,
      base,
      t: 0,
      hit: false,
      aim,
      dir,
      start: hand.clone().addScaledVector(dir, -back),
      end: hand.clone().addScaledVector(dir, style === 'stab' ? 0.12 : 0.02),
      dodged: !!aim.hit && this.ctx.tryDodge(this.def.id === 'fists' ? 'fist' : 'melee', dir),
    });
    audio.play('whoosh', { intensity: 0.4 + Math.min(0.6, this.def.impulse / 120) });
  }

  update(dt: number): void {
    this.cooldown -= dt;
    if (this.queued && this.cooldown <= 0) {
      const aim = this.queued;
      this.queued = null;
      this.trySwing(aim);
    }
    const style = this.def.opts?.swing ?? 'overhead';
    for (const s of this.swings) {
      s.t += dt;
      const swingK = Math.min(1, s.t / SWING_TIME);
      const ease = swingK * swingK;
      const q = new THREE.Quaternion();
      if (style === 'overhead') q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.5 * (1 - ease));
      else if (style === 'side') q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.6 * (1 - ease));
      s.pivot.quaternion.copy(s.base).multiply(q);
      s.pivot.position.lerpVectors(s.start, s.end, ease);

      if (!s.hit && swingK >= 1) {
        s.hit = true;
        this.impact(s);
      }
      if (s.t > SWING_TIME) {
        const r = (s.t - SWING_TIME) / RECOVER_TIME;
        const bounce = Math.sin(Math.min(1, r) * Math.PI) * 0.25;
        if (style === 'overhead') s.pivot.quaternion.copy(s.base).multiply(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -bounce));
        s.pivot.position.copy(s.end).addScaledVector(s.dir, -bounce * 0.4);
        s.pivot.scale.setScalar(Math.max(0.001, 1 - Math.max(0, r - 0.5) * 2));
      }
    }
    this.swings = this.swings.filter((s) => {
      if (s.t < SWING_TIME + RECOVER_TIME) return true;
      this.ctx.scene.remove(s.pivot);
      disposeObject(s.pivot);
      return false;
    });
  }

  private impact(s: Swing): void {
    // Re-check what's under the swing now: the boss may have moved since the click.
    const ray = new THREE.Ray(this.ctx.rig.camera.position.clone(), s.dir.clone());
    const hit = this.ctx.raycastBoss(ray) ?? s.aim.hit;
    const prop = this.ctx.raycastProp(ray);
    const bossDist = hit ? hit.point.distanceTo(ray.origin) : Infinity;
    if (prop && prop.distance < bossDist && prop.point.distanceTo(s.end) < 0.9) {
      // Smacking furniture.
      const amount = this.def.damage * (0.85 + Math.random() * 0.3);
      this.ctx.props.hit(prop.prop, amount, prop.point, s.dir, this.def.impulse);
      this.ctx.fx.impactSparks(prop.point, s.dir, 6, 0xffe29a);
      this.ctx.rig.shake(0.1);
      return;
    }
    if (!hit || s.dodged || hit.point.distanceTo(s.end) > 0.9) {
      return;
    }
    const style = this.def.opts?.swing ?? 'overhead';
    const hitDir = s.dir.clone();
    if (style === 'overhead') hitDir.add(new THREE.Vector3(0, -0.7, 0)).normalize();
    if (style === 'side') hitDir.add(new THREE.Vector3(-0.6, 0, 0)).normalize();
    const amount = this.def.damage * (0.85 + Math.random() * 0.3);
    const result = this.ctx.hitBoss({
      part: hit.part,
      amount,
      type: this.def.type,
      point: hit.point.clone(),
      dir: hitDir,
      impulse: this.def.impulse,
      source: this.def.id,
    });
    if (result) hitFeedback(this.ctx, this.def, hit.point, hitDir, amount, result);
  }

  dispose(): void {
    for (const s of this.swings) {
      this.ctx.scene.remove(s.pivot);
      disposeObject(s.pivot);
    }
    this.swings = [];
  }
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => m.dispose());
    }
  });
}
