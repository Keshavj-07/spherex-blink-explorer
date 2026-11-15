import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Telescope, Search, Globe2, Database, Link2, Play, Pause, Loader2, Info, Layers, AlertTriangle, Check,
} from 'lucide-react';
import { api, Frame, FieldMeta, GaiaSource, Release, ResolvedObject, SpectrumPoint, WiseSource } from './lib/api';
import { degToDMS, degToHMS, mjdToYear, parseAngle, parseCoordinates } from './lib/sky';
import { absPercentile, meanFrames, percentiles, subtract, subtractMedian } from './lib/render';
import { FOV_OPTIONS, PRESETS, SPHEREX_CHANNELS, SPHEREX_DETECTORS, detColor } from './lib/constants';
import { Colormap, StretchMode } from './types/astronomy';
import { SkyCanvas, Aperture } from './components/SkyCanvas';
import { SpectrumPanel, epochColor } from './components/SpectrumPanel';
import { ExposureTable } from './components/ExposureTable';
import { ReleasesModal } from './components/ReleasesModal';
import { AtlasModal } from './components/AtlasModal';

type Mode = 'play' | 'blink' | 'diff' | 'resid' | 'sum';
type StackMode = 'all' | 'det' | 'channel';

interface Target {
  ra: number;
  dec: number;
  pmra: number | null;
  pmdec: number | null;
  posEpoch: number;
  name: string | null;
  info: ResolvedObject | null;
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'play', label: 'Animate', hint: 'Play all epochs as a movie' },
  { id: 'blink', label: 'Blink', hint: 'Alternate between epoch A and B' },
  { id: 'diff', label: 'B − A', hint: 'Subtract epoch A from B: movers become +/− pairs' },
  { id: 'resid', label: 'Epoch − rest', hint: 'Each epoch minus the mean of the others' },
  { id: 'sum', label: 'Sum all', hint: 'Co-add every epoch for maximum depth' },
];

const params = new URLSearchParams(window.location.search);
const EMBED = params.get('embed') === '1';

function initialChannel(): number {
  const c = Number(params.get('channel') ?? NaN);
  if (params.has('channel') && Number.isInteger(c) && c >= 0 && c < 102) return c;
  const wl = Number(params.get('wavelength'));
  if (wl > 0) {
    let best = 0;
    SPHEREX_CHANNELS.forEach((ch, i) => {
      if (Math.abs(ch.center - wl) < Math.abs(SPHEREX_CHANNELS[best].center - wl)) best = i;
    });
    return best;
  }
  return 93; // ~4.6 µm
}

