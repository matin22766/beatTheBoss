import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { RAPIER, G, groups } from '../../../physics/PhysicsWorld';
import { ROOM } from '../../../physics/ArenaColliders';
import { audio } from '../../../audio/AudioEngine';
import { hitFeedback } from '../hitFeedback';
import { explode } from '../../explosion';
import { disposeObject } from './Melee';
import type { PartName } from '../../../character/RagdollDef';
import { orientBetween, strand } from './common';

interface Item {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  obj: THREE.Object3D;
  fuse: number | null;
  age: number;
  life: number;
  lastHit: number;
  lastBounce: number;
  joint: RAPIER.ImpulseJoint | null;
  preVel: THREE.Vector3;
  /** Pendulum: fixed ceiling anchor, its rope joint and the chain mesh. */
  anchor: RAPIER.RigidBody | null;
  anchorPos: THREE.Vector3 | null;
  chain: THREE.Mesh | null;
}

const MAX_ITEMS = 10;

/**
 * Physical throwables: real rigid bodies that bounce, roll and hit with their momentum. Supports
 * fused explosives (grenade), sticky ones (dynamite) and objects dropped from the ceiling (anvil).
 */
export class Thrown implements WeaponBehavior {
  private items: Item[] = [];
  private cooldown = 0;
  private time = 0;
  private readonly removeHook: () => void;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {
    this.removeHook = ctx.physics.onBeforeStep(() => {
      for (const it of this.items) {
        const v = it.body.linvel();
        it.preVel.set(v.x, v.y, v.z);
      }
    });
  }

  down(aim: Aim): void {
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    this.spawn(aim);
  }

  hold(aim: Aim): void {
    if (this.def.auto && this.cooldown <= 0) this.down(aim);
  }

