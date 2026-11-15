import React, { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar, ReferenceArea, Legend,
} from 'recharts';
import { Download, Loader2 } from 'lucide-react';
import { SpectrumPoint, Epoch } from '../lib/api';
import { SPECTRAL_FEATURES, detColor } from '../lib/constants';

const EPOCH_COLORS = ['#22d3ee', '#facc15', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#60a5fa', '#f87171'];
export const epochColor = (i: number) => EPOCH_COLORS[i % EPOCH_COLORS.length];

interface Props {
  points: SpectrumPoint[];
  epochs: Epoch[];
  loading: boolean;
  error: string | null;
  label: string;
  tracked: boolean;
  window: { lo: number; hi: number } | null;
  onPickExposure: (did: string) => void;
}

function toCSV(points: SpectrumPoint[]) {
  const head = 'wavelength_um,bandwidth_um,flux_ujy,flux_err_ujy,snr,mjd,date,detector,epoch,masked_frac,flags,did';
  const rows = points.map((p) =>
    [p.wavelength_um, p.bandwidth_um ?? '', p.flux_ujy, p.flux_err_ujy, p.snr ?? '', p.mjd, p.date, p.detector, p.epoch,
      p.masked_frac, p.flags.join('|'), p.did].join(',')
  );
  return [head, ...rows].join('\n');
}

const Tip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p: SpectrumPoint = payload[0].payload;
  return (
    <div className="bg-space-900 border border-space-700 rounded px-2 py-1.5 text-[10px] font-mono text-slate-200 space-y-0.5">
      <div>λ = {p.wavelength_um.toFixed(4)} µm (D{p.detector})</div>
      <div>F = {p.flux_ujy.toFixed(1)} ± {p.flux_err_ujy.toFixed(1)} µJy</div>
      <div>{p.date} · epoch {p.epoch + 1}</div>
      {p.flags.length > 0 && <div className="text-amber-300">flags: {p.flags.join(', ')}</div>}
      {p.masked_frac > 0 && <div className="text-amber-300">masked {Math.round(p.masked_frac * 100)}% of aperture</div>}
    </div>
  );
};

