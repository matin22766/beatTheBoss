import * as THREE from 'three';
import { ROOM } from '../physics/ArenaColliders';

export interface StaticBox {
  pos: [number, number, number];
  half: [number, number, number];
  rotY?: number;
}

export interface ThemeInstance {
  group: THREE.Group;
  /** Static colliders for big props so the boss can be smashed into them. */
  colliders: StaticBox[];
  background: THREE.Color;
  fog?: THREE.Fog;
  update?(dt: number, time: number): void;
}

export interface ThemeDef {
  id: string;
  name: string;
  price: number;
  /** Gravity (m/s², negative = down). Defaults to Earth. */
  gravity?: number;
  /** Colour of cartoon dust puffs on wall impacts. */
  dust: number;
  build(): ThemeInstance;
}

export function std(color: THREE.ColorRepresentation, params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...params });
}

export function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadows = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 20): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface RoomMaterials {
  floor: THREE.Material;
  wall: THREE.Material;
  back?: THREE.Material;
  ceiling?: THREE.Material;
  trim?: THREE.Material;
}

/** Floor, back wall, two side walls and ceiling matching the physics room. */
export function buildRoom(mats: RoomMaterials): THREE.Group {
  const g = new THREE.Group();
  const { halfWidth: hw, back, front, height: h } = ROOM;
  const depth = front - back + 3;
  const midZ = back + depth / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, depth), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  floor.receiveShadow = true;
  floor.name = 'floor';
  g.add(floor);

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, h), mats.back ?? mats.wall);
  backWall.position.set(0, h / 2, back);
  backWall.receiveShadow = true;
  g.add(backWall);

  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, h), mats.wall);
    wall.rotation.y = (-s * Math.PI) / 2;
    wall.position.set(s * hw, h / 2, midZ);
    wall.receiveShadow = true;
    g.add(wall);
  }

  if (mats.ceiling) {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, depth), mats.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, h, midZ);
    g.add(ceil);
  }

  if (mats.trim) {
    g.add(box(hw * 2, 0.14, 0.04, mats.trim, 0, 0.07, back + 0.02, false));
    for (const s of [-1, 1]) g.add(box(0.04, 0.14, depth, mats.trim, s * (hw - 0.02), 0.07, midZ, false));
  }
  return g;
}

/** Standard three-light rig with a shadow-casting key light. */
export function lightRig(opts: {
  sky: THREE.ColorRepresentation;
  ground: THREE.ColorRepresentation;
  hemi: number;
  key: THREE.ColorRepresentation;
  keyIntensity: number;
  keyPos?: [number, number, number];
}): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(opts.sky, opts.ground, opts.hemi));
  const key = new THREE.DirectionalLight(opts.key, opts.keyIntensity);
  key.position.set(...(opts.keyPos ?? [3, 7, 5]));
  key.target.position.set(0, 1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  g.add(key, key.target);
  return g;
}
