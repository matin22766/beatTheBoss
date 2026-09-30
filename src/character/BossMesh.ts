import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RAGDOLL, getPartDef, type PartDef, type PartName } from './RagdollDef';
import { createBossMaterials, type BossMaterials } from './materials';
import { CartoonFace } from './CartoonFace';
import type { FaceRig } from './Expression';
import { buildSkeleton } from './Skeleton';

const CHAR = new THREE.Color(0x1d1612);
const ICE = new THREE.Color(0xa8dcff);
const XRAY = new THREE.MeshBasicMaterial({ color: 0x5ec8ff, transparent: true, opacity: 0.22, depthWrite: false });
XRAY.userData.outlineParameters = { visible: false };
XRAY.userData.shared = true;

/**
 * Procedural cartoon office boss: one Group per ragdoll part, in that body's local frame.
 * Groups live directly in the scene and are driven by BodySync.
 */
export class BossMesh {
  readonly parts = new Map<PartName, THREE.Group>();
  readonly materials: BossMaterials;
  face: FaceRig;
  /** Head-local group the face rig is mounted in (swappable for the photo face). */
  readonly faceMount = new THREE.Group();
  readonly headShell: THREE.Mesh;
  private readonly geoms: THREE.BufferGeometry[] = [];
  private readonly decals = new Map<PartName, THREE.Object3D[]>();
  private skeleton: THREE.Object3D[] = [];
  private xray = false;
  private savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private baseColors = new Map<THREE.MeshToonMaterial, THREE.Color>();
  /** 0..1 charring, 0..1 frost, 0..1 electric glow. */
  readonly tint = { char: 0, frost: 0, glow: 0 };

