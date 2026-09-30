import * as THREE from 'three';
import { toon, setOutline } from '../../character/materials';

/**
 * Procedural weapon models. Convention: the grip is at the origin and the weapon extends along +Z,
 * so a melee weapon's striking end / a gun's muzzle is at +Z.
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

/** Cylinder lying along +Z from z0 to z0+len (r = radius at z0, r2 at the far end). */
function rod(r: number, len: number, m: THREE.Material, z0 = 0, r2 = r, seg = 12): THREE.Mesh {
  const o = mesh(new THREE.CylinderGeometry(r2, r, len, seg), m);
  o.rotation.x = Math.PI / 2;
  o.position.z = z0 + len / 2;
  return o;
}

function boxm(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
}

/** Flat blade in the YZ plane from z0 to z0+len. */
function blade(len: number, width: number, thick: number, m: THREE.Material, z0: number, tip = true): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(width, 0);
  s.lineTo(width, len * (tip ? 0.8 : 1));
  if (tip) s.lineTo(width * 0.2, len);
  s.lineTo(0, len);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  geo.translate(-width / 2, 0, -thick / 2);
  const o = mesh(geo, m);
  o.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  o.position.z = z0;
  return o;
}

const steel = () => mat(0xc9d1d9, 0.003);
const darkSteel = () => mat(0x4a5058, 0.003);
const wood = () => mat(0x9c6b3f);
const black = () => mat(0x1f1f24);

