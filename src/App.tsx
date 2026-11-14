import React, { useState, useEffect } from 'react';
import {
  ViewerMode,
  Colormap,
  StretchMode,
  TargetMetadata,
  TargetSummary,
  SpectrumDataPoint,
  LightCurvePoint,
  CatalogSource,
} from './types/astronomy';
import { ALL_SPHEREX_CHANNELS } from './utils/spherexChannels';
import { Header } from './components/Header';
import { TargetQuickBar } from './components/TargetQuickBar';
import { SkyViewer } from './components/SkyViewer';
import { ViewerControls } from './components/ViewerControls';
import { SpectralScrubber } from './components/SpectralScrubber';
import { SpectrumPlot } from './components/SpectrumPlot';
import { LightCurvePlot } from './components/LightCurvePlot';
import { CatalogOverlayToggle } from './components/CatalogOverlayToggle';
import { TargetDetailDrawer } from './components/TargetDetailDrawer';
import { PlanetXDetectorModal } from './components/PlanetXDetectorModal';
import { BarChart3 } from 'lucide-react';

export const App: React.FC = () => {
  // Target lists and current selection
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [currentTargetId, setCurrentTargetId] = useState<string>('wise-0855');
  const [currentTargetData, setCurrentTargetData] = useState<TargetMetadata | null>(null);

  // Synchronized Data
  const [spectrumData, setSpectrumData] = useState<SpectrumDataPoint[]>([]);
  const [lightCurveData, setLightCurveData] = useState<LightCurvePoint[]>([]);
  const [catalogData, setCatalogData] = useState<CatalogSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<CatalogSource | null>(null);

  // Viewer State
  const [viewerMode, setViewerMode] = useState<ViewerMode>('blink');
  const [blinkHz, setBlinkHz] = useState<number>(1);
  const [crossfadeAlpha, setCrossfadeAlpha] = useState<number>(0.5);
  const [colormap, setColormap] = useState<Colormap>('viridis');
  const [stretch, setStretch] = useState<StretchMode>('asinh');

  // Spectral Scrubber State (102 bands)
  const [currentChannelIdx, setCurrentChannelIdx] = useState<number>(85); // Default to Band 5 (3.9 um)

  // Catalog Vector Overlays State
  const [showGaia, setShowGaia] = useState<boolean>(true);
  const [showWise, setShowWise] = useState<boolean>(true);
  const [flagInfraredOnlyMovers, setFlagInfraredOnlyMovers] = useState<boolean>(true);

  // Modals / Drawers
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [isPlanetXModalOpen, setIsPlanetXModalOpen] = useState<boolean>(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(true);

  // 1. Initial Load: Read URL Deep-Linking query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetParam = params.get('target');
    const modeParam = params.get('mode') as ViewerMode | null;
    const bandParam = params.get('band');
    const channelParam = params.get('channel');

    if (targetParam) {
      setCurrentTargetId(targetParam);
    }
    if (modeParam && ['blink', 'diff', 'crossfade', 'epoch1', 'epoch2'].includes(modeParam)) {
      setViewerMode(modeParam);
    }
    if (channelParam) {
      const ch = parseInt(channelParam, 10);
      if (!isNaN(ch) && ch >= 0 && ch < ALL_SPHEREX_CHANNELS.length) {
        setCurrentChannelIdx(ch);
      }
    } else if (bandParam) {
      const b = parseInt(bandParam, 10);
      if (!isNaN(b) && b >= 1 && b <= 6) {
        const found = ALL_SPHEREX_CHANNELS.findIndex((c) => c.band === b);
        if (found !== -1) setCurrentChannelIdx(found);
      }
    }
  }, []);

  // 2. Sync State changes back to URL query parameters
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('target', currentTargetId);
    params.set('mode', viewerMode);
    params.set('channel', currentChannelIdx.toString());
    const currentWav = ALL_SPHEREX_CHANNELS[currentChannelIdx]?.wavelength_um;
    if (currentWav) params.set('wavelength', currentWav.toString());

    if (currentTargetData) {
      params.set('ra', currentTargetData.ra_deg.toFixed(4));
      params.set('dec', currentTargetData.dec_deg.toFixed(4));
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [currentTargetId, viewerMode, currentChannelIdx, currentTargetData]);

  // 3. Load Targets Master Index
  useEffect(() => {
    fetch('/data/targets.json')
      .then((res) => res.json())
      .then((data: TargetSummary[]) => {
        setTargets(data);
      })
      .catch((err) => console.error('Failed to load targets.json:', err));
  }, []);

  // 4. Load Active Target Data whenever currentTargetId changes
  useEffect(() => {
    Promise.all([
      fetch(`/data/${currentTargetId}/target.json`).then((r) => r.json()),
      fetch(`/data/${currentTargetId}/spectrum.json`).then((r) => r.json()),
      fetch(`/data/${currentTargetId}/lightcurve.json`).then((r) => r.json()),
      fetch(`/data/${currentTargetId}/catalog.json`).then((r) => r.json()),
    ])
      .then(([targetInfo, spec, lc, cat]) => {
        setCurrentTargetData(targetInfo);
        setSpectrumData(spec);
        setLightCurveData(lc);
        setCatalogData(cat);
        const primary = cat.find((s: CatalogSource) => s.is_primary) || cat[0] || null;
        setSelectedSource(primary);

        // Auto-select interesting channel based on target
        if (targetInfo.id === 'wise-0855') {
          // Jump to Band 5 / Band 6 (3.9 - 4.6 um)
          setCurrentChannelIdx(85);
          setFlagInfraredOnlyMovers(true);
        } else if (targetInfo.id === 'epsilon-indi-b') {
          // Jump to 2.2 um (CH4 absorption trough)
          const ch4Idx = ALL_SPHEREX_CHANNELS.findIndex((c) => c.wavelength_um >= 2.2);
          if (ch4Idx !== -1) setCurrentChannelIdx(ch4Idx);
        }
      })
      .catch((err) => console.error(`Error loading data for ${currentTargetId}:`, err));
  }, [currentTargetId]);

  const handleSelectWavelength = (wavUm: number) => {
    let bestIdx = 0;
    let minDiff = 999;
    ALL_SPHEREX_CHANNELS.forEach((c, idx) => {
      const diff = Math.abs(c.wavelength_um - wavUm);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = idx;
      }
    });
    setCurrentChannelIdx(bestIdx);
  };

  const currentWav = ALL_SPHEREX_CHANNELS[currentChannelIdx]?.wavelength_um || 1.0;
  const hasInfraredOnly = catalogData.some((s) => s.is_infrared_only_mover);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-space-950 text-slate-100 font-sans">
      {/* 1. Top Header */}
      <Header
        targets={targets}
        onSelectTarget={(id) => setCurrentTargetId(id)}
        onCustomCoordinates={(ra, dec) => {
          // Find nearest target to custom coordinates
          let nearest = targets[0];
          let minDist = 9999;
          targets.forEach((t) => {
            const dist = Math.hypot(t.ra_deg - ra, t.dec_deg - dec);
            if (dist < minDist) {
              minDist = dist;
              nearest = t;
            }
          });
          if (nearest) setCurrentTargetId(nearest.id);
        }}
        onOpenPlanetXGuide={() => setIsPlanetXModalOpen(true)}
        onOpenDetails={() => setIsDetailsOpen(true)}
      />

      {/* 2. Top Quick-Jump Bar for 5 Benchmark Targets */}
      <TargetQuickBar
        targets={targets}
        selectedTargetId={currentTargetId}
        onSelectTarget={(id) => setCurrentTargetId(id)}
      />

      {/* 3. Main Workspace: Sky Viewer + Synchronized Analytics */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left / Center: Interactive Sky Viewer Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative border-r border-space-800">
          {/* Sky Viewer Overlay Controls Bar */}
          <div className="bg-space-900/80 px-4 py-1.5 border-b border-space-800 flex items-center justify-between text-xs z-10 backdrop-blur-sm">
            <CatalogOverlayToggle
              showGaia={showGaia}
              onToggleGaia={() => setShowGaia(!showGaia)}
              showWise={showWise}
              onToggleWise={() => setShowWise(!showWise)}
              flagInfraredOnlyMovers={flagInfraredOnlyMovers}
              onToggleFlagInfraredOnlyMovers={() => setFlagInfraredOnlyMovers(!flagInfraredOnlyMovers)}
              hasInfraredOnlyInField={hasInfraredOnly}
            />

            <button
              onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)}
              className="lg:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-space-800 border border-space-700 text-xs text-slate-200"
            >
              <BarChart3 className="w-3.5 h-3.5 text-nasa-cyan" />
              <span>{isAnalyticsOpen ? 'Hide Graphs' : 'Show Graphs'}</span>
            </button>
          </div>

          {/* Interactive Astronomical Canvas */}
          <div className="flex-1 relative overflow-hidden">
            {currentTargetData ? (
              <SkyViewer
                target={currentTargetData}
                catalog={catalogData}
                mode={viewerMode}
                blinkHz={blinkHz}
                crossfadeAlpha={crossfadeAlpha}
                colormap={colormap}
                stretch={stretch}
                showGaia={showGaia}
                showWise={showWise}
                flagInfraredOnlyMovers={flagInfraredOnlyMovers}
                selectedSourceId={selectedSource ? selectedSource.id : null}
                onSelectSource={(source) => setSelectedSource(source)}
                scrubbedWavelengthUm={currentWav}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 font-mono">
                Initializing SPHEREx Sky Viewer...
              </div>
            )}
          </div>

          {/* Viewer Controls (Blink, Difference, Colormaps, Stretches) */}
          <ViewerControls
            mode={viewerMode}
            onSetMode={(m) => setViewerMode(m)}
            blinkHz={blinkHz}
            onSetBlinkHz={(hz) => setBlinkHz(hz)}
            crossfadeAlpha={crossfadeAlpha}
            onSetCrossfadeAlpha={(a) => setCrossfadeAlpha(a)}
            colormap={colormap}
            onSetColormap={(cm) => setColormap(cm)}
            stretch={stretch}
            onSetStretch={(s) => setStretch(s)}
          />

          {/* 102-Band Spectral Scrubber Slider */}
          <SpectralScrubber
            currentChannelIdx={currentChannelIdx}
            onSelectChannel={(idx) => setCurrentChannelIdx(idx)}
          />
        </div>

        {/* Right Panel / Analytics Dock: 102-Band SED & Light Curve */}
        <div
          className={`${
            isAnalyticsOpen ? 'flex' : 'hidden lg:flex'
          } w-full lg:w-[480px] xl:w-[540px] flex-col bg-space-950 border-t lg:border-t-0 lg:border-l border-space-800 p-3 space-y-3 overflow-y-auto shrink-0 select-none`}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between pb-1 border-b border-space-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-nasa-cyan" />
              <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Spectrophotometric Inspection
              </h2>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Target: <strong className="text-slate-200">{currentTargetData?.name}</strong>
            </span>
          </div>

          {/* 1. 102-Band SED Chart */}
          <div className="h-[230px] w-full">
            <SpectrumPlot
              data={spectrumData}
              currentWavelengthUm={currentWav}
              onSelectWavelength={handleSelectWavelength}
              targetName={currentTargetData?.name || 'Benchmark Target'}
            />
          </div>

          {/* 2. Multi-Epoch Light Curve Chart */}
          <div className="h-[210px] w-full">
            <LightCurvePlot
              data={lightCurveData}
              targetName={currentTargetData?.name || 'Benchmark Target'}
              variabilityType={currentTargetData?.variability_type || 'Stable'}
            />
          </div>

          {/* 3. Selected Source Inspection Card */}
          {selectedSource && (
            <div className="p-3 rounded-lg bg-space-900 border border-space-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-nasa-cyan" />
                  {selectedSource.name || selectedSource.id}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {selectedSource.is_primary ? 'PRIMARY BENCHMARK' : 'FIELD STAR'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                <div>RA: {selectedSource.ra.toFixed(4)}°</div>
                <div>Dec: {selectedSource.dec.toFixed(4)}°</div>
                <div>μ_α: {selectedSource.pmra} mas/yr</div>
                <div>μ_δ: {selectedSource.pmdec} mas/yr</div>
                <div>Gaia G: {selectedSource.g_mag ? `${selectedSource.g_mag} mag` : 'UNDETECTED'}</div>
                <div>WISE W1: {selectedSource.w1_mag ? `${selectedSource.w1_mag} mag` : '—'}</div>
              </div>

              {selectedSource.is_infrared_only_mover && (
                <div className="p-2 rounded bg-red-500/20 border border-red-500/40 text-[11px] text-red-200 font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                  INFRARED-ONLY MOVER CONFIRMED (Zero Optical Counterpart • Planet X / Cold Y-Dwarf Candidate)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Target Details Drawer */}
      {currentTargetData && (
        <TargetDetailDrawer
          target={currentTargetData}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
        />
      )}

      {/* Planet X Scientific Educational Modal */}
      <PlanetXDetectorModal
        isOpen={isPlanetXModalOpen}
        onClose={() => setIsPlanetXModalOpen(false)}
        onJumpToWISE0855={() => setCurrentTargetId('wise-0855')}
      />
    </div>
  );
};
