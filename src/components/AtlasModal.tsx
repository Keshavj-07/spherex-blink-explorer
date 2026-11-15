import React, { useEffect, useRef, useState } from 'react';
import { X, Globe2, Crosshair } from 'lucide-react';
import { degToDMS, degToHMS } from '../lib/sky';

interface Props {
  open: boolean;
  onClose: () => void;
  ra: number;
  dec: number;
  onPick: (ra: number, dec: number) => void;
}

// HiPS sky surveys served from IRSA's mirror (more reliable than resolving IDs through CDS).
const HIPS = 'https://irsa.ipac.caltech.edu/data/hips/CDS/';
const SURVEYS = [
  { id: HIPS + 'AllWISE/RGB-W4-W2-W1', label: 'AllWISE color (3.4–22 µm)' },
  { id: HIPS + '2MASS/Color', label: '2MASS color (1.2–2.2 µm)' },
  { id: HIPS + 'DSS2/color', label: 'DSS2 optical' },
];

/** Whole-sky navigator using CDS Aladin Lite: click anywhere to load SPHEREx data there. */
export const AtlasModal: React.FC<Props> = ({ open, onClose, ra, dec, onPick }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const aladinRef = useRef<any>(null);
  const [picked, setPicked] = useState<{ ra: number; dec: number } | null>(null);
  const [survey, setSurvey] = useState(SURVEYS[0].id);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !divRef.current) return;
    let cancelled = false;
    import('aladin-lite')
      .then(async (mod: any) => {
        const A = mod.default ?? mod;
        await A.init;
        if (cancelled || !divRef.current) return;
        const al = A.aladin(divRef.current, {
          survey, fov: 2, target: `${ra} ${dec}`, cooFrame: 'ICRSd', showReticle: true,
          showCooGrid: false, showProjectionControl: false, showFullscreenControl: false,
        });
        aladinRef.current = al;
        al.on('click', (e: any) => {
          let r = e?.ra;
          let d = e?.dec;
          if ((r === undefined || d === undefined) && e?.x !== undefined) [r, d] = al.pix2world(e.x, e.y);
          if (isFinite(r) && isFinite(d)) setPicked({ ra: r, dec: d });
        });
      })
      .catch((e) => setErr(`Aladin Lite failed to load: ${e.message}`));
    return () => {
      cancelled = true;
      if (divRef.current) divRef.current.innerHTML = '';
      aladinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    aladinRef.current?.setImageSurvey?.(survey);
  }, [survey]);

  if (!open) return null;
  const center = () => {
    const c = aladinRef.current?.getRaDec?.();
    if (c) setPicked({ ra: c[0], dec: c[1] });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-xl bg-space-900 border border-space-700 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2"><Globe2 className="w-4 h-4 text-nasa-cyan" /> Explore the whole sky</h2>
          <div className="flex items-center gap-2">
            <select className="sel" value={survey} onChange={(e) => setSurvey(e.target.value)}>
              {SURVEYS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
        </div>
        <p className="text-xs text-slate-400">Pan and zoom anywhere (Aladin Lite, CDS Strasbourg). Click a spot — or use the view center — then load its SPHEREx images.</p>
        <div ref={divRef} className="w-full h-[60vh] rounded-lg overflow-hidden bg-black" />
        {err && <p className="text-xs text-red-300">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-mono text-slate-300">
            {picked ? `${degToHMS(picked.ra)} ${degToDMS(picked.dec)}  (${picked.ra.toFixed(5)}, ${picked.dec.toFixed(5)})` : 'No position picked yet'}
          </span>
          <div className="flex gap-2">
            <button className="btn" onClick={center}><Crosshair className="w-4 h-4" /> Use view center</button>
            <button className="btn-primary" disabled={!picked} onClick={() => picked && (onPick(picked.ra, picked.dec), onClose())}>
              Load SPHEREx data here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
