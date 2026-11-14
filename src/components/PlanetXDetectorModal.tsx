import React from 'react';
import { X, Sparkles, Orbit, ShieldAlert, ArrowRight } from 'lucide-react';

interface PlanetXDetectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToWISE0855: () => void;
}

export const PlanetXDetectorModal: React.FC<PlanetXDetectorModalProps> = ({
  isOpen,
  onClose,
  onJumpToWISE0855,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-space-900 border border-space-700 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-space-950 via-space-900 to-space-950 border-b border-space-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Orbit className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Hunting Planet X & Sub-Stellar Worlds with SPHEREx
              </h2>
              <p className="text-xs text-slate-400">
                2026 NASA Space Apps Challenge Scientific Briefing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-space-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 text-xs text-slate-300 max-h-[75vh] overflow-y-auto leading-relaxed">
          {/* Executive Summary */}
          <div className="p-3.5 rounded-lg bg-nasa-blue/20 border border-nasa-cyan/30 space-y-1.5">
            <span className="text-[11px] font-bold text-nasa-cyan uppercase tracking-wider block">
              The Mission Objective
            </span>
            <p className="text-slate-200">
              Is there a 9th planet lurking at the frozen fringes of our Solar System (300–800 AU)? If Planet X exists, it is too cold to emit optical light and too slow-moving for narrow-field optical telescopes. <strong>NASA’s SPHEREx mission</strong> is uniquely tailored to solve this mystery by mapping the entire sky four times in 102 near-infrared bands (0.75 – 5.0 μm).
            </p>
          </div>

          {/* 3 Pillars of Detection */}
          <div className="space-y-2.5">
            <h3 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              How the SPHEREx Blink & Spectrum Explorer Identifies Candidates
            </h3>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-space-950 border border-space-800 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-200">
                  <span className="w-5 h-5 rounded bg-space-800 border border-space-700 flex items-center justify-center text-[10px] text-nasa-cyan">1</span>
                  Blink Comparator
                </div>
                <p className="text-slate-400 text-[11px]">
                  Multi-epoch observations (separated by 6 months) cause moving Solar System objects and nearby brown dwarfs to noticeably jump against stationary background stars.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-space-950 border border-space-800 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-200">
                  <span className="w-5 h-5 rounded bg-space-800 border border-space-700 flex items-center justify-center text-[10px] text-purple-400">2</span>
                  Difference Imaging (Δ)
                </div>
                <p className="text-slate-400 text-[11px]">
                  Subtracting Epoch 1 from Epoch 2 cancels stationary background stars to zero noise. Moving bodies produce a stark <strong>dipole signature</strong> (adjacent dark and bright lobes).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-space-950 border border-space-800 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-200">
                  <span className="w-5 h-5 rounded bg-space-800 border border-space-700 flex items-center justify-center text-[10px] text-red-400">3</span>
                  Infrared-Only Filter
                </div>
                <p className="text-slate-400 text-[11px]">
                  Cold objects (&lt; 300 K) emit zero visible light. By cross-matching against Gaia DR3, any moving source visible in SPHEREx NIR with <strong>no Gaia counterpart</strong> is flagged!
                </p>
              </div>
            </div>
          </div>

          {/* Benchmark Target Connection */}
          <div className="p-3 rounded-lg bg-space-950 border border-space-800 space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              The Coldest Benchmark: WISE 0855-0714
            </h4>
            <p className="text-slate-300">
              At only 250 Kelvin (-23°C / -10°F), <strong>WISE 0855</strong> is the coldest known sub-stellar body outside our Solar System. It possesses rapid proper motion (8.16″/yr) and is completely invisible in Gaia optical images, but lights up brilliantly in SPHEREx Bands 5 & 6 (3.8–5.0 μm). It represents the exact physical analog of what a distant giant planet would look like.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-space-950 border-t border-space-800 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onClose();
              onJumpToWISE0855();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20"
          >
            <span>Inspect WISE 0855 (Planet X Analog)</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-space-800 hover:bg-space-700 text-slate-200 font-medium text-xs transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
