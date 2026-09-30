import { RAPIER, G, groups, type PhysicsWorld } from './PhysicsWorld';

/** Interior bounds of every arena room (metres). The camera looks in from +Z through an invisible wall. */
export const ROOM = {
  halfWidth: 5,
  back: -3,
  front: 3.2,
  height: 6,
  /** The visible room continues behind the camera so orbiting never leaves the box. */
  visualFront: 7.8,
} as const;

export type Surface = 'floor' | 'wall' | 'ceiling' | 'glass';

/** Builds the static room box. Returns a map from collider handle to surface kind. */
export function buildArenaColliders(physics: PhysicsWorld): Map<number, Surface> {
  const world = physics.world;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const t = 1; // wall thickness: thick walls prevent tunnelling on hard throws
  const { halfWidth: hw, back, front, height: h } = ROOM;
  const midZ = (back + front) / 2;
  const halfDepth = (front - back) / 2;
  const boxes: Array<[Surface, number, number, number, number, number, number]> = [
    ['floor', 0, -t, midZ, hw + t, t, halfDepth + t],
    ['ceiling', 0, h + t, midZ, hw + t, t, halfDepth + t],
    ['wall', -hw - t, h / 2, midZ, t, h / 2 + t, halfDepth + t],
    ['wall', hw + t, h / 2, midZ, t, h / 2 + t, halfDepth + t],
    ['wall', 0, h / 2, back - t, hw + t, h / 2 + t, t],
    ['glass', 0, h / 2, front + t, hw + t, h / 2 + t, t],
  ];
  const surfaces = new Map<number, Surface>();
  for (const [kind, x, y, z, hx, hy, hz] of boxes) {
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setFriction(kind === 'floor' ? 0.9 : 0.5)
        .setRestitution(kind === 'glass' ? 0.3 : 0.15)
        .setCollisionGroups(groups(G.ARENA, G.BOSS | G.WEAPON | G.PROJECTILE | G.PROP)),
      body,
    );
    surfaces.set(c.handle, kind);
  }
  return surfaces;
}
