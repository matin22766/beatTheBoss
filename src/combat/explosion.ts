import * as THREE from 'three';
import type { WeaponCtx } from './weapons/types';
import { audio } from '../audio/AudioEngine';

/** Radial blast: fireball FX, knock-back and explosive damage to every nearby body part. */
export function explode(ctx: WeaponCtx, center: THREE.Vector3, radius: number, damage: number, source: string): void {
  ctx.fx.explosion(center, radius);
  ctx.fx.splat(new THREE.Vector3(center.x, 0.004, center.z), new THREE.Vector3(0, 1, 0), new THREE.Color(0x15110e), radius * 0.35);
  audio.play('explosion', { intensity: 1.2 });
  ctx.rig.shake(Math.min(1, 0.5 + damage / 150));
  ctx.hitstop(0.06);
  ctx.props.explode(center, radius, damage);
  const boss = ctx.boss();
  if (!boss) return;
  for (const part of boss.ragdoll.parts.values()) {
    const t = part.body.translation();
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const d = pos.distanceTo(center);
    if (d > radius) continue;
    const f = 1 - d / radius;
    const dir = pos.clone().sub(center).add(new THREE.Vector3(0, 0.5, 0)).normalize();
    const k = part.def.mass * 11 * f;
    part.body.applyImpulse({ x: dir.x * k, y: dir.y * k, z: dir.z * k }, true);
    if (damage * f > 2) {
      ctx.hitBoss({ part: part.def.name, amount: damage * f, type: 'explosive', point: pos, dir, impulse: 0, source, hpScale: 0.2 });
    }
  }
}
