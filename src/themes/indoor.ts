import * as THREE from 'three';
import { box, buildRoom, cyl, lightRig, std, type StaticBox, type ThemeDef } from './Theme';
import { tex } from './textures';

function crate(g: THREE.Group, colliders: StaticBox[], x: number, y: number, z: number, s = 0.8, rotY = 0): void {
  const wood = std(0xffffff, { map: tex.planks('#a8763e', [1, 1]) });
  const c = box(s, s, s, wood, x, y + s / 2, z);
  c.rotation.y = rotY;
  g.add(c);
  const edge = std(0x6b4523);
  for (const dy of [-s / 2 + 0.04, s / 2 - 0.04]) {
    const b = box(s + 0.02, 0.06, s + 0.02, edge, x, y + s / 2 + dy, z);
    b.rotation.y = rotY;
    g.add(b);
  }
  colliders.push({ pos: [x, y + s / 2, z], half: [s / 2, s / 2, s / 2], rotY });
}

function barrel(g: THREE.Group, colliders: StaticBox[], x: number, z: number, color: number): void {
  g.add(cyl(0.3, 0.3, 0.9, std(color, { metalness: 0.3, roughness: 0.5 }), x, 0.45, z));
  for (const y of [0.2, 0.7]) g.add(cyl(0.31, 0.31, 0.04, std(0x333333), x, y, z));
  colliders.push({ pos: [x, 0.45, z], half: [0.3, 0.45, 0.3] });
}

export const warehouse: ThemeDef = {
  id: 'warehouse',
  name: 'Warehouse',
  price: 800,
  dust: 0xb9b2a5,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    g.add(
      buildRoom({
        floor: std(0xffffff, { map: tex.concrete('#8a8a86', [4, 3]) }),
        wall: std(0xffffff, { map: tex.bricks('#8f4a33', '#bfae9a', [4, 2]) }),
        ceiling: std(0x2c2c2c),
      }),
    );
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.25), std(0xffffff, { map: tex.hazard() }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.005, -1.9);
    g.add(stripe);
    crate(g, colliders, -3.9, 0, -2.3, 1);
    crate(g, colliders, -2.8, 0, -2.4, 0.8, 0.3);
    crate(g, colliders, -3.9, 1, -2.3, 0.8, 0.5);
    crate(g, colliders, 3.8, 0, 1.6, 0.9, 0.2);
    barrel(g, colliders, 3.9, -2.3, 0x2a6fdb);
    barrel(g, colliders, 3.2, -2.5, 0xc1121f);
    barrel(g, colliders, 4.3, -1.6, 0x2a6fdb);
    // Pallet stack and a loading door.
    g.add(box(1.2, 0.15, 1, std(0x9c6b3f), -4.2, 0.075, 1.2), box(1.2, 0.15, 1, std(0x9c6b3f), -4.2, 0.23, 1.2));
    colliders.push({ pos: [-4.2, 0.15, 1.2], half: [0.6, 0.15, 0.5] });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2), std(0x6f7a84, { metalness: 0.5, roughness: 0.4 }));
    door.position.set(0.8, 1.6, -2.99);
    g.add(door);
    for (let i = 0; i < 10; i++) g.add(box(2.6, 0.03, 0.02, std(0x4a535b), 0.8, 0.3 + i * 0.3, -2.97, false));
    // Hanging lamps.
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1c1 });
    for (const x of [-2.5, 0, 2.5]) {
      g.add(cyl(0.01, 0.01, 1.4, std(0x222222), x, 5.3, 0));
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 16, 1, true), std(0x2f4f3f, { side: THREE.DoubleSide }));
      shade.position.set(x, 4.5, 0);
      g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lampMat);
      bulb.position.set(x, 4.38, 0);
      g.add(bulb);
    }
    g.add(lightRig({ sky: 0xfff1d6, ground: 0x4d443a, hemi: 0.9, key: 0xffe2b0, keyIntensity: 2.4, keyPos: [1, 8, 3] }));
    return { group: g, colliders, background: new THREE.Color(0x2a2522) };
  },
};

