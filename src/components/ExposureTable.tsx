import React, { useMemo, useState } from 'react';
import { ExposureMeta } from '../lib/api';
import { detColor } from '../lib/constants';

interface Props {
  exposures: ExposureMeta[];
  contamination: string[];
  selected: string | null;
  onSelect: (did: string | null) => void;
}

/** Per-exposure metadata, including the quality / contamination flags at the field centre. */
export const ExposureTable: React.FC<Props> = ({ exposures, contamination, selected, onSelect }) => {
  const [det, setDet] = useState<number | 0>(0);
  const rows = useMemo(
    () => exposures.filter((e) => !det || e.detector === det).sort((a, b) => a.mjd - b.mjd),
    [exposures, det]
  );
  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-1">
        <h3 className="panel-title">Exposures ({rows.length})</h3>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button key={d} className={`chip ${det === d ? 'chip-on' : ''}`} onClick={() => setDet(d)}>{d ? `D${d}` : 'all'}</button>
          ))}
        </div>
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="text-slate-400 sticky top-0 bg-space-900">
            <tr><th className="text-left">date (UTC)</th><th>det</th><th>λ centre</th><th>cov</th><th className="text-left">flags at centre</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const fl = e.center_flags.filter((f) => f !== 'FULLSAMPLE');
              return (
                <tr key={e.did} onClick={() => onSelect(selected === e.did ? null : e.did)}
                  className={`cursor-pointer hover:bg-space-800 ${selected === e.did ? 'bg-nasa-cyan/15' : ''}`} title={e.did}>
                  <td>{e.date.replace('T', ' ').slice(0, 16)}</td>
                  <td className="text-center" style={{ color: detColor(e.detector) }}>D{e.detector}</td>
                  <td className="text-center">{e.wavelength_um ? `${e.wavelength_um.toFixed(3)}µm` : '—'}</td>
                  <td className="text-center">{Math.round(e.coverage * 100)}%</td>
                  <td>
                    {fl.map((f) => (
                      <span key={f} className={`mr-1 ${contamination.includes(f) ? 'text-amber-300' : f === 'SOURCE' ? 'text-slate-400' : 'text-red-300'}`}>{f}</span>
                    ))}
                    {e.source === 'upload' && <span className="text-nasa-amber">uploaded</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] text-slate-500 mt-1">Click a row to display that single exposure. Amber = contamination flag (ghost/crosstalk/streak…); SOURCE = pixel mapped to a known catalog source.</p>
    </div>
  );
};
