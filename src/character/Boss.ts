import * as THREE from 'three';
import { Ragdoll } from './Ragdoll';
import { BossMesh } from './BossMesh';
import { getPartDef, type PartName } from './RagdollDef';
import { DamageSystem } from '../combat/DamageSystem';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { BodySync } from '../core/BodySync';
import type { EventBus } from '../core/EventBus';
import type { DeathStyle, GameEvents, HitInfo, HitResult } from '../core/types';
import type { Effects } from '../fx/Effects';
import { audio } from '../audio/AudioEngine';
import { pickDeathStyle } from '../death/pickDeathStyle';
import type { FaceProfile } from '../face/FaceProfile';
import { PhotoFace } from '../face/PhotoFace';
import { Injuries, injuryFor } from '../gore/Injuries';
import { PART_NAMES } from './RagdollDef';

/** The boss: physics ragdoll + visuals + damage, reacting to every hit. */
export class Boss {
  readonly ragdoll: Ragdoll;
  readonly mesh: BossMesh;
  readonly damage: DamageSystem;
  readonly injuries: Injuries;
  /** Elemental status: char is permanent charring, the rest decay. */
  readonly status = { char: 0, onFire: 0, frost: 0, shock: 0 };
  /** Set by death styles that take over the body (frozen statue, ash, etc.). */
  frozenSolid = false;
  private burnTick = 0;
  private spasmTick = 0;
  private spawnT = 0;
  private wasFrozen = false;
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
    face?: FaceProfile | null,
  ) {
    this.ragdoll = new Ragdoll(physics, origin);
    this.mesh = new BossMesh();
    if (face) {
      this.mesh.setFace(new PhotoFace(face.data), false);
      this.mesh.setSkinColor(face.skin);
      this.mesh.setHairColor(face.hair);
    }
    this.mesh.addTo(scene);
    for (const [name, part] of this.ragdoll.parts) this.sync.add(part.body, this.mesh.parts.get(name)!);
    this.damage = new DamageSystem(this.ragdoll);
    this.ragdoll.onStep = () => audio.play('step', { intensity: 0.2 });
    this.injuries = new Injuries(this.mesh, this.ragdoll, fx);
    // Pop in with a puff of smoke.
    for (const g of this.mesh.parts.values()) g.scale.setScalar(0.01);
    fx.dustPuff(new THREE.Vector3(origin.x, 0.9, origin.z), new THREE.Vector3(0, 1, 0), 0xffffff, 1.2);
    audio.play('pop', { intensity: 0.8 });
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

    const kind = injuryFor(info.type);
    if (kind && info.amount > 4 && info.source !== 'fire-tick') {
      this.injuries.add(info.part, info.point, info.dir.clone().negate(), kind, info.amount);
    }
    switch (info.type) {
      case 'fire':
        this.status.onFire = Math.min(4, this.status.onFire + info.amount * 0.08);
        this.status.char = Math.min(1, this.status.char + info.amount * 0.004);
        break;
      case 'cold':
        this.status.frost = Math.min(1.2, this.status.frost + info.amount * 0.012);
        break;
      case 'electric':
        this.status.shock = Math.min(1.5, this.status.shock + info.amount * 0.05);
        break;
      case 'explosive':
        this.status.char = Math.min(1, this.status.char + info.amount * 0.002);
        break;
    }

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

  /** Kill immediately with a given style (debug/test hook). */
  forceKill(style: DeathStyle, cause: HitInfo): void {
    if (this.dead) return;
    this.damage.hp = 0;
    this.damage.dead = true;
    this.ragdoll.kill();
    this.mesh.face.target = { ...this.mesh.face.target, dead: true, pain: 0, mouthOpen: 0.4 };
    this.events.emit('death', { style, cause });
  }

  private die(cause: HitInfo, result: HitResult): void {
    this.ragdoll.kill();
    this.mesh.face.target = { ...this.mesh.face.target, dead: true, pain: 0, mouthOpen: 0.4 };
    const style = pickDeathStyle(cause, result);
    this.events.emit('death', { style, cause });
  }

  /** Elemental effects: flames, freezing stiffness, electric spasms and X-ray flashes. */
  private updateStatus(dt: number, time: number): void {
    const st = this.status;
    const r = this.ragdoll;
    if (st.onFire > 0) {
      st.onFire = Math.max(0, st.onFire - dt);
      st.char = Math.min(1, st.char + dt * 0.05);
      for (let i = 0; i < 3; i++) {
        const name = PART_NAMES[Math.floor(Math.random() * PART_NAMES.length)];
        const p = r.position(name);
        this.fx.flame(p.add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.05, (Math.random() - 0.5) * 0.15)), new THREE.Vector3(0, 0.6, 0));
      }
      if (Math.random() < dt * 3) this.fx.smokePuff(r.position('head'), 1, 0x6a6a6a, 0.05);
      this.burnTick -= dt;
      if (this.burnTick <= 0 && !this.dead) {
        this.burnTick = 0.3;
        this.hit({ part: 'chest', amount: 1.2, type: 'fire', point: r.position('chest'), dir: new THREE.Vector3(0, 0, -1), impulse: 0, source: 'fire-tick' });
      }
    }
    st.frost = Math.max(0, st.frost - dt * 0.1);
    const frozen = this.frozenSolid || st.frost > 0.85;
    if (frozen !== this.wasFrozen) {
      this.wasFrozen = frozen;
      for (const p of r.parts.values()) {
        p.body.setAngularDamping(frozen ? 25 : this.dead ? 1.2 : 0.6);
        p.body.setLinearDamping(frozen ? 0.8 : 0.05);
      }
      if (frozen) audio.play('freeze', { intensity: 0.8 });
    }
    if (frozen && !this.dead) r.stagger(0.05);

    st.shock = Math.max(0, st.shock - dt * 1.4);
    if (st.shock > 0.12) {
      this.spasmTick -= dt;
      if (this.spasmTick <= 0) {
        this.spasmTick = 0.05;
        for (const p of r.parts.values()) {
          const k = p.def.mass * 0.6 * Math.min(1, st.shock);
          p.body.applyImpulse({ x: (Math.random() - 0.5) * k, y: Math.random() * k * 0.8, z: (Math.random() - 0.5) * k }, true);
        }
        if (!this.dead) r.stagger(0.08);
      }
    }
    this.mesh.setXray(st.shock > 0.45 && Math.sin(time * 70) > 0.2);
    this.mesh.tint.char = st.char;
    this.mesh.tint.frost = frozen ? 1 : Math.min(1, st.frost);
    this.mesh.tint.glow = Math.min(1, st.shock);
    this.mesh.applyTint();
  }

  /** Let the boss taunt the player now and then while healthy. */
  update(dt: number, time: number): void {
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 3);
      const t = this.spawnT;
      const s = 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t);
      for (const g of this.mesh.parts.values()) g.scale.setScalar(Math.max(0.01, t < 1 ? easeOutBack(t) * s : 1));
    }
    this.updateStatus(dt, time);
    this.sinceHit += dt;
    this.gruntCooldown -= dt;
    this.painLevel = Math.max(0, this.painLevel - dt * 0.8);
    const r = this.ragdoll;
    const face = this.mesh.face;
    if (!this.dead && !this.frozenSolid) {
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

  /** Stick an object (arrow, nail, knife) into a part at a world pose so it moves with the body. */
  attachAtWorld(part: PartName, obj: THREE.Object3D, worldPos: THREE.Vector3, worldQuat: THREE.Quaternion): void {
    const body = this.ragdoll.get(part).body;
    const t = body.translation();
    const r = body.rotation();
    const qInv = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
    obj.position.copy(worldPos).sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(qInv);
    obj.quaternion.copy(qInv).multiply(worldQuat);
    obj.userData.decal = true;
    this.mesh.attach(part, obj, 14);
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

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
