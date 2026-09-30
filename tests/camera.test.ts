import { describe, it, expect } from 'vitest';
import { CameraRig } from '../src/core/CameraRig';
import { ROOM } from '../src/physics/ArenaColliders';

describe('CameraRig', () => {
  it('never leaves the room, whatever the orbit', () => {
    const rig = new CameraRig(16 / 9);
    for (const [dx, dy, zoom] of [
      [-9999, 0, 9999],
      [9999, 0, 9999],
      [0, -9999, 9999],
      [0, 9999, 9999],
      [5000, 5000, 9999],
    ]) {
      rig.orbit(dx, dy);
      rig.zoom(zoom);
      for (let i = 0; i < 300; i++) rig.update(1 / 60);
      const p = rig.camera.position;
      expect(Math.abs(p.x)).toBeLessThan(ROOM.halfWidth);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(ROOM.height);
      expect(p.z).toBeGreaterThan(ROOM.back);
      expect(p.z).toBeLessThan(ROOM.visualFront);
    }
  });
});
