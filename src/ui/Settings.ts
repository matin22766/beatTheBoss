import { h } from './dom';
import { openModal } from './Modal';
import type { SaveData, Quality } from '../economy/Save';
import type { GoreMode } from '../fx/Effects';

export interface SettingsHost {
  data(): SaveData;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  setGore(g: GoreMode): void;
  setQuality(q: Quality, auto: boolean): void;
  resetProgress(): void;
}

function seg<T extends string>(options: Array<[T, string]>, value: T, onChange: (v: T) => void): HTMLElement {
  const el = h('div', { class: 'seg' });
  const render = (v: T) =>
    el.replaceChildren(
      ...options.map(([id, label]) =>
        h('button', {
          class: id === v ? 'on' : '',
          text: label,
          onclick: () => {
            onChange(id);
            render(id);
          },
        }),
      ),
    );
  render(value);
  return el;
}

export function openSettings(parent: HTMLElement, host: SettingsHost): void {
  const d = host.data();
  const m = openModal(parent, 'Settings', 'Tune sound, gore and graphics.');
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: d.settings.volume, 'aria-label': 'Volume' }) as HTMLInputElement;
  vol.addEventListener('input', () => host.setVolume(Number(vol.value)));
  const mute = h('input', { type: 'checkbox', 'aria-label': 'Mute' }) as HTMLInputElement;
  mute.checked = d.settings.muted;
  mute.addEventListener('change', () => host.setMuted(mute.checked));
  let quality = d.settings.quality;
  let auto = d.settings.autoQuality;
  const autoBox = h('input', { type: 'checkbox', 'aria-label': 'Auto quality' }) as HTMLInputElement;
  autoBox.checked = auto;
  autoBox.addEventListener('change', () => {
    auto = autoBox.checked;
    host.setQuality(quality, auto);
  });
  const s = d.stats;
  m.setContent(
    h('div', { class: 'row' }, h('span', { text: 'Volume' }), vol),
    h('div', { class: 'row' }, h('span', { text: 'Mute' }), mute),
    h(
      'div',
      { class: 'row' },
      h('span', { text: 'Gore' }),
      seg<GoreMode>(
        [
          ['red', 'Cartoon red'],
          ['green', 'Green goo'],
          ['off', 'Off'],
        ],
        d.settings.gore,
        (g) => host.setGore(g),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('span', { text: 'Graphics' }),
      seg<Quality>(
        [
          ['low', 'Low'],
          ['medium', 'Medium'],
          ['high', 'High'],
        ],
        quality,
        (q) => {
          quality = q;
          host.setQuality(q, auto);
        },
      ),
    ),
    h('div', { class: 'row' }, h('span', { text: 'Lower graphics automatically if it gets choppy' }), autoBox),
    h('div', { class: 'row' }, h('span', { text: 'Stats' }), h('span', { class: 'meta', text: `${s.hits} hits · ${s.kills} KOs · ${s.severs} limbs · best combo ${s.bestCombo}` })),
    h(
      'div',
      { class: 'row' },
      h('span', { text: 'Reset coins, unlocks and stats' }),
      h('button', {
        class: 'btn secondary',
        text: 'Reset progress',
        onclick: () => {
          if (confirm('Reset all coins, unlocks and stats?')) {
            host.resetProgress();
            m.close();
          }
        },
      }),
    ),
    h(
      'div',
      { class: 'controls-help' },
      h('h3', { text: 'Controls' }),
      h('p', { html: '<b>Left click</b> use weapon (hold for auto-fire) · <b>Right-drag</b> or <b>Shift+drag</b> grab a limb and fling him · with Fists, <b>drag</b> on the boss to grab' }),
      h('p', { html: '<b>Drag the background</b> to orbit · <b>Mouse wheel</b> zoom (or push/pull while grabbing) · <b>1-9</b>, <b>Q</b>/<b>E</b> switch weapons · <b>R</b> new boss' }),
    ),
  );
}
