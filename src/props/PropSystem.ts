import * as THREE from 'three';
import { RAPIER, G, groups, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { BodySync } from '../core/BodySync';
import type { Effects } from '../fx/Effects';
import type { HitInfo, HitResult } from '../core/types';
import type { PartName } from '../character/RagdollDef';
import { audio, type SoundName } from '../audio/AudioEngine';
import { disposeObject } from '../combat/weapons/archetypes/Melee';

export type PropMaterial = 'wood' | 'metal' | 'glass' | 'plastic' | 'electronic' | 'liquid' | 'plant' | 'rubber';

export type PropShape =
  | { kind: 'box'; half: [number, number, number] }
  | { kind: 'cyl'; radius: number; halfHeight: number }
  | { kind: 'ball'; radius: number };

export type BreakEffect = 'chunks' | 'shatter' | 'sparks' | 'splash' | 'goo' | 'depressurize';

export interface PropSpec {
  id: string;
  /** Visual, centred on the body origin (collider centre). */
  build: () => THREE.Object3D;
  pos: [number, number, number];
  rotY?: number;
  shape: PropShape;
  mass: number;
  hp: number;
  material: PropMaterial;
  /** Static but breakable (window panes, wall signs). */
  fixed?: boolean;
  /** Can be sat on; seat height above the body origin. */
  seat?: number;
  breakInto?: BreakEffect[];
  /** Colour for chunks/splashes (defaults to the first mesh colour). */
  color?: number;
  restitution?: number;
}

export interface Prop {
  spec: PropSpec;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  obj: THREE.Object3D;
  hp: number;
  broken: boolean;
  lastHit: number;
  lastSound: number;
  preVel: THREE.Vector3;
}

export interface PropHit {
  prop: Prop;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

interface Chunk {
  body: RAPIER.RigidBody;
  obj: THREE.Mesh;
  life: number;
}

export interface PropHost {
  hitBoss(info: HitInfo): HitResult | null;
  partForCollider(handle: number): PartName | null;
  shake(amount: number): void;
  /** Special break effects the game handles (space window). */
  onSpecial(effect: BreakEffect, prop: Prop): void;
}

const IMPACT_SOUND: Record<PropMaterial, SoundName> = {
  wood: 'thunk',
  metal: 'metalHit',
  glass: 'glass',
  plastic: 'thunk',
  electronic: 'metalHit',
  liquid: 'splash',
  plant: 'thunk',
  rubber: 'boing',
};

const BREAK_SOUND: Record<PropMaterial, SoundName> = {
  wood: 'woodBreak',
  metal: 'crunch',
  glass: 'shatter',
  plastic: 'woodBreak',
  electronic: 'zap',
  liquid: 'splash',
  plant: 'woodBreak',
  rubber: 'pop',
};

const DEFAULT_BREAK: Record<PropMaterial, BreakEffect[]> = {
  wood: ['chunks'],
  metal: ['chunks', 'sparks'],
  glass: ['shatter'],
  plastic: ['chunks'],
  electronic: ['chunks', 'sparks'],
  liquid: ['splash', 'chunks'],
  plant: ['chunks'],
  rubber: [],
};

const MAX_CHUNKS = 48;

/**
 * Every movable or breakable arena object: rigid bodies you can grab, throw, smash the boss with and
 * break apart. Props take damage from impacts, weapons and explosions.
 */
export class PropSystem {
  readonly props: Prop[] = [];
  private byHandle = new Map<number, Prop>();
  private chunks: Chunk[] = [];
  private raycaster = new THREE.Raycaster();
  private time = 0;
  private readonly removeHook: () => void;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly scene: THREE.Scene,
    private readonly sync: BodySync,
    private readonly fx: Effects,
    private readonly host: PropHost,
  ) {
    this.removeHook = physics.onBeforeStep(() => {
      for (const p of this.props) {
        const v = p.body.linvel();
        p.preVel.set(v.x, v.y, v.z);
      }
    });
  }

  load(specs: PropSpec[]): void {
    this.clear();
    for (const spec of specs) this.spawn(spec);
  }

  spawn(spec: PropSpec): Prop {
    const world = this.physics.world;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spec.rotY ?? 0);
    const desc = (spec.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(spec.mass < 10))
      .setTranslation(...spec.pos)
      .setRotation(q)
      .setLinearDamping(0.05)
      .setAngularDamping(0.2);
    const body = world.createRigidBody(desc);
    const s = spec.shape;
    const cd =
      s.kind === 'box'
        ? RAPIER.ColliderDesc.cuboid(...s.half)
        : s.kind === 'cyl'
          ? RAPIER.ColliderDesc.cylinder(s.halfHeight, s.radius)
          : RAPIER.ColliderDesc.ball(s.radius);
    cd.setMass(spec.mass)
      .setFriction(spec.material === 'rubber' ? 0.9 : 0.6)
      .setRestitution(spec.restitution ?? (spec.material === 'rubber' ? 0.8 : 0.15))
      .setCollisionGroups(groups(G.PROP, G.ARENA | G.BOSS | G.PROJECTILE | G.PROP | G.WEAPON))
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(spec.mass * 1.5 * 60);
    const collider = world.createCollider(cd, body);
    const obj = spec.build();
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    obj.userData.prop = true;
    this.scene.add(obj);
    this.sync.add(body, obj);
    const prop: Prop = { spec, body, collider, obj, hp: spec.hp, broken: false, lastHit: -1, lastSound: -1, preVel: new THREE.Vector3() };
    obj.userData.propRef = prop;
    this.props.push(prop);
    this.byHandle.set(collider.handle, prop);
    return prop;
  }

  byCollider(handle: number): Prop | undefined {
    return this.byHandle.get(handle);
  }

  isProp(handle: number): boolean {
    return this.byHandle.has(handle);
  }

  /** Nearest prop under a ray. */
  raycast(ray: THREE.Ray, maxDist = 50): PropHit | null {
    this.raycaster.ray.copy(ray);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(
      this.props.filter((p) => !p.broken).map((p) => p.obj),
      true,
    );
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.propRef) o = o.parent;
      if (!o) continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : ray.direction.clone().negate();
      return { prop: o.userData.propRef as Prop, point: h.point.clone(), normal, distance: h.distance };
    }
    return null;
  }

  /** Weapon hit on a prop: impulse, damage, feedback. */
  hit(prop: Prop, amount: number, point: THREE.Vector3, dir: THREE.Vector3, impulse: number): void {
    if (prop.broken) return;
    if (impulse > 0 && !prop.spec.fixed) prop.body.applyImpulseAtPoint(dir.clone().multiplyScalar(impulse * 0.6), point, true);
    this.damage(prop, amount, point, dir);
  }

  damage(prop: Prop, amount: number, point: THREE.Vector3, dir: THREE.Vector3): void {
    if (prop.broken || amount <= 0) return;
    prop.hp -= amount;
    if (this.time - prop.lastSound > 0.08) {
      prop.lastSound = this.time;
      audio.play(IMPACT_SOUND[prop.spec.material], { intensity: Math.min(1, 0.3 + amount / 40) });
    }
    if (prop.spec.material === 'glass') this.fx.impactSparks(point, dir, 4, 0xd8f3ff);
    else if (prop.spec.material === 'electronic' && Math.random() < 0.5) this.fx.impactSparks(point, dir, 8, 0x9be7ff);
    else this.fx.dustPuff(point, dir.clone().negate(), this.colorOf(prop), 0.3);
    if (prop.hp <= 0) this.break(prop, point, dir);
  }

  /** Blast pushes and damages every nearby prop. */
  explode(center: THREE.Vector3, radius: number, damage: number): void {
    for (const p of [...this.props]) {
      if (p.broken) continue;
      const t = p.body.translation();
      const pos = new THREE.Vector3(t.x, t.y, t.z);
      const d = pos.distanceTo(center);
      if (d > radius * 1.3) continue;
      const f = Math.max(0, 1 - d / (radius * 1.3));
      const dir = pos.clone().sub(center).add(new THREE.Vector3(0, 0.4, 0)).normalize();
      if (!p.spec.fixed) p.body.applyImpulse(dir.clone().multiplyScalar(p.spec.mass * 9 * f), true);
      this.damage(p, damage * f * 0.8, pos, dir);
    }
    for (const c of this.chunks) {
      const t = c.body.translation();
      const dir = new THREE.Vector3(t.x - center.x, t.y - center.y + 0.3, t.z - center.z);
      const d = dir.length();
      if (d < radius * 1.5) c.body.applyImpulse(dir.normalize().multiplyScalar(c.body.mass() * 8 * (1 - d / (radius * 1.5))), true);
    }
  }

  /** Physics contacts: props smashing into the boss, the room, and each other. */
  afterStep(contacts: Array<{ h1: number; h2: number; dirX: number; dirY: number; dirZ: number }>): void {
    for (const c of contacts) {
      const a = this.byHandle.get(c.h1);
      const b = this.byHandle.get(c.h2);
      for (const [prop, other] of [
        [a, c.h2],
        [b, c.h1],
      ] as const) {
        if (!prop || prop.broken || prop.spec.fixed) continue;
        const dir = new THREE.Vector3(c.dirX, c.dirY, c.dirZ);
        const speed = Math.abs(prop.preVel.dot(dir));
        if (speed < 3 || this.time - prop.lastHit < 0.2) continue;
        prop.lastHit = this.time;
        const t = prop.body.translation();
        const point = new THREE.Vector3(t.x, t.y, t.z);
        const moveDir = prop.preVel.clone().normalize();
        const part = this.host.partForCollider(other);
        if (part) {
          // A thrown table is a weapon.
          const amount = Math.min(70, (speed - 2.5) * Math.sqrt(prop.spec.mass) * 2.2);
          this.host.hitBoss({ part, amount, type: prop.spec.material === 'glass' ? 'sharp' : 'blunt', point, dir: moveDir, impulse: 0, source: 'prop' });
          this.fx.stars(point, 5);
          this.host.shake(Math.min(0.6, amount / 80));
          if (amount > 20) this.fx.word(['WHAM!', 'SMASH!', 'KRAKK!'][Math.floor(Math.random() * 3)], point, '#ffcc33', 0.5);
        }
        // Props wear out when slammed around (fixed panes are hit from the other side's handler).
        const selfDamage = Math.max(0, (speed - 4) * Math.sqrt(prop.spec.mass) * 2.5);
        const hitProp = this.byHandle.get(other);
        if (hitProp && !hitProp.broken) this.damage(hitProp, selfDamage * 0.8, point, moveDir);
        this.damage(prop, selfDamage, point, moveDir.clone().negate());
        if (!part && selfDamage < 1 && this.time - prop.lastSound > 0.1) {
          prop.lastSound = this.time;
          audio.play(IMPACT_SOUND[prop.spec.material], { intensity: Math.min(1, speed / 10) });
        }
      }
    }
  }

  break(prop: Prop, point: THREE.Vector3, dir: THREE.Vector3): void {
    if (prop.broken) return;
    prop.broken = true;
    const t = prop.body.translation();
    const center = new THREE.Vector3(t.x, t.y, t.z);
    const vel = prop.body.linvel();
    const color = this.colorOf(prop);
    audio.play(BREAK_SOUND[prop.spec.material], { intensity: 1 });
    this.host.shake(0.25);
    for (const effect of prop.spec.breakInto ?? DEFAULT_BREAK[prop.spec.material]) {
      switch (effect) {
        case 'chunks':
          this.spawnChunks(prop, center, new THREE.Vector3(vel.x, vel.y, vel.z), color);
          break;
        case 'shatter':
          this.shatter(prop, center, dir);
          break;
        case 'sparks':
          this.fx.impactSparks(center, new THREE.Vector3(0, -1, 0), 26, 0x9be7ff);
          this.fx.smokePuff(center, 6, 0x555555, 0.1);
          audio.play('zap', { intensity: 0.6 });
          break;
        case 'splash':
          this.splash(center, 0x6ec6ff);
          break;
        case 'goo':
          this.splash(center, 0x39ff88, 90);
          break;
        case 'depressurize':
          this.shatter(prop, center, dir);
          break;
      }
      if (effect === 'depressurize' || effect === 'goo') this.host.onSpecial(effect, prop);
    }
    this.fx.word(prop.spec.material === 'glass' ? 'SHATTER!' : 'CRASH!', point, '#ffffff', 0.5);
    this.removeProp(prop);
  }

  private shatter(prop: Prop, center: THREE.Vector3, dir: THREE.Vector3): void {
    const size = this.halfExtent(prop);
    for (let i = 0; i < 60; i++) {
      const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * size.x * 2, (Math.random() - 0.5) * size.y * 2, (Math.random() - 0.5) * size.z * 2));
      const v = dir.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
      this.fx.ice.spawn({ pos: p, vel: v, life: 2.5, size: 0.02 + Math.random() * 0.035, color: 0xd8f3ff, gravity: 9.81, drag: 0.3 });
    }
  }

  private splash(center: THREE.Vector3, color: number, count = 60): void {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
      this.fx.blood.spawn({ pos: center.clone(), vel: v, life: 2, size: 0.018 + Math.random() * 0.02, color, gravity: 9.81, drag: 0.3, stretch: 0.04 });
    }
  }

  private spawnChunks(prop: Prop, center: THREE.Vector3, vel: THREE.Vector3, color: number): void {
    const h = this.halfExtent(prop);
    const world = this.physics.world;
    // Split along the longest axis into slabs, and the second axis in two.
    const axes = [h.x, h.y, h.z];
    const long = axes.indexOf(Math.max(...axes));
    const n = Math.min(4, Math.max(2, Math.round(axes[long] / 0.2)));
    const mat = new THREE.MeshToonMaterial({ color });
    for (let i = 0; i < n; i++) {
      for (const side of [-1, 1]) {
        const half = [h.x, h.y, h.z];
        half[long] /= n;
        const second = (long + 1) % 3;
        half[second] /= 2;
        const off = [0, 0, 0];
        off[long] = -axes[long] + axes[long] / n + (2 * axes[long] * i) / n;
        off[second] = (side * axes[second]) / 2;
        const pos = center.clone().add(new THREE.Vector3(off[0], off[1], off[2]).applyQuaternion(this.rotOf(prop)));
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(pos.x, pos.y, pos.z)
            .setRotation(this.rotOf(prop))
            .setLinvel(vel.x + (Math.random() - 0.5) * 3, vel.y + Math.random() * 3, vel.z + (Math.random() - 0.5) * 3)
            .setAngvel({ x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 }),
        );
        const hx = Math.max(0.02, half[0] * 0.9);
        const hy = Math.max(0.02, half[1] * 0.9);
        const hz = Math.max(0.02, half[2] * 0.9);
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(hx, hy, hz)
            .setMass(Math.max(0.2, prop.spec.mass / (n * 2)))
            .setCollisionGroups(groups(G.PROP, G.ARENA | G.BOSS | G.PROP)),
          body,
        );
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.sync.add(body, mesh);
        this.chunks.push({ body, obj: mesh, life: 9 + Math.random() * 3 });
      }
    }
    while (this.chunks.length > MAX_CHUNKS) this.removeChunk(this.chunks[0]);
  }

  private rotOf(prop: Prop): THREE.Quaternion {
    const r = prop.body.rotation();
    return new THREE.Quaternion(r.x, r.y, r.z, r.w);
  }

  private halfExtent(prop: Prop): THREE.Vector3 {
    const s = prop.spec.shape;
    if (s.kind === 'box') return new THREE.Vector3(...s.half);
    if (s.kind === 'cyl') return new THREE.Vector3(s.radius, s.halfHeight, s.radius);
    return new THREE.Vector3(s.radius, s.radius, s.radius);
  }

  colorOf(prop: Prop): number {
    if (prop.spec.color !== undefined) return prop.spec.color;
    let c = 0x999999;
    prop.obj.traverse((o) => {
      if (c === 0x999999 && o instanceof THREE.Mesh && 'color' in o.material) c = (o.material as THREE.MeshStandardMaterial).color.getHex();
    });
    return c;
  }

  /** Nearest intact sittable prop to a point (for the boss's brain). */
  nearestSeat(from: THREE.Vector3, maxDist = 6): Prop | null {
    let best: Prop | null = null;
    let bestD = maxDist;
    for (const p of this.props) {
      if (p.broken || p.spec.seat === undefined) continue;
      const t = p.body.translation();
      const d = Math.hypot(t.x - from.x, t.z - from.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  update(dt: number): void {
    this.time += dt;
    for (const c of [...this.chunks]) {
      c.life -= dt;
      if (c.life < 1) c.obj.scale.setScalar(Math.max(0.01, c.life));
      if (c.life <= 0) this.removeChunk(c);
    }
  }

  private removeChunk(c: Chunk): void {
    this.sync.removeBody(c.body);
    if (c.body.isValid()) this.physics.world.removeRigidBody(c.body);
    this.scene.remove(c.obj);
    c.obj.geometry.dispose();
    this.chunks = this.chunks.filter((x) => x !== c);
  }

  private removeProp(prop: Prop): void {
    this.byHandle.delete(prop.collider.handle);
    this.sync.removeBody(prop.body);
    if (prop.body.isValid()) this.physics.world.removeRigidBody(prop.body);
    this.scene.remove(prop.obj);
    disposeObject(prop.obj);
    const i = this.props.indexOf(prop);
    if (i >= 0) this.props.splice(i, 1);
  }

  clear(): void {
    for (const p of [...this.props]) this.removeProp(p);
    for (const c of [...this.chunks]) this.removeChunk(c);
  }

  dispose(): void {
    this.clear();
    this.removeHook();
  }
}
