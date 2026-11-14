/**
 * Astronomical coordinate conversions and formatting
 */

export function degToHMS(deg: number): string {
  let d = ((deg % 360) + 360) % 360;
  const hours = d / 15.0;
  const h = Math.floor(hours);
  const mRemainder = (hours - h) * 60.0;
  const m = Math.floor(mRemainder);
  const s = (mRemainder - m) * 60.0;
  
  const hStr = h.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toFixed(2).padStart(5, '0');
  return `${hStr}h ${mStr}m ${sStr}s`;
}

export function degToDMS(deg: number): string {
  const sign = deg < 0 ? '-' : '+';
  const absDeg = Math.abs(deg);
  const d = Math.floor(absDeg);
  const mRemainder = (absDeg - d) * 60.0;
  const m = Math.floor(mRemainder);
  const s = (mRemainder - m) * 60.0;

  const dStr = d.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toFixed(1).padStart(4, '0');
  return `${sign}${dStr}° ${mStr}' ${sStr}"`;
}

export function parseCoordinates(query: string): { ra: number; dec: number } | null {
  const clean = query.trim();
  // Check for simple decimal format "269.4521, +4.6934"
  const commaSplit = clean.split(/[,\s]+/);
  if (commaSplit.length === 2) {
    const ra = parseFloat(commaSplit[0]);
    const dec = parseFloat(commaSplit[1]);
    if (!isNaN(ra) && !isNaN(dec) && ra >= 0 && ra <= 360 && dec >= -90 && dec <= 90) {
      return { ra, dec };
    }
  }
  return null;
}

/**
 * Approximate pixel to RA/Dec mapping for a 256x256 cutout centered on (ra_center, dec_center)
 * FOV ~ 3.5 arcmin -> ~0.82 arcsec/pixel
 */
export function pixelToSky(
  x: number,
  y: number,
  centerRA: number,
  centerDec: number,
  width = 256,
  height = 256,
  arcsecPerPixel = 0.82
): { ra: number; dec: number } {
  const cx = width / 2;
  const cy = height / 2;
  const draArcsec = (x - cx) * arcsecPerPixel;
  const ddecArcsec = (cy - y) * arcsecPerPixel; // Dec increases upwards

  const decRad = (centerDec * Math.PI) / 180.0;
  const cosDec = Math.max(0.0001, Math.cos(decRad));

  const ra = centerRA + (draArcsec / 3600.0) / cosDec;
  const dec = centerDec + (ddecArcsec / 3600.0);

  return { ra, dec };
}
