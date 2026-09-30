import './ui/styles.css';
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

// The engine (three.js + Rapier WASM) is a few MB: show the title screen first, then stream it in.
let fake = 5;
const tick = setInterval(() => {
  fake = Math.min(90, fake + (90 - fake) * 0.08);
  bar.style.width = `${fake}%`;
}, 100);

import('./app')
  .then(({ startApp }) => startApp(canvas, ui))
  .then(() => {
    clearInterval(tick);
    bar.style.width = '100%';
    startBtn.disabled = false;
    startBtn.textContent = 'Start smashing';
    startBtn.addEventListener('click', () => {
      audio.unlock();
      audio.play('boing', { intensity: 0.5 });
      overlay.remove();
    });
  })
  .catch((err: unknown) => {
    clearInterval(tick);
    console.error(err);
    startBtn.textContent = 'Failed to start: WebGL/WASM unavailable';
  });
