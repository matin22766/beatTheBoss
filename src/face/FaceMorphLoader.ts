import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { BossMesh } from '../character/BossMesh';
import { RAGDOLL } from '../character/RagdollDef';
import { PALETTE } from '../character/materials';
import { FACE_TRIANGLES } from './canonicalFace';
import { FACE_OVAL } from './regions';
import { loadLandmarker, scanFace, type Landmark } from './FaceScanner';
import { buildFace, type FaceData } from './FaceBuilder';
import { PhotoFace } from './PhotoFace';
import { audio } from '../audio/AudioEngine';

export const STEPS = [
  'Waking up the face AI',
  'Scanning the photo',
  'Mapping 478 landmarks',
  'Weaving a 3D face mesh',
  'Peeling the face off',
  'Morphing the boss',
] as const;

export interface LoaderCallbacks {
  onStep(index: number, state: 'active' | 'done'): void;
  onProgress(fraction: number): void;
}

type Phase = 'idle' | 'scan' | 'dots' | 'mesh' | 'peel' | 'done';

const ease = (t: number) => t * t * (3 - 2 * t);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * The animated face-swap loader: a 2D panel shows the photo being scanned, landmarked and meshed,
 * while a 3D panel shows the face peeling off the photo and morphing onto the boss. Each stage is
 * tied to real work (model load, detection, mesh/texture build).
 */
export class FaceMorphLoader {
  readonly photoCanvas: HTMLCanvasElement;
  readonly previewCanvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private outline: OutlineEffect;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  private boss = new BossMesh();
  private bossRoot = new THREE.Group();
  private headFace: PhotoFace | null = null;
  private floating: PhotoFace | null = null;
  private floatGroup = new THREE.Group();
  private phase: Phase = 'idle';
  private phaseT = 0;
  private landmarks: Landmark[] | null = null;
  private image: HTMLCanvasElement | null = null;
  private fit = { x: 0, y: 0, s: 1 };
  private running = true;
  private last = performance.now();
  private time = 0;
  private spin = 0;
  private sparkles: THREE.Points;
  private skinFrom = new THREE.Color(PALETTE.skin);
  data: FaceData | null = null;

  constructor(size = 340) {
    this.photoCanvas = document.createElement('canvas');
    this.photoCanvas.width = this.photoCanvas.height = size * 2;
    this.photoCanvas.className = 'fl-photo';
    this.ctx2d = this.photoCanvas.getContext('2d')!;

    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.className = 'fl-3d';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.previewCanvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(size, size, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.outline = new OutlineEffect(this.renderer, { defaultThickness: 0.004 });

    // Pose the boss in bind pose and frame his head and shoulders.
    for (const def of RAGDOLL) {
      const g = this.boss.parts.get(def.name)!;
      g.position.set(...def.pos);
      this.bossRoot.add(g);
    }
    this.scene.add(this.bossRoot, this.floatGroup);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x60584f, 1.3));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
    key.position.set(1.5, 3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ecbff, 1.2);
    rim.position.set(-2, 2, -2);
    this.scene.add(rim);
    this.camera.position.set(0, 1.78, 2.3);
    this.camera.lookAt(0, 1.72, 0);

