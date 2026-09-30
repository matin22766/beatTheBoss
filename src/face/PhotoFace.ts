import * as THREE from 'three';
import { FACE_TRIANGLES, FACE_UVS } from './canonicalFace';
import { BROW_L, BROW_R, EYE_L, EYE_R, INNER_LIPS, MOUTH, NOSE_TIP } from './regions';
import { VERTS, type FaceData } from './FaceBuilder';
import { blendExpression, NEUTRAL, type Expression, type FaceRig } from '../character/Expression';
import { toonGradient } from '../character/materials';

type Vec = [number, number, number];

/** A displacement field: per-vertex weight × a direction (or a per-vertex vector). */
interface Channel {
  disp: Float32Array; // VERTS * 3
}

const LOWER_INNER_LIP = [14, 87, 178, 88, 95, 317, 402, 318, 324];

/**
 * The user's face as a deformable 3D mesh mounted on the boss's head. Expressions are procedural
 * displacement fields built from landmark regions, so the photo itself squints, gapes and frowns.
 */
export class PhotoFace implements FaceRig {
  readonly group = new THREE.Group();
  target: Expression = { ...NEUTRAL };
  readonly materials: THREE.MeshToonMaterial[];
  private cur: Expression = { ...NEUTRAL };
  private geo: THREE.BufferGeometry;
  private rest = new Float32Array(VERTS * 3);
  private user: Float32Array;
  private neutral: Float32Array;
  private morph = 1;
  private display: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private textureAlpha = 1;
  private channels: Record<'jaw' | 'lids' | 'lidR' | 'lidL' | 'browInner' | 'browOuter' | 'smirk' | 'stretch' | 'sneer', Channel>;
  private blinkTimer = 2;
  private blink = 0;
  private xEyes = new THREE.Group();
  private spirals = new THREE.Group();
  private cavity: THREE.MeshToonMaterial;

  constructor(private readonly data: FaceData) {
    this.user = data.positions;
    this.neutral = data.neutral;
    this.rest.set(this.user);

    this.display = document.createElement('canvas');
    this.display.width = data.texture.width;
    this.display.height = data.texture.height;
    this.displayCtx = this.display.getContext('2d')!;
    this.displayCtx.drawImage(data.texture, 0, 0);
    this.texture = new THREE.CanvasTexture(this.display);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const skinMat = new THREE.MeshToonMaterial({ map: this.texture, gradientMap: toonGradient(), transparent: true, alphaTest: 0.01 });
    // The mouth keeps the photo (teeth, smile) and darkens into a cavity as the jaw opens.
    this.cavity = new THREE.MeshToonMaterial({ map: this.texture, gradientMap: toonGradient() });
    for (const m of [skinMat, this.cavity]) m.userData.outlineParameters = { visible: false };
    this.materials = [skinMat, this.cavity];

    // Split triangles into skin and mouth cavity (triangles made only of inner-lip vertices).
    const lips = new Set(INNER_LIPS);
    const skinIdx: number[] = [];
    const cavIdx: number[] = [];
    for (let t = 0; t < FACE_TRIANGLES.length; t += 3) {
      const a = FACE_TRIANGLES[t];
      const b = FACE_TRIANGLES[t + 1];
      const c = FACE_TRIANGLES[t + 2];
      (lips.has(a) && lips.has(b) && lips.has(c) ? cavIdx : skinIdx).push(a, b, c);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.rest), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(FACE_UVS, 2));
    this.geo.setIndex([...skinIdx, ...cavIdx]);
    this.geo.addGroup(0, skinIdx.length, 0);
    this.geo.addGroup(skinIdx.length, cavIdx.length, 1);
    this.geo.computeVertexNormals();
    const mesh = new THREE.Mesh(this.geo, this.materials);
    // Sits millimetres above the skull: casting shadows would paint a dark ring onto it.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);

