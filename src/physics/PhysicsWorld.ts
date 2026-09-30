import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Collision group bits. */
export const G = {
  ARENA: 1 << 0,
  BOSS: 1 << 1,
  WEAPON: 1 << 2,
  PROJECTILE: 1 << 3,
  PROP: 1 << 4,
} as const;

/** Rapier encodes groups as (memberships << 16) | filter. */
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

let initPromise: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  initPromise ??= RAPIER.init();
  return initPromise;
}

export const PHYSICS_DT = 1 / 60;

export interface ContactForce {
  h1: number;
  h2: number;
  force: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly events: RAPIER.EventQueue;
  /** Contact-force events collected during the most recent step. */
  readonly contacts: ContactForce[] = [];
  private stepListeners: Array<(dt: number) => void> = [];

  constructor(gravity = -9.81) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = PHYSICS_DT;
    this.world.numSolverIterations = 8;
    this.events = new RAPIER.EventQueue(true);
  }

  setGravity(y: number): void {
    this.world.gravity = { x: 0, y, z: 0 };
  }

  /** Run a callback before every physics step (controllers apply forces here). */
  onBeforeStep(fn: (dt: number) => void): () => void {
    this.stepListeners.push(fn);
    return () => {
      this.stepListeners = this.stepListeners.filter((f) => f !== fn);
    };
  }

  step(dt: number): void {
    this.world.timestep = dt;
    for (const fn of this.stepListeners) fn(dt);
    this.world.step(this.events);
    this.contacts.length = 0;
    this.events.drainContactForceEvents((e) => {
      const d = e.maxForceDirection();
      this.contacts.push({
        h1: e.collider1(),
        h2: e.collider2(),
        force: e.totalForceMagnitude(),
        dirX: d.x,
        dirY: d.y,
        dirZ: d.z,
      });
    });
    this.events.drainCollisionEvents(() => {});
  }

  dispose(): void {
    this.events.free();
    this.world.free();
  }
}
