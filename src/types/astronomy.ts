export type ViewerMode = 'blink' | 'diff' | 'crossfade' | 'epoch1' | 'epoch2';

export type Colormap = 'grayscale' | 'viridis' | 'inferno' | 'coolwarm' | 'rainbow';

export type StretchMode = 'linear' | 'log' | 'asinh' | 'sqrt';

export interface SPHERExChannel {
  channel: number; // 0 to 101
  band: number; // 1 to 6
  wavelength_um: number;
  molecules: string[];
}

export interface TargetMetadata {
  id: string;
  name: string;
  designation: string;
  ra_deg: number;
  dec_deg: number;
  ra_hms: string;
  dec_dms: string;
  type: string;
  distance_pc: number;
  pm_ra_mas_yr: number;
  pm_dec_mas_yr: number;
  behavior: string;
  description: string;
  expected_findings: string[];
  is_infrared_only: boolean;
  variability_type: string;
  sed_profile: string;
}

export interface TargetSummary {
  id: string;
  name: string;
  ra_deg: number;
  dec_deg: number;
  ra_hms: string;
  dec_dms: string;
  type: string;
  behavior: string;
  is_infrared_only: boolean;
  variability_type: string;
}

export interface SpectrumDataPoint {
  channel: number;
  band: number;
  wavelength_um: number;
  molecules: string[];
  flux_ujy: number;
  flux_err_ujy: number;
  snr: number;
}

export interface LightCurvePoint {
  epoch: number;
  mjd: number;
  date: string;
  survey: string;
  flux_ujy: number;
  flux_err_ujy: number;
}

export interface CatalogSource {
  id: string;
  name?: string;
  x: number;
  y: number;
  x_epoch1?: number;
  y_epoch1?: number;
  ra: number;
  dec: number;
  is_primary: boolean;
  is_gaia: boolean;
  is_wise: boolean;
  is_infrared_only_mover: boolean;
  g_mag?: number | null;
  w1_mag?: number;
  w2_mag?: number;
  pmra: number;
  pmdec: number;
  type?: string;
  behavior?: string;
  flux?: number;
}
