// Headless smoke test: loads the game, plays a little, screenshots, fails on console errors.
// Usage: node scripts/smoke.mjs [url]   (default http://localhost:5173/?debug)
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/?debug';
// SMOKE=basic,weapons,deaths (default: all). The software renderer is slow, so run sections separately.
const sections = new Set((process.env.SMOKE ?? 'basic,weapons,deaths,face,shop,themes').split(','));
const out = 'smoke-out';
mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-networking', '--disable-component-update'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
// MediaPipe logs routine INFO lines through console.error.
const benign = [/XNNPACK/, /TensorFlow Lite/, /^INFO:/];
page.on('console', (m) => {
  if (m.type() === 'error' && !benign.some((r) => r.test(m.text()))) errors.push(m.text());
  if (process.env.VERBOSE) console.log('[console]', m.type(), m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

// Wait for in-game seconds (the headless software renderer runs at a few FPS).
const waitGame = async (seconds) => {
  const start = await page.evaluate(() => window.__game.time);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await wait(150);
    const now = await page.evaluate(() => window.__game.time);
    if (now - start >= seconds) return;
  }
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(url);
await page.waitForSelector('.start .btn:not([disabled])', { timeout: 60000 });
await shot('00-start');
await page.click('.start .btn');
await wait(2500);
await shot('01-idle');

// Screen position of a boss part.
const partXY = (part) =>
  page.evaluate((p) => {
    const g = window.__game;
    const s = g.toScreen(g.boss.ragdoll.position(p));
    return s;
  }, part);

if (sections.has('basic')) {
// Punch the head a few times.
for (let i = 0; i < 6; i++) {
  const { x, y } = await partXY('head');
  await page.mouse.click(x, y);
  await wait(180);
}
await shot('02-punched');

// Grab the left hand with the right mouse button and fling him at the right wall.
const hand = await partXY('handL');
await page.mouse.move(hand.x, hand.y);
await page.mouse.down({ button: 'right' });
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(hand.x - i * 15, hand.y - i * 22);
  await wait(16);
}
await wait(300);
await shot('03-grabbed');
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(hand.x + i * 90, hand.y - 250);
  await wait(16);
}
await page.mouse.up({ button: 'right' });
await wait(1200);
await shot('04-thrown');

}

// ---- Every weapon: select, aim at the chest, fire/hold, check it did something ----
if (sections.has('weapons')) {
// Unlock everything for the test run.
await page.evaluate(() => {
  const g = window.__game;
  g.save.data.ownedWeapons = g.weaponBar.visible().map((w) => w.id);
  g.weaponBar.render();
});
const only = process.env.WEAPONS ? process.env.WEAPONS.split(',') : null;
const weaponIds = (await page.evaluate(() => window.__game.weaponBar.visible().map((w) => w.id))).filter((id) => !only || only.includes(id));
const results = {};
for (const id of weaponIds) {
  await page.evaluate(() => window.__game.spawnBoss());
  await waitGame(1);
  await page.evaluate((wid) => {
    const g = window.__game;
    g.selectWeapon(g.weaponBar.visible().find((w) => w.id === wid));
  }, id);
  const before = await page.evaluate(() => window.__game.boss.damage.hp);
  const p = await partXY('chest');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await waitGame(['grenade', 'dynamite', 'anvil', 'bowling', 'rocket'].includes(id) ? 0.1 : 0.9);
  await page.mouse.up();
  // Fuses, falling anvils and slow projectiles need time to land.
  await waitGame(['grenade', 'dynamite', 'anvil', 'bowling', 'rocket', 'cleaver', 'knives', 'crossbow', 'brick'].includes(id) ? 3.2 : 0.5);
  const after = await page.evaluate(() => (window.__game.boss ? window.__game.boss.damage.hp : 0));
  results[id] = Math.round(before - after);
  if (['katana', 'shotgun', 'rocket', 'flamethrower', 'taser', 'freezeray', 'chainsaw', 'dynamite', 'anvil'].includes(id)) await shot(`w-${id}`);
}
console.log('weapon damage', JSON.stringify(results));
const dud = Object.entries(results).filter(([, d]) => d <= 0).map(([k]) => k);
if (dud.length) errors.push('weapons dealt no damage: ' + dud.join(', '));
}

// ---- Shop: buy a weapon with coins ----
if (sections.has('shop')) {
  await page.evaluate(() => {
    const g = window.__game;
    g.economy.coins = 5000;
    g.hud.setCoins(5000, false);
    window.__shop.open('weapons', 'katana');
  });
  await wait(500);
  await page.click('[data-item="katana"] .buy');
  await wait(500);
  await shot('s-shop');
  const r = await page.evaluate(() => ({ owned: window.__game.isOwned({ id: 'katana' }), coins: window.__game.economy.coins, weapon: window.__game.weapons.current.id }));
  if (!r.owned || r.coins !== 4500 || r.weapon !== 'katana') errors.push('shop purchase failed: ' + JSON.stringify(r));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__shop.open('arenas'));
  await wait(400);
  await shot('s-arenas');
  await page.keyboard.press('Escape');
}

