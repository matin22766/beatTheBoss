import * as THREE from 'three';
import { box, buildRoom, cyl, lightRig, std, type StaticBox, type ThemeDef } from './Theme';
import { tex } from './textures';

export const office: ThemeDef = {
  id: 'office',
  name: 'Corner Office',
  price: 0,
  dust: 0xd8d0c0,
  build() {
    const g = new THREE.Group();
    const colliders: StaticBox[] = [];
    g.add(
      buildRoom({
        floor: std(0xffffff, { map: tex.noise('#5d6b7e', 0.1, [6, 4]), roughness: 1 }),
        wall: std(0xffffff, { map: tex.stripes('#e3d9c2', '#d8cdb3') }),
        ceiling: std(0xf1f1ee),
        trim: std(0x6b4f36),
      }),
    );

    // Window with city skyline on the back wall.
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2), new THREE.MeshBasicMaterial({ map: tex.skyline() }));
    win.position.set(-2.4, 2.6, -2.99);
    g.add(win);
    const frame = std(0xf5f5f5);
    g.add(box(3, 0.1, 0.08, frame, -2.4, 3.6, -2.96), box(3, 0.1, 0.08, frame, -2.4, 1.6, -2.96));
    g.add(box(0.1, 2.1, 0.08, frame, -3.85, 2.6, -2.96), box(0.1, 2.1, 0.08, frame, -0.95, 2.6, -2.96));
    g.add(box(0.06, 2, 0.06, frame, -2.4, 2.6, -2.96));

    // Motivational poster + clock.
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), std(0xffffff, { map: tex.poster('SYNERGY', '#1f4e79', '#fff', 'Teamwork makes the dream work') }));
    poster.position.set(2.4, 2.4, -2.98);
    g.add(poster);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), std(0xffffff, { map: tex.clockFace() }));
    clock.position.set(0.6, 4.1, -2.98);
    g.add(clock);
    const hands = new THREE.Group();
    hands.position.set(0.6, 4.1, -2.97);
    const hourHand = box(0.03, 0.17, 0.01, std(0x111111), 0, 0.07, 0, false);
    const minHand = box(0.02, 0.26, 0.01, std(0x111111), 0, 0.11, 0, false);
    const hourPivot = new THREE.Group();
    const minPivot = new THREE.Group();
    hourPivot.add(hourHand);
    minPivot.add(minHand);
    hands.add(hourPivot, minPivot);
    g.add(hands);

    // Desk with monitor (left back).
    const wood = std(0x8a5a36, { map: tex.planks('#8a5a36', [1, 1]) });
    const desk = new THREE.Group();
    desk.position.set(-3.3, 0, -2.2);
    desk.add(box(2, 0.08, 0.9, wood, 0, 0.78, 0));
    for (const [x, z] of [
      [-0.9, -0.38],
      [0.9, -0.38],
      [-0.9, 0.38],
      [0.9, 0.38],
    ])
      desk.add(box(0.07, 0.76, 0.07, std(0x3a3a3a), x, 0.38, z));
    desk.add(box(0.6, 0.38, 0.04, std(0x111111), 0.2, 1.1, -0.2), box(0.08, 0.2, 0.08, std(0x222222), 0.2, 0.9, -0.2));
    desk.add(box(0.42, 0.02, 0.15, std(0x333333), 0.1, 0.83, 0.15));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.33), new THREE.MeshBasicMaterial({ color: 0x3b7dd8 }));
    screen.position.set(0.2, 1.1, -0.177);
    desk.add(screen);
    desk.add(cyl(0.05, 0.04, 0.12, std(0xffffff), -0.6, 0.88, 0.1));
    g.add(desk);
    colliders.push({ pos: [-3.3, 0.41, -2.2], half: [1, 0.41, 0.45] });

    // Filing cabinet and plant (right back).
    const metal = std(0x8e9aa6, { metalness: 0.4, roughness: 0.5 });
    const cab = box(0.6, 1.3, 0.6, metal, 3.9, 0.65, -2.5);
    g.add(cab);
    for (let i = 0; i < 3; i++) g.add(box(0.25, 0.04, 0.03, std(0x444444), 3.9, 0.3 + i * 0.4, -2.19, false));
    colliders.push({ pos: [3.9, 0.65, -2.5], half: [0.3, 0.65, 0.3] });
    g.add(cyl(0.25, 0.2, 0.45, std(0xb5562b), 4.4, 0.225, -1.4));
    const leaf = std(0x2f8f3a);
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), leaf);
      l.position.set(4.4 + Math.cos(i) * 0.18, 0.7 + (i % 3) * 0.22, -1.4 + Math.sin(i * 2) * 0.18);
      l.scale.set(0.8, 1.3, 0.8);
      l.castShadow = true;
      g.add(l);
    }
    colliders.push({ pos: [4.4, 0.4, -1.4], half: [0.3, 0.4, 0.3] });

    // Water cooler (left wall).
    g.add(box(0.4, 1, 0.4, std(0xeeeeee), -4.6, 0.5, 0.6));
    g.add(cyl(0.17, 0.17, 0.45, std(0x7ec8f0, { transparent: true, opacity: 0.6, roughness: 0.1 }), -4.6, 1.25, 0.6));
    colliders.push({ pos: [-4.6, 0.7, 0.6], half: [0.2, 0.7, 0.2] });

    // Ceiling light panels.
    const panel = new THREE.MeshBasicMaterial({ color: 0xfffdf0 });
    for (const x of [-2.5, 0, 2.5]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), panel);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, 5.98, 0);
      g.add(p);
    }

    g.add(lightRig({ sky: 0xffffff, ground: 0x7a6e60, hemi: 1.1, key: 0xfff4e0, keyIntensity: 2.2 }));

    return {
      group: g,
      colliders,
      background: new THREE.Color(0xd9d0bd),
      update(_dt, time) {
        minPivot.rotation.z = -time * 0.5;
        hourPivot.rotation.z = -time * 0.04;
      },
    };
  },
};
