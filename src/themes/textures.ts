import * as THREE from 'three';

/** Procedural canvas textures so the game ships with zero image assets. */

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvasTexture(w: number, h: number, draw: Draw, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  return tex;
}

/** Deterministic PRNG so textures look the same every load. */
export function rng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

export function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, amount: number, seed = 7, size = 2): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < (w * h) / (size * size * 3); i++) {
    ctx.fillStyle = shade(base, (r() - 0.5) * amount);
    ctx.fillRect(r() * w, r() * h, size, size);
  }
}

export const tex = {
  planks(base = '#9b6b43', repeat: [number, number] = [4, 3]) {
    return canvasTexture(
      512,
      512,
      (ctx, w, h) => {
        const r = rng(3);
        const rows = 8;
        const rh = h / rows;
        for (let y = 0; y < rows; y++) {
          let x = -r() * 200;
          while (x < w) {
            const len = 140 + r() * 180;
            ctx.fillStyle = shade(base, (r() - 0.5) * 0.12);
            ctx.fillRect(x, y * rh, len, rh);
            ctx.strokeStyle = shade(base, -0.05);
            ctx.globalAlpha = 0.35;
            for (let k = 0; k < 5; k++) {
              ctx.beginPath();
              const yy = y * rh + r() * rh;
              ctx.moveTo(x, yy);
              ctx.bezierCurveTo(x + len / 3, yy + (r() - 0.5) * 6, x + (2 * len) / 3, yy + (r() - 0.5) * 6, x + len, yy);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = shade(base, -0.22);
            ctx.fillRect(x, y * rh, 2, rh);
            x += len;
          }
          ctx.fillStyle = shade(base, -0.25);
          ctx.fillRect(0, y * rh, w, 2);
        }
      },
      repeat,
    );
  },
  tiles(a = '#e8e8e8', b = '#d0d0d0', grout = '#9a9a9a', n = 8, repeat: [number, number] = [4, 3], checker = true) {
    return canvasTexture(
      512,
      512,
      (ctx, w, h) => {
        const s = w / n;
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            ctx.fillStyle = checker && (x + y) % 2 ? b : a;
            ctx.fillRect(x * s, y * s, s, s);
          }
        ctx.strokeStyle = grout;
        ctx.lineWidth = 3;
        for (let i = 0; i <= n; i++) {
          ctx.beginPath();
          ctx.moveTo(i * s, 0);
          ctx.lineTo(i * s, h);
          ctx.moveTo(0, i * s);
          ctx.lineTo(w, i * s);
          ctx.stroke();
        }
      },
      repeat,
    );
  },
  stripes(a = '#d9cfb8', b = '#cfc4ab', repeat: [number, number] = [6, 1]) {
    return canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        noiseFill(ctx, w, h, a, 0.03, 11, 2);
        ctx.fillStyle = b;
        ctx.globalAlpha = 0.8;
        for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 24, h);
        ctx.globalAlpha = 1;
      },
      repeat,
    );
  },
  noise(base: string, amount = 0.08, repeat: [number, number] = [4, 4], seed = 5) {
    return canvasTexture(256, 256, (ctx, w, h) => noiseFill(ctx, w, h, base, amount, seed, 2), repeat);
  },
  bricks(base = '#9c4a33', mortar = '#c9b9a6', repeat: [number, number] = [3, 3]) {
    return canvasTexture(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = mortar;
        ctx.fillRect(0, 0, w, h);
        const r = rng(9);
        const bh = 32;
        const bw = 96;
        for (let y = 0; y < h / bh; y++) {
          const off = y % 2 ? bw / 2 : 0;
          for (let x = -1; x < w / bw + 1; x++) {
            ctx.fillStyle = shade(base, (r() - 0.5) * 0.14);
            ctx.fillRect(x * bw + off + 3, y * bh + 3, bw - 6, bh - 6);
          }
        }
      },
      repeat,
    );
  },
  concrete(base = '#8d8f93', repeat: [number, number] = [3, 3]) {
    return canvasTexture(
      512,
      512,
      (ctx, w, h) => {
        noiseFill(ctx, w, h, base, 0.07, 21, 3);
        const r = rng(4);
        ctx.strokeStyle = shade(base, -0.15);
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          let x = r() * w;
          let y = r() * h;
          ctx.moveTo(x, y);
          for (let k = 0; k < 6; k++) {
            x += (r() - 0.5) * 60;
            y += (r() - 0.5) * 60;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      repeat,
    );
  },
  skyline(top = '#7fb3e6', bottom = '#e8f1fa', night = false) {
    return canvasTexture(1024, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = rng(12);
      if (night) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 150; i++) ctx.fillRect(r() * w, r() * h * 0.5, 1.5, 1.5);
      }
      for (let layer = 0; layer < 2; layer++) {
        let x = 0;
        while (x < w) {
          const bw = 40 + r() * 90;
          const bh = h * (0.25 + r() * 0.45) * (layer ? 0.8 : 1);
          ctx.fillStyle = night ? (layer ? '#1a2238' : '#243052') : layer ? '#9fb2c8' : '#7890ab';
          ctx.fillRect(x, h - bh, bw, bh);
          ctx.fillStyle = night ? '#ffd76a' : '#d9e6f2';
          for (let wy = h - bh + 10; wy < h - 8; wy += 16)
            for (let wx = x + 6; wx < x + bw - 8; wx += 14) if (r() < (night ? 0.35 : 0.6)) ctx.fillRect(wx, wy, 7, 9);
          x += bw + 4;
        }
      }
    });
  },
  poster(text: string, bg = '#1f4e79', fg = '#ffffff', sub = '') {
    return canvasTexture(256, 340, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.38, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, w / 2, h * 0.78);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(sub, w / 2, h * 0.88);
    });
  },
  crowd(bg = '#141420') {
    return canvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const r = rng(31);
      for (let row = 0; row < 4; row++) {
        for (let x = -10; x < w + 10; x += 22 + r() * 8) {
          const y = h - 30 - row * 42 + r() * 8;
          const shade = 30 + row * 12 + r() * 25;
          ctx.fillStyle = `rgb(${shade},${shade},${shade + 12})`;
          ctx.beginPath();
          ctx.arc(x, y - 22, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(x - 13, y - 12, 26, 40);
          if (r() < 0.08) {
            ctx.fillStyle = '#fff8c0';
            ctx.fillRect(x - 3, y - 40, 6, 6); // camera flash
          }
        }
      }
    });
  },
  stars(planet = true) {
    return canvasTexture(1024, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05060f');
      g.addColorStop(1, '#161a3a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = rng(77);
      for (let i = 0; i < 500; i++) {
        const s = r() < 0.05 ? 2.5 : 1.2;
        ctx.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
        ctx.fillRect(r() * w, r() * h, s, s);
      }
      if (planet) {
        const pg = ctx.createRadialGradient(w * 0.72, h * 0.62, 10, w * 0.75, h * 0.7, 190);
        pg.addColorStop(0, '#7fc8ff');
        pg.addColorStop(0.6, '#2d6fb3');
        pg.addColorStop(1, '#0b1f40');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(w * 0.75, h * 0.72, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,220,180,0.5)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(w * 0.75, h * 0.72, 290, 50, -0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  },
  ocean() {
    return canvasTexture(1024, 512, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
      sky.addColorStop(0, '#4aa3df');
      sky.addColorStop(1, '#bfe6ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h * 0.55);
      ctx.fillStyle = '#fff6c9';
      ctx.beginPath();
      ctx.arc(w * 0.8, h * 0.18, 40, 0, Math.PI * 2);
      ctx.fill();
      const sea = ctx.createLinearGradient(0, h * 0.55, 0, h);
      sea.addColorStop(0, '#1b7fbf');
      sea.addColorStop(1, '#43c6d9');
      ctx.fillStyle = sea;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      const r = rng(5);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 60; i++) {
        const y = h * 0.58 + r() * h * 0.4;
        const x = r() * w;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 15, y - 4, x + 30, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 5; i++) {
        const cx = r() * w;
        const cy = h * (0.08 + r() * 0.2);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(cx + k * 22, cy + (k % 2) * 6, 18, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  },
  metal(base = '#5b6470', repeat: [number, number] = [4, 3]) {
    return canvasTexture(
      512,
      512,
      (ctx, w, h) => {
        noiseFill(ctx, w, h, base, 0.05, 41, 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        ctx.strokeRect(w / 2, 2, 0, h);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (const [x, y] of [
          [14, 14],
          [w - 14, 14],
          [14, h - 14],
          [w - 14, h - 14],
          [w / 2 - 12, h / 2],
          [w / 2 + 12, h / 2],
        ]) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      repeat,
    );
  },
  hazard() {
    return canvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1a1a1a';
      for (let x = -h; x < w + h; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 20, 0);
        ctx.lineTo(x + 20 - h, h);
        ctx.lineTo(x - h, h);
        ctx.fill();
      }
    }, [4, 1]);
  },
  sign(text: string, bg: string, fg: string) {
    return canvasTexture(512, 160, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = fg;
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 4);
    });
  },
  clockFace() {
    return canvasTexture(256, 256, (ctx, w) => {
      ctx.fillStyle = '#fdfdfd';
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillRect(w / 2 + Math.cos(a) * 100 - 4, w / 2 + Math.sin(a) * 100 - 4, 8, 8);
      }
    });
  },
};
