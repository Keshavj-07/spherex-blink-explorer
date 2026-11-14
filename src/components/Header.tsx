import React, { useState } from 'react';
import { Sparkles, Search, Info, Telescope } from 'lucide-react';
import { TargetSummary } from '../types/astronomy';
import { parseCoordinates } from '../utils/coordinates';

interface HeaderProps {
  targets: TargetSummary[];
  onSelectTarget: (id: string) => void;
  onCustomCoordinates: (ra: number, dec: number) => void;
  onOpenPlanetXGuide: () => void;
  onOpenDetails: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  targets,
  onSelectTarget,
  onCustomCoordinates,
  onOpenPlanetXGuide,
  onOpenDetails,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if matching a target name
    const match = targets.find((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (match) {
      onSelectTarget(match.id);
      setSearchQuery('');
      setSearchError(false);
      return;
    }

    // Check if coordinates
    const coords = parseCoordinates(searchQuery);
    if (coords) {
      onCustomCoordinates(coords.ra, coords.dec);
      setSearchQuery('');
      setSearchError(false);
      return;
    }

    setSearchError(true);
    setTimeout(() => setSearchError(false), 2500);
  };


  return (
    <header className="bg-space-900/90 backdrop-blur-md border-b border-space-700/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm z-30 select-none">
      {/* Brand & Mission Badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-nasa-blue via-space-800 to-nasa-red/80 shadow-lg shadow-nasa-blue/20 ring-1 ring-nasa-cyan/40">
          <Telescope className="w-5 h-5 text-nasa-cyan" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-slate-100 tracking-wide text-base flex items-center gap-1.5">
              SPHEREx <span className="text-nasa-cyan font-normal text-xs uppercase px-1.5 py-0.5 rounded bg-nasa-cyan/10 border border-nasa-cyan/30">Blink & Spectrum Explorer</span>
            </h1>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-nasa-red/20 text-nasa-red border border-nasa-red/30">
              NASA Space Apps 2026
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Multi-epoch 0.75–5.0 μm NIR imaging (102 bands) • High Proper Motion & Variable Star Analysis
          </p>
        </div>
      </div>

      {/* Search & Coordinate Input */}
      <form onSubmit={handleSearch} className="relative flex-1 max-w-md min-w-[220px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search target (e.g. WISE 0855) or 'RA, Dec' (269.45, 4.69)..."
          className={`w-full bg-space-950/80 text-xs text-slate-200 placeholder-slate-500 rounded-lg pl-9 pr-8 py-1.5 border transition-all focus:outline-none ${
            searchError
              ? 'border-red-500 focus:ring-1 focus:ring-red-500'
              : 'border-space-700 focus:border-nasa-cyan/60 focus:ring-1 focus:ring-nasa-cyan/40'
          }`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
          >
            ×
          </button>
        )}
      </form>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Planet X / Science Modal */}
        <button
          onClick={onOpenPlanetXGuide}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/10 hover:from-amber-500/30 hover:to-orange-500/20 border border-amber-500/40 text-amber-300 text-xs font-medium transition-all shadow-sm"
          title="How SPHEREx detects cold brown dwarfs & Planet X candidates"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="hidden sm:inline">Planet X Guide</span>
        </button>

        {/* Target Details Drawer Trigger */}
        <button
          onClick={onOpenDetails}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-space-800 hover:bg-space-700 border border-space-600 text-slate-200 text-xs transition-colors"
          title="Target Physics & Benchmark Verification Details"
        >
          <Info className="w-3.5 h-3.5 text-nasa-cyan" />
          <span className="hidden sm:inline">Target Specs</span>
        </button>
      </div>
    </header>
  );
};
