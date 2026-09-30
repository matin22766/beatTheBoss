import * as THREE from 'three';
import { box, buildRoom, cyl, lightRig, std, type StaticBox, type ThemeDef } from './Theme';
import { canvasTexture, tex } from './textures';
import { ROOM } from '../physics/ArenaColliders';

const basic = (params: THREE.MeshBasicMaterialParameters) => {
  const m = new THREE.MeshBasicMaterial(params);
  m.userData.outlineParameters = { visible: false };
  return m;
};

/** Big backdrop plane behind the back wall. */
function backdrop(map: THREE.Texture, w = 26, h = 13, z = ROOM.back - 6, y = 4): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic({ map, fog: false }));
  m.position.set(0, y, z);
  return m;
}

export const rooftop: ThemeDef = {
  id: 'rooftop',
  name: 'Rooftop at Night',
  price: 800,
  dust: 0x8c93a8,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    const chain = canvasTexture(
      128,
      128,
      (ctx, w) => {
        ctx.clearRect(0, 0, w, w);
        ctx.strokeStyle = '#9aa3b5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = -w; i < w * 2; i += 32) {
          ctx.moveTo(i, 0);
          ctx.lineTo(i + w, w);
          ctx.moveTo(i + w, 0);
          ctx.lineTo(i, w);
        }
        ctx.stroke();
      },
      [10, 5],
    );
    const fence = std(0xffffff, { map: chain, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    g.add(buildRoom({ floor: std(0xffffff, { map: tex.concrete('#3b3e46', [5, 4]) }), wall: fence, back: fence }));
    g.add(backdrop(tex.skyline('#0b1026', '#2a1f4d', true)));
    // Parapet, AC units, water tower, neon sign, moon.
    g.add(box(10, 0.5, 0.2, std(0x5a5f6b), 0, 0.25, -2.95));
    const ac = std(0xb8bec8, { metalness: 0.4, roughness: 0.5 });
    for (const [x, z] of [
      [-3.8, -2.2],
      [-2.6, -2.3],
    ]) {
      g.add(box(1, 0.8, 0.8, ac, x, 0.4, z));
      g.add(cyl(0.3, 0.3, 0.05, std(0x333333), x, 0.83, z));
      colliders.push({ pos: [x, 0.4, z], half: [0.5, 0.4, 0.4] });
    }
    const tower = new THREE.Group();
    tower.position.set(3.7, 0, -2.3);
    tower.add(cyl(0.7, 0.7, 1.3, std(0x6b4a33), 0, 2.2, 0), new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.5, 16), std(0x3b2a1e)));
    tower.children[1].position.y = 3.1;
    for (const [x, z] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ])
      tower.add(cyl(0.04, 0.04, 1.6, std(0x333333), x, 0.8, z));
    g.add(tower);
    colliders.push({ pos: [3.7, 1.5, -2.3], half: [0.7, 1.5, 0.7] });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), basic({ map: tex.sign('OPEN 24/7', '#14051f', '#ff4fd8') }));
    neon.position.set(-1.5, 2.6, -2.9);
    g.add(neon);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), basic({ color: 0xfff6d8, fog: false }));
    moon.position.set(6, 8, ROOM.back - 5.9);
    g.add(moon);
    g.add(lightRig({ sky: 0x7b8cff, ground: 0x1a1426, hemi: 0.8, key: 0xb7c4ff, keyIntensity: 1.6, keyPos: [-3, 8, 4] }));
    const pink = new THREE.PointLight(0xff4fd8, 8, 8, 1.4);
    pink.position.set(-1.5, 2.4, -2.2);
    g.add(pink);
    return {
      group: g,
      colliders,
      background: new THREE.Color(0x0b1026),
      update(_dt, t) {
        pink.intensity = 6 + Math.sin(t * 9) * 1.5 + (Math.sin(t * 23) > 0.95 ? -5 : 0);
      },
    };
  },
};

