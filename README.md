# SPHEREx Data Explorer

A public web tool for the 2026 NASA Space Apps Challenge **"Planet X and SPHEREx"**. Type a name or
coordinates anywhere on the sky. The tool pulls every NASA SPHEREx image of that spot live from
NASA/IPAC IRSA and plays them as a short movie, so moving and variable objects are easy to spot.
Click or draw a circle on the image to get a 0.75–5 µm spectrum on the fly.

Everything the app shows is real data fetched on demand from the archives. The repo's `public/data/`
folder is not used by the app: it holds simulated images and spectra of the five test objects, made
by an early prototype script (`scripts/fetch_and_process.py`).

## What it does

| Challenge item | How it is handled |
|---|---|
| Enter RA/Dec, see the patch as a movie | Search box accepts SIMBAD names, decimal degrees or sexagesimal (`08h55m10.831s -07d14m42.53s`, `08:55:10.8 -07:14:42.5`). Exposures are grouped into epochs (visits ~6 months apart), co-added per epoch, and animated. |
| Whole sky, not just test objects | Any position works. The **Sky atlas** (Aladin Lite, CDS) lets you browse the full sky and click to load SPHEREx data there. |
| Add / subtract epochs | Modes: *Animate*, *Blink A/B*, *B − A* difference, *Epoch − rest* (each epoch minus the mean of the others), *Sum all*. |
| 102 bands | Stack all six detectors (max S/N), one detector array, or one of the 102 wavelength channels. SPHEREx uses linear variable filters, so every pixel has its own wavelength. The channel stack uses only pixels whose wavelength falls in that slice. |
| Spectra on the fly | Click a source, or click-and-drag a circle. Aperture photometry runs on every exposure, one spectral point each, colored by epoch or detector. *Line* view (default) connects each series in wavelength order; *Points* view shows the measurements with error bars. Click a point to open that exposure. For sources with known proper motion, the aperture follows the source. CSV download. |
| Light curves | Flux vs. time in the selected wavelength channel. |
| Field of view | 2′ to 30′ (the URL accepts any value from 1 to 30). |
| Gaia / WISE overlays | Gaia DR3 (moved from epoch 2016.0 to each frame's date) and CatWISE2020 (from 2015.4). CatWISE sources with significant proper motion, clean flags and no Gaia counterpart are flagged red as candidate infrared-only movers. The flag is computed by the API from both catalogs, so it is turned off (and the button says why) when Gaia or CatWISE can't be downloaded. |
| Coordinates in the URL | Every view is a shareable link, e.g. `?ra=133.7951&dec=-7.2451&fov=5&mode=diff` or `?target=Barnard's Star`. Add `&embed=1` for an iframe-friendly layout. |
| Metadata / contamination flags | Exposure table with date, detector, wavelength, coverage and the SPHEREx flag bits at the field center (ghost, crosstalk, streak, halo…). Unusable pixels are always masked. *Mask contamination* also masks the contamination flags. |
| Easy to update with new data | IRSA is queried live on every load, so new exposures appear automatically. If IRSA is down, the last saved answer for that position is used instead. **Check for new releases** probes IRSA for new SPHEREx collections. By default all all-sky releases are combined (currently DR1 + QR3) with duplicates removed. You can also **upload** SPHEREx Level-2 FITS files, which are merged into any field they overlap. |

## Architecture

```
browser (React + Vite + Tailwind + Recharts + Aladin Lite)
   │  /api/*
   ▼
server/ (FastAPI, Python)
   ├─ IRSA SIA v2      → which SPHEREx L2 exposures cover the field (any release)
   ├─ AWS Open Data S3 → HTTP range reads of only the needed pixels
   │                     (IMAGE − ZODI, VARIANCE, FLAGS, per-pixel wavelength from WCS-WAVE)
   ├─ resample every exposure onto one TAN grid at 6.15″/px, group into epochs,
   │  inverse-variance co-add, aperture photometry
   ├─ CDS Sesame (names), ESA Gaia DR3 TAP, IRSA CatWISE2020 cone search
   └─ uploads/ (user FITS), cache/ (resampled cutouts + saved IRSA SIA responses,
                                    so revisits are instant and work during IRSA outages)
```

The first load of a field reads about 250–550 exposures in parallel and takes about 1–2 minutes.
After that it is cached. IRSA's services (SIA, TAP, cone search) sometimes return `502 Proxy Error`;
the app then shows a retry message, and any field opened before still loads from `server/cache/`.

## Run locally

```bash
npm install
python -m pip install -r server/requirements.txt

npm run api      # Python API on :8000
npm run dev      # web app on :3000 (proxies /api to :8000)
```

## Deploy

The tool needs the Python API, so a static-only host is not enough. The included `Dockerfile` builds
the web app and serves it together with the API on port 8000. Any container host works (Render,
Railway, Fly.io, Google Cloud Run…):

```bash
docker build -t spherex-data-explorer .
docker run -p 8000:8000 spherex-data-explorer
```

## Method notes and caveats

* Fluxes are aperture sums of zodi-subtracted surface brightness, minus a local-annulus median,
  times the pixel solid angle (1 MJy/sr × (6.15″)² = 889 µJy). They are not aperture-corrected.
  Treat them as relative unless the source is isolated.
* Apertures with more than 50% masked pixels are skipped. Bright, saturated stars therefore have
  few or no spectral points.
* Always-masked flags: TRANSIENT, OVERFLOW, SUR_ERROR, NONFUNC, DICHROIC, MISSING_DATA, HOT,
  COLD, NONLINEAR, PERSIST, OUTLIER. Contamination flags (shown, and optionally masked):
  CROSSTALK, GHOST, GHOST_FPA, GHOST_EXT, STREAK, BLOOM, SNOWBALL, HALO.
* Infrared-only mover flags are leads to inspect, not discoveries. Check the images. They need
  the full Gaia DR3 list for the field; without it every CatWISE source would look "optically
  invisible", so the flag is disabled instead.

## Data credits

NASA SPHEREx via NASA/IPAC Infrared Science Archive (IRSA) and the AWS Open Data Registry;
ESA Gaia DR3; CatWISE2020 (Marocco et al. 2021) via IRSA; SIMBAD and Aladin Lite (CDS, Strasbourg).

MIT License.
