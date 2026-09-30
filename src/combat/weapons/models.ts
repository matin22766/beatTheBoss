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

  // ------------------------------------------------------------------ v2 weapons
  blackHoleOrb(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ color: 0x050008 })));
    const ring = mesh(new THREE.TorusGeometry(0.13, 0.015, 8, 32), glowMat(0xb14cff));
    ring.rotation.x = Math.PI / 2.4;
    g.add(ring);
    return shrink(g, 0.6);
  },
  tornadoJar(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 16), mat(0xcfe8ff, 0.003, { transparent: true, opacity: 0.5 })));
    const swirl = mesh(new THREE.ConeGeometry(0.05, 0.14, 10, 1, true), glowMat(0x9fb7c9));
    swirl.rotation.x = Math.PI;
    g.add(swirl, boxm(0.15, 0.03, 0.15, mat(0x6b4a33), 0, 0.1, 0));
    return shrink(g, 0.8);
  },
  spectralSword(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.015, 0.14, glowMat(0x7ff6ff), -0.08), blade(0.7, 0.05, 0.008, glowMat(0xbff9ff), 0.06));
    const guard = boxm(0.14, 0.02, 0.02, glowMat(0x7ff6ff), 0, 0, 0.06);
    g.add(guard);
    return g;
  },
  swordHilt(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.02, 0.18, mat(0x3a2a5a), -0.08), boxm(0.16, 0.025, 0.03, mat(0xc9a227), 0, 0, 0.1));
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), glowMat(0x7ff6ff), 0, 0, 0.14));
    return g;
  },
  beeHive(): THREE.Object3D {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.08 - i * 0.012, 0.03, 8, 16), mat(0xe9b949));
      t.rotation.x = Math.PI / 2;
      t.position.y = -0.06 + i * 0.045;
      g.add(t);
    }
    g.add(mesh(new THREE.CircleGeometry(0.02, 10), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, -0.02, 0.1));
    return shrink(g, 0.6);
  },
  bee(): THREE.Object3D {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0xffc300, 0));
    body.scale.set(1, 0.8, 1.4);
    const stripe = mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 10), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    const wing = mesh(new THREE.CircleGeometry(0.02, 8), glowMat(0xffffff, 0.6), 0.015, 0.02, 0);
    wing.rotation.x = -Math.PI / 2;
    const wing2 = wing.clone();
    wing2.position.x = -0.015;
    g.add(body, stripe, wing, wing2);
    return shrink(g, 2.2);
  },
  staff(color = 0x7fd3ff): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.015, 0.55, wood(), -0.2));
    g.add(mesh(new THREE.OctahedronGeometry(0.05, 0), glowMat(color), 0, 0, 0.38));
    return shrink(g, 0.7);
  },
  remote(color = 0xc1121f): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.06, 0.03, 0.16, black(), 0, 0, 0.04), mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 12), mat(color), 0, 0.02, 0.07));
    g.add(rod(0.004, 0.12, steel(), 0.1));
    return g;
  },
  meteor(): THREE.Object3D {
    const g = new THREE.Group();
    const rock = mesh(new THREE.DodecahedronGeometry(0.22, 0), mat(0x4a2f1f));
    g.add(rock, mesh(new THREE.SphereGeometry(0.26, 12, 10), glowMat(0xff6b35, 0.45)));
    return g;
  },
  teslaDevice(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.08, 0.08, 0.12, mat(0x2d3a45)), rod(0.02, 0.12, steel(), 0.06));
    g.add(mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 14), steel(), 0, 0, 0.2));
    return g;
  },
  teslaCoil(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.2, 16), mat(0x2d3a45), 0, 0.1, 0));
    const coil = mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 16), mat(0xb87333, 0.003), 0, 0.75, 0);
    const top = mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 24), steel(), 0, 1.35, 0);
    top.rotation.x = Math.PI / 2;
    g.add(coil, top);
    return g;
  },
  laserCutter(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.06, 0.08, 0.3, mat(0xe0e0e0)), rod(0.02, 0.1, black(), 0.15), boxm(0.04, 0.1, 0.05, black(), 0, -0.08, -0.06));
    g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), glowMat(0xff1744), 0, 0, 0.26));
    return g;
  },
  minigun(): THREE.Object3D {
    const g = new THREE.Group();
    const barrels = new THREE.Group();
    barrels.name = 'barrels';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = rod(0.012, 0.55, darkSteel(), 0.05);
      b.position.x = Math.cos(a) * 0.035;
      b.position.y = Math.sin(a) * 0.035;
      barrels.add(b);
    }
    g.add(barrels, boxm(0.12, 0.12, 0.2, black(), 0, 0, -0.05), boxm(0.04, 0.12, 0.05, black(), 0, -0.1, -0.1));
    return g;
  },
  buzzsawLauncher(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.1, 0.06, 0.34, mat(0xf29e1f)), boxm(0.04, 0.1, 0.05, black(), 0, -0.07, -0.05));
    const disc = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 20), steel(), 0, 0.04, 0.12);
    g.add(disc);
    return g;
  },
  sawDisc(): THREE.Object3D {
    // Lies flat in the XZ plane so it can spin in its own plane while flying along +Z.
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 24), steel()));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), darkSteel()));
    for (let i = 0; i < 12; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 12) * Math.PI * 2;
      const tooth = mesh(new THREE.ConeGeometry(0.02, 0.05, 4), steel(), 0.15, 0, 0);
      tooth.rotation.z = -Math.PI / 2;
      pivot.add(tooth);
      g.add(pivot);
    }
    return g;
  },
  guillotine(): THREE.Object3D {
    const g = new THREE.Group();
    const w = wood();
    g.add(boxm(0.12, 2.6, 0.12, w, -0.45, 1.3, 0), boxm(0.12, 2.6, 0.12, w, 0.45, 1.3, 0), boxm(1.1, 0.14, 0.16, w, 0, 2.6, 0));
    const bladeG = new THREE.Group();
    bladeG.name = 'blade';
    const s = new THREE.Shape([new THREE.Vector2(-0.4, 0.25), new THREE.Vector2(0.4, 0.25), new THREE.Vector2(0.4, 0.05), new THREE.Vector2(-0.4, -0.1)]);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), steel());
    blade.position.z = -0.01;
    bladeG.add(blade, boxm(0.8, 0.12, 0.08, mat(0x333333), 0, 0.3, 0));
    bladeG.position.y = 2.2;
    g.add(bladeG);
    return g;
  },
  banHammer(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.035, 1.1, mat(0x2a2a2a), -0.1));
    const head = boxm(0.34, 0.34, 0.6, mat(0x3a86ff), 0, 0, 1.05);
    head.rotation.y = Math.PI / 2;
    g.add(head);
    const label = mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.171, 1.05);
    label.rotation.x = -Math.PI / 2;
    g.add(label);
    return g;
  },
  wreckingBall(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.45, 24, 18), mat(0x2d2f36, 0.004)));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), steel(), 0, 0.48, 0));
    return g;
  },
  webShooter(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 16), mat(0xd62828)), rod(0.01, 0.06, steel(), 0.05));
    g.children[0].rotation.x = Math.PI / 2;
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(0x1d4ed8), 0, 0.05, 0));
    return shrink(g, 0.6);
  },
  harpoonGun(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.03, 0.5, darkSteel(), -0.05), boxm(0.05, 0.12, 0.06, wood(), 0, -0.08, -0.05), rod(0.008, 0.25, steel(), 0.4));
    return g;
  },
  harpoon(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(rod(0.01, 0.5, steel(), -0.45));
    const tip = mesh(new THREE.ConeGeometry(0.03, 0.1, 4), steel(), 0, 0, 0.1);
    tip.rotation.x = Math.PI / 2;
    const barb = boxm(0.08, 0.005, 0.03, steel(), 0, 0, 0.02);
    g.add(tip, barb);
    return g;
  },
  gravityGun(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.1, 0.1, 0.3, mat(0xf29e1f)), boxm(0.04, 0.1, 0.05, black(), 0, -0.09, -0.05));
    for (const a of [0.4, -0.4, Math.PI]) {
      const claw = boxm(0.015, 0.015, 0.14, darkSteel(), Math.sin(a) * 0.05, Math.cos(a) * 0.05, 0.2);
      claw.rotation.set(Math.cos(a) * 0.4, -Math.sin(a) * 0.4, 0);
      g.add(claw);
    }
    g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), glowMat(0x7ff6ff), 0, 0, 0.18));
    return g;
  },
  plasmaRifle(): THREE.Object3D {
    const g = new THREE.Group();
    g.add(boxm(0.07, 0.09, 0.45, mat(0x3a3f4a), 0, 0, 0.05), boxm(0.04, 0.11, 0.05, black(), 0, -0.09, -0.08));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 14), glowMat(0x39ff88), 0, 0, 0.1 + i * 0.08));
    return g;
  },
  plasmaBolt(): THREE.Object3D {
    const g = new THREE.Group();
    const core = mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(0xd8ffe8, 1));
    const glow = mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMat(0x39ff88, 0.5));
    glow.scale.set(1, 1, 1.8);
    g.add(core, glow);
    return g;
  },
  shuriken(): THREE.Object3D {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 0.02 : 0.08;
      const a = (i / 8) * Math.PI * 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }), steel());
    m.rotation.x = Math.PI / 2;
    g.add(m);
    return g;
  },
  boomerang(): THREE.Object3D {
    const g = new THREE.Group();
    const m = mat(0xc67c3b);
    const a = boxm(0.05, 0.015, 0.3, m, 0, 0, 0.1);
    a.rotation.y = 0.5;
    const b = boxm(0.05, 0.015, 0.3, m, 0, 0, 0.1);
    b.rotation.y = -0.5;
    b.position.x = 0.07;
    g.add(a, b);
    return g;
  },
  piano(): THREE.Object3D {
    const g = new THREE.Group();
    const body = mat(0x111111);
    // Upright piano centred on its collider (1.4 × 1.3 × 0.8).
    g.add(boxm(1.4, 0.95, 0.6, body, 0, 0.18, -0.1), boxm(1.3, 0.05, 0.25, mat(0xf5f5f5), 0, -0.05, 0.28));
    for (let i = 0; i < 12; i++) g.add(boxm(0.05, 0.03, 0.14, black(), -0.55 + i * 0.1, -0.02, 0.26));
    g.add(boxm(1.4, 0.06, 0.3, body, 0, -0.1, 0.25));
    g.add(boxm(0.08, 0.5, 0.08, body, -0.6, -0.4, 0.3), boxm(0.08, 0.5, 0.08, body, 0.6, -0.4, 0.3));
    return g;
  },
  magnet(): THREE.Object3D {
    const g = new THREE.Group();
    const arc = mesh(new THREE.TorusGeometry(0.1, 0.035, 10, 20, Math.PI), mat(0xd62828));
    arc.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    arc.position.z = 0.05;
    g.add(arc, boxm(0.07, 0.07, 0.06, mat(0xdddddd), 0.1, 0, 0.18), boxm(0.07, 0.07, 0.06, mat(0xdddddd), -0.1, 0, 0.18));
    return g;
  },
};

/** Scale a model without touching its root transform (the view model sets the root scale). */
function shrink(g: THREE.Object3D, k: number): THREE.Group {
  const outer = new THREE.Group();
  g.scale.setScalar(k);
  outer.add(g);
  return outer;
}

function glowMat(color: number, opacity = 0.9): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  m.userData.outlineParameters = { visible: false };
  return m;
}

export type ModelName = keyof typeof models;