    const pts = new Float32Array(120 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.sparkles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7ff6ff, size: 0.02, transparent: true, opacity: 0 }));
    this.scene.add(this.sparkles);

    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
    };
    requestAnimationFrame(loop);
  }

  /** Run the whole pipeline on an image. Resolves with the built face (or throws a FaceScanError). */
  async run(image: HTMLCanvasElement, cb: LoaderCallbacks): Promise<FaceData> {
    this.image = image;
    const W = this.photoCanvas.width;
    const k = Math.min(W / image.width, W / image.height);
    this.fit = { s: k, x: (W - image.width * k) / 2, y: (W - image.height * k) / 2 };

    const step = async (i: number, work: () => Promise<void>) => {
      cb.onStep(i, 'active');
      await work();
      cb.onStep(i, 'done');
      cb.onProgress((i + 1) / STEPS.length);
      audio.play('pop', { intensity: 0.3, pitch: 1 + i * 0.12 });
    };

    this.setPhase('scan');
    await step(0, async () => {
      await Promise.all([loadLandmarker(), this.wait(0.6)]);
    });
    await step(1, async () => {
      await nextFrame();
      const [res] = await Promise.all([scanFace(image), this.wait(0.9)]);
      this.landmarks = res.landmarks;
    });
    await step(2, async () => {
      this.setPhase('dots');
      await this.wait(1.1);
    });
    await step(3, async () => {
      this.setPhase('mesh');
      await nextFrame();
      const t0 = performance.now();
      this.data = buildFace(image, this.landmarks!);
      await this.wait(Math.max(0.3, 1.1 - (performance.now() - t0) / 1000));
    });
    await step(4, async () => {
      this.setPhase('peel');
      this.startPeel();
      await this.wait(1.4);
    });
    await step(5, async () => {
      await this.morphOntoBoss(1.8);
    });
    this.setPhase('done');
    return this.data!;
  }

  get scannedLandmarks(): Landmark[] {
    return this.landmarks ?? [];
  }

  /** Try hair colour choices live in the preview. */
  setHair(color: string | null): void {
    this.boss.setHairColor(color);
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((r) => setTimeout(r, seconds * 1000));
  }

  private toCanvas(l: Landmark): [number, number] {
    return [this.fit.x + l.x * this.image!.width * this.fit.s, this.fit.y + l.y * this.image!.height * this.fit.s];
  }

  // ------------------------------------------------------------------ 3D stages

  private startPeel(): void {
    if (!this.data) return;
    this.floating = new PhotoFace(this.data);
    this.floatGroup.add(this.floating.group);
    // Begin flat and large, as if still printed on the photo, in front of the camera.
    this.floatGroup.position.set(0, 1.76, 1.2);
    this.floatGroup.scale.set(1.7, 1.7, 0.02);
    this.floatGroup.rotation.set(0, 0, 0);
    audio.play('whoosh', { intensity: 0.5, pitch: 1.3 });
  }

  private async morphOntoBoss(seconds: number): Promise<void> {
    if (!this.data) return;
    // The floating face sinks into the head and cross-fades into the boss's morphing face.
    this.headFace = new PhotoFace(this.data);
    this.headFace.setMorph(0, 0);
    this.boss.setFace(this.headFace, false);
    this.boss.setHairColor(this.data.hair);
    const skinTo = new THREE.Color(this.data.skin);
    (this.sparkles.material as THREE.PointsMaterial).opacity = 1;
    audio.play('twinkle', { intensity: 0.6 });
    const start = performance.now();
    while (true) {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      const e = ease(t);
      this.headFace.setMorph(e, Math.min(1, t * 1.4));
      this.floating?.setMorph(1, Math.max(0, 1 - t * 2.5));
      this.boss.setSkinColor(this.skinFrom.clone().lerp(skinTo, e));
      (this.sparkles.material as THREE.PointsMaterial).opacity = Math.sin(t * Math.PI);
      if (t >= 1) break;
      await nextFrame();
    }
    if (this.floating) {
      this.floatGroup.remove(this.floating.group);
      this.floating.dispose();
      this.floating = null;
    }
  }

  // ------------------------------------------------------------------ per-frame

  private tick(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    this.draw2d();

    // Turntable + reaction faces once done.
    this.spin += dt;
    this.bossRoot.rotation.y = Math.sin(this.spin * 0.8) * 0.45;
    if (this.headFace && this.phase === 'done') {
      const cycle = Math.floor(this.time / 1.6) % 4;
      this.headFace.target = {
        pain: cycle === 1 ? 1 : 0,
        mouthOpen: cycle === 2 ? 1 : 0,
        eyesClosed: 0,
        brows: cycle === 3 ? -1 : cycle === 1 ? 0.5 : 0,
        dizzy: 0,
        smirk: cycle === 0 ? 1 : 0,
        dead: false,
      };
    }
    this.boss.face.update(dt, this.time);

    if (this.floating && this.phase === 'peel') {
      const t = Math.min(1, this.phaseT / 1.3);
      const e = ease(t);
      // Inflate from flat to 3D, wobble, then fly back onto the head.
      const lift = ease(Math.min(1, t * 1.8));
      this.floatGroup.scale.set(1.7 - 0.7 * e, 1.7 - 0.7 * e, 0.02 + 0.98 * lift);
      this.floatGroup.rotation.y = Math.sin(t * Math.PI * 2) * 0.5 * (1 - t);
      this.floatGroup.rotation.x = Math.sin(t * Math.PI) * -0.25;
      this.floatGroup.position.set(0, 1.76 + Math.sin(t * Math.PI) * 0.08 + 0.12 * e, 1.2 - 1.2 * e);
      this.floating.update(dt, this.time);
      // Match the head's turntable rotation at the end so the hand-off is seamless.
      this.floatGroup.rotation.y += this.bossRoot.rotation.y * e;
    }

    // Sparkles orbit the head during the morph.
    const pos = this.sparkles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = this.time * 2 + i * 0.52;
      const r = 0.32 + 0.05 * Math.sin(i * 1.7 + this.time * 3);
      pos.setXYZ(i, Math.cos(a) * r, 1.88 + Math.sin(i * 0.9 + this.time * 2) * 0.25, Math.sin(a) * r);
    }
    pos.needsUpdate = true;

    this.outline.render(this.scene, this.camera);
  }

  private draw2d(): void {
    const ctx = this.ctx2d;
    const W = this.photoCanvas.width;
    ctx.fillStyle = '#0d0e14';
    ctx.fillRect(0, 0, W, W);
    if (!this.image) return;
    const { x, y, s } = this.fit;
    ctx.drawImage(this.image, x, y, this.image.width * s, this.image.height * s);
    const t = this.phaseT;
    const lm = this.landmarks;

    // Scan line and grid while scanning (and faintly afterwards).
    if (this.phase === 'scan' || this.phase === 'dots') {
      ctx.fillStyle = 'rgba(10, 30, 40, 0.35)';
      ctx.fillRect(0, 0, W, W);
      ctx.strokeStyle = 'rgba(80, 230, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let g = 0; g < W; g += 32) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, W);
        ctx.moveTo(0, g);
        ctx.lineTo(W, g);
        ctx.stroke();
      }
      const sy = ((Math.sin(this.time * 2.4) + 1) / 2) * W;
      const grad = ctx.createLinearGradient(0, sy - 40, 0, sy + 4);
      grad.addColorStop(0, 'rgba(80, 230, 255, 0)');
      grad.addColorStop(1, 'rgba(80, 230, 255, 0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, sy - 40, W, 44);
      ctx.fillStyle = 'rgba(160, 250, 255, 0.9)';
      ctx.fillRect(0, sy, W, 3);
    }
    if (!lm) return;

    const faceAlpha = this.phase === 'peel' || this.phase === 'done' ? Math.max(0, 1 - t * 1.2) : 1;
    if (this.phase === 'dots' || this.phase === 'mesh' || this.phase === 'peel') {
      // Wireframe mesh, woven in triangle by triangle.
      const triFrac = this.phase === 'dots' ? 0 : this.phase === 'mesh' ? Math.min(1, t / 0.9) : 1;
      const n = Math.floor((FACE_TRIANGLES.length / 3) * triFrac);
      ctx.strokeStyle = `rgba(90, 235, 255, ${0.45 * faceAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const [a, b, c] = [FACE_TRIANGLES[i * 3], FACE_TRIANGLES[i * 3 + 1], FACE_TRIANGLES[i * 3 + 2]].map((k) => this.toCanvas(lm[k]));
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.lineTo(...c);
        ctx.closePath();
      }
      ctx.stroke();
      // Landmark dots pop in.
      const dotFrac = this.phase === 'dots' ? Math.min(1, t / 1) : 1;
      const count = Math.floor(lm.length * dotFrac);
      for (let i = 0; i < count; i++) {
        const [px, py] = this.toCanvas(lm[i]);
        const fresh = this.phase === 'dots' && i > count - 25;
        ctx.fillStyle = fresh ? `rgba(255,255,255,${faceAlpha})` : `rgba(120, 245, 255, ${0.9 * faceAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, fresh ? 3.2 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.phase === 'peel' || this.phase === 'done') {
      // The face has left the photo: leave a glowing hole where it was.
      ctx.save();
      ctx.beginPath();
      FACE_OVAL.forEach((i, k) => {
        const [px, py] = this.toCanvas(lm[i]);
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = `rgba(13, 14, 20, ${Math.min(0.92, t * 1.5)})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 235, 255, 0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  dispose(): void {
    this.running = false;
    this.floating?.dispose();
    this.boss.dispose();
    this.renderer.dispose();
  }
}
