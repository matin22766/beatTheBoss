import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { initRapier, PhysicsWorld, PHYSICS_DT, RAPIER, G, groups } from '../physics/PhysicsWorld';
import { buildArenaColliders, type Surface } from '../physics/ArenaColliders';
import { limbRadius } from '../character/BossMesh';
import { BodySync } from './BodySync';
import { EventBus } from './EventBus';
import { CameraRig } from './CameraRig';
import type { DeathStyle, GameEvents, HitInfo, HitResult } from './types';
import { Boss } from '../character/Boss';
import type { PartRuntime } from '../character/Ragdoll';
import { Effects } from '../fx/Effects';
import { GrabController } from '../interaction/GrabController';
import { WeaponSystem, usesViewModel } from '../combat/weapons/WeaponSystem';
import { ViewModel } from '../combat/weapons/ViewModel';
import { WeaponBar } from '../ui/WeaponBar';
import { DeathDirector } from '../death/DeathDirector';
import { WEAPONS } from '../combat/weapons/weaponDefs';
import type { Aim, BossHit, WeaponCtx, WeaponDef } from '../combat/weapons/types';
import { Economy } from '../economy/Economy';
import { Hud } from '../ui/Hud';
import { audio } from '../audio/AudioEngine';
import type { ThemeDef, ThemeInstance } from '../themes/Theme';
import { office } from '../themes/office';
import { THEMES, themeById } from '../themes';
import { SaveStore, type Quality, type SaveData } from '../economy/Save';
import { QualityManager } from './Quality';
import type { GoreMode } from '../fx/Effects';
import type { FaceProfile } from '../face/FaceProfile';
import { saveProfile } from '../face/FaceProfile';
import { roomPoint } from './roomPoint';

const IMPACT_MIN_SPEED = 4;

type PointerMode = 'none' | 'weapon' | 'orbit' | 'pending-grab' | 'grab';

