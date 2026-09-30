import * as THREE from 'three';
import { box, buildRoom, lightRig, std, type StaticBox, type ThemeDef } from './Theme';
import { tex } from './textures';
import { place, props } from '../props/propLib';
import type { PropSpec } from '../props/PropSystem';

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

    // Furniture: all of it can be grabbed, thrown and broken.
    const propsList: PropSpec[] = [
      place(props.desk(), -3.3, 0.4, -2.2),
      place(props.monitor(), -3.1, 1.03, -2.35),
      place(props.mug(0xffffff), -3.9, 0.87, -2.1),
      place(props.mug(0xd62828), -2.6, 0.87, -2.0),
      place(props.officeChair(), -3.2, 0.46, -1.4, 0.3),
      place(props.filingCabinet(), 3.9, 0.65, -2.5),
      place(props.plantPot(), 4.4, 0.45, -1.4),
      place(props.waterCooler(), -4.6, 0.72, 0.6),
      place(props.officeChair(), 2.6, 0.46, -1.9, -0.4),
      // Window panes in front of the skyline.
      place(props.windowPane(1.36, 1.9), -3.13, 2.6, -2.9),
      place(props.windowPane(1.36, 1.9), -1.67, 2.6, -2.9),
    ];

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
      props: propsList,
      background: new THREE.Color(0xd9d0bd),
      update(_dt, time) {
        minPivot.rotation.z = -time * 0.5;
        hourPivot.rotation.z = -time * 0.04;
      },
    };
  },
};
