import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { RAPIER } from '../../../physics/PhysicsWorld';
import { audio } from '../../../audio/AudioEngine';
import { roomPoint } from '../../../core/roomPoint';
import { hitFeedback } from '../hitFeedback';
import { disposeObject } from './Melee';
import { orientBetween, roomNormal, strand } from './common';
import { ROOM } from '../../../physics/ArenaColliders';
import { models } from '../models';

type TetherKind = 'web' | 'harpoon';

interface Line {
  body: RAPIER.RigidBody;
  /** Attachment point in the body's local frame. */
  local: THREE.Vector3;
  anchorBody: RAPIER.RigidBody;
  anchor: THREE.Vector3;
  joint: RAPIER.ImpulseJoint | null;
  length: number;
  jointLength: number;
  minLength: number;
  mesh: THREE.Mesh;
  age: number;
  life: number;
  /** Reel in automatically (harpoon) instead of while the button is held. */
  autoReel: number;
}

const MAX_LINES = 3;

/**
 * Rope weapons. The web shooter glues whatever it hits to the wall behind it (hold to reel him in
 * and slam him against it); the harpoon gun skewers a limb and drags him to the wall on its cable.
 */
export class Tether implements WeaponBehavior {
  private lines: Line[] = [];
  private cooldown = 0;
  private holding = false;
  private readonly kind: TetherKind;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {
    this.kind = (def.opts?.kind as TetherKind) ?? 'web';
  }

