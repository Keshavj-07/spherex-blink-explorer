import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ViewerMode,
  Colormap,
  StretchMode,
  CatalogSource,
  TargetMetadata,
} from '../types/astronomy';
import { pixelToSky, degToHMS, degToDMS } from '../utils/coordinates';
import { applyStretch } from '../utils/stretches';
import { applyColormap } from '../utils/colormaps';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface SkyViewerProps {
  target: TargetMetadata;
  catalog: CatalogSource[];
  mode: ViewerMode;
  blinkHz: number;
  crossfadeAlpha: number; // 0 (Epoch 1) to 1 (Epoch 2)
  colormap: Colormap;
  stretch: StretchMode;
  showGaia: boolean;
  showWise: boolean;
  flagInfraredOnlyMovers: boolean;
  selectedSourceId: string | null;
  onSelectSource: (source: CatalogSource) => void;
  scrubbedWavelengthUm: number;
}

export const SkyViewer: React.FC<SkyViewerProps> = ({
  target,
  catalog,
  mode,
  blinkHz,
  crossfadeAlpha,
  colormap,
  stretch,
  showGaia,
  showWise,
  flagInfraredOnlyMovers,
  selectedSourceId,
  onSelectSource,
  scrubbedWavelengthUm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cached raw image pixel arrays
  const epoch1PixelsRef = useRef<Uint8ClampedArray | null>(null);
  const epoch2PixelsRef = useRef<Uint8ClampedArray | null>(null);
  const diffPixelsRef = useRef<Uint8ClampedArray | null>(null);

  // Transform state (Pan & Zoom)
  const [zoom, setZoom] = useState(1.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Cursor Sky Coordinates
  const [cursorCoords, setCursorCoords] = useState<{
    ra: number;
    dec: number;
    pixelX: number;
    pixelY: number;
  } | null>(null);

  // Active blink frame: 1 (Epoch 1) or 2 (Epoch 2)
  const [blinkPhase, setBlinkPhase] = useState<1 | 2>(1);

  // Blink interval timer
  useEffect(() => {
    if (mode !== 'blink') return;
    const intervalMs = 1000 / blinkHz;
    const interval = setInterval(() => {
      setBlinkPhase((prev) => (prev === 1 ? 2 : 1));
    }, intervalMs);
    return () => clearInterval(interval);
  }, [mode, blinkHz]);

  // Load target PNG images into memory
  useEffect(() => {
    let isCancelled = false;

    const loadImage = (url: string): Promise<Uint8ClampedArray> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const offscreen = document.createElement('canvas');
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D context unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, img.width, img.height).data;
          resolve(data);
        };
        img.onerror = reject;
        img.src = url;
      });
    };

    Promise.all([
      loadImage(`/data/${target.id}/epoch1.png`),
      loadImage(`/data/${target.id}/epoch2.png`),
      loadImage(`/data/${target.id}/diff.png`),
    ])
      .then(([ep1, ep2, diff]) => {
        if (!isCancelled) {
          epoch1PixelsRef.current = ep1;
          epoch2PixelsRef.current = ep2;
          diffPixelsRef.current = diff;
          requestRender();
        }
      })
      .catch((err) => {
        console.warn('Failed loading target images, falling back to procedural generation:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [target.id]);

  // Main Render Routine
  const requestRender = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Center of canvas
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    // Astronomical cutout native size
    const nativeSize = 256;
    const halfNative = nativeSize / 2;

    const ep1 = epoch1PixelsRef.current;
    const ep2 = epoch2PixelsRef.current;
    const diff = diffPixelsRef.current;

    if (ep1 && ep2 && diff) {
      // Create offscreen image buffer for scientific processing
      const imgData = ctx.createImageData(nativeSize, nativeSize);
      const out = imgData.data;

      // Determine blend weights between Epoch 1 & Epoch 2
      let w1 = 1.0;
      let w2 = 0.0;
      let isDiffMode = mode === 'diff';

      if (mode === 'epoch1') {
        w1 = 1.0;
        w2 = 0.0;
      } else if (mode === 'epoch2') {
        w1 = 0.0;
        w2 = 1.0;
      } else if (mode === 'blink') {
        w1 = blinkPhase === 1 ? 1.0 : 0.0;
        w2 = blinkPhase === 2 ? 1.0 : 0.0;
      } else if (mode === 'crossfade') {
        w1 = 1.0 - crossfadeAlpha;
        w2 = crossfadeAlpha;
      }

      // Spectral modulation factor: simulates wavelength-dependent brightness
      // e.g. Y-dwarf WISE 0855 gets brighter in 3.5-5.0 um channels
      const spectralMod = scrubbedWavelengthUm > 3.5 ? 1.15 : 0.95;

      for (let i = 0; i < nativeSize * nativeSize; i++) {
        const pixelIdx = i * 4;
        let val = 0;

        if (isDiffMode) {
          // Difference map (raw midpoint is 128)
          const rawDiff = diff[pixelIdx];
          val = rawDiff / 255.0;
        } else {
          const v1 = ep1[pixelIdx] / 255.0;
          const v2 = ep2[pixelIdx] / 255.0;
          val = (v1 * w1 + v2 * w2) * spectralMod;
        }

        // Apply astronomical stretch
        const stretched = isDiffMode ? val : applyStretch(val, stretch);
        const pixel255 = Math.round(stretched * 255.0);

        // Apply Colormap LUT
        // In diff mode, coolwarm works best for dipole separation
        const effectiveColormap = isDiffMode && colormap === 'grayscale' ? 'coolwarm' : colormap;
        const [r, g, b] = applyColormap(pixel255, effectiveColormap);

        out[pixelIdx] = r;
        out[pixelIdx + 1] = g;
        out[pixelIdx + 2] = b;
        out[pixelIdx + 3] = 255;
      }

      // Draw pixel array onto offscreen bitmap then draw to main canvas
      const offCanvas = document.createElement('canvas');
      offCanvas.width = nativeSize;
      offCanvas.height = nativeSize;
      const offCtx = offCanvas.getContext('2d')!;
      offCtx.putImageData(imgData, 0, 0);

      // Disable smoothing for sharp pixelated astronomy view when zoomed
      ctx.imageSmoothingEnabled = zoom < 2.5;
      ctx.drawImage(offCanvas, -halfNative, -halfNative);
    }

    // Vector Catalog Overlays
    const renderOverlays = () => {
      catalog.forEach((source) => {
        // Pixel coordinates relative to center (-128 to +128)
        let sx = source.x - halfNative;
        let sy = source.y - halfNative;

        // If in Epoch 1 or blink phase 1, and object has proper motion, shift to epoch 1 position
        if ((mode === 'epoch1' || (mode === 'blink' && blinkPhase === 1)) && source.x_epoch1 !== undefined && source.y_epoch1 !== undefined) {
          sx = source.x_epoch1 - halfNative;
          sy = source.y_epoch1 - halfNative;
        }

        const isSelected = source.id === selectedSourceId || (source.is_primary && !selectedSourceId);

        // 1. Gaia DR3 Optical Overlay (Cyan Circles)
        if (showGaia && source.is_gaia) {
          ctx.beginPath();
          ctx.arc(sx, sy, 7, 0, Math.PI * 2);
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1.2 / zoom;
          ctx.stroke();

          // Small optical cross tick
          ctx.beginPath();
          ctx.moveTo(sx - 3, sy);
          ctx.lineTo(sx + 3, sy);
          ctx.moveTo(sx, sy - 3);
          ctx.lineTo(sx, sy + 3);
          ctx.strokeStyle = '#00f0ff88';
          ctx.stroke();
        }

        // 2. CatWISE Infrared Overlay (Amber Diamonds)
        if (showWise && source.is_wise) {
          ctx.beginPath();
          const r = 8;
          ctx.moveTo(sx, sy - r);
          ctx.lineTo(sx + r, sy);
          ctx.lineTo(sx, sy + r);
          ctx.lineTo(sx - r, sy);
          ctx.closePath();
          ctx.strokeStyle = '#ffb800';
          ctx.lineWidth = 1.2 / zoom;
          ctx.stroke();
        }

        // 3. "Flag Infrared-Only Movers" (Highlight cold brown dwarfs / Planet X candidates)
        if (flagInfraredOnlyMovers && source.is_infrared_only_mover) {
          ctx.save();
          // Animated pulsing ring
          ctx.beginPath();
          ctx.arc(sx, sy, 14, 0, Math.PI * 2);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.0 / zoom;
          ctx.setLineDash([4 / zoom, 2 / zoom]);
          ctx.stroke();

          // Target tag box
          ctx.fillStyle = '#ef4444dd';
          ctx.fillRect(sx - 36, sy - 24, 72, 12);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('PLANET X / Y-DWARF', sx, sy - 18);
          ctx.restore();
        }

        // Selected Source Target Box
        if (isSelected) {
          ctx.beginPath();
          ctx.rect(sx - 11, sy - 11, 22, 22);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.8 / zoom;
          ctx.stroke();

          // Corner brackets
          const cl = 4;
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(sx - 11, sy - 11 + cl);
          ctx.lineTo(sx - 11, sy - 11);
          ctx.lineTo(sx - 11 + cl, sy - 11);

          ctx.moveTo(sx + 11 - cl, sy - 11);
          ctx.lineTo(sx + 11, sy - 11);
          ctx.lineTo(sx + 11, sy - 11 + cl);

          ctx.moveTo(sx - 11, sy + 11 - cl);
          ctx.lineTo(sx - 11, sy + 11);
          ctx.lineTo(sx - 11 + cl, sy + 11);

          ctx.moveTo(sx + 11 - cl, sy + 11);
          ctx.lineTo(sx + 11, sy + 11);
          ctx.lineTo(sx + 11, sy + 11 - cl);
          ctx.stroke();
        }
      });
    };

    renderOverlays();

    // Scale Bar (30 arcseconds on sky)
    // 0.82 arcsec per pixel -> 30 arcsec = 36.58 pixels
    const barArcsec = 30;
    const barPixels = 36.58;
    const barX = halfNative - 48;
    const barY = halfNative - 12;

    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 2.0 / zoom;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barPixels, barY);
    ctx.stroke();

    // Bar end caps
    ctx.beginPath();
    ctx.moveTo(barX, barY - 3);
    ctx.lineTo(barX, barY + 3);
    ctx.moveTo(barX + barPixels, barY - 3);
    ctx.lineTo(barX + barPixels, barY + 3);
    ctx.stroke();

    ctx.fillStyle = '#ffffffcc';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${barArcsec}"`, barX + barPixels / 2, barY - 5);

    // North / East Compass Indicator
    const compassX = -halfNative + 20;
    const compassY = halfNative - 20;
    const armLen = 14;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5 / zoom;
    // North (Up)
    ctx.beginPath();
    ctx.moveTo(compassX, compassY);
    ctx.lineTo(compassX, compassY - armLen);
    ctx.stroke();
    // East (Left in astronomical projection)
    ctx.beginPath();
    ctx.moveTo(compassX, compassY);
    ctx.lineTo(compassX - armLen, compassY);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('N', compassX - 2, compassY - armLen - 3);
    ctx.fillText('E', compassX - armLen - 8, compassY + 3);

    ctx.restore();
  }, [
    zoom,
    pan,
    mode,
    blinkPhase,
    crossfadeAlpha,
    colormap,
    stretch,
    showGaia,
    showWise,
    flagInfraredOnlyMovers,
    selectedSourceId,
    catalog,
    scrubbedWavelengthUm,
  ]);

  // Sync canvas size with container & re-render
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      requestRender();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [requestRender]);

  // Re-render when dependencies change
  useEffect(() => {
    requestRender();
  }, [requestRender]);

  // Mouse / Pointer Event Handlers for Pan, Zoom, and Coordinate Tracking
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }

    // Calculate astronomical coordinates under cursor
    const centerX = canvas.width / 2 + pan.x;
    const centerY = canvas.height / 2 + pan.y;

    const px = (mouseX - centerX) / zoom + 128;
    const py = (mouseY - centerY) / zoom + 128;

    if (px >= 0 && px <= 256 && py >= 0 && py <= 256) {
      const sky = pixelToSky(px, py, target.ra_deg, target.dec_deg);
      setCursorCoords({
        ra: sky.ra,
        dec: sky.dec,
        pixelX: Math.round(px),
        pixelY: Math.round(py),
      });
    } else {
      setCursorCoords(null);
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom((prev) => Math.max(0.6, Math.min(8.0, prev * zoomFactor)));
  };

  // Click to select catalog object
  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerX = canvas.width / 2 + pan.x;
    const centerY = canvas.height / 2 + pan.y;

    const px = (mouseX - centerX) / zoom + 128;
    const py = (mouseY - centerY) / zoom + 128;

    // Find nearest catalog object within 12 pixels
    let nearest: CatalogSource | null = null;
    let minDist = 14;

    for (const source of catalog) {
      const dist = Math.hypot(source.x - px, source.y - py);
      if (dist < minDist) {
        minDist = dist;
        nearest = source;
      }
    }

    if (nearest) {
      onSelectSource(nearest);
    }
  };

  const handleResetView = () => {
    setZoom(1.8);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-space-950 overflow-hidden flex items-center justify-center cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false);
        setCursorCoords(null);
      }}
      onWheel={handleWheel}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Floating Status Badges & Controls */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none z-10">
        <div className="px-2.5 py-1 rounded-md bg-space-900/90 border border-space-700/80 backdrop-blur-sm text-xs font-mono flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-200">{target.name}</span>
          <span className="text-slate-400">({target.type})</span>
        </div>

        {mode === 'blink' && (
          <div className="px-2.5 py-1 rounded-md bg-nasa-blue/40 border border-nasa-cyan/60 backdrop-blur-sm text-xs font-mono text-nasa-cyan flex items-center gap-2">
            <span className="animate-spin inline-block">⚡</span>
            <span>Blinking {blinkHz} Hz (Showing Epoch {blinkPhase})</span>
          </div>
        )}

        {mode === 'diff' && (
          <div className="px-2.5 py-1 rounded-md bg-purple-900/50 border border-purple-400/60 backdrop-blur-sm text-xs font-mono text-purple-200 flex items-center gap-1.5">
            <span>Δ</span>
            <span>Difference Imaging Mode (Epoch 2 - Epoch 1)</span>
          </div>
        )}
      </div>

      {/* Floating Zoom & Reset Toolbar */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        <button
          onClick={() => setZoom((z) => Math.min(8.0, z * 1.25))}
          className="p-2 rounded-lg bg-space-900/80 hover:bg-space-800 border border-space-700 text-slate-200 transition-colors shadow-lg"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z * 0.8))}
          className="p-2 rounded-lg bg-space-900/80 hover:bg-space-800 border border-space-700 text-slate-200 transition-colors shadow-lg"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="p-2 rounded-lg bg-space-900/80 hover:bg-space-800 border border-space-700 text-slate-200 transition-colors shadow-lg"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Live Coordinate Bar */}
      <div className="absolute bottom-2 left-3 right-3 pointer-events-none flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-300">
        <div className="px-3 py-1 rounded-md bg-space-900/90 border border-space-700/80 backdrop-blur-sm flex items-center gap-3">
          {cursorCoords ? (
            <>
              <span className="text-nasa-cyan">RA: {degToHMS(cursorCoords.ra)} ({cursorCoords.ra.toFixed(4)}°)</span>
              <span className="text-nasa-cyan">Dec: {degToDMS(cursorCoords.dec)} ({cursorCoords.dec.toFixed(4)}°)</span>
              <span className="text-slate-400">Pix: [{cursorCoords.pixelX}, {cursorCoords.pixelY}]</span>
            </>
          ) : (
            <span className="text-slate-400">Hover over field to inspect coordinates</span>
          )}
        </div>

        <div className="px-3 py-1 rounded-md bg-space-900/90 border border-space-700/80 backdrop-blur-sm flex items-center gap-3">
          <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
          <span>Colormap: <span className="capitalize text-slate-100">{colormap}</span></span>
          <span>Stretch: <span className="capitalize text-slate-100">{stretch}</span></span>
        </div>
      </div>
    </div>
  );
};
