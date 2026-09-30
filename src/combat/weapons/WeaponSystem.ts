import type { Aim, WeaponBehavior, WeaponCtx, WeaponDef } from './types';
import { Melee } from './archetypes/Melee';
import { Hitscan } from './archetypes/Hitscan';
import { Projectile } from './archetypes/Projectile';
import { Thrown } from './archetypes/Thrown';
import { Spray } from './archetypes/Spray';
import { Saw } from './archetypes/Saw';

function create(def: WeaponDef, ctx: WeaponCtx): WeaponBehavior {
  switch (def.archetype) {
    case 'melee':
      return new Melee(def, ctx);
    case 'hitscan':
      return new Hitscan(def, ctx);
    case 'projectile':
      return new Projectile(def, ctx);
    case 'thrown':
      return new Thrown(def, ctx);
    case 'spray':
      return new Spray(def, ctx);
    case 'saw':
      return new Saw(def, ctx);
  }
}

/** Weapons that are held on screen (guns, sprays, throwables) rather than appearing in the world. */
export function usesViewModel(def: WeaponDef): boolean {
  return def.archetype !== 'melee' && def.archetype !== 'saw' && !def.opts?.drop;
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
    this.ctx.viewModel.show(usesViewModel(def) ? def : null);
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
