import * as THREE from 'three';
import type { BossMaterials } from '../character/materials';

/** A flattened cartoon boss lying spread-eagled on the floor (anvil death). Head points to −Z. */
export function buildPancake(m: BossMaterials, withHead: boolean): THREE.Group {
  const g = new THREE.Group();
  const T = 0.025;
  const flat = (w: number, d: number, mat: THREE.Material, x: number, z: number, rotY = 0, y = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, T, d), mat);
    b.position.set(x, T / 2 + y, z);
    b.rotation.y = rotY;
    b.receiveShadow = true;
    g.add(b);
    return b;
  };
  const disc = (r: number, mat: THREE.Material, x: number, z: number, sx = 1, sz = 1, y = 0) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, T, 28), mat);
    d.position.set(x, T / 2 + y, z);
    d.scale.set(sx, 1, sz);
    d.receiveShadow = true;
    g.add(d);
    return d;
  };

  // Legs and shoes.
  for (const s of [-1, 1]) {
    flat(0.2, 0.62, m.pants, s * 0.2, 0.55, s * 0.35);
    disc(0.1, m.shoe, s * 0.33, 0.86, 1.1, 1.5, 0.004);
  }
  // Arms and hands, flung out.
  for (const s of [-1, 1]) {
    flat(0.16, 0.56, m.suit, s * 0.42, -0.28, s * -1.0);
    disc(0.09, m.skin, s * 0.66, -0.5, 1, 1, 0.004);
  }
  // Torso with shirt and tie.
  flat(0.6, 0.66, m.suit, 0, 0);
  flat(0.18, 0.28, m.shirt, 0, -0.2, 0, 0.004);
  flat(0.06, 0.34, m.tie, 0, -0.12, 0, 0.008);
  flat(0.62, 0.05, m.shoe, 0, 0.26, 0, 0.004);

  if (withHead) {
    disc(0.36, m.skin, 0, -0.66, 1.1, 1);
    for (const s of [-1, 1]) disc(0.07, m.skin, s * 0.4, -0.66, 0.5, 1);
    // X eyes.
    for (const s of [-1, 1]) {
      for (const r of [0.785, -0.785]) {
        const x = flat(0.12, 0.022, m.pupil, s * 0.12, -0.74, r, 0.006);
        x.castShadow = false;
      }
    }
    disc(0.07, m.mouth, 0, -0.5, 1.3, 0.7, 0.006);
    for (const s of [-1, 1]) {
      const st = disc(0.05, m.hair, s * 0.05, -0.58, 1.4, 0.5, 0.008);
      st.rotation.y = s * 0.3;
    }
    disc(0.36, m.hair, 0, -0.66, 1.12, 1.02, -0.003).scale.set(1.12, 1, 1.02);
  }
  return g;
}
