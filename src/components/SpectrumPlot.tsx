import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
} from 'recharts';
import { SpectrumDataPoint } from '../types/astronomy';
import { Sparkles, Activity } from 'lucide-react';

interface SpectrumPlotProps {
  data: SpectrumDataPoint[];
  currentWavelengthUm: number;
  onSelectWavelength: (wavelength: number) => void;
  targetName: string;
}

export const SpectrumPlot: React.FC<SpectrumPlotProps> = ({
  data,
  currentWavelengthUm,
  onSelectWavelength,
  targetName,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-500">
        Loading 102-band spectrum data...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-space-900/60 p-3 rounded-lg border border-space-800">
      {/* Title & Stats */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-nasa-cyan" />
          <h3 className="text-xs font-semibold text-slate-200">
            102-Band Spectral Energy Distribution (SED)
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">
            {targetName} (0.75 – 5.0 μm)
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-500/30 border border-amber-500/60" />
            Molecular Absorption
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-nasa-cyan" />
            Current Channel
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 w-full min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
            onClick={(state) => {
              if (state && state.activePayload && state.activePayload.length > 0) {
                const pt = state.activePayload[0].payload as SpectrumDataPoint;
                onSelectWavelength(pt.wavelength_um);
              }
            }}
          >
            <defs>
              <linearGradient id="spectrumGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#0B3D91" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e294b" />

            <XAxis
              dataKey="wavelength_um"
              tickFormatter={(val) => `${val.toFixed(1)}μ`}
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              domain={[0.75, 5.0]}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0))}
              unit=" μJy"
            />

            {/* Molecular feature highlight zones */}
            {/* CH4 Methane at 1.66 um & 2.2 um */}
            <ReferenceArea x1={1.64} x2={1.75} fill="#f59e0b" fillOpacity={0.12} />
            <ReferenceArea x1={2.15} x2={2.38} fill="#f59e0b" fillOpacity={0.12} />
            {/* H2O Water at 1.35-1.45 and 1.85-1.95 */}
            <ReferenceArea x1={1.35} x2={1.45} fill="#38bdf8" fillOpacity={0.1} />
            <ReferenceArea x1={1.85} x2={1.95} fill="#38bdf8" fillOpacity={0.1} />
            {/* CH4 Fundamental at 3.3 um */}
            <ReferenceArea x1={3.20} x2={3.50} fill="#f59e0b" fillOpacity={0.12} />
            {/* CO2 at 4.26 um */}
            <ReferenceArea x1={4.20} x2={4.35} fill="#a855f7" fillOpacity={0.12} />
            {/* CO at 4.67 um */}
            <ReferenceArea x1={4.58} x2={4.75} fill="#ec4899" fillOpacity={0.12} />

            {/* Currently scrubbed wavelength cursor */}
            <ReferenceLine
              x={currentWavelengthUm}
              stroke="#00f0ff"
              strokeWidth={2}
              strokeDasharray="2 2"
              label={{
                value: `λ=${currentWavelengthUm.toFixed(2)}μm`,
                fill: '#00f0ff',
                fontSize: 10,
                position: 'top',
              }}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload as SpectrumDataPoint;
                return (
                  <div className="bg-space-950 border border-space-700 p-2.5 rounded-lg shadow-xl text-xs font-mono space-y-1">
                    <div className="text-nasa-cyan font-bold">
                      λ = {p.wavelength_um.toFixed(3)} μm (Band {p.band})
                    </div>
                    <div className="text-slate-200">
                      Flux: <span className="font-semibold text-emerald-400">{p.flux_ujy} μJy</span> ± {p.flux_err_ujy} μJy
                    </div>
                    <div className="text-slate-400">SNR: {p.snr}</div>
                    {p.molecules && p.molecules.length > 0 && (
                      <div className="text-amber-400 text-[11px] font-semibold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Feature: {p.molecules.join(', ')} Absorption
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="flux_ujy"
              stroke="#00f0ff"
              strokeWidth={1.8}
              fill="url(#spectrumGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
