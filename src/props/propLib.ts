import * as THREE from 'three';
import type { PropSpec } from './PropSystem';
import { std } from '../themes/Theme';
import { tex } from '../themes/textures';

/** A prop recipe without placement. */
export type PropKind = Omit<PropSpec, 'id' | 'pos' | 'rotY'>;

let counter = 0;
/** Place a prop recipe in the arena. `y` is the height of the collider centre. */
export function place(kind: PropKind, x: number, y: number, z: number, rotY = 0): PropSpec {
  return { ...kind, id: `prop${counter++}`, pos: [x, y, z], rotY };
}

function b(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function c(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 18): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  return g;
}

const glow = (color: number, opacity = 0.85) => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  m.userData.outlineParameters = { visible: false };
  return m;
};

export const props = {
  // ---------------------------------------------------------------- office
  desk(): PropKind {
    return {
      shape: { kind: 'box', half: [0.9, 0.4, 0.42] },
      mass: 30,
      hp: 140,
      material: 'wood',
      seat: 0.41,
      color: 0x8a5a36,
      build: () => {
        const wood = std(0x8a5a36, { map: tex.planks('#8a5a36', [1, 1]) });
        const metal = std(0x3a3a3a);
        const g = group(b(1.8, 0.07, 0.84, wood, 0, 0.365, 0));
        for (const [x, z] of [
          [-0.82, -0.36],
          [0.82, -0.36],
          [-0.82, 0.36],
          [0.82, 0.36],
        ])
          g.add(b(0.06, 0.73, 0.06, metal, x, -0.035, z));
        g.add(b(0.42, 0.02, 0.15, std(0x333333), 0.1, 0.41, 0.15));
        return g;
      },
    };
  },
  /** Collider is the seat block (top = seat); the backrest is visual only. */
  officeChair(): PropKind {
    return {
      shape: { kind: 'box', half: [0.25, 0.25, 0.25] },
      mass: 12,
      hp: 70,
      material: 'plastic',
      seat: 0.25,
      color: 0x2b2f3a,
      build: () => {
        const fabric = std(0x2b2f3a);
        const metal = std(0x777777, { metalness: 0.5 });
        const g = group(b(0.5, 0.08, 0.5, fabric, 0, 0.21, 0), b(0.48, 0.52, 0.07, fabric, 0, 0.51, -0.22), c(0.03, 0.03, 0.35, metal, 0, -0.01, 0));
        for (let i = 0; i < 5; i++) {
          const leg = b(0.04, 0.03, 0.28, metal, 0, -0.21, 0);
          leg.rotation.y = (i / 5) * Math.PI * 2;
          leg.translateZ(0.12);
          g.add(leg);
        }
        return g;
      },
    };
  },
  monitor(): PropKind {
    return {
      shape: { kind: 'box', half: [0.3, 0.22, 0.08] },
      mass: 5,
      hp: 30,
      material: 'electronic',
      color: 0x111111,
      build: () => {
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.32), glow(0x3b7dd8, 1));
        screen.position.set(0, 0.02, 0.041);
        return group(b(0.6, 0.38, 0.06, std(0x111111), 0, 0.02, 0), screen, b(0.08, 0.06, 0.08, std(0x222222), 0, -0.19, 0));
      },
    };
  },
  mug(color = 0xffffff): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.05, halfHeight: 0.06 },
      mass: 0.4,
      hp: 6,
      material: 'glass',
      breakInto: ['shatter'],
      build: () => group(c(0.05, 0.045, 0.12, std(color)), c(0.035, 0.035, 0.01, std(0x4a2c17), 0, 0.055, 0)),
    };
  },
  filingCabinet(): PropKind {
    return {
      shape: { kind: 'box', half: [0.3, 0.65, 0.3] },
      mass: 60,
      hp: 200,
      material: 'metal',
      color: 0x8e9aa6,
      build: () => {
        const g = group(b(0.6, 1.3, 0.6, std(0x8e9aa6, { metalness: 0.4, roughness: 0.5 })));
        for (let i = 0; i < 3; i++) g.add(b(0.25, 0.04, 0.03, std(0x444444), 0, -0.35 + i * 0.4, 0.31));
        return g;
      },
    };
  },
  plantPot(): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.25, halfHeight: 0.45 },
      mass: 15,
      hp: 40,
      material: 'plant',
      color: 0xb5562b,
      build: () => {
        const g = group(c(0.25, 0.2, 0.45, std(0xb5562b), 0, -0.225, 0));
        const leaf = std(0x2f8f3a);
        for (let i = 0; i < 9; i++) {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), leaf);
          l.position.set(Math.cos(i) * 0.15, 0.15 + (i % 3) * 0.2, Math.sin(i * 2) * 0.15);
          l.scale.set(0.8, 1.3, 0.8);
          g.add(l);
        }
        return g;
      },
    };
  },
  waterCooler(): PropKind {
    return {
      shape: { kind: 'box', half: [0.2, 0.72, 0.2] },
      mass: 22,
      hp: 50,
      material: 'liquid',
      color: 0x7ec8f0,
      breakInto: ['splash', 'chunks'],
      build: () =>
        group(b(0.4, 1, 0.4, std(0xeeeeee), 0, -0.22, 0), c(0.17, 0.17, 0.44, std(0x7ec8f0, { transparent: true, opacity: 0.6, roughness: 0.1 }), 0, 0.5, 0)),
    };
  },
  /** Fixed glass pane; w × h metres. */
  windowPane(w: number, h: number): PropKind {
    return {
      shape: { kind: 'box', half: [w / 2, h / 2, 0.03] },
      mass: 10,
      hp: 20,
      material: 'glass',
      fixed: true,
      breakInto: ['shatter'],
      build: () => {
        const m = new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2 });
        m.userData.outlineParameters = { visible: false };
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
        pane.position.z = 0.02;
        const shine = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.15, h * 0.9), glow(0xffffff, 0.18));
        shine.position.set(-w * 0.2, 0, 0.025);
        shine.rotation.z = 0.3;
        return group(pane, shine);
      },
    };
  },

  // ---------------------------------------------------------------- warehouse
  crate(size = 0.8): PropKind {
    return {
      shape: { kind: 'box', half: [size / 2, size / 2, size / 2] },
      mass: 25 * size,
      hp: 55 * size + 20,
      material: 'wood',
      seat: size / 2,
      color: 0xa8763e,
      build: () => {
        const wood = std(0xffffff, { map: tex.planks('#a8763e', [1, 1]) });
        const edge = std(0x6b4523);
        return group(b(size, size, size, wood), b(size + 0.02, 0.06, size + 0.02, edge, 0, size / 2 - 0.04, 0), b(size + 0.02, 0.06, size + 0.02, edge, 0, -size / 2 + 0.04, 0));
      },
    };
  },
  barrel(color: number): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.3, halfHeight: 0.45 },
      mass: 25,
      hp: 130,
      material: 'metal',
      color,
      seat: 0.45,
      build: () => group(c(0.3, 0.3, 0.9, std(color, { metalness: 0.3, roughness: 0.5 })), c(0.31, 0.31, 0.04, std(0x333333), 0, -0.25, 0), c(0.31, 0.31, 0.04, std(0x333333), 0, 0.25, 0)),
    };
  },
  pallet(): PropKind {
    return {
      shape: { kind: 'box', half: [0.6, 0.07, 0.5] },
      mass: 10,
      hp: 40,
      material: 'wood',
      color: 0x9c6b3f,
      build: () => {
        const w = std(0x9c6b3f);
        const g = group();
        for (let i = 0; i < 5; i++) g.add(b(1.2, 0.03, 0.16, w, 0, 0.055, -0.4 + i * 0.2));
        for (const x of [-0.5, 0, 0.5]) g.add(b(0.1, 0.1, 1, w, x, -0.02, 0));
        return g;
      },
    };
  },

  // ---------------------------------------------------------------- ring / kitchen
  stool(): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.22, halfHeight: 0.3 },
      mass: 6,
      hp: 40,
      material: 'wood',
      seat: 0.3,
      color: 0xc1121f,
      build: () => {
        const g = group(c(0.22, 0.22, 0.06, std(0xc1121f), 0, 0.27, 0));
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const leg = c(0.025, 0.025, 0.56, std(0x333333), Math.cos(a) * 0.15, -0.03, Math.sin(a) * 0.15);
          leg.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
          g.add(leg);
        }
        return g;
      },
    };
  },
  bucket(): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.16, halfHeight: 0.15 },
      mass: 3,
      hp: 25,
      material: 'liquid',
      color: 0x4cc9f0,
      breakInto: ['splash'],
      build: () => group(c(0.16, 0.13, 0.3, std(0xd9d9d9, { metalness: 0.5 })), c(0.14, 0.14, 0.01, std(0x4cc9f0), 0, 0.12, 0)),
    };
  },
  diningTable(): PropKind {
    return {
      shape: { kind: 'box', half: [0.7, 0.39, 0.45] },
      mass: 25,
      hp: 110,
      material: 'wood',
      seat: 0.39,
      color: 0xb07d4f,
      build: () => {
        const g = group(b(1.4, 0.06, 0.9, std(0xb07d4f), 0, 0.36, 0));
        for (const [x, z] of [
          [-0.6, -0.38],
          [0.6, -0.38],
          [-0.6, 0.38],
          [0.6, 0.38],
        ])
          g.add(b(0.06, 0.72, 0.06, std(0x5b3a22), x, -0.03, z));
        return g;
      },
    };
  },
  /** Collider is the seat block (top = seat); the backrest is visual only. */
  chair(color = 0x8b5a2b): PropKind {
    return {
      shape: { kind: 'box', half: [0.22, 0.23, 0.22] },
      mass: 6,
      hp: 45,
      material: 'wood',
      seat: 0.23,
      color,
      build: () => {
        const w = std(color);
        const g = group(b(0.44, 0.05, 0.44, w, 0, 0.205, 0), b(0.44, 0.45, 0.04, w, 0, 0.45, -0.2));
        for (const [x, z] of [
          [-0.19, -0.19],
          [0.19, -0.19],
          [-0.19, 0.19],
          [0.19, 0.19],
        ])
          g.add(b(0.04, 0.44, 0.04, w, x, -0.02, z));
        return g;
      },
    };
  },
  microwave(): PropKind {
    return {
      shape: { kind: 'box', half: [0.28, 0.16, 0.2] },
      mass: 12,
      hp: 40,
      material: 'electronic',
      color: 0xdddddd,
      build: () => {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), glow(0x222a33, 0.9));
        door.position.set(-0.06, 0, 0.201);
        return group(b(0.56, 0.32, 0.4, std(0xdddddd)), door, b(0.1, 0.24, 0.01, std(0x333333), 0.19, 0, 0.201));
      },
    };
  },
  kettle(): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.11, halfHeight: 0.11 },
      mass: 1.5,
      hp: 15,
      material: 'liquid',
      color: 0xd62828,
      breakInto: ['splash', 'chunks'],
      build: () => group(c(0.1, 0.12, 0.22, std(0xd62828)), b(0.04, 0.1, 0.12, std(0x222222), 0, 0.14, 0)),
    };
  },
  fridge(): PropKind {
    return {
      shape: { kind: 'box', half: [0.45, 1.05, 0.4] },
      mass: 90,
      hp: 260,
      material: 'metal',
      color: 0xe8ecef,
      build: () => group(b(0.9, 2.1, 0.8, std(0xe8ecef, { metalness: 0.3, roughness: 0.3 })), b(0.04, 0.5, 0.05, std(0x888888), -0.38, 0.35, 0.42), b(0.9, 0.02, 0.01, std(0x999999), 0, 0.5, 0.405)),
    };
  },
  pan(): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.17, halfHeight: 0.03 },
      mass: 1.8,
      hp: 999,
      material: 'metal',
      build: () => group(c(0.17, 0.15, 0.05, std(0x2b2b30)), b(0.04, 0.02, 0.3, std(0x111111), 0, 0, 0.3)),
    };
  },

  // ---------------------------------------------------------------- rooftop / lab / beach / space
  acUnit(): PropKind {
    return {
      shape: { kind: 'box', half: [0.5, 0.4, 0.4] },
      mass: 45,
      hp: 150,
      material: 'electronic',
      seat: 0.4,
      color: 0xb8bec8,
      build: () => group(b(1, 0.8, 0.8, std(0xb8bec8, { metalness: 0.4, roughness: 0.5 })), c(0.3, 0.3, 0.05, std(0x333333), 0, 0.42, 0)),
    };
  },
  neonSign(text: string, color: string): PropKind {
    return {
      shape: { kind: 'box', half: [1.2, 0.35, 0.05] },
      mass: 15,
      hp: 25,
      material: 'electronic',
      fixed: true,
      breakInto: ['sparks', 'shatter'],
      build: () => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), new THREE.MeshBasicMaterial({ map: tex.sign(text, '#14051f', color) }));
        m.material.userData.outlineParameters = { visible: false };
        m.position.z = 0.051;
        return group(b(2.4, 0.7, 0.1, std(0x111111)), m);
      },
    };
  },
  labBench(): PropKind {
    return {
      shape: { kind: 'box', half: [1.7, 0.47, 0.4] },
      mass: 80,
      hp: 220,
      material: 'metal',
      seat: 0.47,
      color: 0x2d3a45,
      build: () => group(b(3.4, 0.9, 0.8, std(0x2d3a45), 0, -0.02, 0), b(3.5, 0.05, 0.85, std(0x111111), 0, 0.45, 0)),
    };
  },
  flask(color: number): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.1, halfHeight: 0.13 },
      mass: 0.5,
      hp: 5,
      material: 'glass',
      color,
      breakInto: ['shatter', 'splash'],
      build: () =>
        group(c(0.07, 0.12, 0.26, std(0xffffff, { transparent: true, opacity: 0.35, roughness: 0.05 })), c(0.06, 0.1, 0.15, glow(color), 0, -0.05, 0)),
    };
  },
  specimenTube(): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.6, halfHeight: 1.6 },
      mass: 200,
      hp: 70,
      material: 'glass',
      fixed: true,
      color: 0x39ff88,
      breakInto: ['shatter', 'goo'],
      build: () =>
        group(
          c(0.55, 0.55, 3, std(0xffffff, { transparent: true, opacity: 0.25, roughness: 0.05 }), 0, 0, 0, 32),
          c(0.5, 0.5, 2.8, glow(0x39ff88), 0, 0, 0, 32),
          c(0.65, 0.65, 0.2, std(0x3a4450), 0, -1.6, 0),
          c(0.65, 0.65, 0.2, std(0x3a4450), 0, 1.6, 0),
        ),
    };
  },
  cooler(): PropKind {
    return {
      shape: { kind: 'box', half: [0.35, 0.25, 0.23] },
      mass: 8,
      hp: 50,
      material: 'plastic',
      seat: 0.25,
      color: 0x1d9bf0,
      build: () => group(b(0.7, 0.45, 0.45, std(0x1d9bf0), 0, -0.02, 0), b(0.72, 0.08, 0.47, std(0xffffff), 0, 0.22, 0)),
    };
  },
  umbrella(): PropKind {
    return {
      shape: { kind: 'cyl', radius: 0.06, halfHeight: 1.15 },
      mass: 5,
      hp: 40,
      material: 'plastic',
      color: 0xff5d73,
      build: () => {
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 12), std(0xff5d73));
        canopy.position.y = 1.15;
        return group(c(0.03, 0.03, 2.3, std(0xffffff)), canopy);
      },
    };
  },
  beachBall(): PropKind {
    return {
      shape: { kind: 'ball', radius: 0.3 },
      mass: 0.4,
      hp: 9999,
      material: 'rubber',
      restitution: 0.85,
      build: () => {
        const cols = [0xff4d4d, 0xffffff, 0x3a86ff, 0xffd60a, 0xffffff, 0x2ec4b6];
        const g = group();
        cols.forEach((col, i) => {
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12, (i / 6) * Math.PI * 2, Math.PI / 3), std(col, { roughness: 0.4 }));
          g.add(seg);
        });
        return g;
      },
    };
  },
  deckChair(): PropKind {
    return {
      shape: { kind: 'box', half: [0.3, 0.25, 0.6] },
      mass: 7,
      hp: 40,
      material: 'wood',
      seat: 0.25,
      color: 0xff6b6b,
      build: () => {
        const cloth = std(0xffffff, { map: tex.stripes('#ff6b6b', '#ffffff', [3, 1]) });
        const frame = std(0x9c6b3f);
        const seatM = b(0.56, 0.03, 0.7, cloth, 0, 0, 0.1);
        const back = b(0.56, 0.03, 0.6, cloth, 0, 0.2, -0.45);
        back.rotation.x = -1;
        return group(seatM, back, b(0.04, 0.5, 0.04, frame, -0.28, -0.2, 0.4), b(0.04, 0.5, 0.04, frame, 0.28, -0.2, 0.4));
      },
    };
  },
  console(): PropKind {
    return {
      shape: { kind: 'box', half: [0.6, 0.5, 0.3] },
      mass: 60,
      hp: 140,
      material: 'electronic',
      seat: 0.5,
      color: 0x39424f,
      build: () => {
        const g = group(b(1.2, 1, 0.6, std(0x39424f, { metalness: 0.5 })));
        [0xff3b30, 0x34c759, 0x4cc9f0].forEach((col, i) => {
          const l = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), glow(col, 1));
          l.position.set(-0.4 + i * 0.4, 0.3, 0.301);
          g.add(l);
        });
        return g;
      },
    };
  },
  spaceWindow(): PropKind {
    return {
      shape: { kind: 'box', half: [4.6, 2.6, 0.05] },
      mass: 500,
      hp: 160,
      material: 'glass',
      fixed: true,
      breakInto: ['depressurize'],
      build: () => {
        const m = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.12, roughness: 0.05 });
        m.userData.outlineParameters = { visible: false };
        return group(new THREE.Mesh(new THREE.PlaneGeometry(9.2, 5.2), m));
      },
    };
  },
};
