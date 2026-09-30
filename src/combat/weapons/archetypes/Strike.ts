import * as THREE from 'three';
import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from '../types';
import { audio } from '../../../audio/AudioEngine';
import { explode } from '../../explosion';
import { hitFeedback } from '../hitFeedback';
import { disposeObject } from './Melee';
import { FloorMarker, floorTarget, glow, liveParts } from './common';
import type { PartName } from '../../../character/RagdollDef';
import { ROOM } from '../../../physics/ArenaColliders';
import { models } from '../models';

type StrikeKind = 'lightning' | 'icespikes' | 'meteor' | 'guillotine';

interface Pending {
  at: THREE.Vector3;
  delay: number;
  marker: FloorMarker | null;
}

interface Spike {
  obj: THREE.Mesh;
  height: number;
  t: number;
}

interface Meteor {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  delay: number;
  marker: FloorMarker;
}

interface Blade {
  obj: THREE.Object3D;
  blade: THREE.Object3D;
  t: number;
  hit: boolean;
  at: THREE.Vector3;
}

interface Bolt {
  lines: THREE.Mesh[];
  t: number;
}

const GUILLOTINE_DELAY = 0.45;
const GUILLOTINE_DROP = 0.18;

/**
 * Attacks that come out of the sky or the floor at the cursor, after a short telegraph ring:
 * lightning bolts that chain into furniture, ice spikes that impale and freeze, a meteor shower,
 * and a guillotine that drops right where his neck is.
 */
export class Strike implements WeaponBehavior {
  private cooldown = 0;
  private pending: Pending[] = [];
  private spikes: Spike[] = [];
  private meteors: Meteor[] = [];
  private blades: Blade[] = [];
  private bolts: Bolt[] = [];
  private readonly kind: StrikeKind;

  constructor(
    private readonly def: WeaponDef,
    private readonly ctx: WeaponCtx,
  ) {
    this.kind = (def.opts?.kind as StrikeKind) ?? 'lightning';
  }

  down(aim: Aim): void {
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    const boss = this.ctx.boss();
    let target = floorTarget(aim.hit?.point ?? aim.point);
    // Aimed at the boss: strike where he stands.
    if (aim.hit && boss) target = floorTarget(boss.ragdoll.position(this.kind === 'guillotine' ? 'head' : aim.hit.part));
    this.ctx.viewModel.recoil(0.8);
    switch (this.kind) {
      case 'lightning':
        this.pending.push({ at: target, delay: 0.18, marker: new FloorMarker(this.ctx.scene, target, 0x9be7ff, 0.5, 0.18) });
        this.ctx.fx.flash(target.clone().setY(ROOM.height - 0.5), 0xdff6ff, 10, 0.1);
        break;
      case 'icespikes':
        this.pending.push({ at: target, delay: 0.35, marker: new FloorMarker(this.ctx.scene, target, 0x8fe3ff, 0.7, 0.35) });
        this.ctx.fx.iceShards(target.clone().setY(0.05), 8, 0.3);
        break;
      case 'meteor':
        this.meteorShower(target);
        break;
      case 'guillotine':
        this.dropGuillotine(target);
        break;
    }
  }

