import { describe, it, expect } from 'vitest';
import { FACE_POSITIONS, FACE_TRIANGLES, FACE_UVS } from '../src/face/canonicalFace';
import { alignLandmarks, applyFit, fitToHead, HEAD_RADIUS, VERTS } from '../src/face/FaceBuilder';
import { FACE_OVAL, EYE_L, EYE_R, NOSE_TIP } from '../src/face/regions';

/** Fake MediaPipe output: the canonical face rolled, scaled and placed in a W×H image. */
function fakeLandmarks(roll: number, pxPerCm: number, W: number, H: number) {
  const out = [];
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  for (let i = 0; i < 478; i++) {
    const k = i % VERTS;
    const x = FACE_POSITIONS[k * 3];
    const y = FACE_POSITIONS[k * 3 + 1];
    const z = FACE_POSITIONS[k * 3 + 2];
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    out.push({ x: (W / 2 + rx * pxPerCm) / W, y: (H / 2 - ry * pxPerCm) / H, z: (-z * pxPerCm) / W });
  }
  return out;
}

describe('canonical face mesh', () => {
  it('has the expected topology', () => {
    expect(FACE_POSITIONS.length).toBe(468 * 3);
    expect(FACE_UVS.length).toBe(468 * 2);
    expect(FACE_TRIANGLES.length).toBe(898 * 3);
    expect(Math.max(...FACE_TRIANGLES)).toBe(467);
  });
});

describe('alignLandmarks', () => {
  it('undoes roll, scale and translation', () => {
    const lm = fakeLandmarks(0.3, 9, 800, 1000);
    const a = alignLandmarks(lm, 800, 1000, 1);
    let maxErr = 0;
    for (let i = 0; i < a.length; i++) maxErr = Math.max(maxErr, Math.abs(a[i] - FACE_POSITIONS[i]));
    expect(maxErr).toBeLessThan(0.05);
  });
});

describe('fitToHead + applyFit', () => {
  const fit = fitToHead(FACE_POSITIONS);
  const p = applyFit(FACE_POSITIONS, fit);
  const len = (i: number) => Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);

  it('keeps every vertex on or outside the skull', () => {
    for (let i = 0; i < VERTS; i++) expect(len(i)).toBeGreaterThanOrEqual(HEAD_RADIUS);
  });

  it('seats the face rim on the skull surface', () => {
    for (const i of FACE_OVAL) expect(Math.abs(len(i) - HEAD_RADIUS)).toBeLessThan(0.003);
  });

  it('keeps facial relief: the nose stands well proud of the skull', () => {
    expect(len(NOSE_TIP) - HEAD_RADIUS).toBeGreaterThan(0.02);
  });

  it('produces a sensibly sized, forward-facing face', () => {
    const width = Math.abs(p[454 * 3] - p[234 * 3]);
    expect(width).toBeGreaterThan(0.25);
    expect(width).toBeLessThan(0.45);
    expect(p[NOSE_TIP * 3 + 2]).toBeGreaterThan(HEAD_RADIUS);
    const eyeY = (p[EYE_R.outer * 3 + 1] + p[EYE_L.outer * 3 + 1]) / 2;
    expect(eyeY).toBeGreaterThan(-0.02);
    expect(eyeY).toBeLessThan(0.09);
  });
});
