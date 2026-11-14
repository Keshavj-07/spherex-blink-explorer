import React from 'react';
import { TargetSummary } from '../types/astronomy';
import { Compass, Flame, EyeOff, Radio, Orbit, AlertCircle } from 'lucide-react';

interface TargetQuickBarProps {
  targets: TargetSummary[];
  selectedTargetId: string;
  onSelectTarget: (id: string) => void;
}

export const TargetQuickBar: React.FC<TargetQuickBarProps> = ({
  targets,
  selectedTargetId,
  onSelectTarget,
}) => {
  const getBadgeIcon = (id: string) => {
    switch (id) {
      case 'barnards-star':
        return <Orbit className="w-3.5 h-3.5 text-nasa-cyan" />;
      case 'epsilon-indi-b':
        return <Flame className="w-3.5 h-3.5 text-purple-400" />;
      case 'wise-0855':
        return <EyeOff className="w-3.5 h-3.5 text-amber-400" />;
      case 'rw-aurigae':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'r-draconis':
        return <Radio className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Compass className="w-3.5 h-3.5 text-slate-400" />;
    }
  };


  return (
    <div className="bg-space-900 border-b border-space-800 px-4 py-2 overflow-x-auto scrollbar-none flex items-center gap-2 select-none">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
        <Compass className="w-3.5 h-3.5 text-nasa-cyan" />
        Benchmark Targets:
      </span>

      <div className="flex items-center gap-2">
        {targets.map((t) => {
          const isSelected = t.id === selectedTargetId;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTarget(t.id)}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-left transition-all shrink-0 ${
                isSelected
                  ? 'bg-space-800 border-nasa-cyan shadow-md shadow-nasa-cyan/10 ring-1 ring-nasa-cyan/40 text-slate-100'
                  : 'bg-space-950/60 border-space-800 hover:border-space-700 hover:bg-space-850 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded bg-space-900 border border-space-700 shrink-0">
                {getBadgeIcon(t.id)}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{t.name}</span>
                  {t.is_infrared_only && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                      IR-Only
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                  <span>{t.ra_hms} / {t.dec_dms}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
