import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { LightCurvePoint } from '../types/astronomy';
import { Radio, Calendar } from 'lucide-react';

interface LightCurvePlotProps {
  data: LightCurvePoint[];
  targetName: string;
  variabilityType: string;
}

export const LightCurvePlot: React.FC<LightCurvePlotProps> = ({
  data,
  targetName,
  variabilityType,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-500">
        Loading multi-epoch light curve...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-space-900/60 p-3 rounded-lg border border-space-800">
      {/* Title & Variability Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-semibold text-slate-200">
            Multi-Epoch Infrared Light Curve
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">
            {targetName} (MJD 59580 – 61230)
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-[10px] text-purple-300 font-mono">
          <span>Behavior:</span>
          <span className="font-semibold">{variabilityType}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 w-full min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e294b" />

            <XAxis
              dataKey="mjd"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(val) => `MJD ${val}`}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0))}
              unit=" μJy"
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload as LightCurvePoint;
                return (
                  <div className="bg-space-950 border border-space-700 p-2.5 rounded-lg shadow-xl text-xs font-mono space-y-1">
                    <div className="text-purple-400 font-bold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {p.date} (MJD {p.mjd})
                    </div>
                    <div className="text-slate-200">
                      Survey: <span className="text-nasa-cyan">{p.survey}</span>
                    </div>
                    <div className="text-slate-200">
                      Flux: <span className="font-semibold text-emerald-400">{p.flux_ujy} μJy</span> ± {p.flux_err_ujy} μJy
                    </div>
                  </div>
                );
              }}
            />

            <Line
              type="monotone"
              dataKey="flux_ujy"
              stroke="#a855f7"
              strokeWidth={2}
              dot={{ r: 4, fill: '#a855f7', stroke: '#ffffff', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: '#00f0ff', stroke: '#ffffff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