export const models = {
  glove(): THREE.Object3D {
    const g = new THREE.Group();
    const red = mat(0xd62828);
    const ball = mesh(new THREE.SphereGeometry(0.11, 20, 14), red, 0, 0, 0.06);
    ball.scale.set(1, 0.9, 1.15);
    const thumb = mesh(new THREE.SphereGeometry(0.045, 12, 10), red, 0.09, 0.02, 0.03);
    g.add(ball, thumb, rod(0.08, 0.1, mat(0xffffff), -0.1));
    return g;
  },
  bat(): THREE.Object3D {
    const g = new THREE.Group();
    const w = mat(0xd9a066);
    g.add(rod(0.022, 0.3, mat(0x222222), -0.1), rod(0.024, 0.55, w, 0.2, 0.05, 14));
    g.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), w, 0, 0, 0.75));
    g.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), w, 0, 0, -0.1));
    return g;
  },
  pan(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.018, 0.34, black(), -0.08));
    const pan = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.05, 24), mat(0x2b2b30), 0, 0, 0.42);
    // Flat face points sideways (±X) so a side swing hits face-first.
    pan.rotation.z = Math.PI / 2;
    g.add(pan);
    return g;
  },
  sledgehammer(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.025, 0.8, wood(), -0.1));
    const head = boxm(0.16, 0.16, 0.34, darkSteel(), 0, 0, 0.72);
    head.rotation.y = Math.PI / 2;
    g.add(head);
    return g;
  },
  brick(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.2, 0.065, 0.1, mat(0xa4452d)));
    return g;
  },
  keyboard(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.04, 0.16, 0.46, mat(0x2e2f36), 0, 0, 0.25));
    const keyMat = mat(0xe8e8e8, 0);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 11; c++) g.add(boxm(0.012, 0.026, 0.03, keyMat, 0.025, -0.06 + r * 0.035, 0.07 + c * 0.037));
    return g;
  },
  chicken(): THREE.Object3D {
    const g = new THREE.Group();
    const y = mat(0xffd23f);
    const body = mesh(new THREE.SphereGeometry(0.08, 14, 10), y, 0, 0, 0.35);
    body.scale.set(0.8, 1, 1.9);
    g.add(body, rod(0.025, 0.2, y, 0.0, 0.03));
    const head = mesh(new THREE.SphereGeometry(0.045, 12, 10), y, 0, 0.04, 0.55);
    const beak = mesh(new THREE.ConeGeometry(0.02, 0.05, 8), mat(0xff8c00), 0, 0.04, 0.6);
    beak.rotation.x = Math.PI / 2;
    const comb = mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0xe63946), 0, 0.09, 0.55);
    g.add(head, beak, comb);
    return g;
  },
  katana(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.018, 0.24, mat(0x1d1d1d), -0.1));
    const guard = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 16), mat(0xc9a227), 0, 0, 0.14);
    guard.rotation.x = Math.PI / 2;
    g.add(guard, blade(0.8, 0.035, 0.006, mat(0xe9eef2, 0.002), 0.15));
    return g;
  },
  axe(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.022, 0.7, wood(), -0.1));
    const s = new THREE.Shape();
    s.moveTo(0, -0.05);
    s.lineTo(0.16, -0.12);
    s.quadraticCurveTo(0.2, 0, 0.16, 0.12);
    s.lineTo(0, 0.05);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
    geo.translate(0, 0, -0.01);
    const head = mesh(geo, steel(), 0, 0, 0.55);
    head.rotation.set(0, -Math.PI / 2, Math.PI / 2);
    g.add(head);
    return g;
  },
  cleaver(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.018, 0.14, wood(), -0.04));
    g.add(boxm(0.006, 0.12, 0.22, steel(), 0, -0.03, 0.2));
    return g;
  },
  chainsaw(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.14, 0.16, 0.26, mat(0xf29e1f), 0, 0, 0));
    g.add(boxm(0.03, 0.06, 0.5, darkSteel(), 0, -0.02, 0.36));
    const chain = boxm(0.034, 0.075, 0.52, mat(0x9aa0a6, 0.002), 0, -0.02, 0.36);
    chain.name = 'chain';
    g.add(chain);
    g.add(rod(0.02, 0.14, black(), -0.2));
    return g;
  },
  knife(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.012, 0.09, black(), -0.08), blade(0.14, 0.022, 0.004, steel(), 0.01));
    return g;
  },
  pistol(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.04, 0.05, 0.2, black(), 0, 0.02, 0.06));
    const grip = boxm(0.035, 0.11, 0.05, mat(0x3a2a1e), 0, -0.05, -0.02);
    grip.rotation.x = -0.25;
    g.add(grip);
    return g;
  },
  shotgun(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.018, 0.55, darkSteel(), 0.05), rod(0.018, 0.5, darkSteel(), 0.05));
    g.children[1].position.y = -0.035;
    g.add(boxm(0.05, 0.06, 0.18, wood(), 0, -0.02, 0.12), boxm(0.045, 0.08, 0.22, wood(), 0, -0.05, -0.12));
    return g;
  },
  nailgun(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.07, 0.12, 0.26, mat(0x2a9d8f), 0, 0.02, 0.05));
    g.add(boxm(0.04, 0.12, 0.05, black(), 0, -0.08, -0.03));
    g.add(rod(0.015, 0.08, darkSteel(), 0.18));
    return g;
  },
  crossbow(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.04, 0.04, 0.5, wood(), 0, 0, 0.1));
    const bow = mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 20, Math.PI), darkSteel(), 0, 0, 0.3);
    bow.rotation.set(Math.PI / 2, 0, 0);
    g.add(bow, rod(0.006, 0.4, mat(0xe0e0e0), 0.12));
    return g;
  },
  bolt(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.008, 0.36, wood(), -0.3));
    const tip = mesh(new THREE.ConeGeometry(0.016, 0.06, 8), steel(), 0, 0, 0.08);
    tip.rotation.x = Math.PI / 2;
    g.add(tip);
    for (let i = 0; i < 3; i++) {
      const f = boxm(0.002, 0.03, 0.06, mat(0xe63946, 0), 0, 0, -0.28);
      f.rotation.z = (i / 3) * Math.PI;
      g.add(f);
    }
    return g;
  },
  nail(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.004, 0.09, steel(), -0.07));
    const head = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 10), steel(), 0, 0, -0.07);
    head.rotation.x = Math.PI / 2;
    g.add(head);
    return g;
  },
  grenade(): THREE.Object3D {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.06, 14, 10), mat(0x4f6d3a));
    body.scale.set(1, 1.2, 1);
    g.add(body, boxm(0.03, 0.03, 0.03, darkSteel(), 0, 0.08, 0));
    const pin = mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12), steel(), 0.03, 0.09, 0);
    g.add(pin);
    return g;
  },
  dynamite(): THREE.Object3D {
    const g = new THREE.Group();
    const red = mat(0xc1121f);
    for (const [x, y] of [
      [-0.03, 0],
      [0.03, 0],
      [0, 0.045],
    ]) {
      const s = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12), red, x, y, 0);
      g.add(s);
    }
    g.add(boxm(0.1, 0.02, 0.02, mat(0x222222), 0, 0.02, 0.03));
    const fuse = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6), mat(0xeeeeee, 0), 0, 0.14, 0);
    fuse.name = 'fuse';
    g.add(fuse);
    return g;
  },
  rocketLauncher(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.07, 0.9, mat(0x556b2f), -0.3));
    g.add(boxm(0.04, 0.12, 0.06, black(), 0, -0.1, 0.0));
    g.add(boxm(0.06, 0.06, 0.12, black(), 0.08, 0.02, 0.1));
    return g;
  },
  rocket(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.045, 0.3, mat(0xdddddd), -0.2));
    const nose = mesh(new THREE.ConeGeometry(0.045, 0.1, 12), mat(0xc1121f), 0, 0, 0.15);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    for (let i = 0; i < 4; i++) {
      const f = boxm(0.004, 0.12, 0.08, mat(0xc1121f), 0, 0, -0.18);
      f.rotation.z = (i / 4) * Math.PI;
      g.add(f);
    }
    return g;
  },
  flamethrower(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.03, 0.5, darkSteel(), -0.05), rod(0.045, 0.06, black(), 0.45));
    const tank = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 14), mat(0xc1121f), 0, -0.09, 0.05);
    tank.rotation.x = Math.PI / 2;
    g.add(tank, boxm(0.035, 0.1, 0.05, black(), 0, -0.06, -0.08));
    return g;
  },
  taser(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.05, 0.06, 0.18, mat(0xffd60a), 0, 0.02, 0.06), boxm(0.04, 0.1, 0.05, black(), 0, -0.05, -0.02));
    g.add(boxm(0.012, 0.012, 0.03, steel(), 0.012, 0.03, 0.16), boxm(0.012, 0.012, 0.03, steel(), -0.012, 0.03, 0.16));
    return g;
  },
  freezeRay(): THREE.Object3D {
    const g = new THREE.Group();
    const blue = mat(0x4cc9f0);
    g.add(rod(0.04, 0.3, mat(0xe0e0e0), -0.05), rod(0.03, 0.12, blue, 0.25, 0.06));
    for (let i = 0; i < 3; i++) {
      const ring = mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), blue, 0, 0, i * 0.08);
      g.add(ring);
    }
    g.add(boxm(0.035, 0.1, 0.05, black(), 0, -0.07, -0.02));
    return g;
  },
  anvil(): THREE.Object3D {
    const g = new THREE.Group();
    const m = mat(0x2d2f36);
    g.add(boxm(0.3, 0.1, 0.22, m, 0, -0.14, 0), boxm(0.16, 0.12, 0.14, m, 0, -0.03, 0), boxm(0.46, 0.1, 0.22, m, 0.04, 0.08, 0));
    const horn = mesh(new THREE.ConeGeometry(0.06, 0.2, 10), m, -0.28, 0.08, 0);
    horn.rotation.z = Math.PI / 2;
    g.add(horn);
    return g;
  },
  bowlingBall(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.11, 22, 16), mat(0x3a0ca3)));
    const hole = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const [x, y] of [
      [-0.02, 0.05],
      [0.02, 0.05],
      [0, 0.02],
    ])
      g.add(mesh(new THREE.CircleGeometry(0.012, 10), hole, x, y, 0.109));
    return g;
  },
};

export type ModelName = keyof typeof models;
