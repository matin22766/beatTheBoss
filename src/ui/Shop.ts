import { h } from './dom';
import { openModal, type ModalHandle } from './Modal';
import { WEAPONS, CATEGORIES } from '../combat/weapons/weaponDefs';
import { THEMES } from '../themes';
import type { WeaponDef } from '../combat/weapons/types';
import type { ThemeDef } from '../themes/Theme';
import { audio } from '../audio/AudioEngine';

export interface ShopHost {
  coins(): number;
  spend(price: number): boolean;
  ownsWeapon(id: string): boolean;
  ownsTheme(id: string): boolean;
  unlockWeapon(id: string): void;
  unlockTheme(id: string): void;
  equipWeapon(def: WeaponDef): void;
  equipTheme(def: ThemeDef): void;
  currentWeapon(): string;
  currentTheme(): string;
  toast(text: string): void;
}

const SWATCH: Record<string, string> = {
  office: 'linear-gradient(135deg,#e3d9c2,#5d6b7e)',
  warehouse: 'linear-gradient(135deg,#8f4a33,#8a8a86)',
  ring: 'linear-gradient(135deg,#0b0b12,#3c5a88 60%,#c1121f)',
  kitchen: 'linear-gradient(135deg,#e9f3f1,#6fa89a)',
  rooftop: 'linear-gradient(135deg,#0b1026,#2a1f4d 60%,#ff4fd8)',
  lab: 'linear-gradient(135deg,#dfe6ea,#39ff88)',
  beach: 'linear-gradient(180deg,#4aa3df,#bfe6ff 50%,#e9cf8f 50%)',
  space: 'radial-gradient(circle at 70% 70%,#2d6fb3,#05060f 60%)',
};

const TYPE_LABEL: Record<string, string> = {
  blunt: 'Blunt',
  sharp: 'Cuts limbs',
  pierce: 'Piercing',
  explosive: 'Explosive',
  fire: 'Burns',
  electric: 'Shocks',
  cold: 'Freezes',
};

/** Spend coins on weapons and arenas; equip what you own. */
export class Shop {
  private modal: ModalHandle | null = null;
  private tab: 'weapons' | 'arenas' = 'weapons';
  private coinsEl: HTMLElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly host: ShopHost,
  ) {}

  open(tab: 'weapons' | 'arenas' = this.tab, focus?: string): void {
    this.tab = tab;
    this.modal?.close();
    this.modal = openModal(this.parent, 'Shop', 'Earn coins with every hit and knockout. Spend them here.', () => (this.modal = null), 'shop-modal');
    this.render();
    if (focus) this.modal.body.querySelector(`[data-item="${focus}"]`)?.scrollIntoView({ block: 'center' });
  }

  private render(): void {
    if (!this.modal) return;
    this.coinsEl = h('span', { class: 'shop-coins', text: `$ ${this.host.coins()}` });
    const tabs = h(
      'div',
      { class: 'seg shop-tabs' },
      ...(['weapons', 'arenas'] as const).map((t) =>
        h('button', {
          class: t === this.tab ? 'on' : '',
          text: t === 'weapons' ? '🗡 Weapons' : '🏙 Arenas',
          onclick: () => {
            this.tab = t;
            this.render();
          },
        }),
      ),
    );
    const content = this.tab === 'weapons' ? this.weapons() : this.arenas();
    this.modal.setContent(h('div', { class: 'shop-bar' }, tabs, this.coinsEl), content);
  }

  private buyButton(price: number, owned: boolean, equipped: boolean, onBuy: () => void, onEquip: () => void): HTMLElement {
    if (equipped) return h('button', { class: 'buy owned', text: 'Equipped', disabled: true });
    if (owned) return h('button', { class: 'buy owned', text: 'Equip', onclick: onEquip });
    return h('button', {
      class: 'buy',
      text: `Buy · $${price}`,
      disabled: this.host.coins() < price,
      onclick: onBuy,
    });
  }

  private weapons(): HTMLElement {
    const wrap = h('div');
    for (const cat of CATEGORIES.filter((c) => c.id !== 'all')) {
      const items = WEAPONS.filter((w) => w.category === cat.id);
      wrap.append(
        h('h3', { class: 'shop-cat', text: cat.label }),
        h(
          'div',
          { class: 'grid' },
          ...items.map((w) => {
            const owned = this.host.ownsWeapon(w.id);
            return h(
              'div',
              { class: `card${this.host.currentWeapon() === w.id ? ' active' : ''}`, 'data-item': w.id },
              h('div', { class: 'big-ico', text: w.icon }),
              h('div', { class: 'title', text: w.name }),
              h('div', { class: 'meta', text: `${TYPE_LABEL[w.type]} · ${Math.round(w.damage * (w.opts?.pellets ?? 1))} dmg` }),
              this.buyButton(
                w.price,
                owned,
                this.host.currentWeapon() === w.id,
                () => this.buy(w.price, w.name, () => this.host.unlockWeapon(w.id), () => this.host.equipWeapon(w)),
                () => {
                  this.host.equipWeapon(w);
                  this.render();
                },
              ),
            );
          }),
        ),
      );
    }
    return wrap;
  }

  private arenas(): HTMLElement {
    return h(
      'div',
      { class: 'grid' },
      ...THEMES.map((t) => {
        const owned = this.host.ownsTheme(t.id);
        const sw = h('div', { class: 'swatch-lg' });
        sw.style.background = SWATCH[t.id] ?? '#333';
        return h(
          'div',
          { class: `card${this.host.currentTheme() === t.id ? ' active' : ''}`, 'data-item': t.id },
          sw,
          h('div', { class: 'title', text: t.name }),
          h('div', { class: 'meta', text: t.gravity ? 'Low gravity!' : 'Arena' }),
          this.buyButton(
            t.price,
            owned,
            this.host.currentTheme() === t.id,
            () => this.buy(t.price, t.name, () => this.host.unlockTheme(t.id), () => this.host.equipTheme(t)),
            () => {
              this.host.equipTheme(t);
              this.render();
            },
          ),
        );
      }),
    );
  }

  private buy(price: number, name: string, unlock: () => void, equip: () => void): void {
    if (!this.host.spend(price)) {
      audio.play('squeak', { intensity: 0.5 });
      return;
    }
    unlock();
    equip();
    audio.play('kaching', { intensity: 0.9 });
    this.host.toast(`Unlocked ${name}!`);
    this.render();
  }
}