  update(dt: number): void {
    this.cooldown -= dt;
    for (const p of [...this.pending]) {
      p.delay -= dt;
      if (p.marker && !p.marker.update(dt)) p.marker = null;
      if (p.delay > 0) continue;
      p.marker?.dispose();
      this.pending = this.pending.filter((x) => x !== p);
      if (this.kind === 'lightning') this.lightning(p.at);
      else this.eruptSpikes(p.at);
    }
    this.updateSpikes(dt);
    this.updateMeteors(dt);
    this.updateBlades(dt);
    for (const b of [...this.bolts]) {
      b.t += dt;
      const k = b.t / 0.25;
      for (const l of b.lines) (l.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * (Math.sin(b.t * 90) > -0.3 ? 1 : 0.2);
      if (k >= 1) {
        for (const l of b.lines) {
          this.ctx.scene.remove(l);
          disposeObject(l);
        }
        this.bolts = this.bolts.filter((x) => x !== b);
      }
    }
  }

  // ------------------------------------------------------------------ lightning

  private lightning(at: THREE.Vector3): void {
    const top = at.clone().setY(ROOM.height - 0.05).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 0.6));
    const hit = nearestColumn(this.ctx, at, 0.9);
    const end = hit ? hit.pos.clone() : at.clone().setY(0.02);
    this.bolt(top, end, 0.05);
    audio.play('thunder', { intensity: 1.2 });
    this.ctx.fx.flash(end, 0xdff6ff, 40, 0.12);
    this.ctx.rig.shake(0.5);
    this.ctx.fx.splat(at.clone().setY(0.004), new THREE.Vector3(0, 1, 0), new THREE.Color(0x151515), 0.45);
    this.ctx.fx.impactSparks(end, new THREE.Vector3(0, -1, 0), 25, 0xdff6ff);
    if (hit) {
      const dir = new THREE.Vector3(0, -1, 0);
      const r = this.ctx.hitBoss({ part: hit.part.def.name, amount: this.def.damage, type: 'electric', point: end, dir, impulse: this.def.impulse, source: this.def.id });
      if (r) hitFeedback(this.ctx, this.def, end, dir, this.def.damage, r);
      // Current runs through the whole body.
      for (const { part, pos } of liveParts(this.ctx)) {
        if (part.attached && part !== hit.part && Math.random() < 0.4) this.bolt(end, pos, 0.015);
      }
    }
    // Chain into nearby furniture.
    let chains = 0;
    for (const p of this.ctx.props.props) {
      if (p.broken || chains >= 3) continue;
      const t = p.body.translation();
      const pos = new THREE.Vector3(t.x, t.y, t.z);
      if (pos.distanceTo(end) > 2.6) continue;
      chains++;
      this.bolt(end, pos, 0.02);
      this.ctx.props.damage(p, 30, pos, pos.clone().sub(end).normalize());
    }
  }

  private bolt(from: THREE.Vector3, to: THREE.Vector3, thickness: number): void {
    const n = 9;
    const len = from.distanceTo(to);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5).multiplyScalar(len * 0.14));
      pts.push(p);
    }
    const lines: THREE.Mesh[] = [];
    for (const [r, c] of [
      [thickness, 0xffffff],
      [thickness * 3, 0x7fc8ff],
    ] as const) {
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), n * 3, r, 5, false);
      const mesh = new THREE.Mesh(geo, glow(c, c === 0xffffff ? 1 : 0.5, c !== 0xffffff));
      mesh.frustumCulled = false;
      this.ctx.scene.add(mesh);
      lines.push(mesh);
    }
    this.bolts.push({ lines, t: 0 });
  }

  // ------------------------------------------------------------------ ice spikes

  private eruptSpikes(at: THREE.Vector3): void {
    audio.play('spikes', { intensity: 1 });
    this.ctx.rig.shake(0.3);
    const mat = new THREE.MeshToonMaterial({ color: 0xbfefff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const r = i === 0 ? 0 : 0.25 + Math.random() * 0.45;
      const height = i === 0 ? 1.6 : 0.8 + Math.random() * 0.9;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1 + Math.random() * 0.06, height, 6), i === 0 ? mat : mat.clone());
      cone.position.set(at.x + Math.cos(a) * r, -height / 2, at.z + Math.sin(a) * r);
      cone.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      cone.castShadow = true;
      this.ctx.scene.add(cone);
      this.spikes.push({ obj: cone, height, t: 0 });
    }
    this.ctx.fx.iceShards(at.clone().setY(0.1), 30, 1.2);
    this.ctx.fx.dustPuff(at.clone().setY(0.05), new THREE.Vector3(0, 1, 0), 0xdff6ff, 0.8);
    // Everything standing in the patch gets skewered and thrown up.
    let first = true;
    for (const { part, pos } of liveParts(this.ctx)) {
      const flat = Math.hypot(pos.x - at.x, pos.z - at.z);
      if (flat > 0.8 || pos.y > 1.7) continue;
      const dir = new THREE.Vector3(0, 1, 0);
      const k = 1 - flat / 0.8;
      part.body.applyImpulse({ x: 0, y: part.def.mass * (3 + k * 4), z: 0 }, true);
      if (!part.attached) continue;
      const amount = this.def.damage * (0.4 + 0.6 * k);
      const r = this.ctx.hitBoss({ part: part.def.name, amount, type: 'pierce', point: pos, dir, impulse: 0, source: this.def.id, hpScale: 0.5 });
      this.ctx.hitBoss({ part: part.def.name, amount: amount * 0.6, type: 'cold', point: pos, dir, impulse: 0, source: this.def.id, hpScale: 0.4 });
      if (r && first) {
        first = false;
        hitFeedback(this.ctx, this.def, pos, dir, amount * 2, r);
      }
    }
    for (const p of this.ctx.props.props) {
      if (p.broken) continue;
      const t = p.body.translation();
      if (Math.hypot(t.x - at.x, t.z - at.z) < 0.8) this.ctx.props.hit(p, 25, new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(0, 1, 0), p.body.mass() * 4);
    }
  }

  private updateSpikes(dt: number): void {
    for (const s of [...this.spikes]) {
      s.t += dt;
      const up = Math.min(1, s.t / 0.1);
      const sink = Math.max(0, (s.t - 2.8) / 0.6);
      s.obj.position.y = -s.height / 2 + s.height * (1 - (1 - up) ** 3) - s.height * sink;
      if (sink >= 1) {
        this.ctx.scene.remove(s.obj);
        disposeObject(s.obj);
        this.spikes = this.spikes.filter((x) => x !== s);
      }
    }
  }

  // ------------------------------------------------------------------ meteors

  private meteorShower(center: THREE.Vector3): void {
    const count = this.def.opts?.count ?? 5;
    audio.play('meteor', { intensity: 1 });
    this.ctx.fx.word('METEOR SHOWER!', center.clone().setY(3.2), '#ff6b35', 0.5);
    for (let i = 0; i < count; i++) {
      const land = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * (i ? 2.6 : 0.2), 0, (Math.random() - 0.5) * (i ? 2 : 0.2)));
      land.x = THREE.MathUtils.clamp(land.x, -ROOM.halfWidth + 0.4, ROOM.halfWidth - 0.4);
      land.z = THREE.MathUtils.clamp(land.z, ROOM.back + 0.4, ROOM.front - 0.4);
      const start = land.clone().add(new THREE.Vector3(-2.2 + Math.random() * 0.6, ROOM.height - 0.3, -1.2));
      start.x = THREE.MathUtils.clamp(start.x, -ROOM.halfWidth + 0.3, ROOM.halfWidth - 0.3);
      start.z = THREE.MathUtils.clamp(start.z, ROOM.back + 0.3, ROOM.front - 0.3);
      const time = 0.55;
      const vel = land.clone().sub(start).multiplyScalar(1 / time);
      const obj = models.meteor();
      obj.position.copy(start);
      obj.visible = false;
      this.ctx.scene.add(obj);
      const delay = i * 0.28;
      this.meteors.push({ obj, pos: start, vel, delay, marker: new FloorMarker(this.ctx.scene, land, 0xff6b35, 0.55, delay + time) });
    }
  }

  private updateMeteors(dt: number): void {
    for (const m of [...this.meteors]) {
      m.marker.update(dt);
      m.delay -= dt;
      if (m.delay > 0) continue;
      if (!m.obj.visible) {
        m.obj.visible = true;
        audio.play('whoosh', { intensity: 0.9, pitch: 0.5 });
      }
      const prev = m.pos.clone();
      m.pos.addScaledVector(m.vel, dt);
      m.obj.position.copy(m.pos);
      m.obj.rotation.x += dt * 6;
      m.obj.rotation.z += dt * 4;
      for (let i = 0; i < 3; i++) this.ctx.fx.flame(m.pos.clone(), m.vel.clone().multiplyScalar(-0.25).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)));
      this.ctx.fx.smokePuff(m.pos.clone(), 1, 0x444444, 0.12);
      const seg = m.pos.clone().sub(prev);
      const len = seg.length();
      const hit = len > 1e-4 ? this.ctx.raycastBoss(new THREE.Ray(prev, seg.multiplyScalar(1 / len)), len + 0.2) : null;
      if (hit || m.pos.y <= 0.15) {
        const at = hit ? hit.point : m.pos.clone().setY(0.15);
        m.marker.dispose();
        this.ctx.scene.remove(m.obj);
        disposeObject(m.obj);
        this.meteors = this.meteors.filter((x) => x !== m);
        explode(this.ctx, at, this.def.opts?.radius ?? 1.5, this.def.damage, this.def.id);
        audio.play('meteor', { intensity: 0.7, pitch: 0.7 });
        const boss = this.ctx.boss();
        if (boss) boss.status.onFire = Math.min(4, boss.status.onFire + (hit ? 2 : 0.5));
      }
    }
  }

  // ------------------------------------------------------------------ guillotine

  private dropGuillotine(at: THREE.Vector3): void {
    const obj = models.guillotine();
    const blade = obj.getObjectByName('blade')!;
    obj.position.copy(at);
    // Face the camera so the drop reads clearly.
    obj.rotation.y = Math.atan2(this.ctx.rig.camera.position.x - at.x, this.ctx.rig.camera.position.z - at.z);
    obj.scale.set(1, 0.01, 1);
    this.ctx.scene.add(obj);
    this.blades.push({ obj, blade, t: 0, hit: false, at });
    audio.play('thunk', { intensity: 0.8, pitch: 0.6 });
    this.ctx.fx.dustPuff(at.clone().setY(0.05), new THREE.Vector3(0, 1, 0), 0xcccccc, 0.6);
  }

  private updateBlades(dt: number): void {
    for (const b of [...this.blades]) {
      b.t += dt;
      b.obj.scale.y = Math.min(1, b.t / 0.15);
      const dropT = (b.t - GUILLOTINE_DELAY) / GUILLOTINE_DROP;
      if (dropT < 0) {
        b.blade.position.y = 2.2 + Math.sin(b.t * 30) * 0.01;
      } else {
        if (dropT < 0.1 && !b.hit && b.blade.position.y >= 2.19) audio.play('guillotine', { intensity: 1 });
        const k = Math.min(1, dropT);
        b.blade.position.y = 2.2 - k * k * 2.05;
        if (k >= 1 && !b.hit) {
          b.hit = true;
          this.chop(b);
        }
      }
      if (b.t > 3.2) {
        b.obj.scale.setScalar(Math.max(0.001, 1 - (b.t - 3.2) * 3));
        if (b.t > 3.55) {
          this.ctx.scene.remove(b.obj);
          disposeObject(b.obj);
          this.blades = this.blades.filter((x) => x !== b);
        }
      }
    }
  }

  private chop(b: Blade): void {
    this.ctx.rig.shake(0.5);
    this.ctx.fx.dustPuff(b.at.clone().setY(0.1), new THREE.Vector3(0, 1, 0), 0xcccccc, 0.8);
    audio.play('thud', { intensity: 1 });
    const boss = this.ctx.boss();
    const inFrame = (p: THREE.Vector3) => Math.hypot(p.x - b.at.x, p.z - b.at.z) < 0.5 && p.y < 2.2;
    if (boss) {
      const head = boss.ragdoll.get('head');
      const dir = new THREE.Vector3(0, -1, 0);
      if (head.attached && inFrame(boss.ragdoll.position('head'))) {
        const point = boss.ragdoll.jointWorldAnchor('head') ?? boss.ragdoll.position('head');
        const r = this.ctx.hitBoss({ part: 'head', amount: this.def.damage, type: 'sharp', point, dir, impulse: 5, source: this.def.id });
        audio.play('slice', { intensity: 1 });
        if (r) hitFeedback(this.ctx, this.def, point, dir, this.def.damage, r);
        return;
      }
      // Missed the neck: the highest thing in the frame takes it instead.
      let best: { name: PartName; pos: THREE.Vector3 } | null = null;
      for (const { part, pos } of liveParts(this.ctx)) {
        if (!part.attached || !inFrame(pos)) continue;
        if (!best || pos.y > best.pos.y) best = { name: part.def.name, pos };
      }
      if (best) {
        const amount = this.def.damage * 0.6;
        const r = this.ctx.hitBoss({ part: best.name, amount, type: 'sharp', point: best.pos, dir, impulse: 5, source: this.def.id });
        audio.play('slice', { intensity: 1 });
        if (r) hitFeedback(this.ctx, this.def, best.pos, dir, amount, r);
        return;
      }
    }
    for (const p of this.ctx.props.props) {
      if (p.broken) continue;
      const t = p.body.translation();
      const pos = new THREE.Vector3(t.x, t.y, t.z);
      if (inFrame(pos)) this.ctx.props.damage(p, 200, pos, new THREE.Vector3(0, -1, 0));
    }
    this.ctx.fx.impactSparks(b.at.clone().setY(0.15), new THREE.Vector3(0, 1, 0), 12);
  }

  dispose(): void {
    for (const p of this.pending) p.marker?.dispose();
    for (const m of this.meteors) {
      m.marker.dispose();
      this.ctx.scene.remove(m.obj);
      disposeObject(m.obj);
    }
    for (const o of [...this.spikes.map((s) => s.obj), ...this.blades.map((b) => b.obj), ...this.bolts.flatMap((b) => b.lines)]) {
      this.ctx.scene.remove(o);
      disposeObject(o);
    }
    this.pending = [];
    this.meteors = [];
    this.spikes = [];
    this.blades = [];
    this.bolts = [];
  }
}

/** Highest attached boss part standing in a vertical column (what a lightning bolt hits first). */
function nearestColumn(ctx: WeaponCtx, at: THREE.Vector3, radius: number) {
  let best: ReturnType<typeof liveParts>[number] | null = null;
  for (const e of liveParts(ctx)) {
    if (!e.part.attached || Math.hypot(e.pos.x - at.x, e.pos.z - at.z) > radius) continue;
    if (!best || e.pos.y > best.pos.y) best = e;
  }
  return best;
}