  constructor() {
    const m = (this.materials = createBossMaterials());
    const g = <T extends THREE.BufferGeometry>(geo: T) => (this.geoms.push(geo), geo);
    const sphere = g(new THREE.SphereGeometry(1, 24, 16));

    for (const def of RAGDOLL) {
      const group = new THREE.Group();
      group.name = def.name;
      this.parts.set(def.name, group);
      this.decals.set(def.name, []);
    }
    const add = (part: PartName, mesh: THREE.Mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.part = part;
      this.parts.get(part)!.add(mesh);
      return mesh;
    };
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(geo, mat);

    // --- Pelvis: trousers + belt ---
    add('pelvis', mesh(g(new RoundedBoxGeometry(0.36, 0.2, 0.24, 3, 0.05)), m.pants));
    const belt = add('pelvis', mesh(g(new THREE.BoxGeometry(0.37, 0.04, 0.25)), m.shoe));
    belt.position.y = 0.075;
    const buckle = add('pelvis', mesh(g(new THREE.BoxGeometry(0.06, 0.045, 0.02)), m.gold));
    buckle.position.set(0, 0.075, 0.127);

    // --- Chest: jacket, shirt V, tie, buttons, neck, shoulder pads ---
    add('chest', mesh(g(new RoundedBoxGeometry(0.42, 0.46, 0.28, 3, 0.07)), m.suit));
    const vShape = new THREE.Shape([
      new THREE.Vector2(-0.085, 0.23),
      new THREE.Vector2(0.085, 0.23),
      new THREE.Vector2(0, 0.0),
    ]);
    const shirt = add('chest', mesh(g(new THREE.ShapeGeometry(vShape)), m.shirt));
    shirt.position.z = 0.141;
    const tieShape = new THREE.Shape([
      new THREE.Vector2(-0.018, 0.215),
      new THREE.Vector2(0.018, 0.215),
      new THREE.Vector2(0.012, 0.19),
      new THREE.Vector2(0.032, 0.02),
      new THREE.Vector2(0, -0.04),
      new THREE.Vector2(-0.032, 0.02),
      new THREE.Vector2(-0.012, 0.19),
    ]);
    const tie = add('chest', mesh(g(new THREE.ShapeGeometry(tieShape)), m.tie));
    tie.position.z = 0.143;
    for (const y of [-0.08, -0.17]) {
      const b = add('chest', mesh(sphere, m.gold));
      b.scale.setScalar(0.014);
      b.position.set(0, y, 0.142);
    }
    const neck = add('chest', mesh(g(new THREE.CylinderGeometry(0.075, 0.085, 0.12, 16)), m.skin));
    neck.position.y = 0.25;
    for (const s of [1, -1]) {
      const pad = add('chest', mesh(sphere, m.suit));
      pad.scale.set(0.09, 0.08, 0.09);
      pad.position.set(0.24 * s, 0.16, 0);
    }

    // --- Head: skull, ears, hair fringe; face rig mounted on top ---
    this.headShell = add('head', mesh(g(new THREE.SphereGeometry(0.25, 40, 28)), m.skin));
    for (const s of [1, -1]) {
      const ear = add('head', mesh(sphere, m.skin));
      ear.scale.set(0.03, 0.065, 0.045);
      ear.position.set(0.248 * s, 0.0, -0.01);
    }
    const hairGeo = g(new THREE.SphereGeometry(0.258, 32, 12, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.3, Math.PI * 0.28));
    const hair = add('head', mesh(hairGeo, m.hair));
    hair.material = m.hair;
    m.hair.side = THREE.DoubleSide;
    hair.position.y = -0.005;
    this.parts.get('head')!.add(this.faceMount);
    this.face = new CartoonFace(m);
    this.faceMount.add(this.face.group);
    this.faceMount.traverse((o) => {
      if (o instanceof THREE.Mesh) o.userData.part = 'head';
    });

    // --- Limbs ---
    for (const s of ['L', 'R'] as const) {
      const ua = getPartDef(`upperArm${s}`);
      add(ua.name, mesh(g(capsuleFor(ua)), m.suit));
      const la = getPartDef(`lowerArm${s}`);
      add(la.name, mesh(g(capsuleFor(la)), m.suit));
      const cuff = add(la.name, mesh(g(new THREE.CylinderGeometry(0.062, 0.062, 0.04, 14)), m.shirt));
      cuff.position.y = -0.125;
      const hand = add(`hand${s}`, mesh(sphere, m.skin));
      hand.scale.set(0.075, 0.085, 0.06);
      const thumb = add(`hand${s}`, mesh(sphere, m.skin));
      thumb.scale.setScalar(0.03);
      thumb.position.set(s === 'L' ? -0.05 : 0.05, 0.02, 0.035);

      add(`thigh${s}`, mesh(g(capsuleFor(getPartDef(`thigh${s}`))), m.pants));
      add(`shin${s}`, mesh(g(capsuleFor(getPartDef(`shin${s}`))), m.pants));
      const shoe = add(`foot${s}`, mesh(g(new RoundedBoxGeometry(0.14, 0.09, 0.27, 3, 0.04)), m.shoe));
      shoe.position.z = 0.005;
    }

    this.skeleton = buildSkeleton(this.parts);
    for (const mat of Object.values(m)) if (mat instanceof THREE.MeshToonMaterial) this.baseColors.set(mat, mat.color.clone());
  }

