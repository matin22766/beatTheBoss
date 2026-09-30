import { buildFace, type FaceData } from './FaceBuilder';
import type { Landmark } from './FaceScanner';

/** Everything needed to put a user's face on the boss (and to rebuild it after a reload). */
export interface FaceProfile {
  data: FaceData;
  skin: string;
  hair: string | null;
  /** Downscaled source photo (JPEG data URL) and its landmarks, for persistence. */
  source: { image: string; landmarks: Landmark[] };
}

const KEY = 'bossSmash.face.v1';

/** Draw an image into a canvas no larger than `max` px on its long side. */
export function toCanvas(img: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, max = 1280, mirror = false): HTMLCanvasElement {
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img instanceof HTMLVideoElement ? img.videoWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img instanceof HTMLVideoElement ? img.videoHeight : img.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext('2d')!;
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

export function makeProfile(source: HTMLCanvasElement, landmarks: Landmark[], data?: FaceData, hair?: string | null): FaceProfile {
  const face = data ?? buildFace(source, landmarks);
  return {
    data: face,
    skin: face.skin,
    hair: hair === undefined ? face.hair : hair,
    source: { image: toCanvas(source, 720).toDataURL('image/jpeg', 0.85), landmarks },
  };
}

export function saveProfile(p: FaceProfile | null): void {
  try {
    if (!p) {
      localStorage.removeItem(KEY);
      return;
    }
    const lm = p.source.landmarks.map((l) => [+l.x.toFixed(5), +l.y.toFixed(5), +l.z.toFixed(5)]);
    localStorage.setItem(KEY, JSON.stringify({ v: 1, image: p.source.image, lm, hair: p.hair }));
  } catch {
    // Storage full or blocked: the face just won't survive a reload.
  }
}

export async function loadProfile(): Promise<FaceProfile | null> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { v: number; image: string; lm: number[][]; hair: string | null };
    if (d.v !== 1 || !Array.isArray(d.lm) || d.lm.length < 468) return null;
    const img = await loadImage(d.image);
    const canvas = toCanvas(img, 1280);
    const landmarks = d.lm.map(([x, y, z]) => ({ x, y, z }));
    return makeProfile(canvas, landmarks, undefined, d.hair);
  } catch {
    return null;
  }
}
