import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { explode } from '../../explosion';
import { clampToRoom, floorTarget, glow, liveParts } from './common';
import { disposeObject } from './Melee';
import type { Prop } from '../../../props/PropSystem';

type FieldKind = 'blackhole' | 'tornado' | 'magnet';

interface Scrap {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  delay: number;
}

interface Field {
  kind: FieldKind;
  center: THREE.Vector3;
  obj: THREE.Group;
  spinners: THREE.Object3D[];
  age: number;
  life: number;
  tick: number;
  scraps: Scrap[];
}

const BLACKHOLE_RADIUS = 4.5;
const TORNADO_RADIUS = 1.3;
const METAL = new Set(['metal', 'electronic']);

/**
 * Persistent area effects that push the whole ragdoll around with forces every physics step:
 * a black hole that swallows and spaghettifies, a tornado that lifts and spins, and a magnet that
 * hurls scrap metal (and any metal furniture) at the boss.
 */
export class FieldWeapon implements WeaponBehavior {
  private fields: Field[] = [];
  private cooldown = 0;
  private stopLoop: (() => void) | null = null;
  private readonly removeHook: () => void;
  private readonly kind: FieldKind;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {
    this.kind = (def.opts?.kind as FieldKind) ?? 'blackhole';
    this.removeHook = ctx.physics.onBeforeStep((dt) => this.step(dt));
  }

