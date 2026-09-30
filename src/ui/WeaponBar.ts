import { h } from './dom';
import { CATEGORIES } from '../combat/weapons/weaponDefs';
import type { WeaponCategory, WeaponDef } from '../combat/weapons/types';

export interface WeaponBarOpts {
  weapons: WeaponDef[];
  isOwned(def: WeaponDef): boolean;
  onSelect(def: WeaponDef): void;
  onLocked(def: WeaponDef): void;
  /** Upgrade tier (0-5) and mastery stars, shown on the button. */
  tier?(def: WeaponDef): number;
  /** Rank still needed to buy it (0 = buyable). */
  rankNeeded?(def: WeaponDef): number;
}

/** Bottom bar with category tabs; number keys pick from the visible list. */
export class WeaponBar {
  readonly root: HTMLElement;
  private tabs: HTMLElement;
  private list: HTMLElement;
  private category: WeaponCategory | 'all' = 'all';
  private activeId = 'fists';

  constructor(
    parent: HTMLElement,
    private readonly opts: WeaponBarOpts,
  ) {
    this.tabs = h('div', { class: 'weapon-tabs' });
    this.list = h('div', { class: 'weapon-list' });
    this.root = h('div', { class: 'weapons' }, this.tabs, this.list);
    parent.append(this.root);
    this.render();
  }

  visible(): WeaponDef[] {
    return this.opts.weapons.filter((w) => this.category === 'all' || w.category === this.category);
  }

  setActive(id: string): void {
    this.activeId = id;
    this.render();
  }

  render(): void {
    this.tabs.replaceChildren(
      ...CATEGORIES.map((c) =>
        h('button', {
          class: c.id === this.category ? 'active' : '',
          text: c.label,
          onclick: () => {
            this.category = c.id;
            this.render();
          },
        }),
      ),
    );
    this.list.replaceChildren(
      ...this.visible().map((w, i) => {
        const owned = this.opts.isOwned(w);
        const tier = owned ? (this.opts.tier?.(w) ?? 0) : 0;
        const rank = owned ? 0 : (this.opts.rankNeeded?.(w) ?? 0);
        return h(
          'button',
          {
            class: `weapon${w.id === this.activeId ? ' active' : ''}${owned ? '' : ' locked'}`,
            title: owned ? `${w.name}${tier ? ` ${'★'.repeat(tier)}` : ''}` : rank ? `${w.name}: reach rank ${rank}` : `${w.name}: ${w.price} coins`,
            'data-weapon': w.id,
            onclick: () => (owned ? this.opts.onSelect(w) : this.opts.onLocked(w)),
          },
          i < 9 ? h('span', { class: 'key', text: String(i + 1) }) : null,
          h('span', { class: 'ico', text: w.icon }),
          h('span', { class: 'nm', text: w.name }),
          owned ? null : h('span', { class: 'price', text: rank ? `🔒R${rank}` : `🔒${w.price}` }),
          tier ? h('span', { class: 'tier', text: '★'.repeat(tier) }) : null,
        );
      }),
    );
  }
}