export const boxingRing: ThemeDef = {
  id: 'ring',
  name: 'Boxing Ring',
  price: 1200,
  dust: 0xe0e0e0,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    g.add(
      buildRoom({
        floor: std(0xffffff, { map: tex.noise('#3c5a88', 0.06, [4, 3]) }),
        wall: std(0x14141c),
        back: std(0xffffff, { map: tex.crowd() }),
      }),
    );
    // Apron logo.
    const logo = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), std(0xffffff, { map: tex.sign('SMASH', '#c1121f', '#ffffff') }));
    logo.rotation.x = -Math.PI / 2;
    logo.position.set(0, 0.004, 0.3);
    g.add(logo);
    // Corner posts and ropes on the back and sides (the front stays open for the camera).
    const posts: Array<[number, number, number]> = [
      [-4.4, -2.6, 0xc1121f],
      [4.4, -2.6, 0x1d4ed8],
      [-4.4, 2.6, 0xeeeeee],
      [4.4, 2.6, 0xeeeeee],
    ];
    for (const [x, z, c] of posts) {
      g.add(cyl(0.08, 0.08, 1.6, std(0xcccccc, { metalness: 0.6, roughness: 0.3 }), x, 0.8, z));
      g.add(box(0.3, 1.3, 0.3, std(c), x, 0.85, z));
      colliders.push({ pos: [x, 0.8, z], half: [0.15, 0.8, 0.15] });
    }
    const rope = std(0xf5f5f5);
    const ropeRed = std(0xc1121f);
    for (const [i, y] of [0.55, 0.95, 1.35].entries()) {
      const m = i === 1 ? ropeRed : rope;
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 8.8, 8), m);
      back.rotation.z = Math.PI / 2;
      back.position.set(0, y, -2.6);
      g.add(back);
      for (const x of [-4.4, 4.4]) {
        const side = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 5.2, 8), m);
        side.rotation.x = Math.PI / 2;
        side.position.set(x, y, 0);
        g.add(side);
      }
    }
    // Spotlight cones and a scoreboard.
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff6d5, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
    coneMat.userData.outlineParameters = { visible: false };
    for (const x of [-2.5, 2.5]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 24, 1, true), coneMat);
      cone.position.set(x, 3, 0);
      g.add(cone);
    }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshBasicMaterial({ map: tex.sign('ROUND 1', '#111', '#ffcc33') }));
    board.position.set(0, 4.6, -2.95);
    g.add(board);
    g.add(lightRig({ sky: 0xffffff, ground: 0x202030, hemi: 0.7, key: 0xffffff, keyIntensity: 3, keyPos: [0, 9, 2] }));
    return { group: g, colliders, background: new THREE.Color(0x0b0b12), fog: new THREE.Fog(0x0b0b12, 10, 22) };
  },
};

export const kitchen: ThemeDef = {
  id: 'kitchen',
  name: 'Staff Kitchen',
  price: 1500,
  dust: 0xf2efe6,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    g.add(
      buildRoom({
        floor: std(0xffffff, { map: tex.tiles('#f1f1f1', '#1f1f1f', '#777', 8, [5, 4]) }),
        wall: std(0xffffff, { map: tex.tiles('#e9f3f1', '#e9f3f1', '#bcd', 12, [5, 3], false) }),
        ceiling: std(0xf4f4f4),
        trim: std(0x3d7a6c),
      }),
    );
    // Counter run with cabinets along the back.
    const counter = std(0x2f3b45);
    const top = std(0xd9d4c8, { roughness: 0.4 });
    g.add(box(6, 0.9, 0.7, std(0x6fa89a), -1, 0.45, -2.62), box(6.1, 0.06, 0.75, top, -1, 0.93, -2.6));
    for (let i = 0; i < 6; i++) g.add(box(0.03, 0.7, 0.01, counter, -3.5 + i, 0.45, -2.26, false));
    colliders.push({ pos: [-1, 0.48, -2.62], half: [3, 0.48, 0.38] });
    g.add(box(6, 0.8, 0.4, std(0x6fa89a), -1, 2.6, -2.8));
    // Fridge.
    g.add(box(0.9, 2.1, 0.8, std(0xe8ecef, { metalness: 0.3, roughness: 0.3 }), 3.9, 1.05, -2.5));
    g.add(box(0.04, 0.5, 0.05, std(0x888888), 3.5, 1.4, -2.08));
    colliders.push({ pos: [3.9, 1.05, -2.5], half: [0.45, 1.05, 0.4] });
    // Stove, kettle, hanging pans, a microwave and a dinner table.
    g.add(box(0.8, 0.02, 0.6, std(0x111111), -2.6, 0.97, -2.6));
    for (const x of [-2.8, -2.4]) g.add(cyl(0.12, 0.12, 0.01, std(0x444444), x, 0.985, -2.6));
    g.add(cyl(0.12, 0.1, 0.2, std(0xd62828), -0.5, 1.06, -2.6));
    g.add(box(0.55, 0.32, 0.4, std(0xdddddd), 1, 1.12, -2.62));
    for (const [i, x] of [-1.5, -1, -0.5].entries()) {
      const pan = cyl(0.16 - i * 0.02, 0.14 - i * 0.02, 0.04, std(0x2b2b30), x + 2.2, 1.62, -2.95);
      pan.rotation.x = Math.PI / 2;
      g.add(pan);
    }
    g.add(box(1.4, 0.06, 0.9, std(0xb07d4f), -3.6, 0.75, 1), box(0.06, 0.72, 0.06, std(0x333333), -4.2, 0.36, 0.6), box(0.06, 0.72, 0.06, std(0x333333), -3, 0.36, 1.4));
    colliders.push({ pos: [-3.6, 0.39, 1], half: [0.7, 0.39, 0.45] });
    g.add(lightRig({ sky: 0xffffff, ground: 0x8a8f86, hemi: 1.2, key: 0xfffbf2, keyIntensity: 2.1 }));
    return { group: g, colliders, background: new THREE.Color(0xe9f3f1) };
  },
};

