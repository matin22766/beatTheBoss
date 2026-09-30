import { h } from './dom';

export interface ResultsData {
  coins: number;
  xp: number;
  rank: number;
  rankTitle: string;
  /** Progress into the current rank, 0..1. */
  rankFrac: number;
  next: string;
  goal: string;
}

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
  private bulletTime: HTMLElement;
  private displayedCoins = 0;
  private targetCoins = 0;
  private rankEl: HTMLElement;
  private rankFill: HTMLElement;
  private promoEl: HTMLElement;
  private results: HTMLElement | null = null;

  constructor(parent: HTMLElement) {
    this.hpFill = h('div', { class: 'fill' });
    this.hpLag = h('div', { class: 'lag' });
    this.hpBar = h('div', { class: 'hp' }, this.hpLag, this.hpFill);
    this.hpText = h('span', { text: '100%' });
    this.bossName = h('span', { text: 'The Boss' });
    this.coinsEl = h('span', { text: '0' });
    this.wallet = h('div', { class: 'wallet', title: 'Coins' }, h('span', { class: 'coin', text: '$' }), this.coinsEl);
    this.comboEl = h('div', { class: 'combo' });
    this.rankEl = h('span', { class: 'rank-title', text: 'Rank 1 · Intern' });
    this.rankFill = h('div', { class: 'xp-fill' });
    this.promoEl = h('span', { class: 'promo-badge' });
    this.popups = h('div', { class: 'popups' });
    this.side = h('div', { class: 'side' });
    this.bulletTime = h('div', { class: 'bullet-time' }, h('div', { class: 'bt-label', text: 'SLOW-MO' }));
    this.bottom = h('div');
    this.root = h(
      'div',
      { class: 'hud' },
      this.bulletTime,
      this.popups,
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'boss-card' }, h('div', { class: 'boss-name' }, this.bossName, this.hpText), this.hpBar),
        h(
          'div',
          { class: 'hud-right' },
          h('div', { class: 'wallet-row' }, this.promoEl, this.wallet),
          h('div', { class: 'rank-card', title: 'Rank: earn XP by hitting, severing and knocking him out' }, this.rankEl, h('div', { class: 'xp-bar' }, this.rankFill)),
          this.comboEl,
        ),
      ),
      this.side,
      this.bottom,
      h(
        'div',
        { class: 'hint' },
        h('div', { html: '<b>Click</b> hit · <b>Hold</b> auto-fire' }),
        h('div', { html: '<b>Right-drag</b> grab &amp; throw a limb' }),
        h('div', { html: '<b>Hold Shift</b> slow motion' }),
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

  setBulletTime(on: boolean): void {
    this.bulletTime.classList.toggle('on', on);
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

  setRank(rank: number, title: string, frac: number, promotions: number): void {
    this.rankEl.textContent = `Rank ${rank} · ${title}`;
    this.rankFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
    this.promoEl.textContent = promotions > 0 ? `⭐×${promotions}` : '';
    this.promoEl.title = promotions > 0 ? `${promotions} promotion${promotions > 1 ? 's' : ''}: coins ×${(1 + 0.25 * promotions).toFixed(2)}` : '';
  }

  /** Big celebratory banner (rank-ups, promotions). */
  levelUp(title: string, sub: string): void {
    const el = h('div', { class: 'level-up' }, h('div', { class: 'lu-title', text: title }), h('div', { class: 'lu-sub', text: sub }));
    for (let i = 0; i < 24; i++) {
      const c = h('i', { class: 'confetti' });
      c.style.left = `${Math.random() * 100}%`;
      c.style.animationDelay = `${Math.random() * 0.4}s`;
      c.style.background = ['#ffcc33', '#ff3b30', '#34c759', '#0a84ff', '#bf5af2'][i % 5];
      el.append(c);
    }
    this.root.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  /** Knockout summary: coins, XP (rank bar fills up), what's next and the nearest goal. */
  resultsCard(d: ResultsData): void {
    this.results?.remove();
    const coins = h('span', { class: 'rc-num', text: '+0' });
    const xp = h('span', { class: 'rc-num', text: '+0' });
    const fill = h('div', { class: 'xp-fill' });
    const card = h(
      'div',
      { class: 'results-card' },
      h('div', { class: 'rc-head', text: 'K.O.!' }),
      h('div', { class: 'rc-row' }, h('span', { text: '💰 Coins' }), coins),
      h('div', { class: 'rc-row' }, h('span', { text: '⭐ XP' }), xp),
      h('div', { class: 'rc-rank', text: `Rank ${d.rank} · ${d.rankTitle}` }),
      h('div', { class: 'xp-bar big' }, fill),
      h('div', { class: 'rc-next', text: d.next }),
      h('div', { class: 'rc-goal', text: `🎯 ${d.goal}` }),
    );
    this.results = card;
    this.root.append(card);
    // Tick the numbers up.
    const start = performance.now();
    const tick = () => {
      if (!card.isConnected) return;
      const k = Math.min(1, (performance.now() - start) / 900);
      const e = 1 - (1 - k) ** 3;
      coins.textContent = `+${Math.round(d.coins * e)}`;
      xp.textContent = `+${Math.round(d.xp * e)}`;
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, d.rankFrac)) * e})`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => {
      card.classList.add('out');
      setTimeout(() => card.remove(), 400);
    }, 3600);
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
