import * as THREE from 'three';
import { blendExpression, NEUTRAL, type Expression, type FaceRig } from './Expression';
import type { BossMaterials } from './materials';

const R = 0.25;
/** Z of the head sphere surface at (x, y). */
const surfZ = (x: number, y: number) => Math.sqrt(Math.max(0, R * R - x * x - y * y));

interface Eye {
  root: THREE.Group;
  white: THREE.Mesh;
  pupil: THREE.Mesh;
  squint: THREE.Group;
  cross: THREE.Group;
  brow: THREE.Mesh;
  side: 1 | -1;
}

/** Default procedural cartoon face (eyes, brows, nose, moustache, mouth) with eased expressions. */
export class CartoonFace implements FaceRig {
  readonly group = new THREE.Group();
  target: Expression = { ...NEUTRAL };
  private cur: Expression = { ...NEUTRAL };
  private eyes: Eye[] = [];
  private mouth: THREE.Group;
  private mouthHole: THREE.Mesh;
  private teeth: THREE.Mesh;
  private blinkTimer = 2;
  private blink = 0;
  private geoms: THREE.BufferGeometry[] = [];

  constructor(m: BossMaterials) {
    const sphere = this.geo(new THREE.SphereGeometry(1, 20, 14));
    const box = this.geo(new THREE.BoxGeometry(1, 1, 1));

    for (const side of [1, -1] as const) {
      const x = 0.085 * side;
      const y = 0.045;
      const root = new THREE.Group();
      root.position.set(x, y, surfZ(x, y) - 0.022);
      const white = new THREE.Mesh(sphere, m.eyeWhite);
      white.scale.set(0.056, 0.068, 0.034);
      const pupil = new THREE.Mesh(sphere, m.pupil);
      pupil.scale.set(0.024, 0.028, 0.012);
      pupil.position.z = 0.03;
      root.add(white, pupil);

      // "> <" squeeze lines shown when eyes are screwed shut in pain.
      const squint = new THREE.Group();
      for (const s of [1, -1]) {
        const line = new THREE.Mesh(box, m.pupil);
        line.scale.set(0.06, 0.011, 0.01);
        line.position.set(0, 0.013 * s, 0.03);
        line.rotation.z = 0.38 * s * side;
        squint.add(line);
      }
      squint.visible = false;
      root.add(squint);

      const cross = new THREE.Group();
      for (const s of [1, -1]) {
        const line = new THREE.Mesh(box, m.pupil);
        line.scale.set(0.085, 0.016, 0.01);
        line.position.z = 0.032;
        line.rotation.z = 0.785 * s;
        cross.add(line);
      }
      cross.visible = false;
      root.add(cross);

      const brow = new THREE.Mesh(box, m.hair);
      brow.scale.set(0.085, 0.02, 0.02);
      const by = 0.125;
      brow.position.set(x, by, surfZ(x, by) + 0.004);
      this.group.add(root, brow);
      this.eyes.push({ root, white, pupil, squint, cross, brow, side });
    }

    const nose = new THREE.Mesh(sphere, m.skin);
    nose.scale.set(0.048, 0.042, 0.045);
    nose.position.set(0, -0.015, surfZ(0, -0.015) + 0.012);
    this.group.add(nose);

    for (const side of [1, -1]) {
      const stache = new THREE.Mesh(sphere, m.hair);
      stache.scale.set(0.058, 0.02, 0.022);
      const sx = 0.046 * side;
      const sy = -0.066;
      stache.position.set(sx, sy, surfZ(sx, sy) + 0.004);
      stache.rotation.z = -0.3 * side;
      this.group.add(stache);
    }

    this.mouth = new THREE.Group();
    const my = -0.125;
    this.mouth.position.set(0, my, surfZ(0, my) - 0.008);
    this.mouthHole = new THREE.Mesh(sphere, m.mouth);
    this.mouthHole.scale.set(0.06, 0.02, 0.02);
    this.teeth = new THREE.Mesh(box, m.teeth);
    this.teeth.scale.set(0.07, 0.016, 0.01);
    this.teeth.position.set(0, 0.008, 0.012);
    this.mouth.add(this.mouthHole, this.teeth);
    this.group.add(this.mouth);
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geoms.push(g);
    return g;
  }

  update(dt: number, time: number): void {
    blendExpression(this.cur, this.target, Math.min(1, dt * 12));
    const e = this.cur;

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);

    const squeeze = e.pain > 0.55 && !e.dead;
    const closed = Math.min(1, Math.max(e.eyesClosed, this.blink > 0.3 ? 1 : 0, e.pain * 0.6));
    for (const eye of this.eyes) {
      const open = 1 - closed * 0.92;
      eye.white.visible = !squeeze && !e.dead;
      eye.pupil.visible = eye.white.visible && open > 0.3;
      eye.white.scale.y = 0.068 * open;
      eye.squint.visible = squeeze;
      eye.cross.visible = e.dead;
      // Wide eyes when scared, pupils swirl when dizzy.
      const wide = 1 + Math.max(0, e.brows) * 0.25 - e.pain * 0.2;
      eye.white.scale.x = 0.056 * wide;
      const spin = time * 11 * eye.side;
      eye.pupil.position.x = Math.cos(spin) * 0.018 * e.dizzy;
      eye.pupil.position.y = Math.sin(spin) * 0.02 * e.dizzy;
      eye.pupil.scale.set(0.024 * (1 - e.pain * 0.4), 0.028 * (1 - e.pain * 0.4), 0.012);
      // Brows: angry = inner ends down, worried = inner ends up.
      const tilt = -e.brows * 0.45 + e.pain * 0.35;
      eye.brow.rotation.z = tilt * eye.side;
      eye.brow.position.y = 0.125 + e.brows * 0.012 + Math.max(0, e.dizzy) * 0.01 * Math.sin(time * 6);
    }

    const open = Math.max(e.mouthOpen, e.pain * 0.7, e.dead ? 0.35 : 0);
    this.mouthHole.scale.set(0.06 + open * 0.012 - e.smirk * 0.01, 0.018 + open * 0.05, 0.02);
    this.teeth.visible = open > 0.25 || e.smirk > 0.4;
    this.teeth.position.y = 0.008 + open * 0.035;
    this.mouth.rotation.z = e.smirk * 0.3 + (e.dead ? 0.15 : 0) + e.dizzy * 0.15 * Math.sin(time * 4);
    this.mouth.position.x = e.smirk * 0.02;
  }

  dispose(): void {
    this.geoms.forEach((g) => g.dispose());
  }
}