export const lab: ThemeDef = {
  id: 'lab',
  name: 'Science Lab',
  price: 2500,
  dust: 0xc9f2ff,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    g.add(
      buildRoom({
        floor: std(0xffffff, { map: tex.tiles('#dfe6ea', '#cfd8de', '#9aa5ad', 6, [4, 3]) }),
        wall: std(0xffffff, { map: tex.metal('#b9c4cc', [4, 2]) }),
        ceiling: std(0xd8e0e6),
      }),
    );
    const glow = (color: number) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
      m.userData.outlineParameters = { visible: false };
      return m;
    };
    // Lab bench with glowing flasks.
    g.add(box(3.4, 0.9, 0.8, std(0x2d3a45), -2.6, 0.45, -2.5), box(3.5, 0.05, 0.85, std(0x111111), -2.6, 0.92, -2.5));
    colliders.push({ pos: [-2.6, 0.47, -2.5], half: [1.7, 0.47, 0.4] });
    const liquids = [0x39ff88, 0xff3dd1, 0x4cc9f0, 0xffd60a];
    liquids.forEach((c, i) => {
      g.add(cyl(0.07, 0.12, 0.25, std(0xffffff, { transparent: true, opacity: 0.35, roughness: 0.05 }), -3.8 + i * 0.7, 1.07, -2.5));
      g.add(cyl(0.06, 0.1, 0.14, glow(c), -3.8 + i * 0.7, 1.02, -2.5));
    });
    // Giant specimen tube.
    const tube = cyl(0.55, 0.55, 3, std(0xffffff, { transparent: true, opacity: 0.25, roughness: 0.05 }), 3.6, 1.7, -2.2, 32);
    g.add(tube, cyl(0.5, 0.5, 2.8, glow(0x39ff88), 3.6, 1.7, -2.2, 32));
    g.add(cyl(0.65, 0.65, 0.2, std(0x3a4450), 3.6, 0.1, -2.2), cyl(0.65, 0.65, 0.2, std(0x3a4450), 3.6, 3.3, -2.2));
    colliders.push({ pos: [3.6, 1.7, -2.2], half: [0.6, 1.7, 0.6] });
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), std(0xffffff, { map: tex.sign('⚠ DANGER', '#f2c230', '#111') }));
    warn.position.set(0.5, 2.6, -2.98);
    g.add(warn);
    const bubbles: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 8, 6), glow(0xd8ffe8));
      b.position.set(3.6 + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 2.8, -2.2 + (Math.random() - 0.5) * 0.6);
      bubbles.push(b);
      g.add(b);
    }
    g.add(lightRig({ sky: 0xdff6ff, ground: 0x506070, hemi: 1.1, key: 0xe6f7ff, keyIntensity: 2.2 }));
    const green = new THREE.PointLight(0x39ff88, 6, 6, 1.5);
    green.position.set(3.2, 2, -1.4);
    g.add(green);
    return {
      group: g,
      colliders,
      background: new THREE.Color(0xc9d6de),
      update(dt) {
        for (const b of bubbles) {
          b.position.y += dt * 0.6;
          if (b.position.y > 3.1) b.position.y = 0.3;
        }
      },
    };
  },
};
