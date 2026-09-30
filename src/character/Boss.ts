import * as THREE from 'three';
import { Ragdoll } from './Ragdoll';
import { BossMesh } from './BossMesh';
import { getPartDef, type PartName } from './RagdollDef';
import { DamageSystem } from '../combat/DamageSystem';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { BodySync } from '../core/BodySync';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, HitInfo, HitResult } from '../core/types';
import type { Effects } from '../fx/Effects';
import { audio } from '../audio/AudioEngine';
import { pickDeathStyle } from '../death/pickDeathStyle';
import type { FaceRig } from './Expression';

/** The boss: physics ragdoll + visuals + damage, reacting to every hit. */
export class Boss {
  readonly ragdoll: Ragdoll;
  readonly mesh: BossMesh;
  readonly damage: DamageSystem;
  /** Seconds since the last hit, drives the pain expression. */
  private sinceHit = 10;
  private painLevel = 0;
  private gruntCooldown = 0;
  private tauntTimer = 6;

  constructor(
    physics: PhysicsWorld,
    private readonly scene: THREE.Scene,
    private readonly sync: BodySync,
    private readonly events: EventBus<GameEvents>,
    private readonly fx: Effects,
    origin = new THREE.Vector3(),
    face?: () => FaceRig,
  ) {
    this.ragdoll = new Ragdoll(physics, origin);
    this.mesh = new BossMesh();
    if (face) this.mesh.setFace(face(), true);
    this.mesh.addTo(scene);
    for (const [name, part] of this.ragdoll.parts) this.sync.add(part.body, this.mesh.parts.get(name)!);
    this.damage = new DamageSystem(this.ragdoll);
  }

  get dead(): boolean {
    return this.damage.dead;
  }

  partOf(obj: THREE.Object3D): PartName | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      const p = o.userData.part as string | undefined;
      if (p && p !== 'stump') return p as PartName;
      if (p === 'stump') {
        // Stumps belong to whatever part group they are attached to.
        let g: THREE.Object3D | null = o.parent;
        while (g && !this.mesh.parts.has(g.name as PartName)) g = g.parent;
        return g ? (g.name as PartName) : null;
      }
      o = o.parent;
    }
    return null;
  }

  /** Apply a hit: impulse, damage rules, reactions, FX and events. */
  hit(info: HitInfo): HitResult {
    const part = this.ragdoll.get(info.part);
    if (info.impulse > 0) {
      part.body.applyImpulseAtPoint(info.dir.clone().multiplyScalar(info.impulse), info.point, true);
    }
    const wasDead = this.damage.dead;
    const result = this.damage.apply(info);

    // Reactions.
    this.sinceHit = 0;
    this.painLevel = Math.min(1, this.painLevel + result.dealt / 25 + 0.25);
    if (!this.dead) {
      this.ragdoll.stagger(Math.min(0.9, result.dealt / 45 + info.impulse / 300));
      if (result.dealt > 3) this.ragdoll.setPose(Math.random() < 0.5 ? 'hurt' : 'cower', 0.12, 0.5);
    }
    if (this.gruntCooldown <= 0 && part.attached && !wasDead) {
      audio.play(result.dealt > 30 || result.severed.length ? 'scream' : 'grunt', { intensity: Math.min(1, 0.4 + result.dealt / 30) });
      this.gruntCooldown = 0.35 + Math.random() * 0.3;
    }

    for (const s of result.broke) {
      audio.play('crunch', { intensity: 1 });
      this.fx.word('CRACK!', info.point, '#ffffff', 0.55);
      this.events.emit('boneBreak', { part: s, point: info.point.clone() });
    }
    if (result.severed.length) this.onSevered(result.severed[0], info);

    this.events.emit('hit', { hit: info, result });
    if (result.killed && !wasDead) this.die(info, result);
    return result;
  }

  private onSevered(root: PartName, info: HitInfo): void {
    this.mesh.addStumps(root);
    const def = getPartDef(root);
    const anchor = this.ragdoll.jointWorldAnchor(root) ?? info.point;
    audio.play('slice', { intensity: 1 });
    audio.play('splat', { intensity: 1 });
    this.fx.bleed(anchor, info.dir, 40);
    // Fountains from both stumps.
    const parentName = def.parent!;
    const parentDef = getPartDef(parentName);
    const jointLocalParent = new THREE.Vector3(...def.joint!.anchor).sub(new THREE.Vector3(...parentDef.pos));
    const jointLocalChild = new THREE.Vector3(...def.joint!.anchor).sub(new THREE.Vector3(...def.pos));
    const outward = new THREE.Vector3(...def.pos).sub(new THREE.Vector3(...def.joint!.anchor)).normalize();
    this.fx.addSpurt(this.mesh.parts.get(parentName)!, jointLocalParent, outward, 4, 55);
    this.fx.addSpurt(this.mesh.parts.get(root)!, jointLocalChild, outward.clone().negate(), 2.5, 30);
    this.fx.word(root === 'head' ? 'OFF WITH IT!' : 'SLICE!', anchor, '#ff3b30', 0.6);
    this.events.emit('sever', { part: root, point: anchor.clone(), type: info.type });
  }

  private die(cause: HitInfo, result: HitResult): void {
    this.ragdoll.kill();
    this.mesh.face.target = { ...this.mesh.face.target, dead: true, pain: 0, mouthOpen: 0.4 };
    const style = pickDeathStyle(cause, result);
    this.events.emit('death', { style, cause });
  }

  /** Let the boss taunt the player now and then while healthy. */
  update(dt: number, time: number): void {
    this.sinceHit += dt;
    this.gruntCooldown -= dt;
    this.painLevel = Math.max(0, this.painLevel - dt * 0.8);
    const r = this.ragdoll;
    const face = this.mesh.face;
    if (!this.dead) {
      const dizzy = r.strength < 0.45 ? 1 - r.strength / 0.45 : 0;
      const lowHp = 1 - this.damage.hpFraction;
      face.target = {
        pain: this.painLevel,
        mouthOpen: r.grabbed ? 0.8 : this.painLevel * 0.6,
        eyesClosed: 0,
        brows: r.grabbed ? 1 : this.sinceHit > 3 ? -0.8 + lowHp * 1.6 : 0.6,
        dizzy,
        smirk: r.currentPose() === 'taunt' ? 1 : 0,
        dead: false,
      };
      this.fx.setDizzy(this.mesh.parts.get('head')!, dizzy);
      this.tauntTimer -= dt;
      if (this.tauntTimer <= 0) {
        this.tauntTimer = 7 + Math.random() * 6;
        if (this.sinceHit > 4 && r.isStanding()) {
          r.setPose('taunt', 0.3, 1.6);
          audio.play('boing', { intensity: 0.3, pitch: 0.8 });
        }
      }
    } else {
      this.fx.setDizzy(null, 0);
    }
    face.update(dt, time);
  }

  headPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.mesh.parts.get('head')!.getWorldPosition(out);
  }

  dispose(): void {
    for (const part of this.ragdoll.parts.values()) this.sync.removeBody(part.body);
    this.mesh.removeFrom(this.scene);
    this.mesh.dispose();
    this.ragdoll.dispose();
    this.fx.setDizzy(null, 0);
  }
}
