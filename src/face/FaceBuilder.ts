import { FACE_POSITIONS, FACE_TRIANGLES, FACE_UVS } from './canonicalFace';
import { CHEEKS, EYE_L, EYE_R, FACE_OVAL } from './regions';
import type { Landmark } from './FaceScanner';

export const VERTS = FACE_POSITIONS.length / 3;
export const HEAD_RADIUS = 0.25;
/** Where the eye line sits on the boss's head (head-local metres). */
const EYE_LINE_Y = 0.06;

export interface FitParams {
  scale: number;
  yOff: number;
  zOff: number;
}

export interface FaceData {
  /** Head-local vertex positions (metres) of the user's face. */
  positions: Float32Array;
  /** The canonical face fitted the same way: the morph starts here. */
  neutral: Float32Array;
  texture: HTMLCanvasElement;
  skin: string;
  hair: string | null;
}

function mean(p: ArrayLike<number>, idx: number[]): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of idx) {
    x += p[i * 3];
    y += p[i * 3 + 1];
    z += p[i * 3 + 2];
  }
  return [x / idx.length, y / idx.length, z / idx.length];
}

/**
 * Bring photo landmarks into the canonical face frame: undo roll, scale by inter-ocular distance,
 * match the eye midpoint and mean depth, then blend toward the canonical shape to tame noise.
 */
export function alignLandmarks(lm: Landmark[], imgW: number, imgH: number, amount = 0.85): Float32Array {
  const P = new Float32Array(VERTS * 3);
  for (let i = 0; i < VERTS; i++) {
    P[i * 3] = lm[i].x * imgW;
    P[i * 3 + 1] = -lm[i].y * imgH;
    P[i * 3 + 2] = -lm[i].z * imgW;
  }
  const C = FACE_POSITIONS;
  const uR = mean(P, [EYE_R.outer, EYE_R.inner]);
  const uL = mean(P, [EYE_L.outer, EYE_L.inner]);
  const cR = mean(C, [EYE_R.outer, EYE_R.inner]);
  const cL = mean(C, [EYE_L.outer, EYE_L.inner]);
  const uAng = Math.atan2(uL[1] - uR[1], uL[0] - uR[0]);
  const cAng = Math.atan2(cL[1] - cR[1], cL[0] - cR[0]);
  const k = Math.hypot(cL[0] - cR[0], cL[1] - cR[1]) / Math.hypot(uL[0] - uR[0], uL[1] - uR[1]);
  const rot = cAng - uAng;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const uM = [(uR[0] + uL[0]) / 2, (uR[1] + uL[1]) / 2];
  const cM = [(cR[0] + cL[0]) / 2, (cR[1] + cL[1]) / 2];

  const out = new Float32Array(VERTS * 3);
  let zSumU = 0;
  let zSumC = 0;
  for (let i = 0; i < VERTS; i++) {
    const x = (P[i * 3] - uM[0]) * k;
    const y = (P[i * 3 + 1] - uM[1]) * k;
    out[i * 3] = x * cos - y * sin + cM[0];
    out[i * 3 + 1] = x * sin + y * cos + cM[1];
    out[i * 3 + 2] = P[i * 3 + 2] * k;
    zSumU += out[i * 3 + 2];
    zSumC += C[i * 3 + 2];
  }
  const dz = (zSumC - zSumU) / VERTS;
  for (let i = 0; i < VERTS; i++) {
    for (let a = 0; a < 3; a++) {
      const u = out[i * 3 + a] + (a === 2 ? dz : 0);
      out[i * 3 + a] = C[i * 3 + a] + (u - C[i * 3 + a]) * amount;
    }
  }
  return out;
}

/** Face width (cheek to cheek) on the boss's head, in metres. */
export const FACE_WIDTH = 0.32;

/** Scale the face to a fixed cartoon width and put the eye line at EYE_LINE_Y. */
export function fitToHead(face: Float32Array): FitParams {
  const eyes = mean(face, [EYE_R.outer, EYE_R.inner, EYE_L.outer, EYE_L.inner]);
  const width = Math.abs(face[454 * 3] - face[234 * 3]) || 15;
  const s = FACE_WIDTH / width;
  return { scale: s, yOff: EYE_LINE_Y - eyes[1] * s, zOff: 0 };
}

/** Least-squares fit of z = a + b·x² + c·y² + d·y through the face outline (the "base" surface). */
function fitBase(xs: number[], ys: number[], zs: number[]): (x: number, y: number) => number {
  const rows = xs.map((x, k) => [1, x * x, ys[k] * ys[k], ys[k]]);
  const n = 4;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  rows.forEach((r, k) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += r[i] * r[j];
      A[i][n] += r[i] * zs[k];
    }
  });
  for (let i = 0; i < n; i++) A[i][i] += 1e-9;
  // Gaussian elimination.
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const [a, b, c2, d] = A.map((row, i) => row[n] / row[i]);
  return (x, y) => a + b * x * x + c2 * y * y + d * y;
}

