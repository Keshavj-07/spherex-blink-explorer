import React from 'react';
import { ViewerMode, Colormap, StretchMode } from '../types/astronomy';
import { Play, Pause, Sliders, Activity } from 'lucide-react';

interface ViewerControlsProps {
  mode: ViewerMode;
  onSetMode: (mode: ViewerMode) => void;
  blinkHz: number;
  onSetBlinkHz: (hz: number) => void;
  crossfadeAlpha: number;
  onSetCrossfadeAlpha: (alpha: number) => void;
  colormap: Colormap;
  onSetColormap: (cm: Colormap) => void;
  stretch: StretchMode;
  onSetStretch: (st: StretchMode) => void;
}

export const ViewerControls: React.FC<ViewerControlsProps> = ({
  mode,
  onSetMode,
  blinkHz,
  onSetBlinkHz,
  crossfadeAlpha,
  onSetCrossfadeAlpha,
  colormap,
  onSetColormap,
  stretch,
  onSetStretch,
}) => {
  return (
    <div className="bg-space-900 border-t border-space-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs select-none">
      {/* Primary Mode Switcher (Blink, Difference, Epoch 1, Epoch 2, Crossfade) */}
      <div className="flex items-center gap-1.5 bg-space-950 p-1 rounded-lg border border-space-800">
        <button
          onClick={() => onSetMode('blink')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-all ${
            mode === 'blink'
              ? 'bg-nasa-blue text-white shadow-md shadow-nasa-blue/40 ring-1 ring-nasa-cyan/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-space-800'
          }`}
          title="Blink comparator between Epoch 1 and Epoch 2"
        >
          {mode === 'blink' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>Blink Mode</span>
        </button>

        <button
          onClick={() => onSetMode('diff')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
            mode === 'diff'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-space-800'
          }`}
          title="Pixel Difference Mode (Epoch 2 - Epoch 1)"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Difference (Δ)</span>
        </button>

        <button
          onClick={() => onSetMode('crossfade')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-all ${
            mode === 'crossfade'
              ? 'bg-space-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-space-800'
          }`}
          title="Manual Cross-fader slider"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Cross-Fade</span>
        </button>

        <button
          onClick={() => onSetMode('epoch1')}
          className={`px-2.5 py-1.5 rounded-md font-medium transition-all ${
            mode === 'epoch1'
              ? 'bg-space-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-space-800'
          }`}
        >
          Epoch 1
        </button>

        <button
          onClick={() => onSetMode('epoch2')}
          className={`px-2.5 py-1.5 rounded-md font-medium transition-all ${
            mode === 'epoch2'
              ? 'bg-space-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-space-800'
          }`}
        >
          Epoch 2
        </button>
      </div>

      {/* Mode-Specific Sub-Controls */}
      {mode === 'blink' && (
        <div className="flex items-center gap-2 bg-space-950/80 px-2.5 py-1 rounded-lg border border-space-800">
          <span className="text-[11px] text-slate-400 font-mono">Blink Speed:</span>
          {[0.5, 1, 2, 4].map((hz) => (
            <button
              key={hz}
              onClick={() => onSetBlinkHz(hz)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                blinkHz === hz
                  ? 'bg-nasa-cyan/20 text-nasa-cyan border border-nasa-cyan/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {hz} Hz
            </button>
          ))}
        </div>
      )}

      {mode === 'crossfade' && (
        <div className="flex items-center gap-2 bg-space-950/80 px-3 py-1 rounded-lg border border-space-800 min-w-[200px]">
          <span className="text-[11px] text-slate-400 font-mono">Ep 1</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={crossfadeAlpha}
            onChange={(e) => onSetCrossfadeAlpha(parseFloat(e.target.value))}
            className="w-full accent-nasa-cyan h-1.5 bg-space-800 rounded-lg cursor-pointer"
          />
          <span className="text-[11px] text-slate-400 font-mono">Ep 2</span>
          <span className="text-[11px] font-mono text-nasa-cyan w-9 text-right">
            {(crossfadeAlpha * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Astronomical Image Enhancements: Colormap & Stretch */}
      <div className="flex items-center gap-3">
        {/* Colormap Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Palette:</span>
          <select
            value={colormap}
            onChange={(e) => onSetColormap(e.target.value as Colormap)}
            className="bg-space-950 text-slate-200 border border-space-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-nasa-cyan capitalize"
          >
            <option value="grayscale">Grayscale</option>
            <option value="viridis">Viridis</option>
            <option value="inferno">Inferno</option>
            <option value="coolwarm">Coolwarm (Dipole)</option>
            <option value="rainbow">Rainbow</option>
          </select>
        </div>

        {/* Stretch Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Stretch:</span>
          <select
            value={stretch}
            onChange={(e) => onSetStretch(e.target.value as StretchMode)}
            className="bg-space-950 text-slate-200 border border-space-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-nasa-cyan capitalize"
          >
            <option value="asinh">Asinh (Deep)</option>
            <option value="log">Logarithmic</option>
            <option value="sqrt">Square Root</option>
            <option value="linear">Linear</option>
          </select>
        </div>
      </div>
    </div>
  );
};
