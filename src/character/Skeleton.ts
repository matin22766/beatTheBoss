import * as THREE from 'three';
import { RAGDOLL, type PartName } from './RagdollDef';

/** Cartoon X-ray skeleton, one set of bones per part group, hidden until electrocution flashes. */
export function buildSkeleton(parts: Map<PartName, THREE.Group>): THREE.Object3D[] {
  const boneMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x0b1020 });
  const out: THREE.Object3D[] = [];
  const add = (part: PartName, o: THREE.Object3D) => {
    o.name = 'xray';
    o.visible = false;
    o.renderOrder = 5;
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) c.material.userData.outlineParameters = { visible: false };
    });
    parts.get(part)!.add(o);
    out.push(o);
  };
  const longBone = (len: number, r: number) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), boneMat));
    for (const s of [1, -1]) {
      for (const x of [-r, r]) {
        const k = new THREE.Mesh(new THREE.SphereGeometry(r * 1.5, 8, 6), boneMat);
        k.position.set(x * 0.7, (s * len) / 2, 0);
        g.add(k);
      }
    }
    return g;
  };

  for (const def of RAGDOLL) {
    const s = def.shape;
    if (def.name === 'head') {
      const g = new THREE.Group();
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), boneMat);
      skull.scale.set(1, 1.05, 1.05);
      skull.position.y = 0.03;
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.14), boneMat);
      jaw.position.set(0, -0.13, 0.05);
      g.add(skull, jaw);
      for (const x of [-0.07, 0.07]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), holeMat);
        eye.position.set(x, 0.04, 0.17);
        g.add(eye);
      }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 3), holeMat);
      nose.position.set(0, -0.03, 0.19);
      nose.rotation.x = Math.PI;
      g.add(nose);
      add('head', g);
    } else if (def.name === 'chest') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 8), boneMat));
      for (let i = 0; i < 5; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15 - Math.abs(i - 1.5) * 0.01, 0.014, 6, 18, Math.PI * 1.5), boneMat);
        rib.rotation.x = Math.PI / 2;
        rib.rotation.z = Math.PI * 0.25 + Math.PI / 2;
        rib.position.set(0, 0.15 - i * 0.07, 0);
        g.add(rib);
      }
      for (const x of [-1, 1]) {
        const clav = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), boneMat);
        clav.rotation.z = Math.PI / 2 + x * 0.2;
        clav.position.set(x * 0.12, 0.2, 0.03);
        g.add(clav);
      }
      add('chest', g);
    } else if (def.name === 'pelvis') {
      const g = new THREE.Group();
      const hip = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 16, Math.PI), boneMat);
      hip.rotation.x = Math.PI;
      hip.scale.set(1.2, 0.8, 1);
      g.add(hip, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), boneMat));
      add('pelvis', g);
    } else if (s.kind === 'capsule') {
      add(def.name, longBone(s.halfHeight * 2 + s.radius, s.radius * 0.3));
    } else if (def.name.startsWith('hand')) {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5), boneMat);
        f.position.set(-0.03 + i * 0.02, -0.03, 0);
        g.add(f);
      }
      add(def.name, g);
    } else if (def.name.startsWith('foot')) {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), boneMat);
        f.rotation.x = Math.PI / 2;
        f.position.set(-0.03 + i * 0.02, 0, 0.02);
        g.add(f);
      }
      add(def.name, g);
    }
  }
  return out;
}
