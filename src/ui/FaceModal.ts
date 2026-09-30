import { h } from './dom';
import { FaceMorphLoader, STEPS } from '../face/FaceMorphLoader';
import { FaceScanError } from '../face/FaceScanner';
import { loadImage, makeProfile, toCanvas, type FaceProfile } from '../face/FaceProfile';
import { audio } from '../audio/AudioEngine';

const HAIR = [
  { label: 'From photo', color: 'photo' },
  { label: 'Black', color: '#1f1a17' },
  { label: 'Brown', color: '#5a3a22' },
  { label: 'Blonde', color: '#d8b35a' },
  { label: 'Red', color: '#a4432a' },
  { label: 'Grey', color: '#9a9a9a' },
  { label: 'Bald', color: null },
] as const;

export interface FaceModalHost {
  applyFace(profile: FaceProfile | null): void;
  hasFace(): boolean;
}

/** Upload / webcam capture → animated morph loader → hair choice → apply. */
export class FaceModal {
  private overlay: HTMLElement | null = null;
  private loader: FaceMorphLoader | null = null;
  private stream: MediaStream | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly host: FaceModalHost,
  ) {}

  open(): void {
    if (this.overlay) return;
    this.overlay = h('div', { class: 'overlay', onclick: (e: Event) => e.target === this.overlay && this.close() });
    this.parent.append(this.overlay);
    this.showPicker();
  }

  close(): void {
    this.stopCamera();
    this.loader?.dispose();
    this.loader = null;
    this.overlay?.remove();
    this.overlay = null;
  }

  private frame(title: string, sub: string, ...body: Array<Node | null>): HTMLElement {
    const modal = h(
      'div',
      { class: 'modal face-modal' },
      h('div', { class: 'modal-head' }, h('div', {}, h('h2', { text: title }), h('p', { class: 'sub', text: sub })), h('button', { class: 'close', text: '✕', 'aria-label': 'Close', onclick: () => this.close() })),
      ...body,
    );
    this.overlay!.replaceChildren(modal);
    return modal;
  }

  private showPicker(error?: string): void {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true }) as HTMLInputElement;
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) void this.fromFile(f);
    });
    const drop = h(
      'label',
      { class: 'dropzone' },
      h('div', { class: 'dz-ico', text: '📸' }),
      h('div', { class: 'dz-title', text: 'Drop a photo here or click to upload' }),
      h('div', { class: 'dz-sub', text: 'One clear, front-facing face works best. The photo never leaves your device.' }),
      input,
    );
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (f) void this.fromFile(f);
    });
    this.frame(
      'Give the boss a face',
      'Upload a photo. We scan it, build a 3D face and morph it onto the boss.',
      error ? h('div', { class: 'face-error', text: error }) : null,
      drop,
      h(
        'div',
        { class: 'face-actions' },
        h('button', { class: 'btn secondary', text: '🎥 Use camera', onclick: () => void this.showCamera() }),
        this.host.hasFace()
          ? h('button', {
              class: 'btn secondary',
              text: '↩ Default boss face',
              onclick: () => {
                this.host.applyFace(null);
                this.close();
              },
            })
          : null,
      ),
    );
  }

  private async showCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } });
    } catch {
      this.showPicker('Camera unavailable. Allow access or upload a photo instead.');
      return;
    }
    const video = h('video', { class: 'cam', autoplay: true, playsinline: true, muted: true }) as HTMLVideoElement;
    video.srcObject = this.stream;
    this.frame(
      'Say cheese',
      'Look straight at the camera.',
      video,
      h(
        'div',
        { class: 'face-actions' },
        h('button', {
          class: 'btn',
          text: '📸 Snap',
          onclick: () => {
            const c = toCanvas(video, 1280, true);
            this.stopCamera();
            audio.play('click', { intensity: 0.6 });
            void this.process(c);
          },
        }),
        h('button', { class: 'btn secondary', text: 'Back', onclick: () => (this.stopCamera(), this.showPicker()) }),
      ),
    );
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private async fromFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.showPicker('That file is not an image.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      await this.process(toCanvas(img, 1280));
    } catch (e) {
      this.showPicker(e instanceof Error ? e.message : String(e));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Public for tests: run the loader on an already-decoded image. */
  async process(image: HTMLCanvasElement): Promise<void> {
    this.loader?.dispose();
    const loader = (this.loader = new FaceMorphLoader());
    const steps = STEPS.map((s) => h('li', { text: s }));
    const bar = h('div');
    const after = h('div', { class: 'face-after', hidden: true });
    this.frame(
      'Building your boss…',
      'Hang tight, this takes a few seconds.',
      h('div', { class: 'fl-stage' }, loader.photoCanvas, loader.previewCanvas),
      h('ol', { class: 'fl-steps' }, ...steps),
      h('div', { class: 'progress' }, bar),
      after,
    );
    try {
      const data = await loader.run(image, {
        onStep: (i, state) => {
          steps[i].className = state;
        },
        onProgress: (f) => (bar.style.width = `${Math.round(f * 100)}%`),
      });
      if (this.loader !== loader) return;
      let hair: string | null = data.hair;
      const swatches = HAIR.map((o) => {
        const color = o.color === 'photo' ? data.hair : o.color;
        const b = h('button', {
          class: `swatch${o.color === 'photo' ? ' on' : ''}`,
          title: o.label,
          'aria-label': `Hair: ${o.label}`,
          onclick: () => {
            hair = color;
            loader.setHair(color);
            swatches.forEach((s) => s.classList.remove('on'));
            b.classList.add('on');
          },
        });
        b.style.background = color ?? 'repeating-linear-gradient(45deg,#555 0 4px,#333 4px 8px)';
        return b;
      });
      after.hidden = false;
      after.append(
        h('div', { class: 'hair-row' }, h('span', { text: 'Hair' }), ...swatches),
        h(
          'div',
          { class: 'face-actions' },
          h('button', {
            class: 'btn',
            text: '👊 Smash him!',
            onclick: () => {
              this.host.applyFace(makeProfile(image, loader.scannedLandmarks, data, hair));
              this.close();
            },
          }),
          h('button', { class: 'btn secondary', text: 'Try another photo', onclick: () => this.showPicker() }),
        ),
      );
      audio.play('twinkle', { intensity: 0.8 });
    } catch (e) {
      if (this.loader !== loader) return;
      this.showPicker(e instanceof FaceScanError ? e.message : `Something went wrong: ${String(e)}`);
    }
  }
}
