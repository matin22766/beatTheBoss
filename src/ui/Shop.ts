import { h } from './dom';
import { openModal, type ModalHandle } from './Modal';
import { WEAPONS, CATEGORIES } from '../combat/weapons/weaponDefs';
import { THEMES } from '../themes';
import type { WeaponDef } from '../combat/weapons/types';
import type { ThemeDef } from '../themes/Theme';
import { audio } from '../audio/AudioEngine';
import { MAX_TIER, MASTERY_STEPS, PROMOTE_AT, bossTitle, promotionMultiplier, requiredRank, stars, upgradeCost, xpToNext } from '../progression/Progression';

export interface CareerData {
  rank: number;
  rankTitle: string;
  xp: number;
  bossLevel: number;
  promotions: number;
  stats: { hits: number; kills: number; severs: number; bestCombo: number };
  kosByTheme: Record<string, number>;
  goal: string;
}

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
  rank(): number;
  weaponTier(id: string): number;
  masteryKills(id: string): number;
  upgrade(id: string): boolean;
  career(): CareerData;
  canPromote(): boolean;
  promote(): boolean;
}

type Tab = 'weapons' | 'arenas' | 'career';

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
  private tab: Tab = 'weapons';
  private coinsEl: HTMLElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly host: ShopHost,
  ) {}

  open(tab: Tab = this.tab, focus?: string): void {
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
      ...(['weapons', 'arenas', 'career'] as const).map((t) =>
        h('button', {
          class: t === this.tab ? 'on' : '',
          'data-tab': t,
          text: t === 'weapons' ? '🗡 Weapons' : t === 'arenas' ? '🏙 Arenas' : '📈 Career',
          onclick: () => {
            this.tab = t;
            this.render();
          },
        }),
      ),
    );
    const content = this.tab === 'weapons' ? this.weapons() : this.tab === 'arenas' ? this.arenas() : this.careerTab();
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
            const tier = owned ? this.host.weaponTier(w.id) : 0;
            const need = owned ? 0 : requiredRank(w);
            const kills = this.host.masteryKills(w.id);
            const mastery = MASTERY_STEPS.filter((k) => kills >= k).length;
            const dmg = w.damage * (w.opts?.pellets ?? 1) * (1 + 0.15 * tier) * (1 + 0.05 * mastery);
            return h(
              'div',
              { class: `card${this.host.currentWeapon() === w.id ? ' active' : ''}`, 'data-item': w.id },
              h('div', { class: 'big-ico', text: w.icon }),
              h('div', { class: 'title', text: w.name }),
              h('div', { class: 'meta', text: `${TYPE_LABEL[w.type]} · ${Math.round(dmg)} dmg` }),
              owned ? h('div', { class: 'stars', title: `Upgrade tier ${tier}/${MAX_TIER} · mastery ${mastery}/3 (${kills} KOs)`, text: `${stars(tier, MAX_TIER)}${mastery ? ` · ${'🏅'.repeat(mastery)}` : ''}` }) : null,
              !owned && need > this.host.rank()
                ? h('button', { class: 'buy locked', text: `🔒 Rank ${need} · $${w.price}`, disabled: true })
                : this.buyButton(
                w.price,
                owned,
                this.host.currentWeapon() === w.id,
                () => this.buy(w.price, w.name, () => this.host.unlockWeapon(w.id), () => this.host.equipWeapon(w)),
                () => {
                  this.host.equipWeapon(w);
                  this.render();
                },
              ),
              owned ? this.upgradeButton(w) : null,
            );
          }),
        ),
      );
    }
    return wrap;
  }

  private upgradeButton(w: WeaponDef): HTMLElement {
    const tier = this.host.weaponTier(w.id);
    const cost = upgradeCost(w, tier);
    if (cost === null) return h('button', { class: 'buy owned upgrade', text: 'MAXED ★★★★★', disabled: true });
    return h('button', {
      class: 'buy upgrade',
      'data-upgrade': w.id,
      text: `⬆ ${'★'.repeat(tier + 1)} · $${cost}`,
      title: `+15% damage, −6% cooldown`,
      disabled: this.host.coins() < cost,
      onclick: () => {
        if (!this.host.upgrade(w.id)) audio.play('squeak', { intensity: 0.5 });
        this.render();
      },
    });
  }

  private careerTab(): HTMLElement {
    const c = this.host.career();
    const frac = Math.min(1, c.xp / xpToNext(c.rank));
    const fill = h('div', { class: 'xp-fill' });
    fill.style.transform = `scaleX(${frac})`;
    const kos = Object.entries(c.kosByTheme)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => {
        const t = THEMES.find((x) => x.id === id);
        return h('div', {}, h('b', { text: String(n) }), `KOs · ${t?.name ?? id}`);
      });
    const promoteBtn = this.host.canPromote()
      ? h('button', {
          class: 'buy',
          'data-promote': '1',
          text: `⭐ Get promoted (coins ×${promotionMultiplier(c.promotions + 1).toFixed(2)})`,
          onclick: () => {
            if (this.host.promote()) this.modal?.close();
          },
        })
      : h('button', { class: 'buy locked', text: `🔒 Promotion at boss LV ${PROMOTE_AT} (now ${c.bossLevel})`, disabled: true });
    return h(
      'div',
      { class: 'career' },
      h(
        'div',
        { class: 'panel' },
        h('h4', { text: 'Your rank' }),
        h('div', { class: 'big-line', text: `Rank ${c.rank} · ${c.rankTitle}` }),
        h('div', { class: 'xp-bar big' }, fill),
        h('div', { class: 'meta', text: `${Math.floor(c.xp)} / ${xpToNext(c.rank)} XP to the next rank` }),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h4', { text: 'The boss' }),
        h('div', { class: 'big-line', text: `LV ${c.bossLevel} · ${bossTitle(c.bossLevel)}` }),
        h('div', { class: 'meta', text: `Coins ×${promotionMultiplier(c.promotions).toFixed(2)} from ${c.promotions} promotion${c.promotions === 1 ? '' : 's'}. Promote at LV ${PROMOTE_AT}: the boss ladder resets, you keep everything and earn +25% coins forever.` }),
        promoteBtn,
      ),
      h('div', { class: 'panel' }, h('h4', { text: 'Next goal' }), h('div', { class: 'big-line', text: `🎯 ${c.goal}` })),
      h(
        'div',
        { class: 'panel' },
        h('h4', { text: 'Lifetime' }),
        h(
          'div',
          { class: 'stat-grid' },
          h('div', {}, h('b', { text: String(c.stats.kills) }), 'Knockouts'),
          h('div', {}, h('b', { text: String(c.stats.hits) }), 'Hits'),
          h('div', {}, h('b', { text: String(c.stats.severs) }), 'Limbs severed'),
          h('div', {}, h('b', { text: String(c.stats.bestCombo) }), 'Best combo'),
          ...kos,
        ),
      ),
    );
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
