import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface CatalogOverlayToggleProps {
  showGaia: boolean;
  onToggleGaia: () => void;
  showWise: boolean;
  onToggleWise: () => void;
  flagInfraredOnlyMovers: boolean;
  onToggleFlagInfraredOnlyMovers: () => void;
  hasInfraredOnlyInField: boolean;
}

export const CatalogOverlayToggle: React.FC<CatalogOverlayToggleProps> = ({
  showGaia,
  onToggleGaia,
  showWise,
  onToggleWise,
  flagInfraredOnlyMovers,
  onToggleFlagInfraredOnlyMovers,
  hasInfraredOnlyInField,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 select-none">
      {/* Gaia DR3 Optical Toggle */}
      <button
        onClick={onToggleGaia}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
          showGaia
            ? 'bg-nasa-cyan/15 border-nasa-cyan text-nasa-cyan shadow-sm shadow-nasa-cyan/20'
            : 'bg-space-950 border-space-800 text-slate-400 hover:text-slate-200'
        }`}
        title="Toggle Gaia DR3 Optical vector overlays (cyan circles)"
      >
        <span className="w-2.5 h-2.5 rounded-full border border-nasa-cyan bg-nasa-cyan/40" />
        <span>Gaia DR3 (Optical)</span>
      </button>

      {/* CatWISE / AllWISE Infrared Toggle */}
      <button
        onClick={onToggleWise}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
          showWise
            ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm shadow-amber-500/20'
            : 'bg-space-950 border-space-800 text-slate-400 hover:text-slate-200'
        }`}
        title="Toggle CatWISE Infrared vector overlays (amber diamonds)"
      >
        <span className="w-2 h-2 rotate-45 border border-amber-400 bg-amber-400/40" />
        <span>CatWISE (Infrared)</span>
      </button>

      {/* Flag Infrared-Only Movers (The Planet X / Cold Y-Dwarf Filter) */}
      <button
        onClick={onToggleFlagInfraredOnlyMovers}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold border transition-all ${
          flagInfraredOnlyMovers
            ? 'bg-red-500/20 border-red-500 text-red-300 shadow-md shadow-red-500/30 animate-pulse'
            : 'bg-space-950 border-space-800 text-slate-400 hover:text-slate-200'
        }`}
        title="Flag moving sources with IR detection and ZERO Gaia optical counterpart (Planet X / Cold Brown Dwarf signature)"
      >
        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
        <span>Flag Infrared-Only Movers</span>
        {hasInfraredOnlyInField && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
        )}
      </button>
    </div>
  );
};
