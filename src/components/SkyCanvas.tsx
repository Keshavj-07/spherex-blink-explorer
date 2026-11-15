import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Colormap, StretchMode } from '../types/astronomy';
import { GaiaSource, WiseSource } from '../lib/api';
import { Grid, pix2sky, sky2pix, propagate, degToHMS, degToDMS } from '../lib/sky';
import { paint } from '../lib/render';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

export interface Aperture {
  ra: number; // at posEpoch
  dec: number;
  radiusArcsec: number;
  pmra?: number | null;
  pmdec?: number | null;
  posEpoch?: number;
  label?: string;
}

interface Props {
  grid: Grid;
  image: Float32Array | null;
  vmin: number;
  vmax: number;
  diverging: boolean;
  stretch: StretchMode;
  colormap: Colormap;
  frameYear: number; // epoch of the displayed frame, for moving overlays
  gaia: GaiaSource[];
  wise: WiseSource[];
  showGaia: boolean;
  showWise: boolean;
  flagIrOnly: boolean;
  track: { x: number; y: number; epoch: number }[] | null;
  currentEpoch: number | null;
  aperture: Aperture | null;
  onAperture: (a: Aperture) => void;
  label: string;
}

const MARK_HIT_PX = 9;

export const SkyCanvas: React.FC<Props> = (p) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState(500);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<null | { x0: number; y0: number; x: number; y: number; pan: boolean; px0: { x: number; y: number } }>(null);
  const [hover, setHover] = useState<null | { ra: number; dec: number; v: number }>(null);
  const n = p.grid.n;

  // fit to container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize(Math.max(200, Math.floor(Math.min(r.width, r.height) - 8)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [n, p.grid.ra0, p.grid.dec0]);

  // screen <-> pixel transforms (pixel y north-up, 0-based)
  const scale = (size / n) * zoom;
  const toScreen = useCallback(
    (x: number, y: number) => ({
      sx: size / 2 + (x - (n - 1) / 2) * scale + pan.x,
      sy: size / 2 - (y - (n - 1) / 2) * scale + pan.y,
    }),
    [size, n, scale, pan]
  );
  const toPix = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - size / 2 - pan.x) / scale + (n - 1) / 2,
      y: -(sy - size / 2 - pan.y) / scale + (n - 1) / 2,
    }),
    [size, n, scale, pan]
  );

  // paint the float image into an offscreen n×n canvas
  useEffect(() => {
    if (!p.image) return;
    if (!offRef.current) offRef.current = document.createElement('canvas');
    const off = offRef.current;
    off.width = n;
    off.height = n;
    const ctx = off.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    paint(img, p.image, n, p.vmin, p.vmax, p.stretch, p.colormap, p.diverging);
    ctx.putImageData(img, 0, 0);
  }, [p.image, n, p.vmin, p.vmax, p.stretch, p.colormap, p.diverging]);

  const sourcePix = useCallback(
    (ra: number, dec: number, pmra: number | null, pmdec: number | null, epoch: number) => {
      const pos = pmra != null && pmdec != null ? propagate(ra, dec, pmra, pmdec, epoch, p.frameYear) : { ra, dec };
      return sky2pix(p.grid, pos.ra, pos.dec);
    },
    [p.grid, p.frameYear]
  );

  // draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, size, size);
    if (offRef.current && p.image) {
      ctx.imageSmoothingEnabled = false;
      const tl = toScreen(-0.5, n - 0.5);
      ctx.drawImage(offRef.current, tl.sx, tl.sy, n * scale, n * scale);
    }
    const pxArc = scale / p.grid.scaleArcsec; // screen px per arcsec

    if (p.showGaia) {
      ctx.strokeStyle = 'rgba(0,240,255,0.75)';
      ctx.lineWidth = 1;
      for (const g of p.gaia) {
        const q = sourcePix(g.ra, g.dec, g.pmra, g.pmdec, g.epoch);
        const s = toScreen(q.x, q.y);
        if (s.sx < -10 || s.sy < -10 || s.sx > size + 10 || s.sy > size + 10) continue;
        const r = Math.max(3, Math.min(10, 12 - (g.g ?? 18) * 0.4)) * Math.max(1, zoom * 0.6);
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (p.showWise) {
      for (const w of p.wise) {
        const q = sourcePix(w.ra, w.dec, w.pmra, w.pmdec, w.epoch);
        const s = toScreen(q.x, q.y);
        if (s.sx < -10 || s.sy < -10 || s.sx > size + 10 || s.sy > size + 10) continue;
        const r = 5 * Math.max(1, zoom * 0.6);
        ctx.strokeStyle = w.ir_only_mover_candidate ? '#ff3b3b' : w.no_gaia ? 'rgba(255,184,0,0.95)' : 'rgba(255,184,0,0.55)';
        ctx.lineWidth = w.ir_only_mover_candidate ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy - r);
        ctx.lineTo(s.sx + r, s.sy);
        ctx.lineTo(s.sx, s.sy + r);
        ctx.lineTo(s.sx - r, s.sy);
        ctx.closePath();
        ctx.stroke();
      }
    }
    if (p.flagIrOnly) {
      for (const w of p.wise) {
        if (!w.ir_only_mover_candidate) continue;
        const q = sourcePix(w.ra, w.dec, w.pmra, w.pmdec, w.epoch);
        const s = toScreen(q.x, q.y);
        if (s.sx < -30 || s.sy < -30 || s.sx > size + 30 || s.sy > size + 30) continue;

        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        const ringRadius = 15 * Math.max(1, zoom * 0.5);
        ctx.arc(s.sx, s.sy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        const tag = 'COLD MOVER / PLANET X';
        ctx.font = 'bold 9px monospace';
        const tw = ctx.measureText(tag).width;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.fillRect(s.sx - tw / 2 - 4, s.sy - ringRadius - 16, tw + 8, 14);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, s.sx, s.sy - ringRadius - 9);
        ctx.restore();
      }
    }
    if (p.track && p.track.length > 1) {
      ctx.strokeStyle = 'rgba(168,85,247,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      p.track.forEach((t, i) => {
        const s = toScreen(t.x, t.y);
        if (i === 0) ctx.moveTo(s.sx, s.sy);
        else ctx.lineTo(s.sx, s.sy);
      });
      ctx.stroke();
      for (const t of p.track) {
        const s = toScreen(t.x, t.y);
        ctx.fillStyle = t.epoch === p.currentEpoch ? '#e9d5ff' : 'rgba(168,85,247,0.9)';
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, t.epoch === p.currentEpoch ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // aperture
    const ap = drag && !drag.pan ? null : p.aperture;
    if (ap) {
      const q = sourcePix(ap.ra, ap.dec, ap.pmra ?? null, ap.pmdec ?? null, ap.posEpoch ?? 2000);
      const s = toScreen(q.x, q.y);
      const r = ap.radiusArcsec * pxArc;
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(74,222,128,0.45)';
      ctx.lineWidth = 1;
      const rp = ap.radiusArcsec / p.grid.scaleArcsec;
      for (const k of [Math.max(1, rp) + 1.5, Math.max(1, rp) + 4]) {
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, k * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (drag && !drag.pan) {
      const r = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
      ctx.strokeStyle = '#4ade80';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(drag.x0, drag.y0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#bbf7d0';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`r = ${(r / pxArc).toFixed(1)}″`, drag.x0 + r + 4, drag.y0);
    }
    // compass + scale bar
    ctx.font = '11px JetBrains Mono, monospace';
    const barArc = n * p.grid.scaleArcsec / zoom > 600 ? 60 : 30;
    const bw = barArc * pxArc;
    const lw = Math.max(ctx.measureText(p.label).width, bw + 40) + 12;
    ctx.fillStyle = 'rgba(5,7,13,0.72)';
    ctx.fillRect(4, 4, 84, 20);
    ctx.fillRect(4, size - 42, lw, 38);
    ctx.fillStyle = 'rgba(226,232,240,0.95)';
    ctx.fillText('N ↑   E ←', 10, 18);
    ctx.fillRect(10, size - 14, bw, 2);
    ctx.fillText(barArc >= 60 ? `${barArc / 60}′` : `${barArc}″`, 14 + bw, size - 10);
    ctx.fillText(p.label, 10, size - 27);
  }, [p, size, zoom, pan, drag, toScreen, scale, n, sourcePix]);

  const local = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.MouseEvent) => {
    const m = local(e);
    setDrag({ x0: m.x, y0: m.y, x: m.x, y: m.y, pan: e.shiftKey || e.button === 1 || e.button === 2, px0: { ...pan } });
  };
  const onMove = (e: React.MouseEvent) => {
    const m = local(e);
    const q = toPix(m.x, m.y);
    if (q.x >= -0.5 && q.y >= -0.5 && q.x < n - 0.5 && q.y < n - 0.5 && p.image) {
      const sky = pix2sky(p.grid, q.x, q.y);
      const v = p.image[Math.round(q.y) * n + Math.round(q.x)];
      setHover({ ...sky, v });
    } else setHover(null);
    if (!drag) return;
    if (drag.pan) setPan({ x: drag.px0.x + m.x - drag.x0, y: drag.px0.y + m.y - drag.y0 });
    setDrag({ ...drag, x: m.x, y: m.y });
  };
  const onUp = (e: React.MouseEvent) => {
    if (!drag) return;
    const m = local(e);
    const d = Math.hypot(m.x - drag.x0, m.y - drag.y0);
    const pxArc = scale / p.grid.scaleArcsec;
    if (!drag.pan) {
      const q = toPix(drag.x0, drag.y0);
      if (d < 4) {
        // click: snap to a catalog source if one is under the cursor (and follow its proper motion)
        let best: null | { ra: number; dec: number; pmra: number | null; pmdec: number | null; epoch: number; id: string; dist: number } = null;
        const consider = (s: { ra: number; dec: number; pmra: number | null; pmdec: number | null; epoch: number; id: string }) => {
          const qq = sourcePix(s.ra, s.dec, s.pmra, s.pmdec, s.epoch);
          const ss = toScreen(qq.x, qq.y);
          const dist = Math.hypot(ss.sx - drag.x0, ss.sy - drag.y0);
          if (dist < MARK_HIT_PX && (!best || dist < best.dist)) best = { ...s, dist };
        };
        if (p.showGaia) p.gaia.forEach(consider);
        if (p.showWise || p.flagIrOnly) p.wise.forEach(consider);
        const radius = p.aperture?.radiusArcsec ?? 12.3;
        if (best) {
          const b = best as { ra: number; dec: number; pmra: number | null; pmdec: number | null; epoch: number; id: string };
          p.onAperture({ ra: b.ra, dec: b.dec, pmra: b.pmra, pmdec: b.pmdec, posEpoch: b.epoch, radiusArcsec: radius, label: b.id });
        } else {
          const sky = pix2sky(p.grid, q.x, q.y);
          p.onAperture({ ...sky, radiusArcsec: radius, posEpoch: p.frameYear, label: `${sky.ra.toFixed(5)}, ${sky.dec.toFixed(5)}` });
        }
      } else {
        const sky = pix2sky(p.grid, q.x, q.y);
        const rArc = Math.max(3, Math.min(120, d / pxArc));
        p.onAperture({ ...sky, radiusArcsec: rArc, posEpoch: p.frameYear, label: `${sky.ra.toFixed(5)}, ${sky.dec.toFixed(5)}` });
      }
    }
    setDrag(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    const m = local(e);
    const f = e.deltaY < 0 ? 1.25 : 0.8;
    const nz = Math.max(1, Math.min(16, zoom * f));
    const k = nz / zoom;
    setPan({ x: (pan.x - (m.x - size / 2)) * k + (m.x - size / 2), y: (pan.y - (m.y - size / 2)) * k + (m.y - size / 2) });
    setZoom(nz);
  };

  return (
    <div ref={wrapRef} className="relative w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="rounded-md ring-1 ring-space-700 cursor-crosshair touch-none"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => {
          setHover(null);
          setDrag(null);
        }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <button className="icon-btn" title="Zoom in" onClick={() => setZoom((z) => Math.min(16, z * 1.5))}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="icon-btn" title="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className="icon-btn" title="Fit" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
          <Maximize className="w-4 h-4" />
        </button>
      </div>
      {hover && (
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-space-900/90 border border-space-700 text-[10px] font-mono text-slate-300">
          {degToHMS(hover.ra, 2)} {degToDMS(hover.dec, 1)} · {hover.ra.toFixed(5)}°, {hover.dec.toFixed(5)}° ·{' '}
          {isFinite(hover.v) ? `${hover.v.toFixed(4)} MJy/sr` : 'masked'}
        </div>
      )}
    </div>
  );
};
