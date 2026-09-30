import * as THREE from 'three';
import { box, buildRoom, cyl, lightRig, std, type StaticBox, type ThemeDef } from './Theme';
import { tex } from './textures';
import { place, props } from '../props/propLib';

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
    const propsList = [
      place(props.crate(1), -3.9, 0.5, -2.3),
      place(props.crate(0.8), -2.8, 0.4, -2.4, 0.3),
      place(props.crate(0.8), -3.9, 1.4, -2.3, 0.5),
      place(props.crate(0.9), 3.8, 0.45, 1.6, 0.2),
      place(props.crate(0.6), 2.9, 0.3, 1.9, 0.6),
      place(props.barrel(0x2a6fdb), 3.9, 0.45, -2.3),
      place(props.barrel(0xc1121f), 3.2, 0.45, -2.5),
      place(props.barrel(0x2a6fdb), 4.3, 0.45, -1.6),
      place(props.pallet(), -4.2, 0.07, 1.2),
      place(props.pallet(), -4.2, 0.22, 1.2, 0.1),
      place(props.bucket(), -2.1, 0.15, -2.5),
    ];
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
    return { group: g, colliders, props: propsList, background: new THREE.Color(0x2a2522) };
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
    const propsList = [
      place(props.stool(), -3.8, 0.3, -2.0, 0.4),
      place(props.stool(), 3.8, 0.3, -2.0),
      place(props.bucket(), -3.3, 0.15, -2.3),
      place(props.bucket(), 3.3, 0.15, -2.3),
      place(props.chair(0x1d4ed8), 3.9, 0.23, 1.8, -0.6),
    ];
    return { group: g, colliders, props: propsList, background: new THREE.Color(0x0b0b12), fog: new THREE.Fog(0x0b0b12, 10, 22) };
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
    // Stove top is built in; everything else can be thrown.
    g.add(box(0.8, 0.02, 0.6, std(0x111111), -2.6, 0.97, -2.6));
    for (const x of [-2.8, -2.4]) g.add(cyl(0.12, 0.12, 0.01, std(0x444444), x, 0.985, -2.6));
    const propsList = [
      place(props.fridge(), 3.9, 1.05, -2.5),
      place(props.microwave(), 1, 1.13, -2.62),
      place(props.kettle(), -0.5, 1.08, -2.6),
      place(props.pan(), -2.6, 1.02, -2.6),
      place(props.mug(0x2a9d8f), 0.2, 1.02, -2.55),
      place(props.diningTable(), -3.3, 0.39, 1),
      place(props.chair(), -3.3, 0.23, 0.25),
      place(props.chair(), -3.3, 0.23, 1.75, Math.PI),
      place(props.chair(), -2.3, 0.23, 1, -Math.PI / 2),
    ];
    g.add(lightRig({ sky: 0xffffff, ground: 0x8a8f86, hemi: 1.2, key: 0xfffbf2, keyIntensity: 2.1 }));
    return { group: g, colliders, props: propsList, background: new THREE.Color(0xe9f3f1) };
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
    // Bench, flasks and the specimen tube are all breakable.
    const liquids = [0x39ff88, 0xff3dd1, 0x4cc9f0, 0xffd60a];
    const propsList = [
      place(props.labBench(), -2.6, 0.47, -2.5),
      ...liquids.map((c, i) => place(props.flask(c), -3.8 + i * 0.7, 1.08, -2.5)),
      place(props.specimenTube(), 3.6, 1.7, -2.2),
      place(props.chair(0x3a4450), -1.2, 0.23, -1.7, 0.5),
      place(props.crate(0.6), 1.8, 0.3, -2.4),
    ];
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), std(0xffffff, { map: tex.sign('⚠ DANGER', '#f2c230', '#111') }));
    warn.position.set(0.5, 2.6, -2.98);
    g.add(warn);
    g.add(lightRig({ sky: 0xdff6ff, ground: 0x506070, hemi: 1.1, key: 0xe6f7ff, keyIntensity: 2.2 }));
    const green = new THREE.PointLight(0x39ff88, 6, 6, 1.5);
    green.position.set(3.2, 2, -1.4);
    g.add(green);
    return { group: g, colliders, props: propsList, background: new THREE.Color(0xc9d6de) };
  },
};
