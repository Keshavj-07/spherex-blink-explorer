import React, { useState, useEffect } from 'react';
import { ALL_SPHEREX_CHANNELS, SPHEREX_BANDS_INFO, getBandColor } from '../utils/spherexChannels';
import { Play, Pause, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface SpectralScrubberProps {
  currentChannelIdx: number;
  onSelectChannel: (idx: number) => void;
}

export const SpectralScrubber: React.FC<SpectralScrubberProps> = ({
  currentChannelIdx,
  onSelectChannel,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-scrubber player
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      onSelectChannel((currentChannelIdx + 1) % ALL_SPHEREX_CHANNELS.length);
    }, 180);
    return () => clearInterval(interval);
  }, [isPlaying, currentChannelIdx, onSelectChannel]);

  const currentChannel = ALL_SPHEREX_CHANNELS[currentChannelIdx] || ALL_SPHEREX_CHANNELS[0];
  const bandInfo = SPHEREX_BANDS_INFO.find((b) => b.band === currentChannel.band);

  return (
    <div className="bg-space-950 border-t border-space-800 px-4 py-2.5 flex flex-col gap-2 select-none">
      {/* Top Header: Channel Number, Band Info, Wavelength, Molecules */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {/* Play / Step Controls */}
          <div className="flex items-center gap-1 bg-space-900 border border-space-700 rounded-md p-0.5">
            <button
              onClick={() => onSelectChannel(Math.max(0, currentChannelIdx - 1))}
              className="p-1 text-slate-400 hover:text-slate-100 rounded"
              title="Previous Channel"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1 text-nasa-cyan hover:bg-nasa-cyan/10 rounded"
              title={isPlaying ? 'Pause Spectrum Scan' : 'Play Spectrum Scan'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onSelectChannel(Math.min(ALL_SPHEREX_CHANNELS.length - 1, currentChannelIdx + 1))}
              className="p-1 text-slate-400 hover:text-slate-100 rounded"
              title="Next Channel"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Current Channel & Wavelength */}
          <div className="flex items-center gap-2 font-mono">
            <span className="font-bold text-slate-100">
              CH {currentChannel.channel + 1} / 102
            </span>
            <span className="text-nasa-cyan font-bold text-sm">
              λ = {currentChannel.wavelength_um.toFixed(3)} μm
            </span>
          </div>

          {/* Band Badge */}
          <span
            className="px-2 py-0.5 rounded text-[11px] font-semibold border"
            style={{
              backgroundColor: `${getBandColor(currentChannel.band)}18`,
              borderColor: `${getBandColor(currentChannel.band)}55`,
              color: getBandColor(currentChannel.band),
            }}
          >
            Band {currentChannel.band} ({bandInfo?.range}, R~{bandInfo?.R})
          </span>
        </div>

        {/* Molecular Absorption Indicators */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400">Atmospheric Tracers:</span>
          {currentChannel.molecules.length > 0 ? (
            currentChannel.molecules.map((mol) => (
              <span
                key={mol}
                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse"
              >
                <Sparkles className="w-2.5 h-2.5" />
                {mol} Absorption
              </span>
            ))
          ) : (
            <span className="text-[11px] text-slate-500 font-mono">Continuum emission</span>
          )}
        </div>
      </div>

      {/* 102-Band Slider */}
      <div className="relative flex flex-col gap-1">
        <input
          type="range"
          min="0"
          max={ALL_SPHEREX_CHANNELS.length - 1}
          value={currentChannelIdx}
          onChange={(e) => onSelectChannel(parseInt(e.target.value, 10))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-sky-400 via-indigo-500 via-purple-500 via-pink-500 via-orange-500 to-red-500 accent-nasa-cyan"
        />

        {/* Band Range Ticks underneath */}
        <div className="flex justify-between text-[10px] text-slate-500 font-mono px-0.5">
          <span>0.75 μm (B1)</span>
          <span>1.11 μm (B2)</span>
          <span>1.64 μm (B3)</span>
          <span>2.42 μm (B4)</span>
          <span>3.82 μm (B5)</span>
          <span>5.00 μm (B6)</span>
        </div>
      </div>
    </div>
  );
};
