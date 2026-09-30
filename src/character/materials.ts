import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 4-step ramp for cel shading. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 160, 160, 160, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

/** Outline thickness for the OutlineEffect (inverted hull). */
export function setOutline(mat: THREE.Material, thickness: number, visible = true): void {
  mat.userData.outlineParameters = { thickness, color: [0.05, 0.04, 0.06], alpha: 1, visible };
}

export const PALETTE = {
  skin: 0xf2c49b,
  skinShade: 0xd99a74,
  suit: 0x2c3e66,
  shirt: 0xf4f4f0,
  tie: 0xc0392b,
  pants: 0x2a2f3d,
  shoe: 0x1c1a1a,
  hair: 0x4a3426,
  eyeWhite: 0xffffff,
  pupil: 0x141414,
  mouth: 0x5a1717,
  teeth: 0xfafafa,
  meat: 0xb3202a,
  bone: 0xf3ead7,
  bruise: 0x6b3a7a,
};

export interface BossMaterials {
  skin: THREE.MeshToonMaterial;
  suit: THREE.MeshToonMaterial;
  shirt: THREE.MeshToonMaterial;
  tie: THREE.MeshToonMaterial;
  pants: THREE.MeshToonMaterial;
  shoe: THREE.MeshToonMaterial;
  hair: THREE.MeshToonMaterial;
  eyeWhite: THREE.MeshToonMaterial;
  pupil: THREE.MeshBasicMaterial;
  mouth: THREE.MeshToonMaterial;
  teeth: THREE.MeshToonMaterial;
  meat: THREE.MeshToonMaterial;
  bone: THREE.MeshToonMaterial;
  gold: THREE.MeshToonMaterial;
}

/** A fresh material set per boss so death effects (charring, freezing) can recolour it. */
export function createBossMaterials(): BossMaterials {
  const m: BossMaterials = {
    skin: toon(PALETTE.skin),
    suit: toon(PALETTE.suit),
    shirt: toon(PALETTE.shirt),
    tie: toon(PALETTE.tie),
    pants: toon(PALETTE.pants),
    shoe: toon(PALETTE.shoe),
    hair: toon(PALETTE.hair),
    eyeWhite: toon(PALETTE.eyeWhite),
    pupil: new THREE.MeshBasicMaterial({ color: PALETTE.pupil }),
    mouth: toon(PALETTE.mouth),
    teeth: toon(PALETTE.teeth),
    meat: toon(PALETTE.meat),
    bone: toon(PALETTE.bone),
    gold: toon(0xd4a82a),
  };
  for (const mat of Object.values(m)) setOutline(mat, 0.006);
  setOutline(m.pupil, 0, false);
  setOutline(m.mouth, 0.003);
  setOutline(m.teeth, 0, false);
  return m;
}
