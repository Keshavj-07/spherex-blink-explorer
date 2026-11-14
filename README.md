# 🔭 SPHEREx Blink & Spectrum Explorer

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Challenge-0B3D91?style=for-the-badge&logo=nasa)](https://www.spaceappschallenge.org/)
[![SPHEREx Mission](https://img.shields.io/badge/Mission-NASA%20SPHEREx-00F0FF?style=for-the-badge)](https://spherex.caltech.edu/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)

**SPHEREx Blink & Spectrum Explorer** is a high-performance, public-facing astronomical browser tool engineered for the **2026 NASA Space Apps Challenge ("Planet X and SPHEREx")**. 

It allows scientists, citizen astronomers, and challenge judges to interactively inspect multi-epoch near-infrared sky imagery (0.75 – 5.0 μm across 102 spectral channels) from NASA's SPHEREx mission to visually detect high-proper-motion objects (substellar brown dwarfs, rogue worlds, and hypothetical Planet X candidates) as well as photometric variable stars.

---

## 🌟 Key Features

### 1. Multi-Epoch Blink Comparator & Cross-Fader
* **High-Speed Astronomical Blinker:** Toggle between Epoch 1 and Epoch 2 at customizable frequencies (0.5 Hz, 1 Hz, 2 Hz, 4 Hz).
* **Cross-Fade Slider:** Manually blend between epochs with continuous opacity controls (0% to 100%).
* **Astrometric Motion Detection:** Background stars remain stationary while high-proper-motion objects (e.g. Barnard's Star, Epsilon Indi B, WISE 0855) visibly jump across the field of view.

### 2. Real-Time Difference Imaging ($\Delta = \text{Epoch 2} - \text{Epoch 1}$)
* **Dipole Signature for Movers:** Subtracting Epoch 1 from Epoch 2 cancels stationary background stars to zero noise while moving bodies resolve into distinct **positive/negative dipole pairs** (bright/dark or red/blue in Coolwarm colormap).
* **Monopolar Residual for Variables:** Photometrically variable stars (e.g., RW Aurigae, R Draconis) remain spatially centered and manifest as clean positive or negative circular residuals without dipole displacement.

### 3. 102-Band Spectral Scrubber (0.75 – 5.0 μm)
* **Continuous Channel Stepper:** Step across all 102 SPHEREx spectral channels spanning the 6 spectrometer detector arrays:
  * **Band 1 (0.75 – 1.11 μm, $R \approx 41$):** Optical-to-NIR transition.
  * **Band 2 (1.11 – 1.64 μm, $R \approx 41$):** J-band & water vapor window.
  * **Band 3 (1.64 – 2.42 μm, $R \approx 41$):** H & K bands, methane overtones.
  * **Band 4 (2.42 – 3.82 μm, $R \approx 35$):** Hydrocarbons & water ice cloud absorption.
  * **Band 5 (3.82 – 4.42 μm, $R \approx 110$):** Coldest sub-stellar thermal peak & $\text{CO}_2$ ice.
  * **Band 6 (4.42 – 5.00 μm, $R \approx 130$):** Carbon monoxide ($\text{CO}$) & $4.65\ \mu\text{m}$ atmospheric window.
* **Molecular Absorption Tracers:** Dynamically flags key diagnostic absorption lines ($\text{H}_2\text{O}$, $\text{CH}_4$, $\text{CO}_2$, $\text{CO}$, $\text{TiO}$).

### 4. Click-to-Plot Spectrophotometry (SED & Light Curve)
* **102-Band Spectral Energy Distribution (SED):** Interactive flux ($\mu\text{Jy}$) vs. wavelength ($\mu\text{m}$) chart with shaded molecular absorption regions and signal-to-noise readouts.
* **Multi-Epoch Infrared Light Curve:** Calibrated flux history tracking photometric variations across SPHEREx passes and precursor surveys (CatWISE2020, NEOWISE-R).

### 5. Vector Catalog Overlays & "Planet X / Cold Object" Filter
* **Gaia DR3 (Optical):** Vector overlays (cyan circles) indicating optical source positions.
* **CatWISE / AllWISE (Infrared):** Vector overlays (amber diamonds) marking thermal infrared emitters.
* **"Flag Infrared-Only Movers":** Automated detection filter that isolates sources exhibiting high proper motion in the infrared with **zero counterpart in Gaia DR3** ($G > 23.0\ \text{mag}$). This is the exact signature of a cold Y-type brown dwarf or hypothetical outer Solar System planet (**Planet X**).

### 6. Deep-Linking & Coordinate Search
* **Deep URL State Synchronization:** Share exact viewer states, coordinates, and filters via query parameters (e.g., `?target=wise-0855&channel=85&mode=diff`).
* **Sexagesimal & Decimal Coordinate Parser:** Supports arbitrary astronomical target searches by name or coordinates (`RA, Dec`).

---

## 🎯 The 5 Official Benchmark Targets

Preloaded and validated against the challenge criteria:

| Target | Object Type | Coordinates (J2000) | Proper Motion | Expected Behavior & Diagnostic Findings |
|---|---|---|---|---|
| **1. Barnard's Star** | Red Dwarf (M4V) | `17h 57m 48.50s`<br>`+04° 41' 36.2"` | $\mu = 10.36''/\text{yr}$ | Fastest known proper motion; textbook linear spatial jump across epochs; prominent TiO & $\text{H}_2\text{O}$ absorption. |
| **2. Epsilon Indi B** | Binary Brown Dwarf (T1 + T6) | `22h 04m 10.52s`<br>`-56° 46' 57.7"` | $\mu = 4.70''/\text{yr}$ | Fast motion; distinctive substellar methane ($\text{CH}_4$) absorption troughs at 1.66, 2.2, and 3.3 $\mu\text{m}$. |
| **3. WISE 0855-0714** | Sub-stellar Y4 Dwarf ($T \sim 250\ \text{K}$) | `08h 55m 10.83s`<br>`-07° 14' 42.5"` | $\mu = 8.16''/\text{yr}$ | **Planet X Analog**: Coldest known brown dwarf; **100% optical invisibility** (absent in Gaia DR3); extreme proper motion with massive thermal surge in SPHEREx Bands 5 & 6 (3.8–5.0 $\mu\text{m}$). |
| **4. RW Aurigae** | Classical T Tauri Star | `05h 07m 49.54s`<br>`+30° 24' 05.1"` | Negligible ($\sim 0.01''/\text{yr}$) | Spatially stationary; severe photometric dimming ($\Delta \sim 50\%$) caused by circumstellar dust occultation streams; clean monopolar negative residual in difference mode. |
| **5. R Draconis** | Mira-Type Variable Pulsator | `16h 32m 40.23s`<br>`+66° 45' 17.9"` | Negligible ($\sim 0.01''/\text{yr}$) | Spatially stationary; sinusoidal periodic pulsation ($P = 245.5\ \text{days}$); pure monopolar difference residual; deep carbon monoxide ($\text{CO}$) band at 4.67 $\mu\text{m}$. |

---

## 🏗️ Architecture & Tech Stack

```
spherex-blink-explorer/
├── public/
│   ├── data/                   # Pre-cached 0-latency benchmark datasets
│   │   ├── targets.json        # Master targets catalog & coordinates
│   │   ├── channels.json       # 102 SPHEREx channels metadata
│   │   └── <target-slug>/      # epoch1.png, epoch2.png, diff.png, spectrum.json, etc.
│   └── favicon.svg
├── scripts/
│   ├── fetch_and_process.py    # Python IRSA/MAST pipeline & synthetic generator
│   └── requirements.txt        # astropy, astroquery, numpy, scipy, pillow
├── src/
│   ├── components/             # SkyViewer, ViewerControls, SpectralScrubber, etc.
│   ├── types/                  # TypeScript astronomical interfaces
│   ├── utils/                  # Colormaps (LUTs), Stretches, WCS coordinates
│   ├── App.tsx                 # Main layout & synchronized state management
│   └── main.tsx
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── vercel.json                 # Vercel deployment configuration
```

* **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS (astronomy dark theme).
* **Charting:** Recharts (responsive vector spectrophotometric rendering).
* **Canvas Engine:** HTML5 Canvas with precomputed 256-level colormap lookup tables (LUTs) for smooth 60 FPS multi-epoch rendering.
* **Pipeline:** Python 3 (`numpy`, `astropy`, `pillow`, `scipy`).

---

## 🚀 Quick Start & Local Development

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/keshavjhunjhunwala/spherex-blink-explorer.git
cd spherex-blink-explorer

npm install
```

### 2. Run the Data Pipeline (Optional, pre-built in `/public/data`)

```bash
pip install -r scripts/requirements.txt
python scripts/fetch_and_process.py
```

### 3. Launch Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production

```bash
npm run build
```

The production-ready static bundle will be generated in `dist/`.

---

## 🌐 Public Deployment Guide

### Deploying to Vercel (Recommended)

1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: complete SPHEREx Blink & Spectrum Explorer"
   git branch -M main
   git remote add origin https://github.com/<your-username>/spherex-blink-explorer.git
   git push -u origin main
   ```
2. Import the repository in [Vercel](https://vercel.com/new).
3. The included `vercel.json` automatically configures single-page application routing and asset caching.
4. Click **Deploy** — your app is live!

### Deploying to GitHub Pages or Render

* **Render / Netlify:** Connect the repo, set Build Command to `npm run build`, and Publish Directory to `dist`.
* **GitHub Pages:** Set GitHub Pages source to GitHub Actions using the standard Vite workflow.

---

## 🔬 Scientific Methodology for Space Apps Judges

1. **How does SPHEREx identify moving objects?**
   SPHEREx surveys the entire sky four times over its 2-year nominal mission. Comparing consecutive sky passes separates fast-moving Solar System bodies and nearby substellar objects from distant, fixed stars.
2. **Why Difference Imaging?**
   Subtraction removes unchanging stellar fluxes and detector fixed-pattern noise. Moving sources leave a characteristic dipole: a negative depression at the prior epoch's coordinate and a positive peak at the new epoch's coordinate.
3. **How does this verify Planet X?**
   A hypothetical 5–10 Earth-mass planet at 300–800 AU would have an equilibrium temperature below 50 K. It reflects negligible sunlight and emits almost exclusively in the mid-to-far infrared. By filtering for **Infrared-Only Movers** (sources with multi-epoch proper motion in SPHEREx/WISE but undetected in optical catalogs like Gaia), this tool directly isolates candidate signatures of cold brown dwarfs and outer planets.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. Built for the 2026 NASA Space Apps Challenge.
