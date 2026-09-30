import { h } from './dom';

export interface SideAction {
  id: string;
  icon: string;
  label: string;
  onClick: () => void;
}

/** Heads-up display: boss HP, coins, combo, side menu, popups and banners. */
export class Hud {
  readonly root: HTMLElement;
  private hpFill: HTMLElement;
  private hpLag: HTMLElement;
  private hpBar: HTMLElement;
  private hpText: HTMLElement;
  private bossName: HTMLElement;
  private coinsEl: HTMLElement;
  private wallet: HTMLElement;
  private comboEl: HTMLElement;
  private popups: HTMLElement;
  readonly side: HTMLElement;
  readonly bottom: HTMLElement;
  private displayedCoins = 0;
  private targetCoins = 0;

  constructor(parent: HTMLElement) {
    this.hpFill = h('div', { class: 'fill' });
    this.hpLag = h('div', { class: 'lag' });
    this.hpBar = h('div', { class: 'hp' }, this.hpLag, this.hpFill);
    this.hpText = h('span', { text: '100%' });
    this.bossName = h('span', { text: 'The Boss' });
    this.coinsEl = h('span', { text: '0' });
    this.wallet = h('div', { class: 'wallet', title: 'Coins' }, h('span', { class: 'coin', text: '$' }), this.coinsEl);
    this.comboEl = h('div', { class: 'combo' });
    this.popups = h('div', { class: 'popups' });
    this.side = h('div', { class: 'side' });
    this.bottom = h('div');
    this.root = h(
      'div',
      { class: 'hud' },
      this.popups,
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'boss-card' }, h('div', { class: 'boss-name' }, this.bossName, this.hpText), this.hpBar),
        h('div', {}, this.wallet, this.comboEl),
      ),
      this.side,
      this.bottom,
      h(
        'div',
        { class: 'hint' },
        h('div', { html: '<b>Click</b> hit · <b>Hold</b> auto-fire' }),
        h('div', { html: '<b>Right-drag</b> grab &amp; throw a limb' }),
        h('div', { html: '<b>Drag</b> background to orbit · <b>Wheel</b> zoom' }),
        h('div', { html: '<b>1-9 / Q E</b> weapons · <b>R</b> new boss' }),
      ),
    );
    parent.append(this.root);
  }

  setSideActions(actions: SideAction[]): void {
    this.side.replaceChildren(
      ...actions.map((a) =>
        h('button', { 'data-label': a.label, 'aria-label': a.label, 'data-id': a.id, onclick: () => a.onClick() }, a.icon),
      ),
    );
  }

  setBossName(name: string): void {
    this.bossName.textContent = name;
  }

  setHp(fraction: number, dead: boolean): void {
    const f = Math.max(0, Math.min(1, fraction));
    this.hpFill.style.transform = `scaleX(${f})`;
    this.hpLag.style.transform = `scaleX(${f})`;
    this.hpText.textContent = dead ? 'K.O.' : `${Math.ceil(f * 100)}%`;
    this.hpBar.classList.toggle('dead', dead);
  }

  setCoins(total: number, animate = true): void {
    this.targetCoins = total;
    if (!animate) this.displayedCoins = total;
    this.coinsEl.textContent = String(Math.round(this.displayedCoins));
    if (animate) {
      this.wallet.classList.remove('bump');
      void this.wallet.offsetWidth;
      this.wallet.classList.add('bump');
    }
  }

  setCombo(combo: number, mult: number): void {
    this.comboEl.classList.toggle('show', combo >= 3);
    if (combo >= 3) this.comboEl.textContent = `${combo} HIT COMBO ×${mult.toFixed(2)}`;
  }

  popup(text: string, x: number, y: number, big = false): void {
    const el = h('div', { class: `popup${big ? ' big' : ''}`, text });
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popups.append(el);
    setTimeout(() => el.remove(), 950);
  }

  banner(text: string): void {
    const el = h('div', { class: 'banner', text });
    this.root.append(el);
    setTimeout(() => el.remove(), 2500);
  }

  toast(text: string): void {
    const el = h('div', { class: 'toast', text });
    this.root.append(el);
    setTimeout(() => el.remove(), 2300);
  }

  update(dt: number): void {
    if (this.displayedCoins !== this.targetCoins) {
      const d = this.targetCoins - this.displayedCoins;
      this.displayedCoins += Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 10));
      if (Math.abs(this.targetCoins - this.displayedCoins) < 1) this.displayedCoins = this.targetCoins;
      this.coinsEl.textContent = String(Math.round(this.displayedCoins));
    }
  }
}
