import * as THREE from 'three';
import { ROOM } from '../physics/ArenaColliders';

export interface ParticleSpawn {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  size: number;
  sizeEnd?: number;
  color: THREE.ColorRepresentation;
  gravity?: number;
  drag?: number;
  /** Stretch along velocity (droplets / sparks). */
  stretch?: number;
}

export interface ParticleOptions {
  count: number;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material;
  /** Called when a particle hits the room box; the particle dies. */
  onCollide?: (pos: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, size: number) => void;
  /** Bounce instead of dying on collision (debris). */
  bounce?: number;
  /** 'puff' = grow toward sizeEnd then shrink to nothing (smoke/dust). */
  curve?: 'linear' | 'puff';
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _c = new THREE.Color();

/** Pooled, instanced, CPU-simulated particles. One draw call per pool. */
export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size0: Float32Array;
  private size1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private stretch: Float32Array;
  private colors: THREE.Color[];
  private next = 0;
  private active = 0;

  constructor(private readonly opts: ParticleOptions) {
    const n = (this.n = opts.count);
    const geo = opts.geometry ?? new THREE.IcosahedronGeometry(1, 1);
    const mat = opts.material ?? new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.stretch = new Float32Array(n);
    this.colors = Array.from({ length: n }, () => new THREE.Color());
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.set(0xffffff));
    }
  }

  spawn(s: ParticleSpawn): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    if (this.life[i] <= 0) this.active++;
    this.pos.set([s.pos.x, s.pos.y, s.pos.z], i * 3);
    this.vel.set([s.vel.x, s.vel.y, s.vel.z], i * 3);
    this.life[i] = this.maxLife[i] = s.life;
    this.size0[i] = s.size;
    this.size1[i] = s.sizeEnd ?? s.size;
    this.grav[i] = s.gravity ?? 9.81;
    this.drag[i] = s.drag ?? 0.5;
    this.stretch[i] = s.stretch ?? 0;
    this.colors[i].set(s.color);
    this.mesh.setColorAt(i, this.colors[i]);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Spawn `count` particles in a cone around `dir`. */
  burst(
    count: number,
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    spread: number,
    speed: [number, number],
    base: Omit<ParticleSpawn, 'pos' | 'vel'>,
    jitterSize = 0.4,
  ): void {
    for (let k = 0; k < count; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .multiplyScalar(2 * spread)
        .add(dir)
        .normalize()
        .multiplyScalar(speed[0] + Math.random() * (speed[1] - speed[0]));
      const size = base.size * (1 - jitterSize / 2 + Math.random() * jitterSize);
      this.spawn({ ...base, pos: pos.clone(), vel: v, size, sizeEnd: base.sizeEnd !== undefined ? base.sizeEnd * (size / base.size) : undefined });
    }
  }

  update(dt: number): void {
    if (this.active <= 0) return;
    const { pos, vel } = this;
    const hw = ROOM.halfWidth - 0.01;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.active--;
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      vel[o] *= d;
      vel[o + 1] = vel[o + 1] * d - this.grav[i] * dt;
      vel[o + 2] *= d;
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;

      // Room collisions.
      let hit = false;
      if (pos[o + 1] < 0.003) {
        pos[o + 1] = 0.003;
        _n.set(0, 1, 0);
        hit = true;
      } else if (pos[o] > hw) {
        pos[o] = hw;
        _n.set(-1, 0, 0);
        hit = true;
      } else if (pos[o] < -hw) {
        pos[o] = -hw;
        _n.set(1, 0, 0);
        hit = true;
      } else if (pos[o + 2] < ROOM.back + 0.01) {
        pos[o + 2] = ROOM.back + 0.01;
        _n.set(0, 0, 1);
        hit = true;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      const size =
        this.opts.curve === 'puff'
          ? (this.size0[i] + (this.size1[i] - this.size0[i]) * Math.min(1, t * 2.5)) * Math.min(1, (1 - t) * 2.2)
          : this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      if (hit) {
        if (this.opts.bounce !== undefined) {
          const vn = vel[o] * _n.x + vel[o + 1] * _n.y + vel[o + 2] * _n.z;
          if (vn < 0) {
            vel[o] -= (1 + this.opts.bounce) * vn * _n.x;
            vel[o + 1] -= (1 + this.opts.bounce) * vn * _n.y;
            vel[o + 2] -= (1 + this.opts.bounce) * vn * _n.z;
            vel[o] *= 0.7;
            vel[o + 2] *= 0.7;
          }
        } else {
          this.opts.onCollide?.(_p.set(pos[o], pos[o + 1], pos[o + 2]), _n, this.colors[i], size);
          this.life[i] = 0;
          this.active--;
          _m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, _m);
          continue;
        }
      }

      _p.set(pos[o], pos[o + 1], pos[o + 2]);
      const st = this.stretch[i];
      if (st > 0) {
        _dir.set(vel[o], vel[o + 1], vel[o + 2]);
        const sp = _dir.length();
        if (sp > 1e-4) _q.setFromUnitVectors(_up, _dir.multiplyScalar(1 / sp));
        _s.set(size, size * (1 + sp * st), size);
      } else {
        _q.identity();
        _s.setScalar(size);
      }
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.n; i++) {
      this.life[i] = 0;
      this.mesh.setMatrixAt(i, _m);
    }
    this.active = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