  down(aim: Aim): void {
    this.holding = true;
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    const muzzle = this.ctx.viewModel.muzzle();
    const dir = aim.ray.direction.clone();
    audio.play(this.def.sound, { intensity: 1 });
    this.ctx.viewModel.recoil(this.kind === 'harpoon' ? 1.3 : 0.6);

    const boss = this.ctx.boss();
    let hit = aim.hit;
    if (hit && this.kind === 'harpoon' && this.ctx.tryDodge('projectile', dir)) hit = null;
    const prop = this.ctx.raycastProp(aim.ray);
    const bossDist = hit ? hit.point.distanceTo(aim.ray.origin) : Infinity;
    let end: THREE.Vector3;
    if (prop && prop.distance < bossDist && prop.prop.body.isDynamic()) {
      end = prop.point.clone();
      this.attach(prop.prop.body, end, null);
      this.ctx.props.hit(prop.prop, this.kind === 'harpoon' ? this.def.damage : 2, end, dir, 0);
    } else if (prop && prop.distance < bossDist) {
      end = prop.point.clone();
      this.ctx.props.hit(prop.prop, this.def.damage, end, dir, 0);
    } else if (hit && boss) {
      end = hit.point.clone();
      const part = boss.ragdoll.get(hit.part);
      const amount = this.def.damage;
      const r = this.ctx.hitBoss({ part: hit.part, amount, type: this.def.type, point: end, dir, impulse: this.def.impulse, source: this.def.id });
      if (r) hitFeedback(this.ctx, this.def, end, dir, amount, r);
      if (this.kind === 'harpoon' && !part.severed) {
        const spear = models.harpoon();
        boss.attachAtWorld(hit.part, spear, end.clone().addScaledVector(dir, 0.05), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
      }
      this.attach(part.body, end, hit.part);
    } else {
      end = roomPoint(aim.ray);
      // A web splat on the wall.
      if (this.kind === 'web') this.ctx.fx.splat(end, roomNormal(end), new THREE.Color(0xf4f4f4), 0.22);
      else {
        audio.play('thunk', { intensity: 0.8 });
        this.ctx.fx.impactSparks(end, dir, 8);
      }
    }
    this.ctx.fx.tracer(muzzle, end, this.kind === 'web' ? 0xffffff : 0x6b4a33, 0.12);
  }

  /**
   * Tie a body to the room with a rope joint. Webs go up to the ceiling (reeling hoists him up like
   * a fly in a web); harpoon cables run to the nearest side wall. Both read clearly from the camera.
   */
  private attach(body: RAPIER.RigidBody, point: THREE.Vector3, part: string | null): void {
    const surface =
      this.kind === 'web'
        ? new THREE.Vector3(point.x, ROOM.height, point.z - 0.3)
        : new THREE.Vector3((point.x < 0 ? -1 : 1) * ROOM.halfWidth, THREE.MathUtils.clamp(point.y, 0.5, 2), point.z);
    surface.z = THREE.MathUtils.clamp(surface.z, ROOM.back + 0.1, ROOM.front - 0.3);
    const anchor = surface.clone().addScaledVector(roomNormal(surface), 0.02);
    const t = body.translation();
    const r = body.rotation();
    const local = point.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w).invert());
    const world = this.ctx.physics.world;
    const anchorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchor.x, anchor.y, anchor.z));
    const length = anchor.distanceTo(point) * (this.kind === 'web' ? 0.95 : 1);
    const mesh = strand(this.kind === 'web' ? 0xf8f8f8 : 0x3b2a1a, this.kind === 'web' ? 0.018 : 0.012);
    this.ctx.scene.add(mesh);
    const line: Line = {
      body,
      local,
      anchorBody,
      anchor,
      joint: null,
      length,
      jointLength: -1,
      // Webs hoist him until his feet dangle, not up out of the frame.
      minLength: this.kind === 'web' ? Math.min(length, ROOM.height - 2.6) : 0.2,
      mesh,
      age: 0,
      life: this.def.opts?.duration ?? 10,
      autoReel: this.kind === 'harpoon' ? 4.5 : 0,
    };
    this.rebuild(line);
    this.lines.push(line);
    while (this.lines.length > MAX_LINES) this.remove(this.lines[0]);
    if (this.kind === 'web') {
      this.ctx.fx.splat(anchor, roomNormal(surface), new THREE.Color(0xf4f4f4), 0.3);
      this.ctx.fx.word(part === 'head' ? 'FACE WEB!' : 'WEBBED!', point, '#ffffff', 0.45);
    } else {
      this.ctx.fx.word('HARPOONED!', point, '#ff3b30', 0.45);
    }
  }

  private rebuild(l: Line): void {
    const world = this.ctx.physics.world;
    if (l.joint && l.joint.isValid()) world.removeImpulseJoint(l.joint, true);
    l.joint = world.createImpulseJoint(RAPIER.JointData.rope(l.length, { x: 0, y: 0, z: 0 }, l.local), l.anchorBody, l.body, true);
    l.jointLength = l.length;
  }

  hold(): void {
    this.holding = true;
  }

  up(): void {
    this.holding = false;
  }

  update(dt: number): void {
    this.cooldown -= dt;
    for (const l of [...this.lines]) {
      if (!l.body.isValid() || !l.anchorBody.isValid() || (l.joint && !l.joint.isValid())) {
        this.remove(l);
        continue;
      }
      l.age += dt;
      const reel = l.autoReel || (this.holding && l === this.lines[this.lines.length - 1] ? 3 : 0);
      if (reel > 0 && l.length > l.minLength) {
        l.length = Math.max(l.minLength, l.length - reel * dt);
        if (l.jointLength - l.length > 0.05) {
          this.rebuild(l);
          if (Math.random() < 0.3) audio.play('squeak', { intensity: 0.15, pitch: this.kind === 'web' ? 1.8 : 0.7 });
        }
      }
      const t = l.body.translation();
      const r = l.body.rotation();
      const end = l.local.clone().applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
      orientBetween(l.mesh, l.anchor, end);
      if (l.age > l.life) this.remove(l);
    }
  }

  private remove(l: Line): void {
    const world = this.ctx.physics.world;
    if (l.joint && l.joint.isValid()) world.removeImpulseJoint(l.joint, true);
    if (l.anchorBody.isValid()) world.removeRigidBody(l.anchorBody);
    this.ctx.scene.remove(l.mesh);
    disposeObject(l.mesh);
    this.lines = this.lines.filter((x) => x !== l);
  }

  dispose(): void {
    for (const l of [...this.lines]) this.remove(l);
  }
}
