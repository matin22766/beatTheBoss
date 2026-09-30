import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { disposeObject } from './Melee';
import { hitFeedback } from '../hitFeedback';
import type { PartName } from '../../../character/RagdollDef';

type SummonKind = 'swords' | 'bees';

interface Agent {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
  height: number;
  mode: 'orbit' | 'dash' | 'return';
  timer: number;
  target: PartName | null;
  life: number;
  hitDone: boolean;
}

const SWORD_TARGETS: PartName[] = ['head', 'upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR', 'thighL', 'thighR', 'shinL', 'shinR', 'chest'];
const MAX_AGENTS = 40;

/**
 * Autonomous attackers: a ring of spectral swords that orbit the boss and take turns slashing at
 * his limbs, or an angry bee swarm that stings everywhere and makes him dizzy.
 */
export class Summon implements WeaponBehavior {
  private agents: Agent[] = [];
  private cooldown = 0;
  private stopLoop: (() => void) | null = null;
  private readonly kind: SummonKind;
  private time = 0;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {
    this.kind = (def.opts?.kind as SummonKind) ?? 'swords';
  }

  down(aim: Aim): void {
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    const count = this.def.opts?.count ?? 5;
    const life = this.def.opts?.duration ?? 8;
    const origin = this.ctx.viewModel.muzzle();
    // The camera is outside the room's front glass: spawn just inside it.
    origin.z = Math.min(origin.z, 2.9);
    for (let i = 0; i < count; i++) {
      const obj = (this.def.projectile ?? this.def.model)();
      const pos = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0));
      obj.position.copy(pos);
      this.ctx.scene.add(obj);
      const toTarget = (aim.hit?.point ?? aim.point).clone().sub(pos).normalize();
      this.agents.push({
        obj,
        pos,
        vel: toTarget.multiplyScalar(this.kind === 'swords' ? 6 : 4).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)),
        phase: (i / count) * Math.PI * 2,
        height: this.kind === 'swords' ? 0.2 + (i % 2) * 0.35 : Math.random() * 1.2 - 0.4,
        mode: 'orbit',
        timer: (this.kind === 'swords' ? 0.8 : 0.4) + i * (this.kind === 'swords' ? 0.35 : 0.08) + Math.random() * 0.3,
        target: null,
        life: life + Math.random() * 0.5,
        hitDone: false,
      });
    }
    while (this.agents.length > MAX_AGENTS) this.remove(this.agents[0]);
    this.ctx.viewModel.recoil(1);
    if (this.kind === 'swords') {
      audio.play('sword', { intensity: 1 });
      this.ctx.fx.word('BLADES, RISE!', origin.clone().setZ(1.5), '#7ff6ff', 0.4);
    } else {
      audio.play('pop', { intensity: 0.6 });
      this.ctx.fx.word('BZZZZ!', origin.clone().setZ(1.5), '#ffc300', 0.45);
      if (!this.stopLoop) this.stopLoop = audio.loop('bees', 0.8);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.cooldown -= dt;
    const boss = this.ctx.boss();
    const center = boss ? boss.ragdoll.position('chest') : new THREE.Vector3(0, 1.3, 0);
    for (const a of [...this.agents]) {
      a.life -= dt;
      if (a.life <= 0) {
        this.expire(a);
        continue;
      }
      a.timer -= dt;
      const prev = a.pos.clone();
      if (a.mode === 'orbit') {
        a.phase += dt * (this.kind === 'swords' ? 1.6 : 3 + Math.random());
        const r = this.kind === 'swords' ? 1.05 : 0.55;
        const desired = center.clone().add(new THREE.Vector3(Math.cos(a.phase) * r, a.height + Math.sin(this.time * 2 + a.phase) * 0.1, Math.sin(a.phase) * r));
        const steer = desired.sub(a.pos).multiplyScalar(this.kind === 'swords' ? 6 : 10);
        a.vel.lerp(steer, Math.min(1, dt * 5));
        if (this.kind === 'bees') a.vel.add(new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14).multiplyScalar(dt));
        if (a.timer <= 0 && boss && !boss.dead) this.startDash(a);
      } else if (a.mode === 'dash' && boss && a.target) {
        const part = boss.ragdoll.get(a.target);
        const tp = boss.ragdoll.position(a.target);
        const to = tp.clone().sub(a.pos);
        const speed = this.kind === 'swords' ? 13 : 7;
        a.vel.lerp(to.clone().normalize().multiplyScalar(speed), Math.min(1, dt * 12));
        if (!a.hitDone && to.length() < (this.kind === 'swords' ? 0.28 : 0.15)) this.strike(a, tp, part.attached);
        if (a.timer <= 0) this.toReturn(a);
      } else {
        if (a.mode === 'dash') this.toReturn(a);
        const steer = center.clone().add(new THREE.Vector3(Math.cos(a.phase), a.height, Math.sin(a.phase))).sub(a.pos).multiplyScalar(4);
        a.vel.lerp(steer, Math.min(1, dt * 4));
        if (a.timer <= 0) {
          a.mode = 'orbit';
          a.timer = this.kind === 'swords' ? 0.9 + Math.random() * 1.2 : 0.3 + Math.random() * 0.7;
        }
      }
      a.pos.addScaledVector(a.vel, dt);
      a.obj.position.copy(a.pos);
      if (a.vel.lengthSq() > 0.01) a.obj.lookAt(a.pos.clone().add(a.vel));
      if (this.kind === 'swords') {
        if (a.mode === 'dash') this.ctx.fx.tracer(prev, a.pos, 0x7ff6ff, 0.12);
        if (Math.random() < 0.2) this.ctx.fx.sparks.spawn({ pos: a.pos.clone(), vel: new THREE.Vector3(0, 0.3, 0), life: 0.3, size: 0.008, color: 0xbff9ff, gravity: 0 });
      } else {
        // Wing buzz.
        a.obj.scale.y = 1 + Math.sin(this.time * 80 + a.phase) * 0.15;
      }
    }
    if (this.stopLoop && !this.agents.length) {
      this.stopLoop();
      this.stopLoop = null;
    }
  }

  private startDash(a: Agent): void {
    const boss = this.ctx.boss();
    if (!boss) return;
    const options = (this.kind === 'swords' ? SWORD_TARGETS : [...boss.ragdoll.parts.keys()]).filter((n) => boss.ragdoll.get(n).attached);
    if (!options.length) return;
    a.target = options[Math.floor(Math.random() * options.length)];
    a.mode = 'dash';
    a.hitDone = false;
    a.timer = 0.8;
    if (this.kind === 'swords') audio.play('whoosh', { intensity: 0.5, pitch: 1.4 });
  }

  private toReturn(a: Agent): void {
    a.mode = 'return';
    a.timer = 0.35;
    a.target = null;
  }

  private strike(a: Agent, point: THREE.Vector3, attached: boolean): void {
    a.hitDone = true;
    if (!a.target) return;
    const dir = a.vel.clone().normalize();
    if (this.kind === 'swords') {
      const amount = this.def.damage * (0.85 + Math.random() * 0.3);
      const r = this.ctx.hitBoss({ part: a.target, amount, type: 'sharp', point: point.clone(), dir, impulse: this.def.impulse, source: this.def.id });
      audio.play('sword', { intensity: 0.7, pitch: 0.9 + Math.random() * 0.3 });
      if (r) hitFeedback(this.ctx, this.def, point, dir, amount, r);
      a.vel.multiplyScalar(0.6);
    } else {
      const r = this.ctx.hitBoss({ part: a.target, amount: this.def.damage, type: 'pierce', point: point.clone(), dir, impulse: 0.5, source: this.def.id, hpScale: 0.8 });
      audio.play('squeak', { intensity: 0.25, pitch: 1.6 + Math.random() * 0.4 });
      const boss = this.ctx.boss();
      if (boss && attached && r) {
        boss.ragdoll.stagger(0.03);
        if (Math.random() < 0.06) {
          boss.ragdoll.setPose('dizzy', 0.2, 1.2);
          this.ctx.fx.word(Math.random() < 0.5 ? 'OUCH!' : 'STING!', point, '#ffc300', 0.35);
        }
      }
    }
    this.toReturn(a);
  }

  private expire(a: Agent): void {
    if (this.kind === 'swords') {
      this.ctx.fx.impactSparks(a.pos, new THREE.Vector3(0, 1, 0), 8, 0xbff9ff);
      audio.play('twinkle', { intensity: 0.2 });
    }
    this.remove(a);
  }

  private remove(a: Agent): void {
    this.ctx.scene.remove(a.obj);
    disposeObject(a.obj);
    this.agents = this.agents.filter((x) => x !== a);
  }

  dispose(): void {
    for (const a of [...this.agents]) this.remove(a);
    this.stopLoop?.();
    this.stopLoop = null;
  }
}
