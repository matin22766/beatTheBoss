import * as THREE from 'three';
import type { Ragdoll } from './Ragdoll';
import type { PartName } from './RagdollDef';

const SPOTS: Array<{ part: PartName; size: number; strength: number }> = [
  { part: 'footL', size: 0.34, strength: 0.55 },
  { part: 'footR', size: 0.34, strength: 0.55 },
  { part: 'pelvis', size: 0.95, strength: 0.32 },
];

let texture: THREE.Texture | null = null;
function blobTexture(): THREE.Texture {
  if (texture) return texture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  texture = new THREE.CanvasTexture(c);
  return texture;
}

/**
 * Soft dark blobs on the floor under his feet and hips. They make contact with the ground read
 * clearly on any floor (and show at a glance when he's in the air: they fade and spread).
 */
export class ContactShadows {
  private readonly meshes: THREE.Mesh[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly floorY: number,
  ) {
    if (typeof document === 'undefined') return;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < SPOTS.length; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      mat.userData.outlineParameters = { visible: false };
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 1;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
    }
  }

  update(ragdoll: Ragdoll): void {
    SPOTS.forEach((spot, i) => {
      const m = this.meshes[i];
      if (!m) return;
      const p = ragdoll.get(spot.part);
      const t = p.body.translation();
      const h = Math.max(0, ragdoll.lowestPoint(p) - this.floorY);
      const k = Math.max(0, 1 - h / 0.9);
      m.position.set(t.x, this.floorY + 0.006 + i * 0.001, t.z);
      m.scale.setScalar(spot.size * (1 + h * 0.8));
      (m.material as THREE.MeshBasicMaterial).opacity = spot.strength * k * k;
      m.visible = k > 0.01;
    });
  }

  dispose(): void {
    for (const m of this.meshes) {
      this.scene.remove(m);
      (m.material as THREE.Material).dispose();
    }
    this.meshes[0]?.geometry.dispose();
  }
}
