import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Upload, Trash2, Database, CheckCircle2, Loader2 } from 'lucide-react';
import { api, Release, UploadItem } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  releases: Release[];
  current: string;
  onReleases: (r: Release[], latest: string | null) => void;
  onSelect: (name: string) => void;
  onUploadsChanged: () => void;
}

export const ReleasesModal: React.FC<Props> = ({ open, onClose, releases, current, onReleases, onSelect, onUploadsChanged }) => {
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUploads = () => api.uploads().then(setUploads).catch(() => setUploads([]));
  useEffect(() => {
    if (open) loadUploads();
  }, [open]);

  if (!open) return null;
  const allSky = releases.filter((r) => r.all_sky).map((r) => r.name);
  const combined = allSky.join('+');

  const check = async () => {
    setChecking(true);
    setMsg(null);
    try {
      const before = new Set(releases.map((r) => r.name));
      const r = await api.releases(true, custom.trim() || undefined);
      onReleases(r.releases, r.latest);
      const added = r.releases.filter((x) => !before.has(x.name));
      if (!r.checked) {
        setMsg('IRSA is not responding right now, so releases could not be checked. Please try again in a few minutes.');
        return;
      }
      setMsg(added.length ? `New release found: ${added.map((a) => a.label).join(', ')}` : `Up to date: checked IRSA at ${r.checked}`);
      if (custom.trim() && !r.releases.some((x) => x.name === custom.trim())) setMsg(`'${custom.trim()}' has no SPHEREx images at IRSA`);
    } catch (e: any) {
      setMsg(`Check failed: ${e.message}`);
    } finally {
      setChecking(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg(null);
    const results: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const it = await api.upload(f);
        results.push(`✓ ${it.name} (D${it.detector}, ${it.date.slice(0, 10)})`);
      } catch (e: any) {
        results.push(`✗ ${f.name}: ${e.message}`);
      }
    }
    setMsg(results.join('\n'));
    setBusy(false);
    loadUploads();
    onUploadsChanged();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-space-900 border border-space-700 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-nasa-cyan" /> SPHEREx data releases</h2>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Images are queried live from NASA/IPAC IRSA every time you load a field, so new exposures added to a release
          appear automatically. When IRSA publishes a new release (a new collection), press “Check for new releases”.
        </p>

        <div className="space-y-1.5">
          {allSky.length > 1 && (
            <button onClick={() => onSelect(combined)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm ${current === combined ? 'border-nasa-cyan bg-nasa-cyan/10' : 'border-space-700 hover:bg-space-800'}`}>
              <span className="flex items-center gap-2">
                {current === combined && <CheckCircle2 className="w-4 h-4 text-nasa-cyan" />}
                <span className="font-medium">All all-sky releases combined</span>
                <span className="text-[10px] text-green-300">recommended · most epochs, duplicates removed</span>
              </span>
            </button>
          )}
          {releases.map((r) => (
            <button key={r.name} onClick={() => onSelect(r.name)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm ${r.name === current ? 'border-nasa-cyan bg-nasa-cyan/10' : 'border-space-700 hover:bg-space-800'}`}>
              <span className="flex items-center gap-2">
                {r.name === current && <CheckCircle2 className="w-4 h-4 text-nasa-cyan" />}
                <span className="font-medium">{r.label}</span>
                <code className="text-[10px] text-slate-400">{r.name}</code>
                {!r.all_sky && <span className="text-[10px] text-amber-300">ecliptic-pole deep fields only</span>}
              </span>
              <span className="text-[11px] text-slate-400">released {r.release_date || '—'}</span>
            </button>
          ))}
          {!releases.length && <p className="text-xs text-slate-500">No releases found yet.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={check} disabled={checking}>
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Check for new releases
          </button>
          <input className="input flex-1 min-w-[160px]" placeholder="or IRSA collection name, e.g. spherex_dr2" value={custom}
            onChange={(e) => setCustom(e.target.value)} />
        </div>

        <div className="border-t border-space-700 pt-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Upload className="w-4 h-4 text-nasa-amber" /> Upload SPHEREx files</h3>
          <p className="text-xs text-slate-400">
            Add SPHEREx Level-2 spectral image FITS files (IMAGE, FLAGS, VARIANCE, ZODI, WCS-WAVE extensions) — e.g. new
            files downloaded from IRSA. They are merged into any field they overlap.
          </p>
          <input ref={fileRef} type="file" accept=".fits,.fit,.fts,.gz" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Choose FITS files
          </button>
          {uploads.length > 0 && (
            <ul className="text-xs divide-y divide-space-800 border border-space-800 rounded-lg">
              {uploads.map((u) => (
                <li key={u.file} className="flex items-center justify-between px-3 py-1.5">
                  <span className="font-mono truncate">{u.name}</span>
                  <span className="flex items-center gap-3 text-slate-400">
                    D{u.detector} · {u.date.slice(0, 10)}
                    <button className="hover:text-red-400" title="Remove" onClick={async () => { await api.deleteUpload(u.file); loadUploads(); onUploadsChanged(); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {msg && <pre className="text-xs whitespace-pre-wrap text-slate-200 bg-space-800 rounded p-2">{msg}</pre>}
      </div>
    </div>
  );
};