export const App: React.FC = () => {
  // ---------------------------------------------------------------- settings
  const [releases, setReleases] = useState<Release[]>([]);
  const [release, setRelease] = useState<string>(params.get('release') || '');
  const [fov, setFov] = useState<number>(() => {
    const f = Number(params.get('fov'));
    return f >= 1 && f <= 30 ? f : 5;
  });
  // fov = what is displayed; loadFov = what was downloaded. Shrinking the FOV crops the loaded
  // data in the browser; only growing it beyond loadFov (or a new target) fetches again.
  const [loadFov, setLoadFov] = useState<number>(fov);
  const fovRef = useRef(fov);
  fovRef.current = fov;
  const [strict, setStrict] = useState(params.get('strict') === '1');
  const [stackMode, setStackMode] = useState<StackMode>((params.get('stack') as StackMode) || 'all');
  const [channel, setChannel] = useState<number>(initialChannel);
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || 'play');
  const [fps, setFps] = useState<number>(Number(params.get('fps')) || 2);
  const [playing, setPlaying] = useState(true);
  const [epochA, setEpochA] = useState(Number(params.get('a')) || 0);
  const [epochB, setEpochB] = useState<number>(params.get('b') ? Number(params.get('b')) : -1);
  const [cur, setCur] = useState(0);
  const [colormap, setColormap] = useState<Colormap>((params.get('cmap') as Colormap) || 'grayscale');
  const [stretch, setStretch] = useState<StretchMode>((params.get('stretch') as StretchMode) || 'asinh');
  const [showGaia, setShowGaia] = useState(params.get('gaia') !== '0');
  const [showWise, setShowWise] = useState(params.get('wise') !== '0');

  // ---------------------------------------------------------------- data
  const [target, setTarget] = useState<Target | null>(null);
  const [query, setQuery] = useState('');
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ state: string; message: string; done: number; total: number } | null>(null);
  const [field, setField] = useState<FieldMeta | null>(null);
  const [rawFrames, setFrames] = useState<Frame[]>([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [exposureView, setExposureView] = useState<{ did: string; image: Float32Array; label: string; mjd: number } | null>(null);
  const [gaia, setGaia] = useState<GaiaSource[]>([]);
  const [wise, setWise] = useState<WiseSource[]>([]);
  const [catErr, setCatErr] = useState<string | null>(null);
  const [aperture, setAperture] = useState<Aperture | null>(null);
  const [spectrum, setSpectrum] = useState<SpectrumPoint[]>([]);
  const [specLoading, setSpecLoading] = useState(false);
  const [specErr, setSpecErr] = useState<string | null>(null);
  const [specTracked, setSpecTracked] = useState(false);
  const [releasesOpen, setReleasesOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadsTick, setUploadsTick] = useState(0);
  const pollRef = useRef<number | null>(null);

  const goTo = useCallback((t: Target) => {
    setLoadFov(fovRef.current);
    setTarget(t);
  }, []);

  // ---------------------------------------------------------------- releases
  useEffect(() => {
    api.releases()
      .then((r) => {
        setReleases(r.releases);
        setRelease((cur) => cur || r.default || r.latest || 'spherex_dr1');
      })
      .catch(() => setRelease((cur) => cur || 'spherex_dr1'));
  }, []);

  // ---------------------------------------------------------------- targets
  const resolveAndLoad = useCallback(async (name: string) => {
    setSearchErr(null);
    try {
      const o = await api.resolve(name);
      goTo({ ra: o.ra, dec: o.dec, pmra: o.pmra, pmdec: o.pmdec, posEpoch: o.pos_epoch, name: o.name, info: o });
    } catch (e: any) {
      setSearchErr(e.message);
    }
  }, [goTo]);

  // initial target from URL (?target= / ?name= / ?ra=&dec=)
  useEffect(() => {
    const ra = params.get('ra');
    const dec = params.get('dec');
    const name = params.get('target') || params.get('name');
    if (ra && dec) {
      const r = parseAngle(ra, true);
      const d = parseAngle(dec, false);
      if (r !== null && d !== null) {
        const pmra = params.get('pmra');
        const pmdec = params.get('pmdec');
        goTo({
          ra: r, dec: d, pmra: pmra ? Number(pmra) : null, pmdec: pmdec ? Number(pmdec) : null,
          posEpoch: Number(params.get('epoch')) || 2000, name: name || null, info: null,
        });
        return;
      }
    }
    const preset = PRESETS.find((p) => p.id === name);
    resolveAndLoad(preset ? preset.query : name || PRESETS[2].query);
  }, [resolveAndLoad]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const c = parseCoordinates(q);
    if (c) {
      setSearchErr(null);
      goTo({ ra: c.ra, dec: c.dec, pmra: null, pmdec: null, posEpoch: 2000, name: null, info: null });
    } else resolveAndLoad(q);
  };

  // ---------------------------------------------------------------- field job
  useEffect(() => {
    if (!target || !release) return;
    let cancelled = false;
    setField(null);
    setJobId(null);
    setFrames([]);
    setSpectrum([]);
    setAperture(null);
    setSpecErr(null);
    setSpecLoading(false);
    setCatErr(null);
    setExposureView(null);
    setGaia([]);
    setWise([]);
    setStatus({ state: 'queued', message: 'Starting…', done: 0, total: 0 });
    if (pollRef.current) window.clearTimeout(pollRef.current);
    const req = {
      ra: target.ra, dec: target.dec, fov_arcmin: loadFov, release, strict,
      pmra: target.pmra, pmdec: target.pmdec, pos_epoch: target.posEpoch,
    };
    const poll = async (id: string) => {
      if (cancelled) return;
      try {
        const s = await api.fieldStatus(id);
        if (cancelled) return;
        setStatus(s);
        if (s.state === 'done' && s.field) {
          setField(s.field);
          setJobId(id);
          return;
        }
        if (s.state === 'error') return;
      } catch (e: any) {
        setStatus({ state: 'error', message: e.message, done: 0, total: 0 });
        return;
      }
      pollRef.current = window.setTimeout(() => poll(id), 1200);
    };
    api.startField(req)
      .then((s) => {
        setJobId(s.id);
        poll(s.id);
      })
      .catch((e) => setStatus({ state: 'error', message: e.message, done: 0, total: 0 }));
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [target, release, loadFov, strict, uploadsTick]);

  // default aperture = the target (following its proper motion), set once per newly loaded field
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    const target = targetRef.current;
    if (!field || !target) return;
    setAperture({
      ra: target.ra, dec: target.dec, pmra: target.pmra, pmdec: target.pmdec, posEpoch: target.posEpoch,
      radiusArcsec: 12.3, label: target.name || `${target.ra.toFixed(5)}, ${target.dec.toFixed(5)}`,
    });
    const nE = field.epochs.length;
    setEpochA((a) => (a < nE ? a : 0));
    setEpochB((b) => (b >= 0 && b < nE ? b : nE - 1));
    setCur(0);
  }, [field]);

  // catalogs
  useEffect(() => {
    if (!field) return;
    setCatErr(null);
    const r = Math.min(25, (field.fov_arcmin / 2) * 1.45);
    api.catalog(field.center_ra, field.center_dec, r)
      .then((c) => {
        setGaia(c.gaia);
        setWise(c.catwise);
        const errs = Object.entries(c.errors);
        if (errs.length)
          setCatErr(
            errs
              .map(([k, v]) =>
                k === 'crossmatch'
                  ? v
                  : `${k === 'gaia' ? 'Gaia DR3 (ESA)' : 'CatWISE2020 (IRSA)'} is temporarily unavailable${/\b5\d\d\b/.test(v) ? ' (server error at the archive)' : ''}. Overlays shown without it; reload the field to retry.`
              )
              .join(' ')
          );
      })
      .catch((e) => setCatErr(e.message));
  }, [field]);

  // frames for the chosen stack
  const ch = SPHEREX_CHANNELS[channel];
  const stack = stackMode === 'all' ? 'all' : stackMode === 'det' ? `D${ch.det}` : `wl:${ch.lo.toFixed(4)}:${ch.hi.toFixed(4)}`;
  useEffect(() => {
    if (!field || !jobId) return;
    let cancelled = false;
    setFramesLoading(true);
    api.frames(jobId, stack)
      .then((f) => !cancelled && setFrames(f.map((x) => ({ ...x, image: subtractMedian(x.image) }))))
      .catch((e) => !cancelled && setStatus({ state: 'error', message: e.message, done: 0, total: 0 }))
      .finally(() => !cancelled && setFramesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [field, jobId, stack]);

  // spectrum for the aperture
  useEffect(() => {
    if (!field || !jobId || !aperture) return;
    let cancelled = false;
    setSpecLoading(true);
    setSpecErr(null);
    api.spectrum(jobId, {
      ra: aperture.ra, dec: aperture.dec, radius_arcsec: aperture.radiusArcsec,
      pmra: aperture.pmra, pmdec: aperture.pmdec, pos_epoch: aperture.posEpoch,
    })
      .then((s) => {
        if (cancelled) return;
        setSpectrum(s.points);
        setSpecTracked(s.tracked);
        if (!s.points.length)
          setSpecErr(
            s.skipped_masked
              ? `More than half of the aperture is masked in all ${s.skipped_masked} exposures. These are saturated or non-linear pixels, typical of very bright stars, so SPHEREx cannot measure this source reliably.`
              : 'No SPHEREx measurements at this position.'
          );
        else if (s.skipped_masked) setSpecErr(null);
      })
      .catch((e) => !cancelled && setSpecErr(e.message))
      .finally(() => !cancelled && setSpecLoading(false));
    return () => {
      cancelled = true;
    };
  }, [field, jobId, aperture]);

  // ---------------------------------------------------------------- FOV crop (no reload)
  const fullN = field?.n ?? 0;
  const cropN = useMemo(() => {
    if (!fullN) return 0;
    let k = Math.ceil((fov * 60) / (field?.pixel_scale_arcsec ?? 6.15));
    if (k % 2 === 0) k += 1; // odd, like the server grid, so both share the centre pixel
    return Math.min(fullN, k);
  }, [fov, fullN, field]);
  const off = (fullN - cropN) / 2;
  const crop = useCallback(
    (img: Float32Array) => {
      if (cropN === fullN) return img;
      const out = new Float32Array(cropN * cropN);
      for (let y = 0; y < cropN; y++) out.set(img.subarray((y + off) * fullN + off, (y + off) * fullN + off + cropN), y * cropN);
      return out;
    },
    [cropN, fullN, off]
  );
  const frames = useMemo(() => rawFrames.map((f) => ({ ...f, image: crop(f.image) })), [rawFrames, crop]);
  const track = useMemo(() => field?.track?.map((t) => ({ ...t, x: t.x - off, y: t.y - off })) ?? null, [field, off]);

  // ---------------------------------------------------------------- playback
  const nE = frames.length;
  useEffect(() => {
    if (!playing || nE < 2 || !(mode === 'play' || mode === 'blink' || mode === 'resid')) return;
    const t = window.setInterval(() => setCur((c) => c + 1), 1000 / fps);
    return () => window.clearInterval(t);
  }, [playing, fps, mode, nE]);

  const A = Math.min(epochA, Math.max(0, nE - 1));
  const B = epochB < 0 ? Math.max(0, nE - 1) : Math.min(epochB, Math.max(0, nE - 1));

  const valid = useMemo(() => frames.filter((f) => f.n_used > 0), [frames]);
  const sumImg = useMemo(() => (valid.length ? meanFrames(valid.map((f) => f.image)) : null), [valid]);
  const residImgs = useMemo(() => {
    if (valid.length < 2) return [];
    return frames.map((f) => {
      const others = valid.filter((o) => o !== f).map((o) => o.image);
      return subtract(f.image, meanFrames(others));
    });
  }, [frames, valid]);
  const limits = useMemo(() => percentiles(valid.map((f) => f.image)), [valid]);

  const view = useMemo(() => {
    if (exposureView) {
      const img = crop(exposureView.image);
      const lim = percentiles([img]);
      return { image: img, vmin: lim[0], vmax: lim[1], diverging: false, epoch: null as number | null,
        year: mjdToYear(exposureView.mjd), label: exposureView.label };
    }
    if (!nE) return null;
    const ep = (i: number) => frames[i]?.epoch;
    if (mode === 'sum' && sumImg) {
      const yr = mjdToYear(valid.reduce((s, f) => s + f.epoch.mjd, 0) / valid.length);
      const lim = percentiles([sumImg]);
      return { image: sumImg, vmin: lim[0], vmax: lim[1], diverging: false, epoch: null, year: yr, label: `Sum of ${valid.length} epochs` };
    }
    if (mode === 'diff') {
      const d = subtract(frames[B].image, frames[A].image);
      const l = absPercentile(d);
      return { image: d, vmin: -l, vmax: l, diverging: true, epoch: B, year: mjdToYear(ep(B).mjd),
        label: `${ep(B).date} − ${ep(A).date}` };
    }
    if (mode === 'resid' && residImgs.length) {
      const i = cur % nE;
      const l = Math.max(...residImgs.map((r) => absPercentile(r)));
      return { image: residImgs[i], vmin: -l, vmax: l, diverging: true, epoch: i, year: mjdToYear(ep(i).mjd),
        label: `${ep(i).date} − mean(others)` };
    }
    const i = mode === 'blink' ? (cur % 2 === 0 ? A : B) : cur % nE;
    const f = frames[i];
    return { image: f.image, vmin: limits[0], vmax: limits[1], diverging: false, epoch: i, year: mjdToYear(f.epoch.mjd),
      label: `Epoch ${i + 1}/${nE} · ${f.epoch.date} · ${f.n_used} exp.` };
  }, [exposureView, nE, mode, frames, A, B, cur, sumImg, residImgs, limits, valid, crop]);

  const pickExposure = useCallback(
    async (did: string | null) => {
      if (!did || !jobId) return setExposureView(null);
      try {
        const e = await api.exposure(jobId, did);
        setExposureView({
          did, image: subtractMedian(e.image), mjd: e.meta.mjd,
          label: `Single exposure · D${e.meta.detector} · ${e.meta.wavelength_um?.toFixed(3)} µm · ${e.meta.date.slice(0, 16)}`,
        });
      } catch (err: any) {
        setSpecErr(err.message);
      }
    },
    [jobId]
  );

  // ---------------------------------------------------------------- URL sync
  const shareUrl = useMemo(() => {
    if (!target) return window.location.href;
    const q = new URLSearchParams();
    if (target.name) q.set('target', target.name);
    q.set('ra', target.ra.toFixed(6));
    q.set('dec', target.dec.toFixed(6));
    if (target.pmra != null && target.pmdec != null) {
      q.set('pmra', String(target.pmra));
      q.set('pmdec', String(target.pmdec));
      q.set('epoch', String(target.posEpoch));
    }
    q.set('fov', String(fov));
    if (release) q.set('release', release);
    q.set('stack', stackMode);
    if (stackMode !== 'all') q.set('channel', String(channel));
    q.set('mode', mode);
    if (mode === 'blink' || mode === 'diff') {
      q.set('a', String(A));
      q.set('b', String(B));
    }
    if (colormap !== 'grayscale') q.set('cmap', colormap);
    if (stretch !== 'asinh') q.set('stretch', stretch);
    if (strict) q.set('strict', '1');
    if (EMBED) q.set('embed', '1');
    return `${window.location.origin}${window.location.pathname}?${q}`;
  }, [target, fov, release, stackMode, channel, mode, A, B, colormap, stretch, strict]);

  useEffect(() => {
    window.history.replaceState({}, '', shareUrl);
  }, [shareUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  // ---------------------------------------------------------------- derived info
  const nowPos = useMemo(() => {
    if (!field) return null;
    return { ra: field.center_ra, dec: field.center_dec };
  }, [field]);
  const irOnly = wise.filter((w) => w.ir_only_mover_candidate);
  // Keep overlays readable: sources SPHEREx can plausibly see, plus every infrared-only mover candidate.
  const gaiaShown = useMemo(() => gaia.filter((g) => (g.g ?? 99) < 20), [gaia]);
  const wiseShown = useMemo(
    () => wise.filter((w) => w.ir_only_mover_candidate || Math.min(w.w1 ?? 99, w.w2 ?? 99) < 17),
    [wise]
  );
  const grid = field && cropN ? { ra0: field.center_ra, dec0: field.center_dec, n: cropN, scaleArcsec: field.pixel_scale_arcsec } : null;
  const lcWindow = { lo: ch.lo, hi: ch.hi };
  const pmTotal = target?.pmra != null && target?.pmdec != null ? Math.hypot(target.pmra, target.pmdec) : null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-space-950 text-slate-100">
      {/* Header */}
      {!EMBED && (
        <header className="bg-space-900/90 border-b border-space-700 px-4 py-2 flex flex-wrap items-center gap-3 z-30">
          <div className="flex items-center gap-2.5 mr-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-nasa-blue to-nasa-red/80 flex items-center justify-center ring-1 ring-nasa-cyan/40">
              <Telescope className="w-4 h-4 text-nasa-cyan" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-bold">SPHEREx Blink Explorer</h1>
              <p className="text-[10px] text-slate-400">Live NASA SPHEREx images, any position on the sky</p>
            </div>
          </div>
          <form onSubmit={onSearch} className="flex-1 min-w-[260px] max-w-xl flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-2" />
              <input className="input w-full pl-8" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Object name (SIMBAD) or RA Dec — e.g. 08h55m10.83s -07d14m42.5s, 269.452 4.693" />
            </div>
            <button className="btn-primary" type="submit">Go</button>
          </form>
          <div className="flex items-center gap-2 ml-auto">
            <button className="btn" onClick={() => setAtlasOpen(true)} title="Browse the whole sky"><Globe2 className="w-4 h-4" /> Sky atlas</button>
            <button className="btn" onClick={() => setReleasesOpen(true)} title="Data releases & uploads">
              <Database className="w-4 h-4" /> {release.split('+').map((n) => releases.find((r) => r.name === n)?.label || n).join(' + ') || 'Release'}
            </button>
            <button className="btn" onClick={copyLink} title="Copy a link to this exact view">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Link2 className="w-4 h-4" />} Share
            </button>
          </div>
          {searchErr && <div className="w-full text-xs text-red-300">{searchErr}</div>}
        </header>
      )}

      {/* Preset bar */}
      {!EMBED && (
        <div className="px-4 py-1.5 border-b border-space-800 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-slate-500 shrink-0">Challenge test objects:</span>
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => resolveAndLoad(p.query)} title={p.kind}
              className={`chip shrink-0 ${target?.info?.query === p.query ? 'chip-on' : ''}`}>{p.label}</button>
          ))}
          <span className="text-slate-600 shrink-0 ml-2">…or search / pick anywhere in the sky atlas</span>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Viewer column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 relative min-h-[320px] p-2">
            {grid && view ? (
              <SkyCanvas grid={grid} image={view.image} vmin={view.vmin} vmax={view.vmax} diverging={view.diverging}
                stretch={stretch} colormap={view.diverging ? 'coolwarm' : colormap} frameYear={view.year}
                gaia={gaiaShown} wise={wiseShown} showGaia={showGaia} showWise={showWise}
                track={track} currentEpoch={view.epoch} aperture={aperture}
                onAperture={(a) => setAperture(a)} label={view.label} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-slate-400 text-center px-6">
                {status?.state === 'error' ? (
                  <>
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                    <p className="max-w-md">{status.message}</p>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-nasa-cyan" />
                    <p>{status?.message || 'Waiting for a target…'}</p>
                    {status && status.total > 0 && (
                      <div className="w-72">
                        <div className="h-1.5 bg-space-800 rounded overflow-hidden">
                          <div className="h-full bg-nasa-cyan transition-all" style={{ width: `${(100 * status.done) / status.total}%` }} />
                        </div>
                        <p className="text-[10px] font-mono mt-1">{status.done} / {status.total} exposures · cached after first load</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {framesLoading && grid && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] px-2 py-1 rounded bg-space-900/90 border border-space-700 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> stacking…
              </div>
            )}
            {exposureView && (
              <button className="absolute top-4 left-4 chip chip-on" onClick={() => setExposureView(null)}>✕ back to epochs</button>
            )}
          </div>

          {/* Controls */}
          <div className="border-t border-space-800 bg-space-900/60 px-3 py-2 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {MODES.map((m) => (
                <button key={m.id} title={m.hint} className={`chip ${mode === m.id ? 'chip-on' : ''}`}
                  onClick={() => { setMode(m.id); setExposureView(null); }}>{m.label}</button>
              ))}
              {(mode === 'play' || mode === 'blink' || mode === 'resid') && (
                <>
                  <button className="icon-btn" onClick={() => setPlaying(!playing)} title={playing ? 'Pause' : 'Play'}>
                    {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <label className="flex items-center gap-1 text-slate-400">
                    speed
                    <input type="range" min={0.5} max={8} step={0.5} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
                    <span className="font-mono w-10">{fps} fps</span>
                  </label>
                </>
              )}
              {(mode === 'blink' || mode === 'diff') && nE > 1 && (
                <span className="flex items-center gap-1 text-slate-400">
                  A
                  <select className="sel" value={A} onChange={(e) => setEpochA(Number(e.target.value))}>
                    {frames.map((f, i) => <option key={i} value={i}>{f.epoch.date}</option>)}
                  </select>
                  B
                  <select className="sel" value={B} onChange={(e) => setEpochB(Number(e.target.value))}>
                    {frames.map((f, i) => <option key={i} value={i}>{f.epoch.date}</option>)}
                  </select>
                </span>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                <select className="sel" value={colormap} onChange={(e) => setColormap(e.target.value as Colormap)}>
                  {['grayscale', 'viridis', 'inferno', 'coolwarm', 'rainbow'].map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="sel" value={stretch} onChange={(e) => setStretch(e.target.value as StretchMode)}>
                  {['linear', 'sqrt', 'asinh', 'log'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </span>
            </div>

            {/* epoch strip */}
            {nE > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto">
                <span className="text-slate-500 mr-1">Epochs:</span>
                {frames.map((f, i) => (
                  <button key={i} onClick={() => { setMode('play'); setPlaying(false); setCur(i); setExposureView(null); }}
                    className={`px-2 py-0.5 rounded border font-mono text-[10px] ${view?.epoch === i ? 'border-white text-white' : 'border-space-700 text-slate-400'}`}
                    style={{ boxShadow: `inset 0 -2px 0 ${epochColor(i)}` }} title={`${f.epoch.n_exposures} exposures, detectors ${f.epoch.detectors.join(',')}`}>
                    {f.epoch.date} <span className="text-slate-500">({f.n_used})</span>
                  </button>
                ))}
              </div>
            )}

            {/* stack / wavelength */}
            <div className="flex flex-wrap items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-nasa-cyan" />
              <span className="text-slate-400">Stack:</span>
              {(['all', 'det', 'channel'] as StackMode[]).map((s) => (
                <button key={s} className={`chip ${stackMode === s ? 'chip-on' : ''}`} onClick={() => setStackMode(s)}>
                  {s === 'all' ? 'All 6 detectors (0.75–5 µm)' : s === 'det' ? `Detector D${ch.det}` : `Channel ${channel + 1}/102`}
                </button>
              ))}
              <span className="text-slate-400">FOV</span>
              <select className="sel" value={fov} title={`Loaded ${loadFov}′ — smaller views are instant, larger ones download more data`}
                onChange={(e) => {
                  const f = Number(e.target.value);
                  setFov(f);
                  if (f > loadFov) setLoadFov(f);
                }}>
                {[...new Set([...FOV_OPTIONS, fov])].sort((a, b) => a - b).map((f) => <option key={f} value={f}>{f}′ × {f}′{f <= loadFov ? '' : ' ⤓'}</option>)}
              </select>
              <label className="flex items-center gap-1 text-slate-400" title="Also mask pixels flagged as ghost, crosstalk, streak, bloom, snowball or halo">
                <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /> mask contamination
              </label>
              <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={showGaia} onChange={(e) => setShowGaia(e.target.checked)} /><span className="text-nasa-cyan">○</span> Gaia DR3 <span className="text-slate-600">(G&lt;20)</span></label>
              <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={showWise} onChange={(e) => setShowWise(e.target.checked)} /><span className="text-nasa-amber">◇</span> CatWISE2020 <span className="text-slate-600">(W1|W2&lt;17)</span></label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-24 shrink-0 font-mono">{ch.lo.toFixed(3)}–{ch.hi.toFixed(3)} µm</span>
              <div className="flex-1 relative">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 flex rounded overflow-hidden pointer-events-none">
                  {SPHEREX_DETECTORS.map((d) => <div key={d.det} className="flex-1" style={{ background: d.color, opacity: 0.55 }} />)}
                </div>
                <input type="range" min={0} max={101} value={channel} onChange={(e) => setChannel(Number(e.target.value))} className="w-full relative" />
              </div>
              <span className="font-mono w-14 text-right" style={{ color: detColor(ch.det) }}>D{ch.det} R≈{SPHEREX_DETECTORS[ch.det - 1].R.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Side panel */}
        {!EMBED && (
          <aside className="w-full lg:w-[460px] xl:w-[520px] shrink-0 border-t lg:border-t-0 lg:border-l border-space-800 overflow-y-auto p-3 space-y-3">
            {/* target card */}
            <div className="panel space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="panel-title flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> {target?.name || 'Custom position'}</h3>
                {target?.info && <span className="text-[10px] text-slate-400">{target.info.otype} {target.info.sptype && `· ${target.info.sptype}`}</span>}
              </div>
              {target && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono text-slate-300">
                  <div>RA {degToHMS(target.ra)}</div>
                  <div>Dec {degToDMS(target.dec)}</div>
                  <div className="text-slate-500">{target.ra.toFixed(6)}°, {target.dec.toFixed(6)}° (ep. {target.posEpoch})</div>
                  <div>{target.info?.distance_pc ? `d = ${target.info.distance_pc.toFixed(2)} pc (ϖ ${target.info.parallax_mas} mas)` : ''}</div>
                  {pmTotal !== null && (
                    <div className="col-span-2">μ = {(pmTotal / 1000).toFixed(3)}″/yr (μα* {target.pmra}, μδ {target.pmdec} mas/yr)</div>
                  )}
                  {nowPos && pmTotal !== null && (
                    <div className="col-span-2 text-nasa-purple">
                      Field centred on its position at the mean SPHEREx epoch: {nowPos.ra.toFixed(5)}°, {nowPos.dec.toFixed(5)}°
                      ({(pmTotal / 1000 * (mjdToYear(field!.epochs.reduce((s, e) => s + e.mjd, 0) / field!.epochs.length) - target.posEpoch)).toFixed(0)}″ from ep. {target.posEpoch})
                    </div>
                  )}
                  {target.info?.pos_ref && <div className="col-span-2 text-slate-500">Position: SIMBAD via CDS Sesame ({target.info.pos_ref})</div>}
                </div>
              )}
              {field && (
                <p className="text-[10px] text-slate-400">
                  {field.exposures.length} exposures · {field.epochs.length} epochs · {field.n}×{field.n} px at {field.pixel_scale_arcsec}″/px
                  {field.failed.length > 0 && <span className="text-amber-300"> · {field.failed.length} reads failed</span>}
                  {field.track && field.track.length > 1 && (
                    <> · moves {(Math.hypot(field.track[field.track.length - 1].x - field.track[0].x, field.track[field.track.length - 1].y - field.track[0].y)).toFixed(2)} px across the data (purple track)</>
                  )}
                </p>
              )}
              {catErr && <p className="text-[10px] text-amber-300">Catalog: {catErr}</p>}
              {irOnly.length > 0 && showWise && (
                <p className="text-[10px] text-red-300">
                  {irOnly.length} CatWISE source{irOnly.length > 1 ? 's' : ''} with significant proper motion and no Gaia DR3 match within 3″ (red ◇) — candidate cold, infrared-only movers worth a look.
                </p>
              )}
            </div>

            <SpectrumPanel points={spectrum} epochs={field?.epochs ?? []} loading={specLoading} error={specErr}
              label={aperture ? `${aperture.label ?? ''} · r = ${aperture.radiusArcsec.toFixed(1)}″` : ''} tracked={specTracked}
              window={lcWindow} onPickExposure={pickExposure} />

            {field && (
              <ExposureTable exposures={field.exposures} contamination={field.contamination_flags}
                selected={exposureView?.did ?? null} onSelect={pickExposure} />
            )}

            <div className="panel text-[10px] text-slate-400 space-y-1 leading-snug">
              <h3 className="panel-title">How to read this</h3>
              <p><b className="text-slate-200">Moving objects</b> shift between epochs; in <i>B − A</i> they appear as a dark/bright pair. SPHEREx pixels are 6.15″, so even Barnard’s Star (10.4″/yr) moves only ~1.7 px per year — use zoom and the purple predicted track.</p>
              <p><b className="text-slate-200">Variable stars</b> stay put but change brightness: a single-signed residual in <i>Epoch − rest</i>, and scatter in the light curve.</p>
              <p><b className="text-slate-200">Stacks:</b> SPHEREx images every wavelength with a linear variable filter, so each pixel has its own wavelength. “Channel” stacks only pixels whose wavelength falls in that 1/102 slice.</p>
              <p>Data: NASA/IPAC IRSA SPHEREx ({release}), Gaia DR3 (ESA), CatWISE2020 (IRSA), SIMBAD (CDS).</p>
            </div>
          </aside>
        )}
      </div>

      <ReleasesModal open={releasesOpen} onClose={() => setReleasesOpen(false)} releases={releases} current={release}
        onReleases={(r) => setReleases(r)} onSelect={(n) => { setRelease(n); setReleasesOpen(false); }}
        onUploadsChanged={() => setUploadsTick((t) => t + 1)} />
      <AtlasModal open={atlasOpen} onClose={() => setAtlasOpen(false)} ra={target?.ra ?? 0} dec={target?.dec ?? 0}
        onPick={(ra, dec) => goTo({ ra, dec, pmra: null, pmdec: null, posEpoch: 2000, name: null, info: null })} />
    </div>
  );
};
