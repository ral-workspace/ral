import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────
const RENDER_SIZE = 48;
const CELL = 10;
const GAP = 0;
const COLS = Math.ceil(RENDER_SIZE / CELL);
const ROWS = Math.ceil(RENDER_SIZE / CELL);
const CX = COLS / 2;
const CY = ROWS / 2;

const PAL_SOLAR: [number, number, number][] = [
  [0, 100, 255],
  [0, 200, 160],
  [255, 180, 0],
  [255, 60, 100],
  [180, 0, 200],
  [80, 120, 255],
  [0, 200, 200],
];

const CFG = { warp: 2.5, scale: 5.0, oct: 5 };
const TOTAL_FRAMES = 120;
const LOOP_DURATION = 4; // seconds per loop

// ── Noise ────────────────────────────────────────────────────────────────────
const NT = new Float32Array(512);
for (let i = 0; i < 512; i++) NT[i] = Math.random() * 2 - 1;

function h(ix: number, iy: number): number {
  return NT[((ix & 255) + (iy & 255) * 57) & 511];
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return (
    h(ix, iy)         * (1 - ux) * (1 - uy) +
    h(ix + 1, iy)     * ux       * (1 - uy) +
    h(ix, iy + 1)     * (1 - ux) * uy +
    h(ix + 1, iy + 1) * ux       * uy
  );
}
function fbm(x: number, y: number, oct: number): number {
  let v = 0, a = 0.5, f = 1, m = 0;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, y * f) * a;
    m += a; a *= 0.5; f *= 2.1;
  }
  return v / m;
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function palSample(pal: [number, number, number][], v: number): [number, number, number] {
  v = Math.max(0, Math.min(1, v));
  const idx = v * (pal.length - 1);
  const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, pal.length - 1);
  const f = idx - i0;
  return [
    lerp(pal[i0][0], pal[i1][0], f),
    lerp(pal[i0][1], pal[i1][1], f),
    lerp(pal[i0][2], pal[i1][2], f),
  ];
}

// ── Circle mask (computed once) ──────────────────────────────────────────────
const circleMask = new Uint8Array(RENDER_SIZE * RENDER_SIZE);
const _half = RENDER_SIZE / 2;
const _r2 = _half * _half;
for (let py = 0; py < RENDER_SIZE; py++)
  for (let px = 0; px < RENDER_SIZE; px++) {
    const dx = px - _half + 0.5, dy = py - _half + 0.5;
    circleMask[py * RENDER_SIZE + px] = dx * dx + dy * dy <= _r2 ? 1 : 0;
  }

// ── Background colors per theme ──────────────────────────────────────────────
const BG_DARK:  [number, number, number] = [10, 10, 16];
const BG_LIGHT: [number, number, number] = [235, 235, 240];

// ── Pre-compute frames (module-level, runs once) ─────────────────────────────
function renderFrame(frameIdx: number, bg: [number, number, number]): Uint8ClampedArray {
  // Use sin/cos to loop time smoothly
  const phase = (frameIdx / TOTAL_FRAMES) * Math.PI * 2;
  const tx = Math.cos(phase) * 0.5;
  const ty = Math.sin(phase) * 0.5;

  const d = new Uint8ClampedArray(RENDER_SIZE * RENDER_SIZE * 4);

  // background
  for (let i = 0; i < RENDER_SIZE * RENDER_SIZE; i++) {
    d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255;
  }

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const nx = cx / COLS, ny = cy / ROWS;
      const sx = nx * CFG.scale, sy = ny * CFG.scale;
      const wx1 = fbm(sx + tx * 1.1, sy + ty * 0.9, CFG.oct);
      const wy1 = fbm(sx + 5.2 + ty * 0.9, sy + 1.7 + tx * 1.1, CFG.oct);
      const wx2 = fbm(sx + CFG.warp * wx1 + 1.7 + tx * 0.7, sy + CFG.warp * wy1 + 9.2 + ty * 0.7, CFG.oct);
      const wy2 = fbm(sx + CFG.warp * wx1 + 8.3 + ty * 0.8, sy + CFG.warp * wy1 + 2.8 + tx * 0.8, CFG.oct);
      const vRaw = (fbm(sx + CFG.warp * wx2, sy + CFG.warp * wy2, CFG.oct) + 1) * 0.5;
      // Stretch contrast so palette endpoints are actually reached
      const v = Math.max(0, Math.min(1, (vRaw - 0.3) / 0.4));

      const [r, g, b] = palSample(PAL_SOLAR, v);
      const ddx = cx - CX, ddy = cy - CY;
      const edgeDist = Math.sqrt(ddx * ddx + ddy * ddy) / (COLS / 2);
      const vig = 1 - Math.pow(Math.max(0, edgeDist), 2.5) * 0.55;
      const a = Math.min(1, (0.7 + v * 0.3) * vig);
      if (a < 0.02) continue;

      // Fill cell with 1px gap
      const px0 = cx * CELL + GAP, py0 = cy * CELL + GAP;
      const px1 = px0 + CELL - GAP, py1 = py0 + CELL - GAP;
      for (let py = py0; py < py1 && py < RENDER_SIZE; py++) {
        for (let px = px0; px < px1 && px < RENDER_SIZE; px++) {
          const i = (py * RENDER_SIZE + px) * 4;
          d[i]     = Math.round(d[i]     * (1 - a) + r * a);
          d[i + 1] = Math.round(d[i + 1] * (1 - a) + g * a);
          d[i + 2] = Math.round(d[i + 2] * (1 - a) + b * a);
        }
      }
    }
  }

  // circle mask
  for (let i = 0; i < RENDER_SIZE * RENDER_SIZE; i++) {
    if (!circleMask[i]) d[i * 4 + 3] = 0;
  }

  return d;
}

const frameCacheDark: Uint8ClampedArray[] = [];
const frameCacheLight: Uint8ClampedArray[] = [];
for (let i = 0; i < TOTAL_FRAMES; i++) {
  frameCacheDark.push(renderFrame(i, BG_DARK));
  frameCacheLight.push(renderFrame(i, BG_LIGHT));
}

// ── Component ────────────────────────────────────────────────────────────────
function SolarLoader({
  size = 16,
  className,
  ...props
}: {
  size?: number;
  className?: string;
} & React.HTMLAttributes<HTMLCanvasElement>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const imgData = ctx.createImageData(RENDER_SIZE, RENDER_SIZE);
    const start = performance.now();
    const msPerLoop = LOOP_DURATION * 1000;

    function draw() {
      const isDark = document.documentElement.classList.contains("dark");
      const cache = isDark ? frameCacheDark : frameCacheLight;
      const elapsed = performance.now() - start;
      const frameIdx = Math.floor((elapsed % msPerLoop) / msPerLoop * TOTAL_FRAMES);
      imgData.data.set(cache[frameIdx]);
      ctx.putImageData(imgData, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={RENDER_SIZE}
      height={RENDER_SIZE}
      className={cn("shrink-0", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        imageRendering: "pixelated",
      }}
      {...props}
    />
  );
}

export { SolarLoader };