// ---- Every arena ----
if (sections.has('themes')) {
  const ids = await page.evaluate(() => {
    const g = window.__game;
    return ['office', 'warehouse', 'ring', 'kitchen', 'rooftop', 'lab', 'beach', 'space'].filter((id) => {
      g.unlockTheme(id);
      return true;
    });
  });
  for (const id of ids) {
    await page.evaluate((tid) => {
      const g = window.__game;
      g.setTheme(window.__themes.find((t) => t.id === tid));
    }, id);
    await waitGame(1.2);
    const p = await partXY('head');
    await page.mouse.click(p.x, p.y);
    await waitGame(0.4);
    await shot(`t-${id}`);
  }
}

// ---- Every death style ----
if (sections.has('deaths'))
for (const style of ['crumple', 'dismember', 'decapitate', 'shatter', 'charcoal', 'xray', 'flatten', 'orbit']) {
  await page.evaluate(() => window.__game.spawnBoss());
  await waitGame(1);
  await page.evaluate((st) => window.__game.debugKill(st), style);
  await waitGame(style === 'shatter' || style === 'charcoal' ? 1.1 : style === 'orbit' ? 0.5 : 0.35);
  await shot(`d-${style}`);
  await waitGame(4.5);
  const respawned = await page.evaluate(() => !window.__game.boss.dead);
  if (!respawned) errors.push(`no respawn after ${style}`);
}

// ---- Face pipeline: a photo without a face must fail gracefully ----
if (sections.has('face')) {
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6a8caf';
    ctx.fillRect(0, 0, 640, 480);
    window.__faceModal.open();
    await window.__faceModal.process(c);
  });
  const msg = await page.evaluate(() => document.querySelector('.face-error')?.textContent ?? '');
  if (!/couldn't find a face/i.test(msg)) errors.push('no-face photo did not show a friendly error: ' + msg);
  await page.evaluate(() => window.__faceModal.close());
}

// ---- Face pipeline (needs PORTRAIT=/path/to/front-facing-photo.jpg) ----
if (sections.has('face') && process.env.PORTRAIT) {
  const { readFileSync } = await import('node:fs');
  const dataUrl = 'data:image/jpeg;base64,' + readFileSync(process.env.PORTRAIT).toString('base64');
  await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    window.__faceModal.open();
    window.__faceDone = window.__faceModal.process(c);
  }, dataUrl);
  for (let i = 0; i < 12; i++) {
    await wait(1500);
    await shot(`f-loader-${String(i).padStart(2, '0')}`);
    const done = await page.evaluate(() => !!document.querySelector('.face-after:not([hidden])') || !!document.querySelector('.face-error'));
    if (done) break;
  }
  const err = await page.evaluate(() => document.querySelector('.face-error')?.textContent);
  if (err) errors.push('face pipeline: ' + err);
  else {
    await wait(1500);
    await shot('f-loader-done');
    await page.click('.face-after .btn');
    await waitGame(1.5);
    await shot('f-game');
    const ok = await page.evaluate(() => window.__game.hasFace());
    if (!ok) errors.push('face was not applied');
    for (const part of ['head', 'head', 'chest']) {
      const { x, y } = await partXY(part);
      await page.mouse.click(x, y);
      await waitGame(0.25);
    }
    await shot('f-game-hit');
    // The face survives a reload.
    await page.reload();
    await page.waitForSelector('.start .btn:not([disabled])', { timeout: 60000 });
    await page.click('.start .btn');
    await wait(4000);
    const restored = await page.evaluate(() => window.__game.hasFace());
    if (!restored) errors.push('face was not restored after reload');
  }
}

const state = await page.evaluate(() => {
  const g = window.__game;
  return { hp: g.boss.damage.hp, coins: g.economy.coins, dead: g.boss.dead };
});
console.log('state', JSON.stringify(state));

await browser.close();
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok');
