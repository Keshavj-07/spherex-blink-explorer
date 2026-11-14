import React from 'react';
import { TargetMetadata } from '../types/astronomy';
import { X, CheckCircle2, Download, Info, Compass, Sparkles } from 'lucide-react';

interface TargetDetailDrawerProps {
  target: TargetMetadata;
  isOpen: boolean;
  onClose: () => void;
}

export const TargetDetailDrawer: React.FC<TargetDetailDrawerProps> = ({
  target,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const totalPmArcsec = Math.hypot(target.pm_ra_mas_yr, target.pm_dec_mas_yr) / 1000.0;

  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(target, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${target.id}-spherex-benchmark.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-space-900 border-l border-space-700 shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-space-800 flex items-center justify-between bg-space-950">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-nasa-cyan" />
          <div>
            <h2 className="text-base font-bold text-slate-100">{target.name}</h2>
            <p className="text-xs text-slate-400 font-mono">{target.designation}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-space-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs text-slate-300">
        {/* Core Astrometric & Physical Metrics */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-2.5 rounded-lg bg-space-950 border border-space-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Coordinates (J2000)</span>
            <span className="font-mono text-slate-200 block mt-0.5">{target.ra_hms}</span>
            <span className="font-mono text-slate-200 block">{target.dec_dms}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-space-950 border border-space-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Distance & Type</span>
            <span className="font-semibold text-nasa-cyan block mt-0.5">{target.type}</span>
            <span className="font-mono text-slate-400 block">{target.distance_pc} pc ({(target.distance_pc * 3.262).toFixed(1)} ly)</span>
          </div>

          <div className="p-2.5 rounded-lg bg-space-950 border border-space-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Proper Motion Vector</span>
            <span className="font-mono text-slate-200 block mt-0.5">
              μ_α = {target.pm_ra_mas_yr.toFixed(1)} mas/yr
            </span>
            <span className="font-mono text-slate-200 block">
              μ_δ = {target.pm_dec_mas_yr.toFixed(1)} mas/yr
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-space-950 border border-space-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Sky Motion</span>
            <span className="font-mono font-bold text-amber-400 text-sm block mt-0.5">
              {totalPmArcsec.toFixed(3)}″ / yr
            </span>
            <span className="text-[10px] text-slate-500">
              {totalPmArcsec > 2 ? '⚡ Extreme Proper Motion' : 'Stationary position'}
            </span>
          </div>
        </div>

        {/* Physical Description & Mechanism */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-nasa-cyan" />
            Astrophysical Overview
          </h3>
          <p className="text-slate-300 leading-relaxed bg-space-950/60 p-3 rounded-lg border border-space-800">
            {target.description}
          </p>
        </div>

        {/* Expected Benchmark Findings Checklist */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Space Apps Benchmark Verification
          </h3>
          <div className="space-y-1.5">
            {target.expected_findings.map((finding, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded-lg bg-space-950/40 border border-space-800"
              >
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                  ✓
                </span>
                <span className="text-slate-300 leading-normal">{finding}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Optical vs Infrared Diagnostics */}
        <div className="p-3 rounded-lg bg-space-950 border border-space-800 space-y-2">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Cross-Wavelength Diagnostics
          </h3>
          <div className="flex items-center justify-between text-[11px] font-mono border-b border-space-800 pb-1.5">
            <span className="text-slate-400">Gaia DR3 (Optical G):</span>
            <span className={target.is_infrared_only ? 'text-red-400 font-bold' : 'text-nasa-cyan font-bold'}>
              {target.is_infrared_only ? 'UNDETECTED (G > 23.0)' : 'Detected'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono border-b border-space-800 pb-1.5">
            <span className="text-slate-400">SPHEREx NIR (0.75 – 5.0 μm):</span>
            <span className="text-emerald-400 font-bold">102 Channels Resolved</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">Planet X / Cold Object Flag:</span>
            <span className={target.is_infrared_only ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-500'}>
              {target.is_infrared_only ? 'POSITIVE MATCH (IR-Only Mover)' : 'Normal Stellar'}
            </span>
          </div>
        </div>
      </div>

      {/* Drawer Footer */}
      <div className="p-4 border-t border-space-800 bg-space-950 flex items-center justify-between gap-3">
        <button
          onClick={handleDownloadJSON}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-space-800 hover:bg-space-700 border border-space-700 text-slate-200 text-xs font-medium transition-colors"
        >
          <Download className="w-4 h-4 text-nasa-cyan" />
          <span>Export Benchmark JSON</span>
        </button>

        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-nasa-blue hover:bg-nasa-blue/80 text-white text-xs font-semibold transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
