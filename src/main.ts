import './ui/styles.css';
import { Game } from './core/Game';
import { audio } from './audio/AudioEngine';
import { h } from './ui/dom';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const bar = h('div');
const startBtn = h('button', { class: 'btn', disabled: true, text: 'Loading…' });
const overlay = h(
  'div',
  { class: 'overlay' },
  h(
    'div',
    { class: 'start' },
    h('h1', { text: 'BOSS SMASH' }),
    h('p', { text: 'A stress-relief ragdoll. Punch him, grab him by the tie, fling him into the wall. Upload a photo to give him a familiar face.' }),
    h('div', { class: 'progress' }, bar),
    startBtn,
  ),
);
ui.append(overlay);
bar.style.width = '30%';

Game.create(canvas, ui)
  .then((game) => {
    bar.style.width = '100%';
    startBtn.disabled = false;
    startBtn.textContent = 'Start smashing';
    startBtn.addEventListener('click', () => {
      audio.unlock();
      audio.play('boing', { intensity: 0.5 });
      overlay.remove();
    });
    const params = new URLSearchParams(location.search);
    if (import.meta.env.DEV || params.has('debug')) {
      (window as unknown as { __game: Game }).__game = game;
    }
  })
  .catch((err: unknown) => {
    console.error(err);
    startBtn.textContent = 'Failed to start: WebGL/WASM unavailable';
  });
