import * as THREE from 'three';
import type { BossMesh } from '../character/BossMesh';
import type { Ragdoll } from '../character/Ragdoll';
import type { PartName } from '../character/RagdollDef';
import type { Effects } from '../fx/Effects';
import type { DamageType } from '../core/types';

export type InjuryKind = 'bruise' | 'cut' | 'hole' | 'burn' | 'frost';

const decalMat = (color: number, opacity: number) => {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  m.userData.outlineParameters = { visible: false };
  m.userData.shared = true;
  return m;
};

let MATS: Record<string, THREE.MeshBasicMaterial> | null = null;
function mats() {
  return (MATS ??= {
    bruise: decalMat(0x6b3a7a, 0.5),
    bruiseDark: decalMat(0x3d1f4f, 0.55),
    cut: decalMat(0xb3001b, 0.95),
    cutDark: decalMat(0x4a0010, 0.95),
    hole: decalMat(0x2a0006, 1),
    holeRim: decalMat(0xb3001b, 0.9),
    burn: decalMat(0x16110d, 0.8),
    frost: decalMat(0xe6f6ff, 0.7),
    goo: decalMat(0x4f9d2d, 0.95),
  });
}

const circle = new THREE.CircleGeometry(1, 16);
circle.userData.shared = true;
const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

export function injuryFor(type: DamageType): InjuryKind | null {
  switch (type) {
    case 'blunt':
      return 'bruise';
    case 'sharp':
      return 'cut';
    case 'pierce':
      return 'hole';
    case 'fire':
    case 'explosive':
    case 'electric':
      return 'burn';
    case 'cold':
      return 'frost';
  }
}

/** Paints bruises, cuts, bullet holes, burns and frost onto body parts as small attached decals. */
export class Injuries {
  constructor(
    private readonly mesh: BossMesh,
    private readonly ragdoll: Ragdoll,
    private readonly fx: Effects,
  ) {}

  add(part: PartName, worldPoint: THREE.Vector3, worldNormal: THREE.Vector3, kind: InjuryKind, severity: number): void {
    const body = this.ragdoll.get(part).body;
    const t = body.translation();
    const r = body.rotation();
    const qInv = _q.set(r.x, r.y, r.z, r.w).invert();
    const local = worldPoint.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(qInv);
    const n = worldNormal.clone().applyQuaternion(qInv).normalize();
    const limbScale = part === 'head' || part === 'chest' || part === 'pelvis' ? 1 : 0.6;
    const size = THREE.MathUtils.clamp(0.02 + severity * 0.0025, 0.025, 0.07) * limbScale;
    const m = mats();
    const green = this.fx.gore === 'green';
    const g = new THREE.Group();
    g.userData.decal = true;

    const disc = (mat: THREE.Material, sx: number, sy: number, z = 0) => {
      const d = new THREE.Mesh(circle, mat);
      d.scale.set(sx, sy, 1);
      d.position.z = z;
      d.renderOrder = 2;
      g.add(d);
      return d;
    };

    switch (kind) {
      case 'bruise':
        disc(m.bruise, size * 1.2, size, 0);
        if (severity > 15) disc(m.bruiseDark, size * 0.6, size * 0.5, 0.0005);
        break;
      case 'cut': {
        const c = this.fx.gore === 'off' ? m.bruiseDark : green ? m.goo : m.cut;
        disc(c, size * 1.8, size * 0.35, 0);
        disc(m.cutDark, size * 1.5, size * 0.12, 0.0006);
        break;
      }
      case 'hole':
        disc(this.fx.gore === 'off' ? m.bruiseDark : green ? m.goo : m.holeRim, size * 0.55, size * 0.55, 0);
        disc(m.hole, size * 0.3, size * 0.3, 0.0006);
        break;
      case 'burn':
        disc(m.burn, size * 1.6, size * 1.3, 0);
        break;
      case 'frost':
        disc(m.frost, size * 1.6, size * 1.4, 0);
        break;
    }
    g.position.copy(local).addScaledVector(n, 0.003);
    g.quaternion.setFromUnitVectors(Z, n);
    g.rotateZ(Math.random() * Math.PI * 2);
    this.mesh.attach(part, g, 14);

    // Open wounds keep dribbling for a moment.
    if ((kind === 'cut' || kind === 'hole') && this.fx.gore !== 'off') {
      this.fx.addSpurt(this.mesh.parts.get(part)!, g.position.clone(), n, 0.8 + severity * 0.03, 12);
    }
  }
}