  /** Flicker between flesh and bones (electrocution). */
  setXray(on: boolean): void {
    if (on === this.xray) return;
    this.xray = on;
    for (const b of this.skeleton) b.visible = on;
    for (const grp of this.parts.values()) {
      grp.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || isSkeleton(o)) return;
        if (on) {
          this.savedMaterials.set(o, o.material);
          o.material = XRAY;
        } else {
          const m = this.savedMaterials.get(o);
          if (m) o.material = m;
        }
      });
    }
    if (!on) this.savedMaterials.clear();
  }

  /** Recolour all boss materials for burning / freezing / electric glow. */
  applyTint(): void {
    const { char, frost, glow } = this.tint;
    for (const [mat, base] of this.baseColors) {
      mat.color.copy(base).lerp(CHAR, Math.min(1, char) * 0.9).lerp(ICE, Math.min(1, frost) * 0.75);
      mat.emissive.setRGB(glow * 0.3, glow * 0.55, glow * 0.9);
    }
  }

  setVisible(v: boolean): void {
    for (const grp of this.parts.values()) grp.visible = v;
  }

  /** Replace the face rig (e.g. with the user's photo face). */
  setFace(face: FaceRig, hideDefaultHair = false): void {
    this.faceMount.remove(this.face.group);
    this.face.dispose();
    this.face = face;
    this.faceMount.add(face.group);
    face.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.userData.part = 'head';
    });
    this.setHairColor(hideDefaultHair ? null : undefined);
    for (const m of face.materials ?? []) if (m instanceof THREE.MeshToonMaterial) this.baseColors.set(m, m.color.clone());
  }

  /** Skin tone for head, neck, ears and hands. */
  setSkinColor(color: THREE.ColorRepresentation): void {
    this.materials.skin.color.set(color);
    this.baseColors.set(this.materials.skin, this.materials.skin.color.clone());
  }

  /** Hair colour; null = bald, undefined = leave colour but show hair. */
  setHairColor(color: THREE.ColorRepresentation | null | undefined): void {
    const head = this.parts.get('head')!;
    head.children.forEach((c) => {
      if (c instanceof THREE.Mesh && c.material === this.materials.hair) c.visible = color !== null;
    });
    if (color) {
      this.materials.hair.color.set(color);
      this.baseColors.set(this.materials.hair, this.materials.hair.color.clone());
    }
  }

  addTo(scene: THREE.Object3D): void {
    for (const grp of this.parts.values()) scene.add(grp);
  }

  removeFrom(scene: THREE.Object3D): void {
    for (const grp of this.parts.values()) scene.remove(grp);
  }

  /** Attach a decal-like child (bruise, cut, stump) to a part so it moves with it. */
  attach(part: PartName, obj: THREE.Object3D, maxPerPart = Infinity): void {
    this.parts.get(part)!.add(obj);
    const list = this.decals.get(part)!;
    list.push(obj);
    // Drop the oldest removable decal when a part gets crowded (stumps are never removed).
    const removable = list.filter((d) => d.userData.decal);
    if (removable.length > maxPerPart) {
      const old = removable[0];
      old.removeFromParent();
      list.splice(list.indexOf(old), 1);
      old.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.geometry.userData.shared) o.geometry.dispose();
      });
    }
  }

  /** Meat-and-bone caps on both sides of a severed joint. */
  addStumps(child: PartName): void {
    const def = getPartDef(child);
    if (!def.joint || !def.parent) return;
    const parentDef = getPartDef(def.parent);
    const radius = limbRadius(def);
    const anchor = new THREE.Vector3(...def.joint.anchor);
    const childCenter = new THREE.Vector3(...def.pos);
    const dir = childCenter.clone().sub(anchor).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
    // Child side faces back toward the parent; parent side faces toward the lost child.
    this.attach(child, this.stump(radius, anchor.clone().sub(childCenter), dir.clone().negate()));
    this.attach(parentDef.name, this.stump(radius, anchor.clone().sub(new THREE.Vector3(...parentDef.pos)), dir));
  }

  private stump(radius: number, localPos: THREE.Vector3, normal: THREE.Vector3): THREE.Group {
    const grp = new THREE.Group();
    const meat = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.02, 18), this.materials.meat);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, 0.05, 12), this.materials.bone);
    bone.position.y = 0.012;
    grp.add(meat, bone);
    grp.position.copy(localPos);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    grp.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.userData.part = 'stump';
      }
    });
    return grp;
  }

  /** All meshes that belong to the boss, for raycasting. */
  pickables(): THREE.Object3D[] {
    return [...this.parts.values()];
  }

  dispose(): void {
    this.setXray(false);
    this.face.dispose();
    const geos = new Set<THREE.BufferGeometry>(this.geoms);
    const mats = new Set<THREE.Material>(Object.values(this.materials));
    for (const grp of this.parts.values()) {
      grp.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (!o.geometry.userData.shared) geos.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!m.userData.shared) mats.add(m);
      });
    }
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
  }
}

function isSkeleton(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (p.name === 'xray') return true;
    p = p.parent;
  }
  return false;
}

function capsuleFor(def: PartDef): THREE.CapsuleGeometry {
  if (def.shape.kind !== 'capsule') throw new Error(`${def.name} is not a capsule`);
  return new THREE.CapsuleGeometry(def.shape.radius, def.shape.halfHeight * 2, 6, 16);
}

export function limbRadius(def: PartDef): number {
  const s = def.shape;
  if (s.kind === 'capsule' || s.kind === 'ball') return s.radius;
  return Math.min(s.hx, s.hz);
}