export const SpectrumPanel: React.FC<Props> = ({ points, epochs, loading, error, label, tracked, window, onPickExposure }) => {
  const [hideContam, setHideContam] = useState(true);
  const [colorBy, setColorBy] = useState<'epoch' | 'detector'>('epoch');
  const [logY, setLogY] = useState(false);

  const shown = useMemo(() => points.filter((p) => !(hideContam && p.contaminated)), [points, hideContam]);
  const groups = useMemo(() => {
    const m = new Map<number, SpectrumPoint[]>();
    for (const p of shown) {
      const k = colorBy === 'epoch' ? p.epoch : p.detector;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(logY ? { ...p, flux_ujy: Math.max(p.flux_ujy, 0.1) } : p);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [shown, colorBy, logY]);

  const lc = useMemo(
    () => (window ? shown.filter((p) => p.wavelength_um >= window.lo && p.wavelength_um <= window.hi) : []),
    [shown, window]
  );
  const lcByDet = useMemo(() => {
    const m = new Map<number, SpectrumPoint[]>();
    lc.forEach((p) => {
      if (!m.has(p.detector)) m.set(p.detector, []);
      m.get(p.detector)!.push(p);
    });
    return [...m.entries()];
  }, [lc]);

  const download = () => {
    const blob = new Blob([toCSV(points)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spherex_spectrum_${label.replace(/[^A-Za-z0-9.+-]+/g, '_')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="min-w-0">
            <h3 className="panel-title">Spectrum (on the fly)</h3>
            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[300px]">
              {label} {tracked && <span className="text-nasa-purple">· tracking proper motion</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-nasa-cyan" />}
            <select className="sel" value={colorBy} onChange={(e) => setColorBy(e.target.value as 'epoch' | 'detector')}>
              <option value="epoch">colour: epoch</option>
              <option value="detector">colour: detector</option>
            </select>
            <button className={`chip ${logY ? 'chip-on' : ''}`} onClick={() => setLogY(!logY)}>log</button>
            <button className={`chip ${hideContam ? 'chip-on' : ''}`} onClick={() => setHideContam(!hideContam)} title="Hide points whose aperture touches ghost/crosstalk/streak/halo flags">
              clean only
            </button>
            <button className="icon-btn" onClick={download} title="Download CSV" disabled={!points.length}>
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="h-[230px]">
          {error ? (
            <div className="h-full flex items-center justify-center text-xs text-red-300 text-center px-4">{error}</div>
          ) : !points.length && !loading ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center px-6">
              Click a source, or click-and-drag a circle on the image, to measure its spectrum in every SPHEREx exposure.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 10, bottom: 18, left: 4 }}>
                <CartesianGrid stroke="#1e294b" strokeDasharray="3 3" />
                {SPECTRAL_FEATURES.map((f, i) => (
                  <ReferenceArea key={i} x1={f.lo} x2={f.hi} fill="#A855F7" fillOpacity={0.07} stroke="none"
                    label={{ value: f.name, position: 'insideTop', fontSize: 8, fill: '#a78bfa' }} />
                ))}
                {window && <ReferenceArea x1={window.lo} x2={window.hi} fill="#4ade80" fillOpacity={0.15} stroke="#4ade80" strokeOpacity={0.5} />}
                <XAxis type="number" dataKey="wavelength_um" domain={[0.7, 5.05]} ticks={[0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]}
                  tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#334155"
                  label={{ value: 'wavelength (µm)', position: 'insideBottom', offset: -8, fontSize: 9, fill: '#94a3b8' }} />
                <YAxis type="number" dataKey="flux_ujy" scale={logY ? 'log' : 'linear'} domain={logY ? [0.1, 'auto'] : ['auto', 'auto']}
                  allowDataOverflow tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#334155" width={48}
                  label={{ value: 'µJy', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#94a3b8' }} />
                <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3' }} />
                <Legend verticalAlign="top" height={16} wrapperStyle={{ fontSize: 9 }} />
                {groups.map(([k, pts]) => (
                  <Scatter key={k} name={colorBy === 'epoch' ? `${epochs[k]?.date ?? `epoch ${k + 1}`}` : `D${k}`} data={pts}
                    fill={colorBy === 'epoch' ? epochColor(k) : detColor(k)} shape="circle" isAnimationActive={false}
                    onClick={(d: any) => d?.payload?.did && onPickExposure(d.payload.did)}>
                    <ErrorBar dataKey="flux_err_ujy" direction="y" stroke="#64748b" width={0} />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="text-[9px] text-slate-500 leading-snug">
          One point per exposure: zodi-subtracted SPHEREx L2 surface brightness summed in the aperture minus a local
          annulus median (dashed rings), × pixel solid angle. Not aperture-corrected; neighbouring sources inside the
          aperture are included — check the Gaia/WISE overlays. Click a point to view that exposure.
        </p>
      </div>

      <div className="panel">
        <h3 className="panel-title">Light curve</h3>
        <p className="text-[10px] text-slate-400 font-mono mb-1">
          {window ? `${window.lo.toFixed(3)}–${window.hi.toFixed(3)} µm · ${lc.length} points` : 'Choose a wavelength channel below'}
        </p>
        <div className="h-[170px]">
          {lc.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 10, bottom: 18, left: 4 }}>
                <CartesianGrid stroke="#1e294b" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="mjd" domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#334155"
                  tickFormatter={(m: number) => new Date((m - 40587) * 86400000).toISOString().slice(0, 7)}
                  label={{ value: 'date', position: 'insideBottom', offset: -8, fontSize: 9, fill: '#94a3b8' }} />
                <YAxis type="number" dataKey="flux_ujy" domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#334155" width={48} />
                <Tooltip content={<Tip />} />
                {lcByDet.map(([d, pts]) => (
                  <Scatter key={d} name={`D${d}`} data={pts} fill={detColor(d)} isAnimationActive={false}
                    onClick={(x: any) => x?.payload?.did && onPickExposure(x.payload.did)}>
                    <ErrorBar dataKey="flux_err_ujy" direction="y" stroke="#64748b" width={0} />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              {points.length ? 'No measurements in this wavelength window' : '—'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
