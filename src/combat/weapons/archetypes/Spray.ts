import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { hitFeedback } from '../hitFeedback';
import type { PartName } from '../../../character/RagdollDef';

const TICK = 0.06;

/**
 * Hold-to-use streams: flamethrower (fire cone), taser (electric arc) and freeze ray (ice beam).
 * Damage ticks along a short cone of rays from the muzzle toward the cursor.
 */
export class Spray implements WeaponBehavior {
  private active = false;
  private stopLoop: (() => void) | null = null;
  private tick = 0;
  private aim: Aim | null = null;
  private beam: THREE.Mesh | null = null;
  private feedbackCooldown = 0;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {
    if (def.type === 'cold') {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      mat.userData.outlineParameters = { visible: false };
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 1, 12, 1, true), mat);
      this.beam.visible = false;
      ctx.scene.add(this.beam);
    }
  }

  down(aim: Aim): void {
    this.active = true;
    this.aim = aim;
    if (this.def.loop) this.stopLoop = audio.loop(this.def.loop, 0.8);
    this.tick = 0;
  }

  hold(aim: Aim): void {
    this.aim = aim;
  }

  up(): void {
    this.active = false;
    this.stopLoop?.();
    this.stopLoop = null;
    if (this.beam) this.beam.visible = false;
  }

  update(dt: number): void {
    this.feedbackCooldown -= dt;
    if (!this.active || !this.aim) return;
    const muzzle = this.ctx.viewModel.muzzle();
    const aim = this.aim;
    const target = aim.hit?.point ?? aim.point;
    const range = this.def.opts?.range ?? 5;
    const toTarget = target.clone().sub(muzzle);
    const dir = toTarget.clone().normalize();
    const reach = Math.min(range, toTarget.length());
    const end = muzzle.clone().addScaledVector(dir, reach);

    // Continuous visuals.
    if (this.def.type === 'fire') {
      for (let i = 0; i < 6; i++) {
        const v = dir
          .clone()
          .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.18))
          .normalize()
          .multiplyScalar(7 + Math.random() * 3);
        this.ctx.fx.flame(muzzle.clone().addScaledVector(dir, 0.1), v);
      }
      this.ctx.fx.flash(end, 0xff8c42, 6, 0.05);
    } else if (this.def.type === 'electric') {
      this.ctx.fx.arc(muzzle, aim.hit && aim.hit.point.distanceTo(muzzle) < range ? aim.hit.point : end);
      this.ctx.fx.arc(muzzle, aim.hit && aim.hit.point.distanceTo(muzzle) < range ? aim.hit.point : end, 0xffffff);
      this.ctx.fx.flash(end, 0x9be7ff, 8, 0.05);
    } else if (this.def.type === 'cold' && this.beam) {
      this.beam.visible = true;
      this.beam.position.copy(muzzle).lerp(end, 0.5);
      this.beam.scale.set(1 + Math.sin(performance.now() * 0.03) * 0.15, reach, 1);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.ctx.fx.ice.spawn({
        pos: end.clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2),
        life: 0.8,
        size: 0.02,
        color: 0xdff6ff,
        gravity: 6,
      });
    }

    this.tick -= dt;
    if (this.tick > 0) return;
    let ticks = 0;
    while (this.tick <= 0) {
      this.tick += TICK;
      ticks++;
    }
    // Damage: a few rays in a small cone from the muzzle.
    const hits = new Map<string, { point: THREE.Vector3; count: number }>();
    for (let i = 0; i < 4; i++) {
      const d = dir
        .clone()
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.def.type === 'fire' ? 0.16 : 0.03))
        .normalize();
      const hit = this.ctx.raycastBoss(new THREE.Ray(muzzle.clone(), d), range);
      if (!hit) continue;
      const h = hits.get(hit.part);
      if (h) h.count++;
      else hits.set(hit.part, { point: hit.point, count: 1 });
    }
    for (const [part, { point, count }] of hits) {
      const amount = (this.def.damage * count * ticks) / 4;
      const result = this.ctx.hitBoss({
        part: part as PartName,
        amount,
        type: this.def.type,
        point,
        dir,
        impulse: this.def.impulse * (count / 4),
        source: this.def.id,
      });
      if (result && this.feedbackCooldown <= 0) {
        this.feedbackCooldown = 0.5;
        hitFeedback(this.ctx, this.def, point, dir, amount * 6, result);
      }
    }
  }

  dispose(): void {
    this.up();
    if (this.beam) {
      this.ctx.scene.remove(this.beam);
      this.beam.geometry.dispose();
      (this.beam.material as THREE.Material).dispose();
    }
  }
}
