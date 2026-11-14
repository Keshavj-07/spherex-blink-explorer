import { StretchMode } from '../types/astronomy';

export function applyStretch(normalizedVal: number, mode: StretchMode): number {
  // normalizedVal is 0.0 to 1.0
  const v = Math.max(0.0, Math.min(1.0, normalizedVal));
  switch (mode) {
    case 'linear':
      return v;
    case 'log':
      // log10(1 + 1000 * v) / log10(1001)
      return Math.log10(1.0 + 999.0 * v) / Math.log10(1000.0);
    case 'asinh':
      // asinh(10 * v) / asinh(10)
      return Math.asinh(10.0 * v) / Math.asinh(10.0);
    case 'sqrt':
      return Math.sqrt(v);
    default:
      return v;
  }
}
