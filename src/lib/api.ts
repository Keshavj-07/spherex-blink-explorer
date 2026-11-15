// Typed client for the Python API in /server (proxied at /api by Vite).

export interface Release {
  name: string;
  label: string;
  release_date: string;
  all_sky: boolean;
  example_file: string;
}

export interface ResolvedObject {
  query: string;
  name: string;
  ra: number;
  dec: number;
  pos_epoch: number;
  pmra: number | null;
  pmdec: number | null;
  parallax_mas: number | null;
  distance_pc: number | null;
  otype: string | null;
  sptype: string | null;
  pos_ref: string | null;
}

export interface Epoch {
  index: number;
  mjd: number;
  mjd_min: number;
  mjd_max: number;
  date: string;
  n_exposures: number;
  detectors: number[];
}

export interface ExposureMeta {
  did: string;
  obs_id: string;
  detector: number;
  mjd: number;
  date: string;
  wavelength_um: number | null;
  band_min_um: number;
  band_max_um: number;
  coverage: number;
  center_flags: string[];
  psf_fwhm_arcsec: number | null;
  exptime_s: number | null;
  source: string;
  url: string;
}

export interface FieldMeta {
  n: number;
  pixel_scale_arcsec: number;
  fov_arcmin: number;
  center_ra: number;
  center_dec: number;
  epochs: Epoch[];
  exposures: ExposureMeta[];
  failed: { did: string; error: string }[];
  track: { epoch: number; ra: number; dec: number; x: number; y: number }[] | null;
  flag_bits: Record<string, string>;
  hard_flags: string[];
  contamination_flags: string[];
}

export interface FieldStatus {
  id: string;
  state: 'queued' | 'searching' | 'fetching' | 'done' | 'error';
  message: string;
  total: number;
  done: number;
  field?: FieldMeta;
}

export interface FieldRequest {
  ra: number;
  dec: number;
  fov_arcmin: number;
  release: string;
  pmra?: number | null;
  pmdec?: number | null;
  pos_epoch?: number;
  strict?: boolean;
}

export interface Frame {
  epoch: Epoch;
  n_used: number;
  image: Float32Array;
}

export interface SpectrumPoint {
  did: string;
  detector: number;
  epoch: number;
  mjd: number;
  date: string;
  wavelength_um: number;
  bandwidth_um: number | null;
  flux_ujy: number;
  flux_err_ujy: number;
  snr: number | null;
  masked_frac: number;
  flags: string[];
  contaminated: boolean;
}

export interface GaiaSource {
  id: string;
  ra: number;
  dec: number;
  pmra: number | null;
  pmdec: number | null;
  parallax: number | null;
  g: number | null;
  bp: number | null;
  rp: number | null;
  epoch: number;
}

export interface WiseSource {
  id: string;
  ra: number;
  dec: number;
  pmra: number | null;
  pmdec: number | null;
  pm_err: number | null;
  pm_total: number;
  w1: number | null;
  w2: number | null;
  epoch: number;
  no_gaia: boolean;
  significant_pm: boolean;
  ir_only_mover_candidate: boolean;
  gaia_sep_arcsec: number | null;
}

export interface UploadItem {
  file: string;
  name: string;
  detector: number;
  mjd: number;
  date: string;
  obs_id: string;
  uploaded: string;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return res.json();
}

export function decodeF32(b64: string): Float32Array {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

export const api = {
  releases: (refresh = false, extra?: string) =>
    fetch(`/api/releases?refresh=${refresh}${extra ? `&extra=${encodeURIComponent(extra)}` : ''}`).then((r) =>
      j<{ releases: Release[]; latest: string | null; default: string | null; checked: string | null }>(r)
    ),
  resolve: (name: string) => fetch(`/api/resolve?name=${encodeURIComponent(name)}`).then((r) => j<ResolvedObject>(r)),
  startField: (req: FieldRequest) =>
    fetch('/api/field', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }).then(
      (r) => j<FieldStatus>(r)
    ),
  fieldStatus: (id: string) => fetch(`/api/field/${id}`).then((r) => j<FieldStatus>(r)),
  frames: async (id: string, stack: string): Promise<Frame[]> => {
    const d = await fetch(`/api/field/${id}/frames?stack=${encodeURIComponent(stack)}`).then((r) =>
      j<{ frames: { epoch: Epoch; n_used: number; image: string }[] }>(r)
    );
    return d.frames.map((f) => ({ epoch: f.epoch, n_used: f.n_used, image: decodeF32(f.image) }));
  },
  exposure: async (id: string, did: string) => {
    const d = await fetch(`/api/field/${id}/exposure?did=${encodeURIComponent(did)}`).then((r) =>
      j<{ image: string; wavelength: string; meta: ExposureMeta }>(r)
    );
    return { meta: d.meta, image: decodeF32(d.image) };
  },
  spectrum: (
    id: string,
    p: { ra: number; dec: number; radius_arcsec: number; pmra?: number | null; pmdec?: number | null; pos_epoch?: number }
  ) => {
    const q = new URLSearchParams({ ra: String(p.ra), dec: String(p.dec), radius_arcsec: String(p.radius_arcsec) });
    if (p.pmra != null && p.pmdec != null) {
      q.set('pmra', String(p.pmra));
      q.set('pmdec', String(p.pmdec));
      q.set('pos_epoch', String(p.pos_epoch ?? 2000));
    }
    return fetch(`/api/field/${id}/spectrum?${q}`).then((r) => j<{ points: SpectrumPoint[]; note: string; tracked: boolean; skipped_masked: number }>(r));
  },
  catalog: (ra: number, dec: number, radius_arcmin: number) =>
    fetch(`/api/catalog?ra=${ra}&dec=${dec}&radius_arcmin=${radius_arcmin}`).then((r) =>
      j<{ gaia: GaiaSource[]; catwise: WiseSource[]; errors: Record<string, string> }>(r)
    ),
  uploads: () => fetch('/api/uploads').then((r) => j<UploadItem[]>(r)),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/uploads', { method: 'POST', body: fd }).then((r) => j<UploadItem>(r));
  },
  deleteUpload: (file: string) => fetch(`/api/uploads/${encodeURIComponent(file)}`, { method: 'DELETE' }).then((r) => j(r)),
};
