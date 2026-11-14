import { Colormap } from '../types/astronomy';

// Precomputed 256-entry lookup tables for ultra-fast canvas manipulation
type RGB = [number, number, number];

function createLUT(generator: (t: number) => RGB): RGB[] {
  const lut: RGB[] = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255.0;
    lut.push(generator(t));
  }
  return lut;
}

const grayscaleLUT = createLUT((t) => {
  const v = Math.round(t * 255);
  return [v, v, v];
});

// Scientific Viridis colormap approximation
const viridisLUT = createLUT((t) => {
  const r = Math.max(0, Math.min(255, Math.round(255 * (0.280268 + t * (0.871068 + t * (-0.038234 + t * -0.111812))))));
  const g = Math.max(0, Math.min(255, Math.round(255 * (0.003922 + t * (1.4046 + t * (-0.4079 + t * -0.002))))));
  const b = Math.max(0, Math.min(255, Math.round(255 * (0.4184 + t * (-0.1188 + t * (1.272 + t * -0.575))))));
  return [r, g, b];
});

// Scientific Inferno colormap approximation
const infernoLUT = createLUT((t) => {
  let r = 0, g = 0, b = 0;
  if (t < 0.25) {
    const u = t / 0.25;
    r = Math.round(15 + u * 60);
    g = Math.round(5 + u * 15);
    b = Math.round(25 + u * 95);
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    r = Math.round(75 + u * 110);
    g = Math.round(20 + u * 40);
    b = Math.round(120 - u * 30);
  } else if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    r = Math.round(185 + u * 50);
    g = Math.round(60 + u * 80);
    b = Math.round(90 - u * 60);
  } else {
    const u = (t - 0.75) / 0.25;
    r = Math.round(235 + u * 20);
    g = Math.round(140 + u * 115);
    b = Math.round(30 + u * 130);
  }
  return [r, g, b];
});

// Coolwarm colormap (ideal for difference dipole visualization: blue < 128, white ~ 128, red > 128)
const coolwarmLUT = createLUT((t) => {
  let r = 0, g = 0, b = 0;
  if (t < 0.5) {
    const u = t * 2.0; // 0 to 1
    r = Math.round(59 + u * 196);
    g = Math.round(76 + u * 179);
    b = Math.round(192 + u * 63);
  } else {
    const u = (t - 0.5) * 2.0; // 0 to 1
    r = Math.round(255 - u * 75);
    g = Math.round(255 - u * 217);
    b = Math.round(255 - u * 217);
  }
  return [r, g, b];
});

// Rainbow colormap
const rainbowLUT = createLUT((t) => {
  const h = (1.0 - t) * 240; // 240 (blue) down to 0 (red)
  const c = 1.0;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (h >= 0 && h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h >= 60 && h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h >= 120 && h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h >= 180 && h < 240) { r1 = 0; g1 = x; b1 = c; }
  return [Math.round(r1 * 255), Math.round(g1 * 255), Math.round(b1 * 255)];
});

export const COLORMAP_LUTS: Record<Colormap, RGB[]> = {
  grayscale: grayscaleLUT,
  viridis: viridisLUT,
  inferno: infernoLUT,
  coolwarm: coolwarmLUT,
  rainbow: rainbowLUT,
};

export function applyColormap(pixelVal: number, colormap: Colormap): RGB {
  const idx = Math.max(0, Math.min(255, Math.round(pixelVal)));
  return COLORMAP_LUTS[colormap][idx];
}