  private spawn(aim: Aim): void {
    const o = this.def.opts ?? {};
    const target = (aim.hit?.point ?? aim.point).clone();
    let pos: THREE.Vector3;
    let vel: THREE.Vector3;
    let anchorPos: THREE.Vector3 | null = null;
    if (o.pendulum) {
      // Hang from the ceiling above the target and let go from high up to one side.
      anchorPos = new THREE.Vector3(
        THREE.MathUtils.clamp(target.x, -ROOM.halfWidth + 0.6, ROOM.halfWidth - 0.6),
        ROOM.height - 0.05,
        THREE.MathUtils.clamp(target.z, ROOM.back + 0.6, ROOM.front - 0.6),
      );
      const len = anchorPos.y - THREE.MathUtils.clamp(target.y, 0.8, 2.5);
      const side = target.x > 0 ? -1 : 1;
      const limit = ROOM.halfWidth - 0.6;
      const sx = THREE.MathUtils.clamp(anchorPos.x + side * len * Math.sin(1.2), -limit, limit);
      const h = Math.min(len * 0.98, Math.abs(sx - anchorPos.x));
      pos = new THREE.Vector3(sx, anchorPos.y - Math.sqrt(len * len - h * h), anchorPos.z);
      vel = new THREE.Vector3();
      audio.play('clang', { intensity: 0.7, pitch: 0.5 });
      audio.play('whoosh', { intensity: 1, pitch: 0.35 });
      this.ctx.fx.word('WRECKING BALL!', anchorPos.clone().setY(3.5), '#ffcc33', 0.45);
    } else if (o.drop) {
      pos = new THREE.Vector3(
        THREE.MathUtils.clamp(target.x, -ROOM.halfWidth + 0.5, ROOM.halfWidth - 0.5),
        ROOM.height - 0.4,
        THREE.MathUtils.clamp(target.z, ROOM.back + 0.5, ROOM.front - 0.5),
      );
      vel = new THREE.Vector3(0, -3, 0);
      audio.play('whoosh', { intensity: 0.8, pitch: 0.6 });
      this.ctx.fx.word('INCOMING!', pos.clone().setY(3), '#ffcc33', 0.4);
    } else {
      pos = this.ctx.viewModel.muzzle();
      // The camera sits outside the room's invisible front wall: start just inside it.
      const inside = ROOM.front - 0.35;
      if (pos.z > inside) {
        const d = target.clone().sub(pos).normalize();
        if (d.z < -1e-3) pos.addScaledVector(d, (inside - pos.z) / d.z);
        else pos.z = inside;
      }
      const speed = o.speed ?? 12;
      const d = target.clone().sub(pos);
      const dist = d.length();
      vel = d.normalize().multiplyScalar(speed);
      vel.y += (9.81 * dist) / speed / 2;
      audio.play('whoosh', { intensity: 0.6 });
      this.ctx.viewModel.recoil(1);
    }

    const obj = this.def.model();
    this.ctx.scene.add(obj);
    const mass = o.mass ?? 1;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(vel.x, vel.y, vel.z)
      .setAngvel(o.drop || o.pendulum ? { x: 0, y: 0, z: 0 } : { x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 12 })
      .setCcdEnabled(true)
      .setAngularDamping(0.3);
    if (o.drop) bodyDesc.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI));
    const body = this.ctx.physics.world.createRigidBody(bodyDesc);
    const half = o.half ?? [0.1, 0.1, 0.1];
    const cd = (o.shape === 'ball' ? RAPIER.ColliderDesc.ball(half[0]) : RAPIER.ColliderDesc.cuboid(...half))
      .setMass(mass)
      .setFriction(0.7)
      .setRestitution(o.shape === 'ball' ? 0.35 : 0.15)
      .setCollisionGroups(groups(G.PROJECTILE, G.ARENA | G.BOSS | G.PROP | G.PROJECTILE))
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(0);
    const collider = this.ctx.physics.world.createCollider(cd, body);
    this.ctx.sync.add(body, obj);
    let anchor: RAPIER.RigidBody | null = null;
    let joint: RAPIER.ImpulseJoint | null = null;
    let chain: THREE.Mesh | null = null;
    if (anchorPos) {
      const world = this.ctx.physics.world;
      anchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchorPos.x, anchorPos.y, anchorPos.z));
      joint = world.createImpulseJoint(RAPIER.JointData.rope(anchorPos.distanceTo(pos), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), anchor, body, true);
      chain = strand(0x3a3d42, 0.025);
      this.ctx.scene.add(chain);
    }
    this.items.push({
      body,
      collider,
      obj,
      fuse: o.fuse ?? null,
      age: 0,
      life: o.fuse ? 30 : 12,
      lastHit: -1,
      lastBounce: -1,
      joint,
      preVel: vel.clone(),
      anchor,
      anchorPos,
      chain,
    });
    while (this.items.length > MAX_ITEMS) this.remove(this.items[0]);
  }

  afterStep(): void {
    if (!this.items.length) return;
    const byHandle = new Map(this.items.map((it) => [it.collider.handle, it]));
    for (const c of this.ctx.physics.contacts) {
      let it = byHandle.get(c.h1);
      let other = c.h2;
      if (!it) {
        it = byHandle.get(c.h2);
        other = c.h1;
      }
      if (!it) continue;
      const dir = new THREE.Vector3(c.dirX, c.dirY, c.dirZ);
      const speed = Math.abs(it.preVel.dot(dir));
      const part = this.ctx.partForCollider(other);
      const prop = this.ctx.props.byCollider(other);
      if (prop && speed > 3 && this.time - it.lastBounce > 0.15) {
        const t = it.body.translation();
        this.ctx.props.damage(prop, (speed - 2) * Math.sqrt(this.def.opts?.mass ?? 1) * 3, new THREE.Vector3(t.x, t.y, t.z), it.preVel.clone().normalize());
      }
      if (part) this.hitBoss(it, part, speed, other);
      else if (speed > 2 && this.time - it.lastBounce > 0.15) {
        const first = it.lastBounce < 0;
        it.lastBounce = this.time;
        const land = this.def.opts?.landSound;
        if (first && land) audio.play(land, { intensity: 1 });
        else audio.play(this.def.hitSound === 'clang' || (this.def.opts?.mass ?? 1) > 20 ? 'thud' : 'thunk', { intensity: Math.min(1, speed / 10) });
        if (speed > 6) {
          const t = it.body.translation();
          this.ctx.fx.dustPuff(new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(0, 1, 0), 0xcccccc, Math.min(1, speed / 12));
          if ((this.def.opts?.mass ?? 1) > 20) this.ctx.rig.shake(0.4);
        }
      }
    }
  }

  private hitBoss(it: Item, part: PartName, speed: number, otherHandle: number): void {
    const o = this.def.opts ?? {};
    if (o.sticky && !it.joint) this.stick(it, otherHandle);
    if (speed < 2.5 || this.time - it.lastHit < 0.25) return;
    it.lastHit = this.time;
    const ref = o.drop ? 9 : (o.speed ?? 12);
    const amount = this.def.damage * THREE.MathUtils.clamp(speed / ref, 0.2, 1.6);
    const t = it.body.translation();
    const point = new THREE.Vector3(t.x, t.y, t.z);
    const dir = it.preVel.lengthSq() > 1e-6 ? it.preVel.clone().normalize() : new THREE.Vector3(0, -1, 0);
    const result = this.ctx.hitBoss({ part, amount, type: this.def.type, point, dir, impulse: 0, source: this.def.id });
    if (result) hitFeedback(this.ctx, this.def, point, dir, amount, result);
  }

  /** Dynamite sticks to whatever body part it touches first. */
  private stick(it: Item, otherHandle: number): void {
    const boss = this.ctx.boss();
    const partName = this.ctx.partForCollider(otherHandle);
    if (!boss || !partName) return;
    const pb = boss.ragdoll.get(partName).body;
    const pt = pb.translation();
    const pr = pb.rotation();
    const it_t = it.body.translation();
    const it_r = it.body.rotation();
    const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w);
    const iq = new THREE.Quaternion(it_r.x, it_r.y, it_r.z, it_r.w);
    const local = new THREE.Vector3(it_t.x - pt.x, it_t.y - pt.y, it_t.z - pt.z).applyQuaternion(pq.clone().invert());
    const frame = pq.clone().invert().multiply(iq);
    const data = RAPIER.JointData.fixed(local, frame, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    it.joint = this.ctx.physics.world.createImpulseJoint(data, pb, it.body, true);
    it.joint.setContactsEnabled(false);
    audio.play('thunk', { intensity: 0.6, pitch: 1.4 });
    this.ctx.fx.word('STUCK!', new THREE.Vector3(it_t.x, it_t.y, it_t.z), '#ffcc33', 0.35);
  }

  update(dt: number): void {
    this.time += dt;
    this.cooldown -= dt;
    for (const it of [...this.items]) {
      it.age += dt;
      if (it.chain && it.anchorPos && it.body.isValid()) {
        const t = it.body.translation();
        orientBetween(it.chain, it.anchorPos, new THREE.Vector3(t.x, t.y, t.z));
      }
      if (it.fuse !== null) {
        it.fuse -= dt;
        const t = it.body.translation();
        const p = new THREE.Vector3(t.x, t.y + 0.1, t.z);
        this.ctx.fx.sparks.spawn({
          pos: p,
          vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2),
          life: 0.25,
          size: 0.008,
          color: Math.random() < 0.5 ? 0xffd166 : 0xff6b35,
          gravity: 4,
        });
        // Blink faster as the fuse runs out.
        const blink = Math.sin(it.age * (8 + (1 / Math.max(0.1, it.fuse)) * 6)) > 0;
        it.obj.scale.setScalar(blink && it.fuse < 1 ? 1.12 : 1);
        if (it.fuse <= 0) {
          const radius = this.def.opts?.radius ?? 2;
          this.remove(it);
          explode(this.ctx, p, radius, this.def.damage, this.def.id);
          continue;
        }
      }
      if (it.age > it.life) {
        it.obj.scale.setScalar(Math.max(0.001, 1 - (it.age - it.life) * 2));
        if (it.age > it.life + 0.5) this.remove(it);
      }
    }
  }

  private remove(it: Item): void {
    const world = this.ctx.physics.world;
    if (it.joint && it.joint.isValid()) world.removeImpulseJoint(it.joint, true);
    if (it.anchor && it.anchor.isValid()) world.removeRigidBody(it.anchor);
    if (it.chain) {
      this.ctx.scene.remove(it.chain);
      disposeObject(it.chain);
    }
    this.ctx.sync.removeBody(it.body);
    if (it.body.isValid()) world.removeRigidBody(it.body);
    this.ctx.scene.remove(it.obj);
    disposeObject(it.obj);
    this.items = this.items.filter((x) => x !== it);
  }

  dispose(): void {
    for (const it of [...this.items]) this.remove(it);
    this.removeHook();
  }
}
