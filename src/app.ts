import { Game } from './core/Game';
import { audio } from './audio/AudioEngine';
import { FaceModal } from './ui/FaceModal';
import { loadProfile } from './face/FaceProfile';
import { Shop } from './ui/Shop';
import { openSettings } from './ui/Settings';
import { THEMES } from './themes';

/** Build the game and all its menus. Loaded lazily so the title screen appears instantly. */
export async function startApp(canvas: HTMLCanvasElement, ui: HTMLElement): Promise<Game> {
  const game = await Game.create(canvas, ui);
  const faceModal = new FaceModal(ui, game);
  const shop = new Shop(ui, {
    coins: () => game.economy.coins,
    spend: (p) => game.spend(p),
    ownsWeapon: (id) => game.save.data.ownedWeapons.includes(id),
    ownsTheme: (id) => game.save.data.ownedThemes.includes(id),
    unlockWeapon: (id) => game.unlockWeapon(id),
    unlockTheme: (id) => game.unlockTheme(id),
    equipWeapon: (w) => game.selectWeapon(w),
    equipTheme: (t) => game.setTheme(t),
    currentWeapon: () => game.weapons.current.id,
    currentTheme: () => game.themeDef.id,
    toast: (t) => game.hud.toast(t),
  });
  game.onLockedWeapon = (w) => shop.open('weapons', w.id);
  const soundIcon = () => (audio.muted ? '🔇' : '🔊');
  game.hud.setSideActions([
    { id: 'face', icon: '📷', label: 'Boss face', onClick: () => faceModal.open() },
    { id: 'shop', icon: '🛒', label: 'Shop', onClick: () => shop.open('weapons') },
    { id: 'arena', icon: '🏙️', label: 'Arenas', onClick: () => shop.open('arenas') },
    { id: 'settings', icon: '⚙️', label: 'Settings', onClick: () => openSettings(ui, game) },
    { id: 'respawn', icon: '🔄', label: 'New boss (R)', onClick: () => game.spawnBoss() },
    {
      id: 'sound',
      icon: soundIcon(),
      label: 'Sound on/off',
      onClick: () => {
        game.setMuted(!audio.muted);
        document.querySelector('[data-id="sound"]')!.textContent = soundIcon();
      },
    },
  ]);
  window.addEventListener('beforeunload', () => game.save.flush());
  // Restore a previously uploaded face.
  void loadProfile().then((p) => p && game.applyFace(p, false));

  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV || params.has('debug')) {
    Object.assign(window, { __game: game, __faceModal: faceModal, __shop: shop, __themes: THEMES });
  }
  return game;
}
