import type { FaceLandmarker } from '@mediapipe/tasks-vision';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface ScanResult {
  /** 478 normalised landmarks of the largest face (x, y in 0..1 of the image; z relative depth). */
  landmarks: Landmark[];
  faces: number;
}

let landmarker: Promise<FaceLandmarker> | null = null;

/** Lazily load MediaPipe's face landmarker (WASM + model are served locally from the build). */
export function loadLandmarker(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const base = new URL('mediapipe/', document.baseURI).href.replace(/\/$/, '');
    const fileset = await FilesetResolver.forVisionTasks(base);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: new URL('models/face_landmarker.task', document.baseURI).href, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 3,
      minFaceDetectionConfidence: 0.4,
    });
  })();
  landmarker.catch(() => (landmarker = null));
  return landmarker;
}

export class FaceScanError extends Error {
  constructor(
    message: string,
    readonly code: 'no-face' | 'too-small' | 'turned' | 'load',
  ) {
    super(message);
  }
}

/** Detect the most prominent face and sanity-check that it's usable. */
export async function scanFace(image: HTMLImageElement | HTMLCanvasElement): Promise<ScanResult> {
  let lm: FaceLandmarker;
  try {
    lm = await loadLandmarker();
  } catch (e) {
    throw new FaceScanError(`Couldn't load the face scanner (${String(e)})`, 'load');
  }
  const res = lm.detect(image);
  const faces = res.faceLandmarks ?? [];
  if (!faces.length) throw new FaceScanError("We couldn't find a face in that photo. Try a clear, front-facing shot.", 'no-face');
  // Pick the largest face.
  const width = (pts: Landmark[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  const best = faces.slice().sort((a, b) => width(b) - width(a))[0];
  const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  if (width(best) * w < 90) throw new FaceScanError('That face is too small. Crop closer or use a higher-resolution photo.', 'too-small');
  // Yaw check: nose tip should sit between the eyes.
  const nose = best[1];
  const eyeR = best[33];
  const eyeL = best[263];
  const t = (nose.x - eyeR.x) / (eyeL.x - eyeR.x);
  if (t < 0.2 || t > 0.8) throw new FaceScanError('The face is turned too far. A front-facing photo works best.', 'turned');
  return { landmarks: best, faces: faces.length };
}
