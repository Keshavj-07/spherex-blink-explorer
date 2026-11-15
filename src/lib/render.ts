import { COLORMAP_LUTS } from '../utils/colormaps';
import { applyStretch } from '../utils/stretches';
import { Colormap, StretchMode } from '../types/astronomy';

/** Robust display limits from a sample of all frames, so blinking compares like with like. */
export function percentiles(frames: Float32Array[], lo = 0.5, hi = 99.5): [number, number] {
  const sample: number[] = [];
  for (const f of frames) {
    const step = Math.max(1, Math.floor(f.length / 20000));
    for (let i = 0; i < f.length; i += step) if (isFinite(f[i])) sample.push(f[i]);
  }
  if (!sample.length) return [0, 1];
  sample.sort((a, b) => a - b);
  const q = (p: number) => sample[Math.min(sample.length - 1, Math.max(0, Math.round((p / 100) * (sample.length - 1))))];
  const a = q(lo);
  const b = q(hi);
  return b > a ? [a, b] : [a, a + 1e-6];
}

export function absPercentile(f: Float32Array, p = 99.5): number {
  const s: number[] = [];
  const step = Math.max(1, Math.floor(f.length / 20000));
  for (let i = 0; i < f.length; i += step) if (isFinite(f[i])) s.push(Math.abs(f[i]));
  if (!s.length) return 1;
  s.sort((a, b) => a - b);
  return s[Math.round((p / 100) * (s.length - 1))] || 1e-6;
}

/**
 * Paint an n×n float image (row 0 = south) into ImageData (row 0 = top/north).
 * Diverging mode maps [-lim, +lim] symmetrically (used for difference images).
 */
export function paint(
  out: ImageData,
  data: Float32Array,
  n: number,
  vmin: number,
  vmax: number,
  stretch: StretchMode,
  cmap: Colormap,
  diverging = false
) {
  const lut = COLORMAP_LUTS[cmap];
  const px = out.data;
  const range = vmax - vmin || 1;
  for (let y = 0; y < n; y++) {
    const row = n - 1 - y;
    for (let x = 0; x < n; x++) {
      const v = data[y * n + x];
      const o = (row * n + x) * 4;
      if (!isFinite(v)) {
        px[o] = 40;
        px[o + 1] = 20;
        px[o + 2] = 45;
        px[o + 3] = 255;
        continue;
      }
      let t: number;
      if (diverging) {
        const lim = Math.max(Math.abs(vmin), Math.abs(vmax)) || 1;
        const u = Math.max(-1, Math.min(1, v / lim));
        const su = stretch === 'linear' ? u : Math.sign(u) * applyStretch(Math.abs(u), stretch);
        t = 0.5 + su / 2;
      } else {
        t = applyStretch((v - vmin) / range, stretch);
      }
      const c = lut[Math.max(0, Math.min(255, Math.round(t * 255)))];
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = 255;
    }
  }
}

/** Remove the residual sky level (median) so epochs with different zodiacal/background levels compare cleanly. */
export function subtractMedian(f: Float32Array): Float32Array {
  const s: number[] = [];
  for (let i = 0; i < f.length; i++) if (isFinite(f[i])) s.push(f[i]);
  if (!s.length) return f;
  s.sort((a, b) => a - b);
  const m = s[Math.floor(s.length / 2)];
  const out = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = f[i] - m;
  return out;
}

export function meanFrames(frames: Float32Array[]): Float32Array {
  const n = frames[0].length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (const f of frames) {
      const v = f[i];
      if (isFinite(v)) {
        s += v;
        c++;
      }
    }
    out[i] = c ? s / c : NaN;
  }
  return out;
}

export function subtract(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}