    this.channels = this.buildChannels(this.user);
    this.buildOverlays();
  }

  // ------------------------------------------------------------------ expression fields

  private p(i: number, src = this.user): Vec {
    return [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]];
  }

  private falloff(center: Vec, radius: number, dir: Vec, out: Float32Array, src = this.user, scale = 1): void {
    for (let i = 0; i < VERTS; i++) {
      const dx = src[i * 3] - center[0];
      const dy = src[i * 3 + 1] - center[1];
      const dz = src[i * 3 + 2] - center[2];
      const d2 = (dx * dx + dy * dy + dz * dz) / (radius * radius);
      if (d2 > 4) continue;
      const w = Math.exp(-d2 * 1.5) * scale;
      out[i * 3] += dir[0] * w;
      out[i * 3 + 1] += dir[1] * w;
      out[i * 3 + 2] += dir[2] * w;
    }
  }

  private buildChannels(u: Float32Array): PhotoFace['channels'] {
    const mk = () => ({ disp: new Float32Array(VERTS * 3) });
    const ch = {
      jaw: mk(),
      lids: mk(),
      lidR: mk(),
      lidL: mk(),
      browInner: mk(),
      browOuter: mk(),
      smirk: mk(),
      stretch: mk(),
      sneer: mk(),
    };
    const upper = this.p(MOUTH.upperInner);
    const lower = this.p(MOUTH.lowerInner);
    const chin = this.p(MOUTH.chin);
    const mouthY = (upper[1] + lower[1]) / 2;
    const mouthX = (upper[0] + lower[0]) / 2;
    const jawSpan = Math.max(0.02, mouthY - chin[1]);
    const halfW = Math.abs(this.p(MOUTH.cornerL)[0] - this.p(MOUTH.cornerR)[0]) * 1.4;
    const lowerLip = new Set(LOWER_INNER_LIP);
    // Jaw: everything below the lip line drops, fading out toward the cheeks.
    for (let i = 0; i < VERTS; i++) {
      const y = u[i * 3 + 1];
      const x = u[i * 3];
      let w = lowerLip.has(i) ? 1 : y < mouthY ? Math.min(1, Math.sqrt((mouthY - y) / jawSpan) * 1.1) : 0;
      const hx = (x - mouthX) / halfW;
      w *= Math.max(0, 1 - hx * hx * 0.6);
      if (y < mouthY - jawSpan * 1.3) w *= 0.8;
      ch.jaw.disp[i * 3 + 1] = -0.026 * w;
      ch.jaw.disp[i * 3 + 2] = -0.006 * w;
    }
    // Eyelids: upper lid vertices travel to their lower-lid partners.
    for (const [eye, target] of [
      [EYE_R, ch.lidR],
      [EYE_L, ch.lidL],
    ] as const) {
      eye.upper.forEach((ui, k) => {
        const li = eye.lower[k];
        for (let a = 0; a < 3; a++) {
          const d = (u[li * 3 + a] - u[ui * 3 + a]) * 0.92;
          target.disp[ui * 3 + a] = d;
          ch.lids.disp[ui * 3 + a] = d;
        }
      });
      // Lower lid rises a touch too for a proper squeeze.
      eye.lower.forEach((li) => {
        target.disp[li * 3 + 1] += 0.001;
        ch.lids.disp[li * 3 + 1] += 0.001;
      });
    }
    // Brows (inner / outer), with soft falloff onto the forehead.
    for (const brow of [BROW_R, BROW_L]) {
      for (const i of brow.inner) this.falloff(this.p(i), 0.012, [0, 0.011, 0.001], ch.browInner.disp, u, 1 / brow.inner.length);
      for (const i of brow.outer) this.falloff(this.p(i), 0.014, [0, 0.009, 0], ch.browOuter.disp, u, 1 / brow.outer.length);
    }
    // Smirk: the person's left mouth corner curls up and out.
    this.falloff(this.p(MOUTH.cornerL), 0.022, [0.006, 0.012, 0.002], ch.smirk.disp, u);
    // Grimace: corners pulled sideways and down.
    this.falloff(this.p(MOUTH.cornerL), 0.02, [0.008, -0.006, 0], ch.stretch.disp, u);
    this.falloff(this.p(MOUTH.cornerR), 0.02, [-0.008, -0.006, 0], ch.stretch.disp, u);
    // Sneer: nose wrinkles up.
    this.falloff(this.p(NOSE_TIP), 0.02, [0, 0.005, 0.002], ch.sneer.disp, u);
    return ch;
  }

  private buildOverlays(): void {
    const ink = new THREE.MeshBasicMaterial({ color: 0x111111 });
    ink.userData.outlineParameters = { visible: false };
    for (const eye of [EYE_R, EYE_L]) {
      const c = this.eyeCenter(eye);
      const n = new THREE.Vector3(...c).normalize();
      // X eyes.
      const x = new THREE.Group();
      for (const r of [0.785, -0.785]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.004), ink);
        bar.rotation.z = r;
        x.add(bar);
      }
      x.position.set(...c).addScaledVector(n, 0.012);
      x.lookAt(new THREE.Vector3(...c).addScaledVector(n, 1));
      this.xEyes.add(x);
      // Dizzy spirals.
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 48; k++) {
        const t = k / 48;
        const a = t * Math.PI * 5;
        pts.push(new THREE.Vector3(Math.cos(a) * (0.002 + t * 0.02), Math.sin(a) * (0.002 + t * 0.02), 0));
      }
      const s = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.0022, 5), ink);
      s.position.copy(x.position);
      s.quaternion.copy(x.quaternion);
      this.spirals.add(s);
    }
    this.xEyes.visible = false;
    this.spirals.visible = false;
    this.group.add(this.xEyes, this.spirals);
  }

  private eyeCenter(eye: typeof EYE_R): Vec {
    const ids = [eye.outer, eye.inner, ...eye.upper, ...eye.lower];
    const c: Vec = [0, 0, 0];
    for (const i of ids) for (let a = 0; a < 3; a++) c[a] += this.user[i * 3 + a] / ids.length;
    return c;
  }

  // ------------------------------------------------------------------ morph (loader animation)

  /** 0 = neutral canonical face with plain skin, 1 = the user's face. */
  setMorph(t: number, textureAlpha = t): void {
    this.morph = t;
    const e = t * t * (3 - 2 * t);
    for (let i = 0; i < this.rest.length; i++) this.rest[i] = this.neutral[i] + (this.user[i] - this.neutral[i]) * e;
    if (textureAlpha !== this.textureAlpha) {
      this.textureAlpha = textureAlpha;
      const ctx = this.displayCtx;
      ctx.clearRect(0, 0, this.display.width, this.display.height);
      ctx.globalAlpha = Math.max(0, Math.min(1, textureAlpha));
      ctx.drawImage(this.data.texture, 0, 0);
      ctx.globalAlpha = 1;
      this.texture.needsUpdate = true;
    }
  }

  get morphAmount(): number {
    return this.morph;
  }

  // ------------------------------------------------------------------ per-frame

  update(dt: number, time: number): void {
    blendExpression(this.cur, this.target, Math.min(1, dt * 12));
    const e = this.cur;
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);

    const dead = e.dead;
    const lids = dead ? 1 : Math.min(1, Math.max(e.eyesClosed, this.blink > 0.3 ? 1 : 0, e.pain * 0.75));
    const jaw = Math.min(1, Math.max(e.mouthOpen, e.pain * 0.55, dead ? 0.45 : 0) + e.dizzy * 0.2 * (0.5 + 0.5 * Math.sin(time * 3)));
    const browsIn = -e.brows * 0.9 - e.pain * 0.8;
    const browsOut = e.brows * 0.4 + e.pain * 0.2;
    const w = {
      jaw,
      lids,
      lidR: 0,
      lidL: 0,
      browInner: browsIn,
      browOuter: browsOut,
      smirk: e.smirk,
      stretch: e.pain * 0.9,
      sneer: e.pain * 0.8,
    };
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    arr.set(this.rest);
    for (const [k, v] of Object.entries(w) as Array<[keyof PhotoFace['channels'], number]>) {
      if (Math.abs(v) < 1e-3) continue;
      const d = this.channels[k].disp;
      for (let i = 0; i < arr.length; i++) arr[i] += d[i] * v;
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    const dark = Math.min(1, jaw * 1.6);
    this.cavity.color.setRGB(1 - dark * 0.8, 1 - dark * 0.92, 1 - dark * 0.9);

    this.xEyes.visible = dead;
    this.spirals.visible = !dead && e.dizzy > 0.35;
    if (this.spirals.visible) this.spirals.children.forEach((s, i) => (s.rotation.z = time * 8 * (i ? -1 : 1)));
  }

  dispose(): void {
    this.geo.dispose();
    this.texture.dispose();
    this.materials.forEach((m) => m.dispose());
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== this.geo) o.geometry.dispose();
    });
  }
}
