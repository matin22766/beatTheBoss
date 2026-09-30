import * as THREE from 'three';
import { ParticlePool } from './Particles';

export type GoreMode = 'red' | 'green' | 'off';

const BLOOD: Record<Exclude<GoreMode, 'off'>, number[]> = {
  red: [0xc1121f, 0xa4161a, 0xd62828],
  green: [0x6fd13a, 0x5cb82f, 0x8be04e],
};

interface Word {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vel: THREE.Vector3;
}

interface Spurt {
  obj: THREE.Object3D;
  local: THREE.Vector3;
  dir: THREE.Vector3;
  time: number;
  rate: number;
  acc: number;
}

interface Tracer {
  line: THREE.Line;
  age: number;
  life: number;
}

interface Blast {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  radius: number;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  scale: number;
}

const wordCache = new Map<string, THREE.Texture>();

function wordTexture(text: string, fill: string): THREE.Texture {
  const key = text + fill;
  const cached = wordCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  // Starburst behind the word.
  ctx.translate(256, 128);
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 90 : 125;
    const a = (i / 28) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r * 1.8, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff3b0';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();
  ctx.rotate(-0.12);
  ctx.font = '900 104px Impact, "Arial Black", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#1a1a1a';
  ctx.strokeText(text, 0, 6);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  wordCache.set(key, tex);
  return tex;
}

function starTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.translate(64, 64);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 24 : 58;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd92e';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3a2a00';
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** All transient visual effects: particles, blood, splats, comic words, shock rings, dizzy stars. */
export class Effects {
  readonly group = new THREE.Group();
  gore: GoreMode = 'red';

  readonly sparks: ParticlePool;
  readonly dust: ParticlePool;
  readonly blood: ParticlePool;
  readonly debris: ParticlePool;
  readonly smoke: ParticlePool;
  readonly fire: ParticlePool;
  readonly ice: ParticlePool;

  private splats: THREE.InstancedMesh;
  private splatNext = 0;
  private readonly splatCount = 350;
  private words: Word[] = [];
  private spurts: Spurt[] = [];
  private rings: Ring[] = [];
  private starTex = starTexture();
  private dizzy: THREE.Sprite[] = [];
  private dizzyTarget: THREE.Object3D | null = null;
  private dizzyAmount = 0;
  private time = 0;
  private tracers: Tracer[] = [];
  private blasts: Blast[] = [];
  /** A single always-present light for muzzle/explosion flashes (adding lights recompiles shaders). */
  private flashLight = new THREE.PointLight(0xffc870, 0, 8, 1.5);
  private flashT = 0;
  private flashPeak = 0;