  down(aim: Aim): void {
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    const target = (aim.hit?.point ?? aim.point).clone();
    const life = this.def.opts?.duration ?? 5;
    const obj = new THREE.Group();
    const spinners: THREE.Object3D[] = [];
    let center: THREE.Vector3;
    if (this.kind === 'blackhole') {
      center = clampToRoom(target.clone(), 0.6);
      center.y = THREE.MathUtils.clamp(center.y, 1.2, 3);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      core.material.userData.outlineParameters = { visible: false };
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), glow(0x6a00ff, 0.18));
      const disk = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.1, 48), glow(0xc77dff, 0.55));
      disk.rotation.x = -Math.PI / 2.3;
      const disk2 = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.7, 48), glow(0xffd6ff, 0.5));
      disk2.rotation.x = -Math.PI / 2.3;
      obj.add(core, lens, disk, disk2);
      spinners.push(disk, disk2);
      audio.play('plasma', { intensity: 1, pitch: 0.35 });
      this.ctx.fx.word('BLACK HOLE!', center.clone().setY(center.y + 1), '#c77dff', 0.5);
    } else if (this.kind === 'tornado') {
      center = floorTarget(target);
      for (let i = 0; i < 3; i++) {
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.1 - i * 0.2, 0.18 + i * 0.05, 3.8 - i * 0.4, 20, 6, true), glow(i === 1 ? 0xe8e2d0 : 0xbfb6a0, 0.22, false));
        shell.position.y = (3.8 - i * 0.4) / 2;
        obj.add(shell);
        spinners.push(shell);
      }
      audio.play('whoosh', { intensity: 1, pitch: 0.4 });
      this.ctx.fx.word('TWISTER!', target.clone().setY(3), '#e0e0e0', 0.5);
    } else {
      const boss = this.ctx.boss();
      center = boss ? boss.ragdoll.position('chest') : target;
      audio.play('clang', { intensity: 0.8, pitch: 0.6 });
      this.ctx.fx.word('MAGNETIZED!', center.clone().setY(center.y + 0.6), '#ff4d4d', 0.45);
    }
    obj.position.copy(center);
    obj.scale.setScalar(0.01);
    this.ctx.scene.add(obj);
    const scraps: Scrap[] = [];
    if (this.kind === 'magnet') {
      for (let i = 0; i < 7; i++) {
        const s = scrapModel(i);
        const side = Math.random() < 0.5 ? -1 : 1;
        const pos = new THREE.Vector3(side * 4.8, 0.3 + Math.random() * 3, -2.5 + Math.random() * 4.5);
        if (i % 3 === 2) pos.set((Math.random() - 0.5) * 8, 5.8, -2.8 + Math.random() * 2);
        s.position.copy(pos);
        this.ctx.scene.add(s);
        scraps.push({ obj: s, pos, vel: new THREE.Vector3(), delay: 0.25 + i * 0.35 });
      }
    }
    this.fields.push({ kind: this.kind, center, obj, spinners, age: 0, life, tick: 0, scraps });
    this.ctx.viewModel.recoil(1);
    if (!this.stopLoop) this.stopLoop = audio.loop(this.kind === 'blackhole' ? 'vortex' : this.kind === 'tornado' ? 'wind' : 'gravity', 0.9);
  }

  /** Physics: forces on every boss part and nearby prop. */
  private step(dt: number): void {
    if (!this.fields.length) return;
    const parts = liveParts(this.ctx);
    const boss = this.ctx.boss();
    for (const f of this.fields) {
      const ramp = Math.min(1, f.age / 0.4);
      if (f.kind === 'blackhole') {
        let caught = false;
        for (const { part, pos } of parts) {
          const d = f.center.clone().sub(pos);
          const dist = d.length();
          if (dist > BLACKHOLE_RADIUS) continue;
          caught = true;
          const n = d.multiplyScalar(1 / Math.max(0.05, dist));
          const k = 1 - dist / BLACKHOLE_RADIUS;
          const accel = (10 + 26 * Math.sqrt(k)) * ramp;
          const swirl = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).multiplyScalar(7 * k * ramp);
          const imp = n.multiplyScalar(accel).add(swirl).add(new THREE.Vector3(0, 9.81 * 0.8 * ramp, 0)).multiplyScalar(part.def.mass * dt);
          part.body.applyImpulse(imp, true);
          if (dist < 0.5) {
            const v = part.body.linvel();
            part.body.setLinvel({ x: v.x * 0.9, y: v.y * 0.9, z: v.z * 0.9 }, true);
          }
        }
        if (caught && boss) boss.ragdoll.stagger(dt * 3);
        this.pullProps(f.center, BLACKHOLE_RADIUS, 24 * ramp, dt, () => true);
      } else if (f.kind === 'tornado') {
        let caught = false;
        for (const { part, pos } of parts) {
          const rel = pos.clone().sub(f.center);
          const h = rel.y;
          rel.y = 0;
          const r = rel.length();
          const radius = TORNADO_RADIUS + h * 0.15;
          if (r > radius || h > 4.5) continue;
          caught = true;
          const k = 1 - r / radius;
          const inward = rel.clone().multiplyScalar(-1 / Math.max(0.05, r));
          const tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), inward);
          const lift = h < 3.2 ? 9.81 * (1.05 + 0.6 * k) : 9.81 * 0.6;
          const imp = new THREE.Vector3(0, lift, 0).addScaledVector(tangent, 14 * (0.4 + k)).addScaledVector(inward, 7 * (1 - k * 0.5)).multiplyScalar(part.def.mass * dt * ramp);
          part.body.applyImpulse(imp, true);
        }
        if (caught && boss) boss.ragdoll.stagger(dt * 3);
        this.pullProps(f.center.clone().setY(1), 2, 20 * ramp, dt, () => true, true);
      } else if (boss) {
        f.center.copy(boss.ragdoll.position('chest'));
        this.pullProps(f.center, 9, 32 * ramp, dt, (p) => METAL.has(p.spec.material));
      }
    }
  }

  private pullProps(center: THREE.Vector3, radius: number, accel: number, dt: number, filter: (p: Prop) => boolean, lift = false): void {
    for (const p of this.ctx.props.props) {
      if (p.broken || !p.body.isDynamic() || !filter(p)) continue;
      const t = p.body.translation();
      const d = center.clone().sub(new THREE.Vector3(t.x, t.y, t.z));
      const dist = d.length();
      if (dist > radius || dist < 0.2) continue;
      const m = p.body.mass();
      const k = accel * (lift ? 1 : 0.5 + 0.5 * (1 - dist / radius));
      d.normalize().multiplyScalar(k * m * dt);
      if (lift) d.y += 9.81 * 1.3 * m * dt;
      p.body.applyImpulse(d, true);
    }
  }

  update(dt: number): void {
    this.cooldown -= dt;
    for (const f of [...this.fields]) {
      f.age += dt;
      const grow = Math.min(1, f.age / 0.35);
      const shrink = f.kind === 'blackhole' ? 1 : Math.min(1, (f.life - f.age) / 0.4);
      f.obj.scale.setScalar(Math.max(0.01, grow * shrink * (f.kind === 'blackhole' ? 1 + Math.sin(f.age * 9) * 0.04 : 1)));
      f.spinners.forEach((s, i) => (f.kind === 'blackhole' ? s.rotateZ(dt * (3 + i * 2.5)) : s.rotateY(dt * (6 + i * 3))));
      if (f.kind === 'tornado') this.moveTornado(f, dt);
      else if (f.kind === 'magnet') this.updateMagnet(f, dt);
      this.visuals(f);

      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.2;
        this.damageTick(f);
      }
      if (f.age >= f.life) this.end(f);
    }
    if (!this.fields.length && this.stopLoop) {
      this.stopLoop();
      this.stopLoop = null;
    }
  }

  private moveTornado(f: Field, dt: number): void {
    const boss = this.ctx.boss();
    if (!boss) return;
    const goal = boss.ragdoll.position('pelvis').setY(0);
    const d = goal.sub(f.center).setY(0);
    const len = d.length();
    if (len > 0.05) f.center.addScaledVector(d.normalize(), Math.min(len, dt * 1.1));
    f.center.x += Math.sin(f.age * 2.3) * dt * 0.8;
    clampToRoom(f.center, 0.8).setY(0);
    f.obj.position.copy(f.center);
  }

  private updateMagnet(f: Field, dt: number): void {
    const boss = this.ctx.boss();
    f.obj.position.copy(f.center);
    for (const s of [...f.scraps]) {
      s.delay -= dt;
      if (s.delay > 0) {
        s.obj.position.copy(s.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, 0));
        continue;
      }
      const to = f.center.clone().sub(s.pos);
      const dist = to.length();
      s.vel.addScaledVector(to.normalize(), dt * 40).multiplyScalar(0.985);
      const prev = s.pos.clone();
      s.pos.addScaledVector(s.vel, dt);
      s.obj.position.copy(s.pos);
      s.obj.rotation.x += dt * 12;
      s.obj.rotation.y += dt * 7;
      this.ctx.fx.tracer(prev, s.pos, 0xff8a8a, 0.08);
      const seg = s.pos.clone().sub(prev);
      const hit = boss && seg.length() > 1e-4 ? this.ctx.raycastBoss(new THREE.Ray(prev, seg.clone().normalize()), seg.length() + 0.1) : null;
      if (hit || dist < 0.25) {
        const dir = s.vel.clone().normalize();
        const point = hit?.point ?? f.center.clone();
        const part = hit?.part ?? 'chest';
        const r = this.ctx.hitBoss({ part, amount: 11, type: 'blunt', point, dir, impulse: 12, source: this.def.id });
        audio.play('clang', { intensity: 0.8, pitch: 0.8 + Math.random() * 0.5 });
        this.ctx.fx.impactSparks(point, dir, 12);
        if (r && Math.random() < 0.4) this.ctx.fx.word(Math.random() < 0.5 ? 'CLANK!' : 'DOINK!', point, '#ff3b30', 0.4);
        this.ctx.rig.shake(0.15);
        this.ctx.scene.remove(s.obj);
        disposeObject(s.obj);
        f.scraps = f.scraps.filter((x) => x !== s);
      }
    }
  }

  private visuals(f: Field): void {
    const fx = this.ctx.fx;
    if (f.kind === 'blackhole') {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.2 + Math.random() * 1.6;
        const p = f.center.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.6, Math.sin(a) * r));
        const inward = f.center.clone().sub(p).normalize();
        const tangent = new THREE.Vector3().crossVectors(inward, new THREE.Vector3(0, 1, 0));
        fx.sparks.spawn({ pos: p, vel: inward.multiplyScalar(3).addScaledVector(tangent, 2.5), life: 0.45, size: 0.012, color: Math.random() < 0.5 ? 0xc77dff : 0xffd6ff, gravity: 0 });
      }
    } else if (f.kind === 'tornado') {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const h = Math.random() * 3.5;
        const r = 0.25 + h * 0.22;
        const p = f.center.clone().add(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r));
        fx.dust.spawn({ pos: p, vel: new THREE.Vector3(-Math.sin(a) * 5, 2, Math.cos(a) * 5), life: 0.6, size: 0.06, color: 0xcfc6b0, gravity: 0 });
      }
    } else if (Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      fx.arc(f.center, f.center.clone().add(new THREE.Vector3(Math.cos(a) * 0.8, Math.random() - 0.3, Math.sin(a) * 0.8)), Math.random() < 0.5 ? 0xff4d4d : 0x4d8dff);
    }
  }

  private damageTick(f: Field): void {
    if (f.kind === 'magnet') return;
    const radius = f.kind === 'blackhole' ? 0.85 : TORNADO_RADIUS;
    for (const { part, pos } of liveParts(this.ctx)) {
      if (!part.attached) continue;
      const inside = f.kind === 'blackhole' ? pos.distanceTo(f.center) < radius : pos.clone().sub(f.center).setY(0).length() < radius && pos.y < 4.5;
      if (!inside) continue;
      const dir = f.center.clone().sub(pos).normalize();
      if (f.kind === 'blackhole') {
        // Spaghettification: tidal forces tear the joints apart.
        this.ctx.hitBoss({ part: part.def.name, amount: this.def.damage, type: 'sharp', point: pos, dir, impulse: 0, source: this.def.id, hpScale: 0.3 });
        if (Math.random() < 0.08) this.ctx.fx.word('SPAGHETTI!', pos, '#c77dff', 0.4);
      } else {
        this.ctx.hitBoss({ part: part.def.name, amount: this.def.damage, type: 'blunt', point: pos, dir, impulse: 0, source: this.def.id, hpScale: 0.6 });
      }
    }
    if (f.kind === 'blackhole') {
      for (const p of this.ctx.props.props) {
        if (p.broken) continue;
        const t = p.body.translation();
        const pos = new THREE.Vector3(t.x, t.y, t.z);
        if (pos.distanceTo(f.center) < 0.9) this.ctx.props.damage(p, 25, pos, f.center.clone().sub(pos).normalize());
      }
    }
  }

  private end(f: Field): void {
    if (f.kind === 'blackhole') {
      // Collapse, then everything that was swallowed gets spat out.
      this.ctx.fx.flash(f.center, 0xc77dff, 40, 0.15);
      this.ctx.fx.shockRing(f.center, new THREE.Vector3(0, 1, 0), 3, 0xc77dff);
      explode(this.ctx, f.center, 2.8, 35, this.def.id);
    } else if (f.kind === 'tornado') {
      this.ctx.fx.dustPuff(f.center.clone().setY(0.1), new THREE.Vector3(0, 1, 0), 0xcfc6b0, 1);
    }
    for (const s of f.scraps) {
      this.ctx.scene.remove(s.obj);
      disposeObject(s.obj);
    }
    this.ctx.scene.remove(f.obj);
    disposeObject(f.obj);
    this.fields = this.fields.filter((x) => x !== f);
  }

  dispose(): void {
    for (const f of [...this.fields]) {
      for (const s of f.scraps) {
        this.ctx.scene.remove(s.obj);
        disposeObject(s.obj);
      }
      this.ctx.scene.remove(f.obj);
      disposeObject(f.obj);
    }
    this.fields = [];
    this.stopLoop?.();
    this.stopLoop = null;
    this.removeHook();
  }
}

function scrapModel(i: number): THREE.Object3D {
  const steel = new THREE.MeshToonMaterial({ color: i % 2 ? 0x9aa3ad : 0x6d747c });
  let geo: THREE.BufferGeometry;
  switch (i % 4) {
    case 0:
      geo = new THREE.TorusGeometry(0.05, 0.02, 6, 6); // nut
      break;
    case 1:
      geo = new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6); // bolt
      break;
    case 2:
      geo = new THREE.BoxGeometry(0.04, 0.02, 0.24); // spanner
      break;
    default:
      geo = new THREE.BoxGeometry(0.12, 0.08, 0.02); // plate
  }
  const m = new THREE.Mesh(geo, steel);
  m.castShadow = true;
  return m;
}