/** Top-level orchestrator: rendering, fixed-step physics, input, and wiring between systems. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly physics: PhysicsWorld;
  readonly sync = new BodySync();
  readonly events = new EventBus<GameEvents>();
  readonly fx = new Effects();
  readonly save = new SaveStore(
    WEAPONS.filter((w) => w.price === 0).map((w) => w.id),
    THEMES.filter((t) => t.price === 0).map((t) => t.id),
  );
  readonly economy = new Economy(this.save.data.coins);
  readonly quality: QualityManager;
  outlineEnabled = true;
  readonly hud: Hud;
  readonly grab: GrabController;
  readonly weapons: WeaponSystem;
  readonly viewModel: ViewModel;
  readonly weaponBar: WeaponBar;
  readonly deaths: DeathDirector;
  /** Called when the player picks a weapon they don't own yet (main wires this to the shop). */
  onLockedWeapon: (def: WeaponDef) => void = () => {};
  boss: Boss | null = null;
  themeDef: ThemeDef = office;
  faceProfile: FaceProfile | null = null;

  private outline: OutlineEffect;
  private theme: ThemeInstance | null = null;
  private themeBody: RAPIER.RigidBody | null = null;
  private surfaces = new Map<number, Surface | 'prop'>();
  private ceiling: RAPIER.Collider | null = null;
  private frameAim: Aim | null = null;
  private raycaster = new THREE.Raycaster();
  private acc = 0;
  private last = performance.now();
  time = 0;
  private hitstopT = 0;
  private timeScale = 1;
  private slowmoT = 0;
  private respawnT = -1;
  private preVel = new Map<number, THREE.Vector3>();
  private impactCooldown = 0;
  private running = true;
  private frameHandle = 0;

  private pointer = {
    x: 0,
    y: 0,
    ndc: new THREE.Vector2(),
    mode: 'none' as PointerMode,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pending: null as BossHit | null,
    inside: false,
  };

  static async create(canvas: HTMLCanvasElement, ui: HTMLElement): Promise<Game> {
    await initRapier();
    return new Game(canvas, ui);
  }

  private constructor(
    readonly canvas: HTMLCanvasElement,
    readonly ui: HTMLElement,
  ) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.outline = new OutlineEffect(r, { defaultThickness: 0.0035, defaultColor: [0.06, 0.05, 0.07] });
    const st = this.save.data.settings;
    audio.setVolume(st.volume);
    audio.setMuted(st.muted);
    this.fx.gore = st.gore;

    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.physics = new PhysicsWorld();
    for (const [handle, kind] of buildArenaColliders(this.physics)) {
      this.surfaces.set(handle, kind);
      if (kind === 'ceiling') this.ceiling = this.physics.world.getCollider(handle);
    }
    this.scene.add(this.rig.camera);
    this.scene.add(this.fx.group);
    this.quality = new QualityManager(this, st.quality, st.autoQuality, (q) => {
      this.save.data.settings.quality = q;
      this.save.save();
      this.hud?.toast(`Graphics lowered to ${q} for smoother play`);
    });
    this.setTheme(themeById(this.save.data.theme), false);

    this.hud = new Hud(ui);
    this.grab = new GrabController(this.physics, () => this.boss);
    const ctx: WeaponCtx = {
      scene: this.scene,
      rig: this.rig,
      physics: this.physics,
      sync: this.sync,
      fx: this.fx,
      boss: () => this.boss,
      hitBoss: (info) => this.hitBoss(info),
      raycastBoss: (ray, maxDist) => this.raycastBoss(ray, maxDist),
      partForCollider: (h) => this.boss?.ragdoll.byCollider.get(h)?.def.name ?? null,
      hitstop: (s) => this.hitstop(s),
      viewModel: (this.viewModel = new ViewModel(this.rig.camera)),
      now: () => this.time,
    };
    this.weapons = new WeaponSystem(ctx, WEAPONS.find((w) => w.id === this.save.data.weapon) ?? WEAPONS[0]);
    this.weaponBar = new WeaponBar(ui, {
      weapons: WEAPONS,
      isOwned: (d) => this.isOwned(d),
      onSelect: (d) => this.selectWeapon(d),
      onLocked: (d) => this.onLockedWeapon(d),
    });
    this.deaths = new DeathDirector({
      scene: this.scene,
      fx: this.fx,
      rig: this.rig,
      slowmo: (scale, s) => this.slowmo(scale, s),
      banner: (t) => this.hud.banner(t),
      setCeiling: (on) => this.ceiling?.setEnabled(on),
    });

    this.hud.setCoins(this.economy.coins, false);
    this.selectWeapon(this.weapons.current, false);
    this.spawnBoss();
    this.wireEvents();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- world

  isOwned(def: WeaponDef): boolean {
    return this.save.data.ownedWeapons.includes(def.id);
  }

  setTheme(def: ThemeDef, persist = true): void {
    if (this.theme) {
      this.scene.remove(this.theme.group);
      this.theme.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    }
    if (this.themeBody) {
      for (let i = 0; i < this.themeBody.numColliders(); i++) this.surfaces.delete(this.themeBody.collider(i).handle);
      this.physics.world.removeRigidBody(this.themeBody);
      this.themeBody = null;
    }
    this.themeDef = def;
    const inst = (this.theme = def.build());
    this.scene.add(inst.group);
    this.scene.background = inst.background;
    this.scene.fog = inst.fog ?? null;
    this.physics.setGravity(def.gravity ?? -9.81);
    this.fx.setGravityScale(-(def.gravity ?? -9.81) / 9.81);

    // Static colliders for big props.
    const body = (this.themeBody = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
    for (const b of inst.colliders) {
      const desc = RAPIER.ColliderDesc.cuboid(...b.half)
        .setTranslation(...b.pos)
        .setFriction(0.6)
        .setCollisionGroups(groups(G.ARENA, G.BOSS | G.WEAPON | G.PROJECTILE | G.PROP));
      if (b.rotY) desc.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rotY));
      const c = this.physics.world.createCollider(desc, body);
      this.surfaces.set(c.handle, 'prop');
    }
    this.fx.clearSplats();
    this.quality?.refreshShadowMaps();
    audio.setAmbience(def.id);
    if (persist) {
      this.save.data.theme = def.id;
      this.save.save();
      if (this.boss) this.spawnBoss();
    }
  }

  // ---------------------------------------------------------------- settings

  data(): SaveData {
    return this.save.data;
  }

  setGore(g: GoreMode): void {
    this.fx.gore = g;
    this.save.data.settings.gore = g;
    this.save.save();
  }

  setQuality(q: Quality, auto: boolean): void {
    this.quality.auto = auto;
    this.quality.apply(q);
    this.save.data.settings.quality = q;
    this.save.data.settings.autoQuality = auto;
    this.save.save();
  }

  setVolume(v: number): void {
    audio.setVolume(v);
    this.save.data.settings.volume = v;
    this.save.save();
  }

  setMuted(m: boolean): void {
    audio.setMuted(m);
    this.save.data.settings.muted = m;
    this.save.save();
  }

  /** Spend coins (shop). */
  spend(price: number): boolean {
    if (!this.economy.spend(price)) return false;
    this.save.data.coins = this.economy.coins;
    this.save.flush();
    this.hud.setCoins(this.economy.coins);
    return true;
  }

  unlockWeapon(id: string): void {
    if (!this.save.data.ownedWeapons.includes(id)) this.save.data.ownedWeapons.push(id);
    this.save.flush();
    this.weaponBar.render();
  }

  unlockTheme(id: string): void {
    if (!this.save.data.ownedThemes.includes(id)) this.save.data.ownedThemes.push(id);
    this.save.flush();
  }

  resetProgress(): void {
    this.save.reset();
    this.economy.coins = 0;
    this.hud.setCoins(0, false);
    this.selectWeapon(WEAPONS[0], false);
    this.setTheme(themeById(this.save.data.theme));
    this.weaponBar.render();
  }

  spawnBoss(): void {
    this.grab.release();
    if (this.boss) this.boss.dispose();
    this.fx.clearSpurts();
    this.deaths.reset();
    this.boss = new Boss(this.physics, this.scene, this.sync, this.events, this.fx, new THREE.Vector3(0, 0.02, 0), this.faceProfile);
    this.impactCooldown = 0;
    this.respawnT = -1;
    this.hud.setHp(1, false);
    this.events.emit('respawn', {});
  }

  // ---------------------------------------------------------------- combat plumbing

  hitBoss(info: HitInfo): HitResult | null {
    if (!this.boss) return null;
    return this.boss.hit(info);
  }

  raycastBoss(ray: THREE.Ray, maxDist = 50): BossHit | null {
    if (!this.boss) return null;
    this.raycaster.ray.copy(ray);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.boss.mesh.pickables(), true);
    for (const h of hits) {
      if (!(h.object instanceof THREE.Mesh) || !h.object.visible) continue;
      const part = this.boss.partOf(h.object);
      if (!part) continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : ray.direction.clone().negate();
      return { part, point: h.point.clone(), normal };
    }
    return null;
  }

  hitstop(seconds: number): void {
    this.hitstopT = Math.max(this.hitstopT, seconds);
  }

  slowmo(scale: number, seconds: number): void {
    this.timeScale = scale;
    this.slowmoT = seconds;
  }

  private wireEvents(): void {
    this.events.on('hit', ({ hit, result }) => {
      const earned = this.economy.onHit(result, this.time);
      const stats = this.save.data.stats;
      stats.hits++;
      stats.severs += result.severed.length;
      stats.bestCombo = Math.max(stats.bestCombo, this.economy.combo);
      this.save.data.coins = this.economy.coins;
      this.save.save();
      if (earned > 0) {
        this.hud.setCoins(this.economy.coins);
        const s = this.toScreen(hit.point);
        if (s) this.hud.popup(`+${earned}`, s.x, s.y, earned >= 25);
        if (earned >= 10) audio.play('coin', { intensity: 0.4 });
      }
      this.hud.setCombo(this.economy.combo, this.economy.multiplier);
      if (this.boss) this.hud.setHp(this.boss.damage.hpFraction, this.boss.dead);
    });
    this.events.on('death', ({ style, cause }) => {
      if (!this.boss) return;
      this.grab.release();
      this.hud.setHp(0, true);
      this.save.data.stats.kills++;
      this.save.save();
      if (this.themeDef.id === 'ring') audio.play('cheer', { intensity: 0.8 });
      this.respawnT = this.deaths.play(style, this.boss, cause);
    });
  }

  // ---------------------------------------------------------------- loop

  private frame(now: number): void {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    if (this.slowmoT > 0) {
      this.slowmoT -= realDt;
      if (this.slowmoT <= 0) this.timeScale = 1;
    }
    const scaledDt = realDt * this.timeScale;
    this.time += scaledDt;

    this.acc += realDt;
    let steps = 0;
    while (this.acc >= PHYSICS_DT && steps < 4) {
      this.acc -= PHYSICS_DT;
      steps++;
      if (this.hitstopT > 0) {
        this.hitstopT -= PHYSICS_DT;
        continue;
      }
      this.fixedStep(PHYSICS_DT * this.timeScale);
    }
    if (steps >= 4) this.acc = 0;
    this.sync.apply(this.hitstopT > 0 ? 1 : this.acc / PHYSICS_DT);

    // One aim raycast per frame, shared by held weapons and the view model.
    this.frameAim = null;
    if (this.pointer.mode === 'weapon' && this.weapons.isHolding) this.weapons.hold(this.currentAim(), scaledDt);
    if (this.viewModel.visible) this.viewModel.update(realDt, this.currentAim().point);
    this.deaths.update(scaledDt);

    this.boss?.update(scaledDt, this.time);
    this.weapons.update(scaledDt);
    this.fx.update(scaledDt);
    this.theme?.update?.(scaledDt, this.time);
    this.economy.tick(this.time);
    this.hud.setCombo(this.economy.combo, this.economy.multiplier);
    this.hud.update(realDt);

    if (this.boss) {
      if (this.boss.ragdoll.faceYaw !== this.rig.azimuth * 0.6) this.boss.ragdoll.faceYaw = this.rig.azimuth * 0.6;
      this.rig.follow(this.boss.ragdoll.position('pelvis'));
    }
    this.rig.update(realDt);

    if (this.respawnT > 0) {
      this.respawnT -= realDt;
      if (this.respawnT <= 0) this.spawnBoss();
    }
    this.quality.sample(realDt);
    if (this.outlineEnabled) this.outline.render(this.scene, this.rig.camera);
    else this.renderer.render(this.scene, this.rig.camera);
  }

  private fixedStep(dt: number): void {
    const boss = this.boss;
    if (boss) {
      for (const p of boss.ragdoll.parts.values()) {
        const v = p.body.linvel();
        const pv = this.preVel.get(p.collider.handle);
        if (pv) pv.set(v.x, v.y, v.z);
        else this.preVel.set(p.collider.handle, new THREE.Vector3(v.x, v.y, v.z));
      }
    }
    this.physics.step(dt);
    this.sync.capture();
    this.processImpacts(dt);
    this.weapons.afterStep();
  }

  /**
   * Turn hard collisions between the boss and the room into blunt damage. Only the strongest
   * impact per step counts (a body slam hits many limbs at once) with a short global cooldown.
   */
  private processImpacts(dt: number): void {
    const boss = this.boss;
    if (!boss) return;
    this.impactCooldown -= dt;
    let best: { part: PartRuntime; speed: number; surface: Surface | 'prop'; v: THREE.Vector3 } | null = null;
    for (const c of this.physics.contacts) {
      let partRt = boss.ragdoll.byCollider.get(c.h1);
      let other = c.h2;
      if (!partRt) {
        partRt = boss.ragdoll.byCollider.get(c.h2);
        other = c.h1;
      }
      if (!partRt) continue;
      const surface = this.surfaces.get(other);
      if (!surface) continue;
      const v = this.preVel.get(partRt.collider.handle);
      if (!v) continue;
      const speed = Math.abs(v.x * c.dirX + v.y * c.dirY + v.z * c.dirZ);
      if (!best || speed > best.speed) best = { part: partRt, speed, surface, v };
    }
    if (!best || best.speed < IMPACT_MIN_SPEED || this.impactCooldown > 0) return;
    this.impactCooldown = 0.12;

    const { part, speed, surface, v } = best;
    const name = part.def.name;
    const t = part.body.translation();
    const into = v.clone().normalize();
    const point = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(into, limbRadius(part.def));
    const normal = surface === 'floor' ? new THREE.Vector3(0, 1, 0) : into.clone().negate();
    const massFactor = 0.7 + part.def.mass / 25;
    const amount = Math.min(45, (speed - IMPACT_MIN_SPEED) * 3.2 * massFactor);
    boss.hit({ part: name, amount, type: 'blunt', point, dir: into, impulse: 0, source: 'wall' });

    const k = Math.min(1, (speed - IMPACT_MIN_SPEED) / 9);
    audio.play('thud', { intensity: 0.4 + k * 0.8 });
    if (speed > 9) audio.play('crunch', { intensity: k });
    this.fx.dustPuff(point, normal, this.themeDef.dust, 0.5 + k);
    if (speed > 8) this.fx.bleed(point, normal.clone().negate(), 8 + k * 20);
    if (speed > 7) this.fx.word(['SPLAT!', 'THUD!', 'CRUNCH!', 'WHAM!'][Math.floor(Math.random() * 4)], point, '#ffcc33', 0.5);
    this.rig.shake(0.15 + k * 0.5);
    if (speed > 8) this.hitstop(0.05);
    this.events.emit('impact', { part: name, point, speed, normal });
  }

  // ---------------------------------------------------------------- input

  private updatePointer(e: PointerEvent | WheelEvent | MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - rect.left;
    this.pointer.y = e.clientY - rect.top;
    this.pointer.ndc.set((this.pointer.x / rect.width) * 2 - 1, -(this.pointer.y / rect.height) * 2 + 1);
  }

  ray(): THREE.Ray {
    this.raycaster.setFromCamera(this.pointer.ndc, this.rig.camera);
    return this.raycaster.ray.clone();
  }

  /** Aim for this frame (cached). */
  private currentAim(): Aim {
    return (this.frameAim ??= this.aim());
  }

  aim(): Aim {
    const ray = this.ray();
    const hit = this.raycastBoss(ray);
    return { ray, hit, point: hit?.point ?? roomPoint(ray) };
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      audio.unlock();
      c.setPointerCapture(e.pointerId);
      this.updatePointer(e);
      this.pointer.startX = this.pointer.lastX = this.pointer.x;
      this.pointer.startY = this.pointer.lastY = this.pointer.y;
      const aim = this.aim();
      const grabButton = e.button === 2 || (e.button === 0 && e.shiftKey);
      if (grabButton) {
        if (aim.hit && this.startGrab(aim.hit)) return;
        this.pointer.mode = 'orbit';
        return;
      }
      if (e.button === 1) {
        this.pointer.mode = 'orbit';
        return;
      }
      if (e.button !== 0) return;
      if (!aim.hit && this.weapons.current.archetype === 'melee' && !e.ctrlKey) {
        this.pointer.mode = 'orbit';
        return;
      }
      if (this.weapons.current.id === 'fists' && aim.hit) {
        // Fists: tap to punch, drag to grab.
        this.pointer.mode = 'pending-grab';
        this.pointer.pending = aim.hit;
        return;
      }
      this.pointer.mode = 'weapon';
      this.weapons.down(aim);
    });
    c.addEventListener('pointermove', (e) => {
      this.updatePointer(e);
      const dx = this.pointer.x - this.pointer.lastX;
      const dy = this.pointer.y - this.pointer.lastY;
      this.pointer.lastX = this.pointer.x;
      this.pointer.lastY = this.pointer.y;
      switch (this.pointer.mode) {
        case 'orbit':
          this.rig.orbit(dx, dy);
          break;
        case 'pending-grab': {
          const moved = Math.hypot(this.pointer.x - this.pointer.startX, this.pointer.y - this.pointer.startY);
          if (moved > 8 && this.pointer.pending) this.startGrab(this.pointer.pending);
          break;
        }
        case 'grab':
          this.grab.aim(this.ray());
          break;
        case 'none': {
          // Hover feedback.
          const overBoss = !!this.raycastBoss(this.ray());
          c.classList.toggle('can-grab', overBoss && this.weapons.current.id === 'fists');
          break;
        }
      }
    });
    const end = (e: PointerEvent) => {
      this.updatePointer(e);
      if (this.pointer.mode === 'pending-grab' && this.pointer.pending) {
        this.weapons.down({ ray: this.ray(), hit: this.pointer.pending, point: this.pointer.pending.point });
        this.weapons.up();
      }
      if (this.pointer.mode === 'grab') {
        const part = this.grab.release();
        if (part) this.events.emit('release', { part });
        audio.play('whoosh', { intensity: 0.5 });
      }
      if (this.pointer.mode === 'weapon') this.weapons.up();
      this.pointer.mode = 'none';
      this.pointer.pending = null;
      c.classList.remove('grabbing');
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.pointer.mode === 'grab') this.grab.depth(-e.deltaY * 0.004);
        else this.rig.zoom(e.deltaY);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') this.spawnBoss();
      const n = Number(e.key);
      if (n >= 1 && n <= 9) this.selectWeaponIndex(n - 1);
      if (e.key === 'q' || e.key === 'Q') this.cycleWeapon(-1);
      if (e.key === 'e' || e.key === 'E') this.cycleWeapon(1);
    });
  }

  private startGrab(hit: BossHit): boolean {
    if (!this.grab.start(hit.part, hit.point, this.rig.camera)) return false;
    this.pointer.mode = 'grab';
    this.canvas.classList.add('grabbing');
    audio.play('squeak', { intensity: 0.3 });
    this.events.emit('grab', { part: hit.part });
    return true;
  }

  selectWeapon(def: WeaponDef, sound = true): void {
    if (!this.isOwned(def)) {
      this.onLockedWeapon(def);
      return;
    }
    this.weapons.select(def);
    this.weaponBar.setActive(def.id);
    this.canvas.classList.toggle('aiming', usesViewModel(def));
    this.save.data.weapon = def.id;
    this.save.save();
    if (sound) audio.play('click', { intensity: 0.4 });
  }

  selectWeaponIndex(i: number): void {
    const list = this.weaponBar.visible();
    if (list[i]) this.selectWeapon(list[i]);
  }

  cycleWeapon(dir: number): void {
    const list = this.weaponBar.visible().filter((w) => this.isOwned(w));
    if (!list.length) return;
    const i = list.indexOf(this.weapons.current);
    this.selectWeapon(list[(i + dir + list.length) % list.length]);
  }

  /** Put a user's face on the boss (null = default cartoon face) and spawn a fresh boss. */
  applyFace(profile: FaceProfile | null, persist = true): void {
    this.faceProfile = profile;
    if (persist) saveProfile(profile);
    this.spawnBoss();
    if (profile) {
      this.hud.banner('NEW BOSS!');
      this.boss?.ragdoll.setPose('taunt', 0.3, 2.2);
    }
  }

  hasFace(): boolean {
    return !!this.faceProfile;
  }

  /** Debug/test hook: kill the boss with a specific death style. */
  debugKill(style: DeathStyle): void {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    const cause: HitInfo = { part: 'chest', amount: 50, type: 'blunt', point: boss.ragdoll.position('chest'), dir: new THREE.Vector3(0, 0, -1), impulse: 0, source: 'debug' };
    if (style === 'decapitate') {
      boss.ragdoll.sever('head');
      boss.mesh.addStumps('head');
    }
    boss.forceKill(style, cause);
  }

  // ---------------------------------------------------------------- utils

  toScreen(p: THREE.Vector3): { x: number; y: number } | null {
    const v = p.clone().project(this.rig.camera);
    if (v.z > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.rig.resize(window.innerWidth / window.innerHeight);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.weapons.dispose();
    this.grab.dispose();
    this.boss?.dispose();
    this.physics.dispose();
    this.renderer.dispose();
  }
}