  constructor() {
    const basic = (color = 0xffffff) => new THREE.MeshBasicMaterial({ color });
    this.sparks = new ParticlePool({ count: 300, material: basic(), geometry: new THREE.IcosahedronGeometry(1, 0) });
    this.dust = new ParticlePool({
      count: 200,
      material: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }),
      bounce: 0.1,
      curve: 'puff',
    });
    this.blood = new ParticlePool({
      count: 900,
      material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0 }),
      onCollide: (p, n, c, s) => this.splat(p, n, c, s * 3.2),
    });
    this.debris = new ParticlePool({
      count: 300,
      material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
      geometry: new THREE.TetrahedronGeometry(1, 0),
      bounce: 0.35,
    });
    this.smoke = new ParticlePool({
      count: 250,
      material: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
      bounce: 0,
      curve: 'puff',
    });
    this.fire = new ParticlePool({
      count: 400,
      material: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
      bounce: 0,
    });
    this.ice = new ParticlePool({
      count: 250,
      material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0, emissive: 0x3d7fa6, transparent: true, opacity: 0.9 }),
      geometry: new THREE.OctahedronGeometry(1, 0),
      bounce: 0.3,
    });
    for (const p of [this.sparks, this.dust, this.blood, this.debris, this.smoke, this.fire, this.ice]) {
      this.group.add(p.mesh);
      // No ink outlines on particles: they turn soft puffs into dark blobs.
      (p.mesh.material as THREE.Material).userData.outlineParameters = { visible: false };
    }

    const splatGeo = new THREE.CircleGeometry(1, 14);
    // Wobbly cartoon splat edge.
    const pos = splatGeo.attributes.position;
    for (let i = 1; i < pos.count; i++) {
      const k = 0.75 + Math.random() * 0.45;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, 0);
    }
    this.splats = new THREE.InstancedMesh(
      splatGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      this.splatCount,
    );
    this.splats.frustumCulled = false;
    (this.splats.material as THREE.Material).userData.outlineParameters = { visible: false };
    this.splats.receiveShadow = true;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.splatCount; i++) {
      this.splats.setMatrixAt(i, zero);
      this.splats.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.group.add(this.splats);

    this.group.add(this.flashLight);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starTex, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.12);
      s.visible = false;
      this.dizzy.push(s);
      this.group.add(s);
    }
  }

  setGravityScale(k: number): void {
    for (const p of [this.sparks, this.dust, this.blood, this.debris, this.smoke, this.fire, this.ice]) p.gravityScale = k;
  }

  bloodColor(): number {
    if (this.gore === 'off') return 0xffffff;
    const list = BLOOD[this.gore];
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Cartoon blood burst at a wound. */
  bleed(point: THREE.Vector3, dir: THREE.Vector3, amount: number): void {
    if (this.gore === 'off') {
      this.stars(point, Math.min(12, 3 + amount * 0.3));
      return;
    }
    const n = Math.min(45, Math.round(3 + amount * 0.8));
    for (let i = 0; i < n; i++) {
      const v = dir
        .clone()
        .multiplyScalar(-0.3)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5))
        .normalize()
        .multiplyScalar(1.5 + Math.random() * (2 + amount * 0.08));
      this.blood.spawn({
        pos: point.clone(),
        vel: v,
        life: 2.5,
        size: 0.012 + Math.random() * 0.02,
        color: this.bloodColor(),
        gravity: 9.81,
        drag: 0.3,
        stretch: 0.04,
      });
    }
  }

  /** Continuous fountain from a severed stump, attached to a moving object. */
  addSpurt(obj: THREE.Object3D, local: THREE.Vector3, dir: THREE.Vector3, seconds = 3.5, rate = 45): void {
    if (this.gore === 'off') return;
    this.spurts.push({ obj, local: local.clone(), dir: dir.clone().normalize(), time: seconds, rate, acc: 0 });
  }

  clearSpurts(): void {
    this.spurts = [];
  }

  splat(p: THREE.Vector3, n: THREE.Vector3, color: THREE.Color, size: number): void {
    const i = this.splatNext;
    this.splatNext = (this.splatNext + 1) % this.splatCount;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2));
    const s = Math.min(0.2, Math.max(0.03, size));
    const m = new THREE.Matrix4().compose(
      p.clone().addScaledVector(n, 0.002 + Math.random() * 0.002),
      q,
      new THREE.Vector3(s * (0.8 + Math.random() * 0.6), s * (0.8 + Math.random() * 0.4), 1),
    );
    this.splats.setMatrixAt(i, m);
    this.splats.setColorAt(i, color);
    this.splats.instanceMatrix.needsUpdate = true;
    if (this.splats.instanceColor) this.splats.instanceColor.needsUpdate = true;
  }

  clearSplats(): void {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.splatCount; i++) this.splats.setMatrixAt(i, zero);
    this.splats.instanceMatrix.needsUpdate = true;
  }

  impactSparks(point: THREE.Vector3, dir: THREE.Vector3, count = 10, color = 0xffe066): void {
    this.sparks.burst(count, point, dir.clone().negate(), 0.8, [2, 6], { life: 0.35, size: 0.012, sizeEnd: 0.002, color, gravity: 6, drag: 2, stretch: 0.03 });
  }

  stars(point: THREE.Vector3, count = 6): void {
    this.sparks.burst(count, point, new THREE.Vector3(0, 1, 0), 1, [1.5, 3.5], { life: 0.6, size: 0.025, sizeEnd: 0.005, color: 0xffd92e, gravity: 3, drag: 1.5 });
  }

  dustPuff(point: THREE.Vector3, normal: THREE.Vector3, color: number, amount = 1): void {
    const n = Math.round(6 + amount * 10);
    this.dust.burst(n, point, normal, 1.1, [0.4, 1.6 * amount + 0.4], { life: 0.7, size: 0.05, sizeEnd: 0.16, color, gravity: -0.3, drag: 3 });
  }

  debrisBurst(point: THREE.Vector3, dir: THREE.Vector3, color: number, count = 12, size = 0.03): void {
    this.debris.burst(count, point, dir, 0.9, [1.5, 5], { life: 2.5, size, color, gravity: 9.81, drag: 0.4 });
  }

  smokePuff(point: THREE.Vector3, count = 8, color = 0x555555, size = 0.12): void {
    this.smoke.burst(count, point, new THREE.Vector3(0, 1, 0), 0.6, [0.3, 1.2], { life: 1.6, size, sizeEnd: size * 3, color, gravity: -0.8, drag: 1.5 });
  }

  flame(point: THREE.Vector3, vel: THREE.Vector3): void {
    const colors = [0xffb703, 0xfb8500, 0xff4d00, 0xffe066];
    this.fire.spawn({
      pos: point.clone(),
      vel,
      life: 0.45 + Math.random() * 0.2,
      size: 0.05,
      sizeEnd: 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity: -3,
      drag: 1.6,
    });
  }

  iceShards(point: THREE.Vector3, count = 30, spread = 1): void {
    this.ice.burst(count, point, new THREE.Vector3(0, 1, 0), spread, [1.5, 5], { life: 2.5, size: 0.04, color: 0xbde0fe, gravity: 9.81, drag: 0.3 }, 0.8);
  }

  /** Expanding flat shock ring (explosions, heavy landings). */
  shockRing(point: THREE.Vector3, normal: THREE.Vector3, scale = 1.5, color = 0xffffff): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.material.userData.outlineParameters = { visible: false };
    mesh.position.copy(point).addScaledVector(normal, 0.02);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mesh.scale.setScalar(0.01);
    this.group.add(mesh);
    this.rings.push({ mesh, age: 0, life: 0.4, scale });
  }

  /** Comic-book word ("POW!") popping at a point. */
  word(text: string, point: THREE.Vector3, color = '#ff3b30', size = 0.7): void {
    if (this.words.length > 5) {
      const old = this.words.shift()!;
      this.group.remove(old.sprite);
      old.sprite.material.dispose();
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture(text, color), transparent: true, depthTest: false }));
    sprite.position.copy(point).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25, 0.3));
    sprite.userData.size = size;
    sprite.renderOrder = 10;
    sprite.material.rotation = (Math.random() - 0.5) * 0.4;
    this.group.add(sprite);
    this.words.push({ sprite, age: 0, life: 0.75, vel: new THREE.Vector3(0, 0.6, 0) });
  }

  /** Brief burst of light (muzzle flash, explosion). */
  flash(point: THREE.Vector3, color: number, intensity: number, seconds = 0.08): void {
    this.flashLight.position.copy(point);
    this.flashLight.color.setHex(color);
    this.flashPeak = intensity;
    this.flashT = seconds;
    this.flashLight.userData.life = seconds;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xfff3b0, life = 0.07): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.group.add(line);
    this.tracers.push({ line, age: 0, life });
  }

  /** Jagged electric arc between two points (lives one frame unless refreshed). */
  arc(from: THREE.Vector3, to: THREE.Vector3, color = 0x9be7ff): void {
    const pts: THREE.Vector3[] = [];
    const n = 10;
    const len = from.distanceTo(to);
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(len * 0.12));
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
    this.group.add(line);
    this.tracers.push({ line, age: 0, life: 0.05 });
  }

  /** Cartoon fireball: expanding glowing sphere + fire, smoke and debris. */
  explosion(point: THREE.Vector3, radius: number): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    mesh.material.userData.outlineParameters = { visible: false };
    mesh.position.copy(point);
    mesh.scale.setScalar(0.05);
    this.group.add(mesh);
    this.blasts.push({ mesh, age: 0, life: 0.45, radius });
    for (let i = 0; i < 60; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 - 0.1, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * radius * 3);
      this.flame(point.clone(), v);
    }
    this.smokePuff(point, 16, 0x3a3a3a, 0.25);
    this.debrisBurst(point, new THREE.Vector3(0, 1, 0), 0x333333, 16, 0.04);
    this.sparks.burst(40, point, new THREE.Vector3(0, 1, 0), 1, [4, 11], { life: 0.6, size: 0.015, sizeEnd: 0.003, color: 0xffd166, gravity: 6, drag: 1, stretch: 0.03 });
    this.flash(point, 0xffb347, 60, 0.25);
    if (point.y < 0.6) this.shockRing(new THREE.Vector3(point.x, 0.02, point.z), new THREE.Vector3(0, 1, 0), radius * 1.4, 0xffe8b0);
  }

  setDizzy(target: THREE.Object3D | null, amount: number): void {
    this.dizzyTarget = target;
    this.dizzyAmount = amount;
  }

  update(dt: number): void {
    this.time += dt;
    for (const p of [this.sparks, this.dust, this.blood, this.debris, this.smoke, this.fire, this.ice]) p.update(dt);

    const tmp = new THREE.Vector3();
    for (const s of this.spurts) {
      s.time -= dt;
      s.acc += dt * s.rate * Math.min(1, s.time / 1.5 + 0.2) * (0.6 + 0.4 * Math.sin(this.time * 14));
      if (!s.obj.parent) s.time = 0;
      while (s.acc >= 1) {
        s.acc -= 1;
        const wp = s.obj.localToWorld(tmp.copy(s.local));
        const wd = s.dir.clone().transformDirection(s.obj.matrixWorld);
        const v = wd
          .multiplyScalar(2 + Math.random() * 2.5)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.5, (Math.random() - 0.5) * 0.8));
        this.blood.spawn({ pos: wp.clone(), vel: v, life: 2, size: 0.014 + Math.random() * 0.012, color: this.bloodColor(), gravity: 9.81, drag: 0.3, stretch: 0.05 });
      }
    }
    this.spurts = this.spurts.filter((s) => s.time > 0);

    for (const w of this.words) {
      w.age += dt;
      const t = w.age / w.life;
      const pop = t < 0.15 ? t / 0.15 * 1.25 : t < 0.25 ? 1.25 - (t - 0.15) * 2.5 : 1;
      const size = w.sprite.userData.size as number;
      w.sprite.scale.set(size * 2 * pop, size * pop, 1);
      w.sprite.position.addScaledVector(w.vel, dt);
      w.sprite.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    }
    this.words = this.words.filter((w) => {
      if (w.age < w.life) return true;
      this.group.remove(w.sprite);
      w.sprite.material.dispose();
      return false;
    });

    for (const r of this.rings) {
      r.age += dt;
      const t = r.age / r.life;
      r.mesh.scale.setScalar(0.01 + r.scale * Math.sqrt(t));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
    }
    this.rings = this.rings.filter((r) => {
      if (r.age < r.life) return true;
      this.group.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
      return false;
    });

    if (this.flashT > 0) {
      this.flashT -= dt;
      const life = (this.flashLight.userData.life as number) || 0.08;
      this.flashLight.intensity = Math.max(0, this.flashPeak * (this.flashT / life));
    } else this.flashLight.intensity = 0;

    for (const t of this.tracers) {
      t.age += dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - t.age / t.life);
    }
    this.tracers = this.tracers.filter((t) => {
      if (t.age < t.life) return true;
      this.group.remove(t.line);
      t.line.geometry.dispose();
      (t.line.material as THREE.Material).dispose();
      return false;
    });

    for (const b of this.blasts) {
      b.age += dt;
      const k = b.age / b.life;
      b.mesh.scale.setScalar(b.radius * 0.7 * Math.sqrt(k) + 0.05);
      const m = b.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = 0.95 * (1 - k);
      m.color.setHex(k < 0.3 ? 0xfff1b5 : k < 0.6 ? 0xffb347 : 0xff6b35);
    }
    this.blasts = this.blasts.filter((b) => {
      if (b.age < b.life) return true;
      this.group.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
      return false;
    });

    // Cartoon stars circling a dazed head.
    const show = this.dizzyTarget && this.dizzyAmount > 0.05;
    this.dizzy.forEach((s, i) => {
      s.visible = !!show;
      if (!show) return;
      const c = this.dizzyTarget!.getWorldPosition(tmp);
      const a = this.time * 4 + (i / this.dizzy.length) * Math.PI * 2;
      s.position.set(c.x + Math.cos(a) * 0.32, c.y + 0.3 + Math.sin(a * 2) * 0.03, c.z + Math.sin(a) * 0.32);
      s.scale.setScalar(0.12 * Math.min(1, this.dizzyAmount * 2));
    });
  }

  clearAll(): void {
    for (const p of [this.sparks, this.dust, this.blood, this.debris, this.smoke, this.fire, this.ice]) p.clear();
    this.clearSplats();
    this.clearSpurts();
  }
}
