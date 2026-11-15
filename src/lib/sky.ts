// Sky coordinate helpers: parsing, formatting, proper motion, gnomonic (TAN) projection.

const D2R = Math.PI / 180;

export function degToHMS(deg: number, digits = 2): string {
  const d = ((deg % 360) + 360) % 360;
  let s = d / 15 * 3600;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${s.toFixed(digits).padStart(3 + digits, '0')}s`;
}

export function degToDMS(deg: number, digits = 1): string {
  const sign = deg < 0 ? '-' : '+';
  let s = Math.abs(deg) * 3600;
  const d = Math.floor(s / 3600);
  s -= d * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return `${sign}${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}′${s.toFixed(digits).padStart(3 + digits, '0')}″`;
}

/**
 * Accepts decimal degrees ("133.795 -7.245", "133.795, -7.245") or sexagesimal
 * ("08h55m10.831s -07d14m42.53s", "08:55:10.8 -07:14:42.5", "08 55 10.8 -07 14 42.5").
 */
export function parseCoordinates(input: string): { ra: number; dec: number } | null {
  const q = input.trim();
  if (!q) return null;
  const sexa = /[hms:]/i.test(q) || /\d\s+\d+\s+[\d.]+\s+[+-]?\d/.test(q);
  const norm = q
    .replace(/[,;]/g, ' ')
    .replace(/[hmsd°'′"″:]/gi, ' ')
    .replace(/([+-])\s+/g, '$1')
    .trim();
  const tok = norm.split(/\s+/);
  if (!sexa && tok.length === 2) {
    const ra = Number(tok[0]);
    const dec = Number(tok[1]);
    if (isFinite(ra) && isFinite(dec) && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) return { ra, dec };
    return null;
  }
  if (tok.length === 6) {
    const [h, m, s, dd, dm, ds] = tok;
    const nums = tok.map(Number);
    if (nums.some((x) => !isFinite(x))) return null;
    const ra = (Math.abs(+h) + +m / 60 + +s / 3600) * 15;
    const neg = dd.startsWith('-');
    const dec = (neg ? -1 : 1) * (Math.abs(+dd) + +dm / 60 + +ds / 3600);
    if (ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) return { ra, dec };
  }
  return null;
}

/** Parse a URL value that may be decimal or sexagesimal. */
export function parseAngle(v: string, isRA: boolean): number | null {
  if (/^[+-]?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  const t = v.replace(/[hmsd°'′"″:]/gi, ' ').trim().split(/\s+/);
  if (t.length !== 3 || t.some((x) => !isFinite(Number(x)))) return null;
  const neg = t[0].startsWith('-');
  const val = Math.abs(+t[0]) + +t[1] / 60 + +t[2] / 3600;
  return isRA ? val * 15 : (neg ? -1 : 1) * val;
}

export function mjdToYear(mjd: number): number {
  return 2000 + (mjd - 51544.5) / 365.25;
}

export function propagate(ra: number, dec: number, pmra: number, pmdec: number, fromYear: number, toYear: number) {
  const dt = toYear - fromYear;
  const d = dec + (pmdec * dt) / 3.6e6;
  const r = ra + (pmra * dt) / 3.6e6 / Math.max(1e-6, Math.cos(dec * D2R));
  return { ra: ((r % 360) + 360) % 360, dec: d };
}

/** Grid geometry matching server/spherex.py make_grid_wcs (TAN, north up, east left). */
export interface Grid {
  ra0: number;
  dec0: number;
  n: number;
  scaleArcsec: number;
}

/** Pixel (0-based, y increasing north) -> sky. */
export function pix2sky(g: Grid, x: number, y: number) {
  const c = (g.n - 1) / 2;
  const s = (g.scaleArcsec / 3600) * D2R;
  const xi = -(x - c) * s;
  const eta = (y - c) * s;
  const d0 = g.dec0 * D2R;
  const den = Math.cos(d0) - eta * Math.sin(d0);
  const ra = g.ra0 + Math.atan2(xi, den) / D2R;
  const dec = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(xi, den)) / D2R;
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/** Sky -> pixel (0-based, y increasing north). */
export function sky2pix(g: Grid, ra: number, dec: number) {
  const c = (g.n - 1) / 2;
  const s = (g.scaleArcsec / 3600) * D2R;
  const d0 = g.dec0 * D2R;
  const d = dec * D2R;
  const dra = (ra - g.ra0) * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dra);
  const xi = (Math.cos(d) * Math.sin(dra)) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dra)) / cosc;
  return { x: c - xi / s, y: c + eta / s };
}

export function sepArcsec(ra1: number, dec1: number, ra2: number, dec2: number) {
  const dra = (((ra1 - ra2 + 540) % 360) - 180) * Math.cos(((dec1 + dec2) / 2) * D2R);
  return Math.hypot(dra, dec1 - dec2) * 3600;
}
