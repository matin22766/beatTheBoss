// Headless smoke test: loads the game, plays a little, screenshots, fails on console errors.
// Usage: node scripts/smoke.mjs [url]   (default http://localhost:5173/?debug)
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/?debug';
const out = 'smoke-out';
mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (process.env.VERBOSE) console.log('[console]', m.type(), m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

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

const state = await page.evaluate(() => {
  const g = window.__game;
  return { hp: g.boss.damage.hp, coins: g.economy.coins, dead: g.boss.dead };
});
console.log('state', JSON.stringify(state));
await wait(2000);
await shot('05-after');

await browser.close();
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok');
