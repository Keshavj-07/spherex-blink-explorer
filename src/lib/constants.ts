// SPHEREx instrument facts. Wavelength coverage and resolving power per detector are the
// values IRSA's SIA service reports for DR1 Level-2 images (em_min, em_max, em_res_power).
// Six H2RG detector arrays, each behind a linear variable filter; 17 channels per array = 102.
export const SPHEREX_DETECTORS = [
  { det: 1, min: 0.746, max: 1.117, R: 39.1, color: '#38bdf8' },
  { det: 2, min: 1.103, max: 1.65, R: 41.4, color: '#818cf8' },
  { det: 3, min: 1.63, max: 2.435, R: 40.6, color: '#c084fc' },
  { det: 4, min: 2.403, max: 3.847, R: 34.9, color: '#f472b6' },
  { det: 5, min: 3.811, max: 4.43, R: 111.6, color: '#fb923c' },
  { det: 6, min: 4.412, max: 5.01, R: 127.8, color: '#f87171' },
];

export const detColor = (d: number) => SPHEREX_DETECTORS.find((x) => x.det === d)?.color ?? '#94a3b8';

// Approximate centres of the 102 notional channels (17 per detector, constant R per detector).
export const SPHEREX_CHANNELS = SPHEREX_DETECTORS.flatMap((d) => {
  const ratio = Math.pow(d.max / d.min, 1 / 17);
  return Array.from({ length: 17 }, (_, i) => {
    const lo = d.min * Math.pow(ratio, i);
    const hi = lo * ratio;
    return { det: d.det, index: (d.det - 1) * 17 + i, lo, hi, center: Math.sqrt(lo * hi) };
  });
});

// Broad molecular / solid-state features relevant in the SPHEREx range (wavelengths in µm).
export const SPECTRAL_FEATURES = [
  { name: 'H₂O', lo: 1.33, hi: 1.5 },
  { name: 'CH₄', lo: 1.6, hi: 1.8 },
  { name: 'H₂O', lo: 1.8, hi: 2.05 },
  { name: 'CH₄', lo: 2.15, hi: 2.45 },
  { name: 'CO (2–0)', lo: 2.29, hi: 2.4 },
  { name: 'H₂O ice', lo: 2.9, hi: 3.15 },
  { name: 'CH₄ / PAH', lo: 3.2, hi: 3.45 },
  { name: 'CO₂', lo: 4.22, hi: 4.32 },
  { name: 'CO', lo: 4.5, hi: 4.8 },
];

// The challenge's test objects. Positions & proper motions are resolved live from SIMBAD (CDS Sesame);
// names below are SIMBAD identifiers.
export const PRESETS = [
  { id: 'barnards-star', label: "Barnard's Star", query: "Barnard's Star", kind: 'Fastest proper motion (10.4″/yr)' },
  { id: 'eps-indi-b', label: 'Epsilon Indi B', query: 'eps Ind B', kind: 'T1+T6 brown-dwarf binary' },
  { id: 'wise-0855', label: 'WISE 0855−0714', query: 'WISE J085510.83-071442.5', kind: 'Coldest known brown dwarf' },
  { id: 'rw-aur', label: 'RW Aurigae', query: 'RW Aur', kind: 'T Tauri variable' },
  { id: 'r-dra', label: 'R Draconis', query: 'R Dra', kind: 'Mira variable' },
];

export const FOV_OPTIONS = [2, 3, 5, 8, 12, 20, 30];