export const beach: ThemeDef = {
  id: 'beach',
  name: 'Beach Day',
  price: 1200,
  dust: 0xf3dfae,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    g.add(buildRoom({ floor: std(0xffffff, { map: tex.noise('#e9cf8f', 0.12, [8, 6], 17) }), wall: null, back: undefined }));
    g.add(backdrop(tex.ocean(), 34, 17, ROOM.back - 8, 5));
    // Wet sand strip, palms, umbrella, cooler, lifeguard stand.
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), std(0xc9ad6e));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(0, 0.002, ROOM.back - 3);
    g.add(wet);
    const palm = (x: number, z: number, lean: number) => {
      const p = new THREE.Group();
      p.position.set(x, 0, z);
      for (let i = 0; i < 8; i++) {
        const seg = cyl(0.14 - i * 0.008, 0.16 - i * 0.008, 0.5, std(0x8b5a2b), Math.sin(i * 0.2) * lean, 0.25 + i * 0.48, 0);
        seg.rotation.z = -lean * 0.2;
        p.add(seg);
      }
      for (let k = 0; k < 7; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.8, 4), std(0x2e8b3a));
        leaf.position.set(lean * 1.4, 3.9, 0);
        leaf.rotation.set(Math.PI / 2 + 0.5, (k / 7) * Math.PI * 2, 0, 'YXZ');
        leaf.translateY(0.8);
        p.add(leaf);
      }
      g.add(p);
      colliders.push({ pos: [x, 1.8, z], half: [0.2, 1.8, 0.2] });
    };
    palm(-4.2, -2.4, 0.8);
    palm(4.3, -1.8, -0.6);
    const umbrella = new THREE.Group();
    umbrella.position.set(-2.4, 0, -1.6);
    umbrella.add(cyl(0.03, 0.03, 2.2, std(0xffffff), 0, 1.1, 0));
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 12), std(0xff5d73));
    canopy.position.y = 2.3;
    umbrella.add(canopy);
    g.add(umbrella);
    g.add(box(0.7, 0.45, 0.45, std(0x1d9bf0), 2.4, 0.225, -2.2), box(0.72, 0.08, 0.47, std(0xffffff), 2.4, 0.47, -2.2));
    colliders.push({ pos: [2.4, 0.25, -2.2], half: [0.35, 0.25, 0.23] });
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), std(0xffffff, { map: tex.stripes('#ff6b6b', '#ffffff', [3, 1]) }));
    towel.rotation.x = -Math.PI / 2;
    towel.position.set(-2.2, 0.005, -0.4);
    g.add(towel);
    g.add(lightRig({ sky: 0xbfe6ff, ground: 0xe9cf8f, hemi: 1.3, key: 0xfff4d6, keyIntensity: 2.8, keyPos: [4, 9, 3] }));
    return { group: g, colliders, background: new THREE.Color(0x8fd3ff), fog: new THREE.Fog(0xbfe6ff, 16, 40) };
  },
};

export const space: ThemeDef = {
  id: 'space',
  name: 'Space Station',
  price: 1500,
  gravity: -3.2,
  dust: 0xc8d4ff,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    const panel = std(0xffffff, { map: tex.metal('#566170', [3, 2]), metalness: 0.4, roughness: 0.5 });
    g.add(buildRoom({ floor: std(0xffffff, { map: tex.metal('#3f4753', [5, 4]), metalness: 0.5, roughness: 0.45 }), wall: panel, back: basic({ color: 0x000000 }), ceiling: panel }));
    // Huge window onto space on the back wall.
    const view = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), basic({ map: tex.stars(true) }));
    view.position.set(0, 3, ROOM.back + 0.01);
    g.add(view);
    const frame = std(0x2a2f38, { metalness: 0.6, roughness: 0.4 });
    for (const x of [-3.3, 0, 3.3]) g.add(box(0.15, 6, 0.15, frame, x, 3, ROOM.back + 0.08));
    g.add(box(10, 0.2, 0.2, frame, 0, 0.6, ROOM.back + 0.1), box(10, 0.2, 0.2, frame, 0, 5.4, ROOM.back + 0.1));
    // Consoles with blinking lights.
    const blinkers: THREE.Mesh[] = [];
    for (const x of [-4, 4]) {
      g.add(box(1.2, 1, 0.6, std(0x39424f, { metalness: 0.5 }), x, 0.5, -2.4));
      colliders.push({ pos: [x, 0.5, -2.4], half: [0.6, 0.5, 0.3] });
      for (let i = 0; i < 6; i++) {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), basic({ color: [0xff3b30, 0x34c759, 0x4cc9f0][i % 3] }));
        l.position.set(x - 0.4 + (i % 3) * 0.4, 0.8 + Math.floor(i / 3) * 0.15, -2.09);
        blinkers.push(l);
        g.add(l);
      }
    }
    const floatSign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), basic({ map: tex.sign('LOW GRAVITY', '#101826', '#7ff6ff') }));
    floatSign.position.set(0, 5.2, -2.9);
    g.add(floatSign);
    g.add(lightRig({ sky: 0xa9c4ff, ground: 0x22262e, hemi: 0.9, key: 0xdfe8ff, keyIntensity: 2.2, keyPos: [2, 8, 4] }));
    return {
      group: g,
      colliders,
      background: new THREE.Color(0x05060f),
      update(_dt, t) {
        blinkers.forEach((b, i) => (b.visible = Math.sin(t * (2 + i * 0.7) + i) > -0.2));
        view.position.x = Math.sin(t * 0.05) * 0.3;
      },
    };
  },
};
