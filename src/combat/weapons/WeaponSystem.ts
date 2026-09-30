import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from './types';
import { Melee } from './archetypes/Melee';

function create(def: WeaponDef, ctx: WeaponCtx): WeaponBehavior {
  switch (def.archetype) {
    case 'melee':
      return new Melee(def, ctx);
    default:
      throw new Error(`Archetype ${def.archetype} not implemented`);
  }
}

/** Owns one behaviour instance per weapon (so in-flight projectiles survive switching). */
export class WeaponSystem {
  private behaviors = new Map<string, WeaponBehavior>();
  current: WeaponDef;
  private holding = false;

  constructor(
    private readonly ctx: WeaponCtx,
    initial: WeaponDef,
  ) {
    this.current = initial;
  }

  private behavior(def: WeaponDef): WeaponBehavior {
    let b = this.behaviors.get(def.id);
    if (!b) {
      b = create(def, this.ctx);
      this.behaviors.set(def.id, b);
    }
    return b;
  }

  select(def: WeaponDef): void {
    if (this.holding) this.up();
    this.current = def;
  }

  down(aim: Aim): void {
    this.holding = true;
    this.behavior(this.current).down(aim);
  }

  hold(aim: Aim, dt: number): void {
    if (this.holding) this.behavior(this.current).hold?.(aim, dt);
  }

  up(): void {
    if (!this.holding) return;
    this.holding = false;
    this.behavior(this.current).up?.();
  }

  get isHolding(): boolean {
    return this.holding;
  }

  update(dt: number): void {
    for (const b of this.behaviors.values()) b.update(dt);
  }

  afterStep(): void {
    for (const b of this.behaviors.values()) b.afterStep?.();
  }

  dispose(): void {
    for (const b of this.behaviors.values()) b.dispose();
    this.behaviors.clear();
  }
}
