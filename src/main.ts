import './ui/styles.css';
import { Game } from './core/Game';
import { audio } from './audio/AudioEngine';
import { h } from './ui/dom';
import { FaceModal } from './ui/FaceModal';
import { loadProfile } from './face/FaceProfile';

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
    const faceModal = new FaceModal(ui, game);
    game.hud.setSideActions([
      { id: 'face', icon: '📷', label: 'Boss face', onClick: () => faceModal.open() },
      { id: 'respawn', icon: '🔄', label: 'New boss (R)', onClick: () => game.spawnBoss() },
      {
        id: 'sound',
        icon: '🔊',
        label: 'Sound on/off',
        onClick: () => {
          audio.setMuted(!audio.muted);
          document.querySelector('[data-id="sound"]')!.textContent = audio.muted ? '🔇' : '🔊';
        },
      },
    ]);
    // Restore a previously uploaded face.
    void loadProfile().then((p) => p && game.applyFace(p, false));
    const params = new URLSearchParams(location.search);
    if (import.meta.env.DEV || params.has('debug')) {
      Object.assign(window, { __game: game, __faceModal: faceModal });
    }
  })
  .catch((err: unknown) => {
    console.error(err);
    startBtn.textContent = 'Failed to start: WebGL/WASM unavailable';
  });
