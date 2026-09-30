# Boss Smash 🥊

A 3D browser stress-relief game in the spirit of *Beat the Boss*: a cartoon office boss built as an
active ragdoll that you punch, slice, blow up, freeze, electrocute and fling into the walls, with
**your own photo as his face**.

Everything runs locally in the browser. Uploaded photos never leave your device.

## Features

- **Physics ragdoll**: a 15-part [Rapier](https://rapier.rs) ragdoll that holds procedural poses,
  keeps its balance, staggers, gets dizzy and climbs back to its feet. Grab any hand, foot or his
  head and hurl him into walls, furniture or the ceiling. Impacts deal damage.
- **Grounded body**: his legs hold him up by pushing on the floor (no invisible strings), so he
  can't float. He walks with real steps (the planted foot grips, the swing foot lifts and lands),
  catches himself with a stumble step when shoved, topples when shoved too hard, and sits on
  chairs or on the floor, then gets back up. Soft contact shadows show where his feet touch the floor.
- **Face swap with an animated morph loader**: MediaPipe finds 478 landmarks. The photo is
  unwrapped onto a real 3D face mesh, relief-mapped onto the boss's head, and colour-matched. The
  loader visibly scans the photo, pops in landmarks, weaves the wireframe, peels the face off in 3D
  and morphs it onto the boss. You can also snap a photo with your webcam.
- **Expressive faces**: the photo face itself squints, screams, frowns and smirks. It gets spiral
  eyes when dazed and X-eyes on a knockout.
- **46 weapons** in 8 categories:
  - **Blunt:** fists, bat, frying pan, sledgehammer, brick, keyboard, rubber chicken, Ban Hammer
    (floor shockwave), boomerang (comes back to your hand).
  - **Sharp:** katana, fire axe, thrown cleaver, chainsaw, throwing knives, laser cutter,
    ricocheting buzzsaw launcher, guillotine, shuriken.
  - **Guns:** pistol, shotgun, nail gun, crossbow, minigun (spins up), plasma rifle.
  - **Explosives:** grenade, sticky dynamite, rocket launcher.
  - **Elemental:** flamethrower, taser, freeze ray.
  - **Magic:** black hole (pulls everything in and tears limbs off), tornado, flying swords, bee
    swarm, lightning strike (chains into furniture), ice spikes, meteor shower, Tesla coil turret.
  - **Drops:** anvil, bowling ball, wrecking ball (swings from the ceiling), piano.
  - **Gadgets:** web shooter (hold to hoist him up), harpoon gun (pins him to the wall), gravity
    gun (hold to lift, release to launch), magnet (hurls scrap metal at him).
- **Damage and gore**:
  - Limbs sever from cutting and explosive damage. Stumps get meat-and-bone caps and blood fountains.
  - Bones snap from hard blunt hits, so limbs flop and bend the wrong way.
  - Bruises, cuts, bullet holes, burns and frost decals. Nails, knives and bolts stay stuck in him.
  - Cartoon blood splatters the room. Switch it to green goo or turn it off in Settings.
- **8 death styles**, each chosen by how he died:
  - Crumple.
  - Dismember.
  - Decapitation.
  - Freeze and shatter.
  - Burn to charcoal.
  - Electrocution X-ray skeleton.
  - Anvil pancake.
  - Launched into orbit.
- **8 arenas**:
  - Corner office.
  - Warehouse.
  - Boxing ring with a crowd.
  - Staff kitchen.
  - Neon rooftop at night.
  - Science lab.
  - Beach.
  - Low-gravity space station.
- **Coins and shop**:
  - You earn coins on every hit, with combo multipliers and bonuses for severed limbs, broken bones and KOs.
  - Spend them on weapons, arenas and weapon upgrades (5 tiers: +15% damage, faster cooldown each).
  - Progress is saved in your browser.
- **Progression**:
  - **Boss levels**: every knockout brings a tougher boss (more HP, sharper dodging) who pays more,
    from Assistant Manager up to Chairman of the Board. Every 5th boss wears a crown and pays ×3.
  - **Rank and XP**: hits, severed limbs and KOs earn XP. Each rank pays a coin bonus, and premium
    weapons unlock as you climb (Intern → Office Legend).
  - **Mastery**: 10, 50 and 200 KOs with a weapon earn mastery stars (+5% damage each).
  - **Promotion**: from boss level 20, reset the boss ladder for a permanent +25% coins.
  - After each KO a results card shows coins, XP and your next goal. The Career tab tracks everything.
- **Procedural sound**: every punch, bone crunch, slice, splat, gunshot, explosion, zap, grunt and
  scream is synthesised with the Web Audio API. Each arena has its own ambience.
- **Performance**: fixed 60 Hz physics with interpolated rendering, hit-stop, slow-motion finishers,
  and quality presets with automatic downgrade.

## Controls

| Action | Input |
| --- | --- |
| Use weapon | Left click. Hold to auto-fire, spray or saw. |
| Grab and throw a limb | Right-drag. With fists, drag the boss. |
| Slow motion (bullet time) | Hold Shift |
| Push or pull while grabbing | Mouse wheel |
| Orbit / zoom camera | Drag the background / mouse wheel |
| Switch weapon | `1`–`9`, or `Q` / `E` |
| New boss | `R` |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run lint
npm test           # unit tests: ragdoll physics, damage rules, economy, saves, face fitting, weapons
npm run build      # static site in dist/
npm run preview
```

The headless browser smoke test drives the real game in Chromium. Sections:

- `basic`: punches, grabbing and throwing.
- `weapons`: all 46 weapons (`WEAPONS=id,id` to pick some).
- `deaths`: all 8 death styles.
- `shop`: a purchase.
- `themes`: all arenas.
- `face`: the no-face error path, plus the full pipeline when `PORTRAIT` is set.

```bash
npm run dev &
SMOKE=basic,weapons node scripts/smoke.mjs
SMOKE=face PORTRAIT=/path/to/front-facing.jpg node scripts/smoke.mjs
```

Screenshots are written to `smoke-out/`.

## Deploying to GitHub Pages

Live at **https://matin22766.github.io/beatTheBoss/**.

`.github/workflows/deploy.yml` runs on every push to `main` (or manually from the Actions tab). It
checks and builds the game, then publishes `dist/` to the `gh-pages` branch, which Pages serves.
If Pages ever shows a 404, check Settings → Pages → Deploy from a branch → `gh-pages` / root.
The build uses relative paths, so it works under any sub-path.

## Tech

- [three.js](https://threejs.org) for rendering: cel shading, ink outlines, instanced particles.
- [Rapier](https://rapier.rs) for physics: WASM, CCD, joints and contact-force events.
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
  for on-device face tracking.
- Vite and TypeScript, with Vitest for tests and Playwright for smoke tests.

All art, weapons and arenas are procedural, so the game ships with zero image or audio assets.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for licences.

*Boss Smash is an original fan-made game inspired by the genre. It is not affiliated with the
makers of Beat the Boss.*
