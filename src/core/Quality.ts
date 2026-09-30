import * as THREE from 'three';
import type { Quality } from '../economy/Save';

export interface QualityTarget {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  outlineEnabled: boolean;
}

const PRESETS: Record<Quality, { pixelRatio: number; shadows: boolean; shadowSize: number; outline: boolean }> = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 512, outline: false },
  medium: { pixelRatio: 1.25, shadows: true, shadowSize: 1024, outline: true },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, outline: true },
};

const ORDER: Quality[] = ['low', 'medium', 'high'];

/** Applies render quality presets and steps quality down automatically if the frame rate sags. */
export class QualityManager {
  private frames = 0;
  private elapsed = 0;
  private slowWindows = 0;
  private warmup = 4;

  constructor(
    private readonly target: QualityTarget,
    public level: Quality,
    public auto: boolean,
    private readonly onAutoLower: (to: Quality) => void,
  ) {
    this.apply(level);
  }

  apply(level: Quality): void {
    this.level = level;
    const p = PRESETS[level];
    const r = this.target.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
    const size = r.getSize(new THREE.Vector2());
    r.setSize(size.x, size.y, false);
    this.target.outlineEnabled = p.outline;
    if (r.shadowMap.enabled !== p.shadows) {
      r.shadowMap.enabled = p.shadows;
      // Materials must recompile to pick up the shadow change.
      this.target.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    }
    this.refreshShadowMaps();
    this.warmup = 3;
    this.slowWindows = 0;
  }

  /** Re-apply the shadow-map resolution (after a theme adds new lights). */
  refreshShadowMaps(): void {
    const s = PRESETS[this.level].shadowSize;
    this.target.scene.traverse((o) => {
      if (o instanceof THREE.DirectionalLight && o.castShadow && o.shadow.mapSize.x !== s) {
        o.shadow.mapSize.set(s, s);
        o.shadow.map?.dispose();
        o.shadow.map = null;
      }
    });
  }

  /** Call every frame with real seconds. */
  sample(dt: number): void {
    if (!this.auto || document.hidden) return;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 2) return;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    this.slowWindows = fps < 40 ? this.slowWindows + 1 : 0;
    const i = ORDER.indexOf(this.level);
    if (this.slowWindows >= 2 && i > 0) {
      this.apply(ORDER[i - 1]);
      this.onAutoLower(this.level);
    }
  }
}
