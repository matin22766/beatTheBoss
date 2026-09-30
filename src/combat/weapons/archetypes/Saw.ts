import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import type { PartName } from '../../../character/RagdollDef';
import { audio } from '../../../audio/AudioEngine';
import { disposeObject } from './Melee';

const TICK = 0.07;

/** Chainsaw: hold on the boss to grind through him. The saw floats at the cursor in the world. */
export class Saw implements WeaponBehavior {
  private pivot: THREE.Group | null = null;
  private stopLoop: (() => void) | null = null;
  private aim: Aim | null = null;
  private tick = 0;
  private wordCooldown = 0;
  private t = 0;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {}

  down(aim: Aim): void {
    this.aim = aim;
    if (!this.pivot) {
      this.pivot = new THREE.Group();
      this.pivot.add(this.def.model());
      this.ctx.scene.add(this.pivot);
    }
    this.pivot.visible = true;
    this.stopLoop = this.def.loop ? audio.loop(this.def.loop, 0.9) : null;
  }

  hold(aim: Aim): void {
    this.aim = aim;
  }

  up(): void {
    this.stopLoop?.();
    this.stopLoop = null;
    this.aim = null;
    if (this.pivot) this.pivot.visible = false;
  }

  update(dt: number): void {
    this.t += dt;
    this.wordCooldown -= dt;
    if (!this.aim || !this.pivot) return;
    const cam = this.ctx.rig.camera.position;
    // Re-aim every frame so the saw tracks the moving body.
    const hit = this.ctx.raycastBoss(this.aim.ray);
    const target = hit?.point ?? cam.clone().addScaledVector(this.aim.ray.direction, Math.min(4, this.aim.point.distanceTo(cam)));
    const dir = target.clone().sub(cam).normalize();
    const jitter = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(hit ? 0.03 : 0.008);
    this.pivot.position.copy(target).addScaledVector(dir, -0.55).add(jitter);
    this.pivot.lookAt(target);
    this.pivot.rotateZ(Math.PI / 2 + Math.sin(this.t * 3) * 0.1);
    const chain = this.pivot.getObjectByName('chain');
    if (chain) chain.position.x = Math.sin(this.t * 90) * 0.002;

    if (!hit) return;
    // Grinding FX every frame.
    this.ctx.fx.impactSparks(hit.point, dir, 2, 0xffe29a);
    if (this.ctx.fx.gore !== 'off' && Math.random() < 0.7) this.ctx.fx.bleed(hit.point, dir, 6);
    this.ctx.rig.shake(0.04);

    // Accumulate ticks so damage per second is frame-rate independent.
    this.tick -= dt;
    if (this.tick > 0) return;
    let ticks = 0;
    while (this.tick <= 0) {
      this.tick += TICK;
      ticks++;
    }
    const amount = this.def.damage * ticks;
    const result = this.ctx.hitBoss({ part: hit.part as PartName, amount, type: 'sharp', point: hit.point, dir, impulse: this.def.impulse, source: this.def.id });
    if (result && this.wordCooldown <= 0) {
      this.wordCooldown = 0.8;
      this.ctx.fx.word(['VRRRM!', 'GRIND!', 'BRRRAP!'][Math.floor(Math.random() * 3)], hit.point, '#ff3b30', 0.45);
      audio.play('splat', { intensity: 0.5 });
    }
    if (result?.severed.length) this.ctx.hitstop(0.08);
  }

  dispose(): void {
    this.up();
    if (this.pivot) {
      this.ctx.scene.remove(this.pivot);
      disposeObject(this.pivot);
    }
  }
}
