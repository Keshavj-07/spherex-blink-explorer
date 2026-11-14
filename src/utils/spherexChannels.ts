import { SPHERExChannel } from '../types/astronomy';

// SPHEREx 6 Spectrometer Bands
export const SPHEREX_BANDS_INFO = [
  { band: 1, range: '0.75 – 1.11 μm', R: 41, channels: 17, description: 'Near-Infrared / Optical transition' },
  { band: 2, range: '1.11 – 1.64 μm', R: 41, channels: 17, description: 'J-band & Water vapor window' },
  { band: 3, range: '1.64 – 2.42 μm', R: 41, channels: 17, description: 'H & K bands / CH4 & H2O features' },
  { band: 4, range: '2.42 – 3.82 μm', R: 35, channels: 17, description: 'Water Ice & Hydrocarbon absorption' },
  { band: 5, range: '3.82 – 4.42 μm', R: 110, channels: 17, description: 'CO2 ice & gas / Cold Brown Dwarf peak' },
  { band: 6, range: '4.42 – 5.00 μm', R: 130, channels: 17, description: 'CO gas / 4.65 μm emission window' },
];

export const MOLECULAR_BANDS = [
  { name: 'TiO (Titanium Oxide)', range: '0.83 – 0.90 μm', desc: 'M-dwarf stellar atmosphere indicator' },
  { name: 'H2O (Water Vapor)', range: '1.35 – 1.45 μm', desc: 'Prominent in cool brown dwarfs & Mira envelopes' },
  { name: 'CH4 (Methane)', range: '1.64 – 1.75 μm', desc: 'Diagnostic of T/Y brown dwarf atmospheres' },
  { name: 'H2O (Water Vapor)', range: '1.85 – 1.95 μm', desc: 'Near-infrared absorption band' },
  { name: 'CH4 (Methane)', range: '2.15 – 2.38 μm', desc: 'Overtones in substellar atmospheres' },
  { name: 'H2O (Water Ice Clouds)', range: '2.90 – 3.30 μm', desc: 'Ice grain absorption in sub-freezing Y-dwarfs' },
  { name: 'CH4 (Fundamental Methane)', range: '3.20 – 3.55 μm', desc: 'Strong fundamental vibration band' },
  { name: 'CO2 (Carbon Dioxide)', range: '4.20 – 4.35 μm', desc: 'Interstellar & planetary ice/gas' },
  { name: 'CO (Carbon Monoxide)', range: '4.58 – 4.75 μm', desc: 'Mira & stellar envelope absorption' },
];

export function getBandForChannel(channelIdx: number): number {
  if (channelIdx < 17) return 1;
  if (channelIdx < 34) return 2;
  if (channelIdx < 51) return 3;
  if (channelIdx < 68) return 4;
  if (channelIdx < 85) return 5;
  return 6;
}

export function getBandColor(band: number): string {
  switch (band) {
    case 1: return '#38bdf8'; // sky blue
    case 2: return '#818cf8'; // indigo
    case 3: return '#c084fc'; // purple
    case 4: return '#f472b6'; // pink
    case 5: return '#fb923c'; // orange
    case 6: return '#f87171'; // red
    default: return '#94a3b8';
  }
}

// Generate the 102 channels client-side
export function generateChannels(): SPHERExChannel[] {
  const configs: [number, number, number, number][] = [
    [1, 0.75, 1.11, 17],
    [2, 1.11, 1.64, 17],
    [3, 1.64, 2.42, 17],
    [4, 2.42, 3.82, 17],
    [5, 3.82, 4.42, 17],
    [6, 4.42, 5.00, 17],
  ];

  const channels: SPHERExChannel[] = [];
  let idx = 0;

  for (const [band, wMin, wMax, count] of configs) {
    const ratio = Math.pow(wMax / wMin, 1 / (count - 1));
    for (let i = 0; i < count; i++) {
      const w = wMin * Math.pow(ratio, i);
      const molecules: string[] = [];

      if ((w >= 1.35 && w <= 1.45) || (w >= 1.85 && w <= 1.95) || (w >= 2.65 && w <= 2.75)) {
        molecules.push('H2O');
      }
      if ((w >= 1.64 && w <= 1.75) || (w >= 2.15 && w <= 2.38) || (w >= 3.20 && w <= 3.55)) {
        molecules.push('CH4');
      }
      if (w >= 4.20 && w <= 4.35) {
        molecules.push('CO2');
      }
      if (w >= 4.58 && w <= 4.75) {
        molecules.push('CO');
      }
      if ((w >= 0.83 && w <= 0.86) || (w >= 0.88 && w <= 0.90)) {
        molecules.push('TiO');
      }

      channels.push({
        channel: idx,
        band,
        wavelength_um: parseFloat(w.toFixed(4)),
        molecules,
      });
      idx++;
    }
  }

  return channels;
}

export const ALL_SPHEREX_CHANNELS = generateChannels();
