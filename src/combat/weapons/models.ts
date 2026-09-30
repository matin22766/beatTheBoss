import * as THREE from 'three';
import { toon, setOutline } from '../../character/materials';

/**
 * Procedural weapon models. Convention: the grip is at the origin and the weapon extends along +Z,
 * so the striking end is at +Z (reach).
 */

const mat = (color: THREE.ColorRepresentation, outline = 0.004, extra: THREE.MeshToonMaterialParameters = {}) => {
  const m = toon(color, extra);
  setOutline(m, outline);
  return m;
};

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** Cylinder lying along +Z starting at z0. */
function rod(r: number, len: number, m: THREE.Material, z0 = 0, r2 = r, seg = 12): THREE.Mesh {
  const o = mesh(new THREE.CylinderGeometry(r2, r, len, seg), m);
  o.rotation.x = Math.PI / 2;
  o.position.z = z0 + len / 2;
  return o;
}

export const models = {
  glove(): THREE.Object3D {
    const g = new THREE.Group();
    const red = mat(0xd62828);
    const ball = mesh(new THREE.SphereGeometry(0.11, 20, 14), red, 0, 0, 0.06);
    ball.scale.set(1, 0.9, 1.15);
    const thumb = mesh(new THREE.SphereGeometry(0.045, 12, 10), red, 0.09, 0.02, 0.03);
    const cuff = rod(0.08, 0.1, mat(0xffffff), -0.1);
    g.add(ball, thumb, cuff);
    return g;
  },
};