/**
 * Relief-map the face onto the skull: every vertex keeps its (x, y), sits on the sphere there, and
 * is lifted by its height above a smooth base surface fitted through the face outline. The rim
 * lands exactly on the skin; nose, lips and brows stand proud of it.
 */
export function applyFit(face: Float32Array, fit: FitParams, R = HEAD_RADIUS): Float32Array {
  const out = new Float32Array(face.length);
  const s = fit.scale;
  const X = (i: number) => face[i * 3] * s;
  const Y = (i: number) => face[i * 3 + 1] * s + fit.yOff;
  const Z = (i: number) => face[i * 3 + 2] * s;
  // The smooth "skull" part of the face is already provided by the sphere, so relief is measured
  // against a quadratic fitted through every vertex: what's left is nose, lips, brows and sockets.
  const all = Array.from({ length: VERTS }, (_, i) => i);
  const base = fitBase(all.map(X), all.map(Y), all.map(Z));
  const oval = new Set(FACE_OVAL);
  const rimX = FACE_OVAL.map(X);
  const rimY = FACE_OVAL.map(Y);
  for (let i = 0; i < VERTS; i++) {
    const x = X(i);
    const y = Y(i);
    const r2 = Math.min(x * x + y * y, R * R * 0.995);
    const zs = Math.sqrt(R * R - r2);
    // Fade relief to zero toward the rim so the face melts into the skull.
    let rim = Infinity;
    for (let k = 0; k < rimX.length; k++) rim = Math.min(rim, Math.hypot(x - rimX[k], y - rimY[k]));
    const fade = Math.min(1, rim / 0.04);
    const n = [x / R, y / R, zs / R];
    const relief = oval.has(i) ? 0.0015 : 0.0035 + Math.max(-0.002, (Z(i) - base(x, y)) * fade * fade);
    out[i * 3] = x + n[0] * relief;
    out[i * 3 + 1] = y + n[1] * relief;
    out[i * 3 + 2] = zs + n[2] * relief;
  }
  return out;
}

// ------------------------------------------------------------------------ DOM-only helpers

type Img = HTMLImageElement | HTMLCanvasElement;

function imgSize(img: Img): [number, number] {
  return img instanceof HTMLImageElement ? [img.naturalWidth, img.naturalHeight] : [img.width, img.height];
}

/** Unwrap the photo into the canonical UV layout, one affine-mapped triangle at a time. */
export function warpTexture(img: Img, lm: Landmark[], size = 1024, onProgress?: (f: number) => void): HTMLCanvasElement {
  const [W, H] = imgSize(img);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tris = FACE_TRIANGLES;
  for (let t = 0; t < tris.length; t += 3) {
    const ids = [tris[t], tris[t + 1], tris[t + 2]];
    const s = ids.map((i) => [lm[i].x * W, lm[i].y * H]);
    const d = ids.map((i) => [FACE_UVS[i * 2] * size, (1 - FACE_UVS[i * 2 + 1]) * size]);
    drawTriangle(ctx, img, s, d);
    if (onProgress && t % 300 === 0) onProgress(t / tris.length);
  }
  featherEdges(ctx, size);
  return canvas;
}

function drawTriangle(ctx: CanvasRenderingContext2D, img: Img, s: number[][], d: number[][]): void {
  const [[x0, y0], [x1, y1], [x2, y2]] = s;
  const [[u0, v0], [u1, v1], [u2, v2]] = d;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-6) return;
  // Solve the affine map src → dst.
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
  const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
  const dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  const e = u0 - a * x0 - c * y0;
  const f = v0 - b * x0 - dd * y0;
  // Expand the clip triangle slightly to hide hairline seams.
  const cx = (u0 + u1 + u2) / 3;
  const cy = (v0 + v1 + v2) / 3;
  const grow = (px: number, py: number): [number, number] => {
    const dx = px - cx;
    const dy = py - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [px + (dx / len) * 1.2, py + (dy / len) * 1.2];
  };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...grow(u0, v0));
  ctx.lineTo(...grow(u1, v1));
  ctx.lineTo(...grow(u2, v2));
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, dd, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Fade the texture's alpha toward the face outline so it melts into the skin-coloured head. */
function featherEdges(ctx: CanvasRenderingContext2D, size: number): void {
  const mask = document.createElement('canvas');
  mask.width = mask.height = size;
  const m = mask.getContext('2d')!;
  const pts = FACE_OVAL.map((i) => [FACE_UVS[i * 2] * size, (1 - FACE_UVS[i * 2 + 1]) * size]);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  m.filter = `blur(${Math.round(size * 0.03)}px)`;
  m.fillStyle = '#fff';
  m.beginPath();
  pts.forEach(([x, y], i) => {
    const px = cx + (x - cx) * 0.9;
    const py = cy + (y - cy) * 0.9;
    if (i) m.lineTo(px, py);
    else m.moveTo(px, py);
  });
  m.closePath();
  m.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}

function sampleAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): [number, number, number] | null {
  const sx = Math.max(0, Math.round(x - r));
  const sy = Math.max(0, Math.round(y - r));
  const w = Math.min(ctx.canvas.width - sx, r * 2);
  const h = Math.min(ctx.canvas.height - sy, r * 2);
  if (w <= 0 || h <= 0) return null;
  const d = ctx.getImageData(sx, sy, w, h).data;
  let R = 0;
  let G = 0;
  let B = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    R += d[i];
    G += d[i + 1];
    B += d[i + 2];
  }
  return [R / n, G / n, B / n];
}

const hex = ([r, g, b]: [number, number, number]) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Median-ish skin tone from the cheeks and a hair colour guess from above the forehead. */
export function sampleColors(img: Img, lm: Landmark[]): { skin: string; hair: string } {
  const [W, H] = imgSize(img);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const faceW = (lm[454].x - lm[234].x) * W;
  const r = Math.max(2, Math.round(faceW * 0.03));
  const samples = CHEEKS.map((i) => sampleAt(ctx, lm[i].x * W, lm[i].y * H, r)).filter((s): s is [number, number, number] => !!s);
  // Drop the darkest and brightest (shadows, highlights) and average the rest.
  samples.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  const mid = samples.slice(1, Math.max(2, samples.length - 1));
  const skin = mid.reduce((s, v) => [s[0] + v[0] / mid.length, s[1] + v[1] / mid.length, s[2] + v[2] / mid.length] as [number, number, number], [0, 0, 0] as [number, number, number]);

  const faceH = (lm[152].y - lm[10].y) * H;
  const hairPts = [
    [lm[10].x * W, lm[10].y * H - faceH * 0.12],
    [lm[54].x * W, lm[54].y * H - faceH * 0.1],
    [lm[284].x * W, lm[284].y * H - faceH * 0.1],
  ];
  const hs = hairPts.map(([x, y]) => sampleAt(ctx, x, y, r)).filter((s): s is [number, number, number] => !!s);
  const hair = hs.length ? (hs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map((v) => v / hs.length) as [number, number, number]) : [60, 40, 30];
  return { skin: hex(skin), hair: hex(hair as [number, number, number]) };
}

/**
 * Skin tone as the mid-luminance band of the unwrapped face: robust against dark brows/eyes and
 * bright teeth/highlights, and measured on exactly the pixels that will sit next to the skull.
 */
export function medianSkin(texture: HTMLCanvasElement): string | null {
  const ctx = texture.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width: W, height: H } = texture;
  const d = ctx.getImageData(0, 0, W, H).data;
  const px: Array<[number, number, number, number]> = [];
  for (let k = 0; k < 4000; k++) {
    const i = Math.floor(Math.random() * W * H) * 4;
    if (d[i + 3] < 250) continue;
    px.push([d[i], d[i + 1], d[i + 2], d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11]);
  }
  if (px.length < 50) return null;
  px.sort((a, b) => a[3] - b[3]);
  const band = px.slice(Math.floor(px.length * 0.35), Math.floor(px.length * 0.65));
  const avg = band.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / band.length);
  return hex(avg as [number, number, number]);
}

const lum = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
};

/** The hair sample often catches background: only trust it when it is clearly darker than skin. */
export function plausibleHair(hair: string, skin: string): string {
  return lum(hair) < lum(skin) - 25 ? hair : '#2b211c';
}

/** Full build: geometry for the user's face and for the neutral morph start, plus texture and colours. */
export function buildFace(img: Img, lm: Landmark[], onProgress?: (f: number) => void): FaceData {
  const [W, H] = imgSize(img);
  const aligned = alignLandmarks(lm, W, H);
  const fit = fitToHead(aligned);
  const positions = applyFit(aligned, fit);
  const neutral = applyFit(FACE_POSITIONS, fitToHead(FACE_POSITIONS));
  const texture = warpTexture(img, lm, 1024, onProgress);
  const sampled = sampleColors(img, lm);
  const skin = medianSkin(texture) ?? sampled.skin;
  return { positions, neutral, texture, skin, hair: plausibleHair(sampled.hair, skin) };
}
