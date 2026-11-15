"""
SPHEREx data access + processing.

All imagery comes live from the NASA/IPAC Infrared Science Archive (IRSA):
  * discovery: IRSA Simple Image Access v2 (SIA) -> list of Level-2 spectral images
  * pixels:    the public AWS Open Data copy (s3://nasa-irsa-spherex) read with HTTP
               range requests, so only the pixels inside the requested field are
               downloaded (not the full ~70 MB multi-extension files).

Each SPHEREx Level-2 file has extensions:
  IMAGE (MJy/sr), FLAGS (bitmask), VARIANCE (MJy^2/sr^2), ZODI (MJy/sr model),
  EPSF (PSF table), WCS-WAVE (lookup table for the per-pixel wavelength, WCS key 'W').

SPHEREx uses linear variable filters: every pixel of an exposure sees a different
wavelength. The wavelength of every resampled pixel is therefore kept, which is what
makes on-the-fly spectra possible.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
import threading
import time
import uuid
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import requests
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS, FITSFixedWarning

warnings.simplefilter("ignore", FITSFixedWarning)
warnings.filterwarnings("ignore", module="astropy.wcs")

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
S3_HTTP = "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/"
IBE_PREFIX = "irsa.ipac.caltech.edu/ibe/data/spherex/"
PIXEL_SCALE_ARCSEC = 6.15  # native SPHEREx pixel scale
PIX_SR = (PIXEL_SCALE_ARCSEC / 206264.806) ** 2  # solid angle of one grid pixel
MJYSR_TO_UJY_PER_PIX = PIX_SR * 1e12  # 1 MJy/sr over one pixel -> microJansky

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "cache"
UPLOAD_DIR = ROOT / "uploads"
CACHE_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)

# Pixels with these flags are unusable and always masked.
HARD_FLAGS = {
    "TRANSIENT", "OVERFLOW", "SUR_ERROR", "NONFUNC", "DICHROIC", "MISSING_DATA",
    "HOT", "COLD", "NONLINEAR", "PERSIST", "OUTLIER",
}
# Contamination flags: reported as metadata; optionally masked ("strict" mode).
CONTAM_FLAGS = {
    "CROSSTALK", "GHOST", "GHOST_FPA", "GHOST_EXT", "STREAK", "BLOOM", "SNOWBALL", "HALO",
}
# Bit definitions published in every SPHEREx L2 FLAGS header (DR1). Used as a fallback;
# the definitions are re-read from each file header.
DEFAULT_FLAG_BITS = {
    0: "TRANSIENT", 1: "OVERFLOW", 2: "SUR_ERROR", 6: "NONFUNC", 7: "DICHROIC",
    9: "MISSING_DATA", 10: "HOT", 11: "COLD", 12: "FULLSAMPLE", 14: "PHANMISS",
    15: "NONLINEAR", 17: "PERSIST", 19: "OUTLIER", 20: "CROSSTALK", 21: "SOURCE",
    22: "GHOST", 23: "GHOST_FPA", 24: "GHOST_EXT", 25: "STREAK", 26: "BLOOM",
    27: "SNOWBALL", 28: "HALO",
}

# Collections are probed rather than hard-coded so new IRSA releases show up without
# code changes. Users can also type any collection name in the UI.
CANDIDATE_RELEASES = [
    "spherex_qr", "spherex_qr2", "spherex_qr3",
    "spherex_dr1", "spherex_dr2", "spherex_dr3", "spherex_dr4", "spherex_dr5",
    "spherex_deep", "spherex_dr1_deep", "spherex_dr2_deep",
]
PROBE_POS = (270.0, 66.56)  # north ecliptic pole deep field: covered in every survey

HTTP = requests.Session()
HTTP.headers["User-Agent"] = "spherex-blink-explorer/2.0 (NASA Space Apps)"


# --------------------------------------------------------------------------- utils

def mjd_to_iso(mjd: float) -> str:
    return Time(mjd, format="mjd").isot[:19]


def mjd_to_year(mjd: float) -> float:
    return float(Time(mjd, format="mjd").decimalyear)


def propagate(ra: float, dec: float, pmra: float, pmdec: float, from_year: float, to_year: float):
    """Linear proper-motion propagation. pmra includes cos(dec) (mas/yr), as in SIMBAD/Gaia."""
    dt = to_year - from_year
    dec_new = dec + pmdec * dt / 3.6e6
    ra_new = ra + pmra * dt / 3.6e6 / max(1e-6, math.cos(math.radians(dec)))
    return ra_new % 360.0, dec_new


def make_grid_wcs(ra: float, dec: float, n: int) -> WCS:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2.0, (n + 1) / 2.0]
    s = PIXEL_SCALE_ARCSEC / 3600.0
    w.wcs.cdelt = [-s, s]  # East to the left, North up
    return w


def parse_flag_bits(hdr) -> dict[int, str]:
    bits = {}
    for k in hdr.keys():
        if k.startswith("MSKN"):
            try:
                bits[int(k[4:])] = str(hdr[k]).strip()
            except ValueError:
                pass
    return bits or dict(DEFAULT_FLAG_BITS)


def flag_mask(bits: dict[int, str], names: set[str]) -> int:
    m = 0
    for b, n in bits.items():
        if n in names:
            m |= 1 << b
    return m


def decode_flags(value: int, bits: dict[int, str]) -> list[str]:
    return [n for b, n in sorted(bits.items()) if value & (1 << b)]


def with_retries(fn, tries=4, base=1.5):
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # network hiccups / "Server busy"
            last = e
            time.sleep(base * (2 ** i))
    raise last


# ---------------------------------------------------------------- release discovery

_release_cache: dict = {"t": 0.0, "data": []}


def sia_query(collection: str, ra: float, dec: float, radius_deg: float, maxrec: Optional[int] = None):
    params = {
        "COLLECTION": collection,
        "POS": f"CIRCLE {ra} {dec} {radius_deg}",
        "RESPONSEFORMAT": "CSV",
    }
    if maxrec:
        params["MAXREC"] = str(maxrec)

    def go():
        r = HTTP.get(SIA_URL, params=params, timeout=40)
        r.raise_for_status()
        if "busy" in r.text[:200].lower():
            raise RuntimeError("IRSA busy")
        return r.text

    text = with_retries(go, tries=3, base=1.0)
    rows = list(csv.DictReader(io.StringIO(text)))
    return [r for r in rows if r.get("obs_publisher_did")]


def probe_release(name: str) -> Optional[dict]:
    try:
        rows = sia_query(name, PROBE_POS[0], PROBE_POS[1], 0.01, maxrec=1)
    except Exception:
        return None
    if not rows:
        return None
    r = rows[0]
    deep = "deep" in name
    return {
        "name": name,
        "label": name.replace("spherex_", "SPHEREx ").upper().replace("SPHEREX", "SPHEREx").replace("_DEEP", " deep fields"),
        "all_sky": not deep,
        "release_date": r.get("obs_release_date", "")[:10],
        "example_file": r.get("access_url", ""),
    }


def discover_releases(refresh: bool = False, extra: Optional[list[str]] = None) -> list[dict]:
    if not refresh and _release_cache["data"] and time.time() - _release_cache["t"] < 3600 and not extra:
        return _release_cache["data"]
    names = list(dict.fromkeys(CANDIDATE_RELEASES + (extra or [])))
    with ThreadPoolExecutor(8) as ex:
        found = [r for r in ex.map(probe_release, names) if r]
    # all-sky releases first (newest first); deep-field-only collections after
    found.sort(key=lambda r: (r["all_sky"], r["release_date"], r["name"]), reverse=True)
    _release_cache.update(t=time.time(), data=found)
    return found


# ----------------------------------------------------------------- image fetching

@dataclass
class Exposure:
    did: str
    obs_id: str
    detector: int
    mjd: float
    url: str  # http(s) URL or local path
    em_min_um: float
    em_max_um: float
    source: str  # release name or "upload"
    # filled after resampling
    signal: Optional[np.ndarray] = None  # zodi-subtracted surface brightness (MJy/sr), NaN = masked
    var: Optional[np.ndarray] = None
    wl: Optional[np.ndarray] = None  # micron
    bw: Optional[np.ndarray] = None  # micron
    flags: Optional[np.ndarray] = None
    flag_bits: dict = field(default_factory=dict)
    psf_fwhm: Optional[float] = None
    exptime: Optional[float] = None
    coverage: float = 0.0
    error: Optional[str] = None

    def meta(self, n: int) -> dict:
        c = n // 2
        wl_c = float(self.wl[c, c]) if self.wl is not None and np.isfinite(self.wl[c, c]) else None
        if wl_c is None and self.wl is not None and np.isfinite(self.wl).any():
            wl_c = float(np.nanmedian(self.wl))
        cflags = int(self.flags[c, c]) if self.flags is not None else 0
        return {
            "did": self.did,
            "obs_id": self.obs_id,
            "detector": self.detector,
            "mjd": round(self.mjd, 5),
            "date": mjd_to_iso(self.mjd),
            "wavelength_um": round(wl_c, 4) if wl_c else None,
            "band_min_um": round(self.em_min_um, 4),
            "band_max_um": round(self.em_max_um, 4),
            "coverage": round(self.coverage, 3),
            "center_flags": decode_flags(cflags, self.flag_bits),
            "psf_fwhm_arcsec": self.psf_fwhm,
            "exptime_s": self.exptime,
            "source": self.source,
            "url": self.url,
            "error": self.error,
        }


# One shared session: urllib3's connection pool is thread-safe, and sharing it avoids every
# thread re-loading the CA store (~0.5 s of GIL-held CPU per new SSL context).
_S3 = requests.Session()
_S3.mount("https://", requests.adapters.HTTPAdapter(pool_connections=8, pool_maxsize=96, max_retries=3))


def _session() -> requests.Session:
    return _S3


class HTTPRangeFile(io.RawIOBase):
    """
    Minimal seekable read-only file over HTTP Range requests, with a block cache.
    Blocking socket I/O releases the GIL, so many of these run truly in parallel
    across threads (fsspec funnels every thread through one event loop instead).
    """
    BLOCK = 1 << 16

    def __init__(self, url: str):
        self.url, self.name, self.mode = url, url, "rb"
        self.pos = 0
        self.blocks: dict[int, bytes] = {}
        r = _session().head(url, timeout=60)
        r.raise_for_status()
        self.size = int(r.headers["Content-Length"])

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def _fetch(self, first: int, last: int):
        """Fetch blocks first..last (inclusive) in one request."""
        start, end = first * self.BLOCK, min(self.size, (last + 1) * self.BLOCK) - 1
        r = _session().get(self.url, headers={"Range": f"bytes={start}-{end}"}, timeout=120)
        r.raise_for_status()
        data = r.content
        for b in range(first, last + 1):
            o = (b - first) * self.BLOCK
            self.blocks[b] = data[o:o + self.BLOCK]

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        if n == 0:
            return b""
        if n >= self.BLOCK:  # large reads (image rows): fetch the exact range, no block rounding
            r = _session().get(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"}, timeout=120)
            r.raise_for_status()
            self.pos += n
            return r.content
        b0, b1 = self.pos // self.BLOCK, (self.pos + n - 1) // self.BLOCK
        missing = [b for b in range(b0, b1 + 1) if b not in self.blocks]
        if missing:
            self._fetch(missing[0], missing[-1])
        buf = b"".join(self.blocks[b] for b in range(b0, b1 + 1))
        o = self.pos - b0 * self.BLOCK
        self.pos += n
        return buf[o:o + n]

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)


def _open(url: str):
    if url.startswith("http"):
        return fits.open(HTTPRangeFile(url), lazy_load_hdus=True, cache=False)
    return fits.open(url, memmap=True, lazy_load_hdus=True)


def _bilinear(arr: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    h, w = arr.shape
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    ok = (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)
    out = np.full(x.shape, np.nan, dtype=np.float32)
    xi, yi = x0[ok], y0[ok]
    fx, fy = (x - x0)[ok], (y - y0)[ok]
    a = arr[yi, xi] * (1 - fx) * (1 - fy) + arr[yi, xi + 1] * fx * (1 - fy) \
        + arr[yi + 1, xi] * (1 - fx) * fy + arr[yi + 1, xi + 1] * fx * fy
    out[ok] = a
    return out


def _nearest(arr: np.ndarray, x: np.ndarray, y: np.ndarray, fill=0) -> np.ndarray:
    h, w = arr.shape
    xi = np.rint(x).astype(int)
    yi = np.rint(y).astype(int)
    ok = (xi >= 0) & (yi >= 0) & (xi < w) & (yi < h)
    out = np.full(x.shape, fill, dtype=arr.dtype)
    out[ok] = arr[yi[ok], xi[ok]]
    return out


def _without_sip(hdr):
    """
    Header copy without SIP distortion keywords, for building the spectral ('W') WCS.
    SIP describes the celestial mapping only; leaving it in makes astropy print an
    'Inconsistent SIP distortion' notice for every exposure (the W axes are WAVE-TAB).
    """
    h = hdr.copy()
    for k in list(h.keys()):
        if k.split("_")[0] in ("A", "B", "AP", "BP") and "_" in k:
            del h[k]
    return h


def _rows(hdul, ext: str, y0: int, y1: int, x0: int, x1: int) -> np.ndarray:
    """
    Read rows y0..y1 of an uncompressed image HDU with ONE byte-range request and cut columns
    x0..x1. (astropy's .section reads row by row, which over HTTP means dozens of round trips.)
    """
    hdu = hdul[ext]
    hdr = hdu.header
    f = hdul._file._file if hasattr(hdul._file, "_file") else None
    if not isinstance(f, HTTPRangeFile) or hdr.get("BITPIX") != -32 or "ZIMAGE" in hdr:
        return np.asarray(hdu.section[y0:y1, x0:x1], dtype=np.float32)
    nx = hdr["NAXIS1"]
    f.seek(hdu._data_offset + y0 * nx * 4)
    buf = f.read((y1 - y0) * nx * 4)
    arr = np.frombuffer(buf, dtype=">f4").reshape(y1 - y0, nx)[:, x0:x1]
    return arr.astype(np.float32)


def resample_exposure(exp: Exposure, grid: WCS, n: int, strict: bool) -> Exposure:
    """Read only the needed pixels of one exposure and resample onto the common grid."""
    key = hashlib.sha1(
        f"{exp.did}|{grid.wcs.crval[0]:.6f}|{grid.wcs.crval[1]:.6f}|{n}|{int(strict)}|v4".encode()
    ).hexdigest()
    cpath = CACHE_DIR / f"{key}.npz"
    if cpath.exists():
        try:
            d = np.load(cpath, allow_pickle=False)
            exp.signal, exp.var, exp.flags = d["signal"], d["var"], d["flags"]
            exp.wl, exp.bw = d["wl"].astype(np.float32), d["bw"].astype(np.float32)
            m = json.loads(str(d["meta"]))
            exp.flag_bits = {int(k): v for k, v in m["bits"].items()}
            exp.psf_fwhm, exp.exptime, exp.coverage = m["psf"], m["exp"], m["cov"]
            exp.mjd = m.get("mjd", exp.mjd)
            return exp
        except Exception:
            cpath.unlink(missing_ok=True)

    def work():
        with _open(exp.url) as hdul:
            hdr = hdul["IMAGE"].header
            w = WCS(hdr)
            ny, nx = hdr["NAXIS2"], hdr["NAXIS1"]
            yy, xx = np.mgrid[0:n, 0:n]
            sra, sdec = grid.pixel_to_world_values(xx.ravel(), yy.ravel())
            sx, sy = w.world_to_pixel_values(sra, sdec)
            sx, sy = np.asarray(sx), np.asarray(sy)
            inside = (sx >= -0.5) & (sy >= -0.5) & (sx <= nx - 0.5) & (sy <= ny - 0.5)
            if not inside.any():
                raise LookupError("field not on this exposure")
            x0 = max(0, int(np.floor(sx[inside].min())) - 2)
            x1 = min(nx, int(np.ceil(sx[inside].max())) + 3)
            y0 = max(0, int(np.floor(sy[inside].min())) - 2)
            y1 = min(ny, int(np.ceil(sy[inside].max())) + 3)

            img = _rows(hdul, "IMAGE", y0, y1, x0, x1)
            var = _rows(hdul, "VARIANCE", y0, y1, x0, x1)
            # The zodiacal-light model is smooth (it varies < 0.1 sigma per pixel over 30').
            # Sample three rows (bottom, middle, top) and interpolate linearly in y instead
            # of downloading the whole block. Exact on each sampled row.
            ys = sorted({y0, (y0 + y1 - 1) // 2, y1 - 1})
            zr = np.stack([_rows(hdul, "ZODI", y, y + 1, x0, x1)[0] for y in ys])
            yy_ = np.arange(y0, y1)
            zod = np.empty((y1 - y0, x1 - x0), np.float32)
            for c in range(x1 - x0):
                zod[:, c] = np.interp(yy_, ys, zr[:, c])
            flg = np.asarray(hdul["FLAGS"].section[y0:y1, x0:x1]).astype(np.int64)
            bits = parse_flag_bits(hdul["FLAGS"].header)

            # Per-pixel wavelength from the spectral WCS (lookup table in WCS-WAVE).
            try:
                ws = WCS(_without_sip(hdr), fobj=hdul, key="W")
                wl_full, bw_full = ws.pixel_to_world_values(sx, sy)
                wl_full = np.asarray(wl_full, dtype=np.float32)
                bw_full = np.asarray(bw_full, dtype=np.float32)
            except Exception:
                mid = 0.5 * (exp.em_min_um + exp.em_max_um)
                wl_full = np.full(sx.shape, mid, np.float32)
                bw_full = np.full(sx.shape, np.nan, np.float32)

            psf = hdr.get("PSF_FWHM")
            xpos = hdr.get("XPOSURE")
            mjd = hdr.get("MJD-AVG") or exp.mjd

        bad = flag_mask(bits, HARD_FLAGS | (CONTAM_FLAGS if strict else set()))
        sig = img - zod
        sig[(flg & bad) != 0] = np.nan
        var = np.where(np.isfinite(sig), var, np.nan)

        lx, ly = sx - x0, sy - y0
        s = _bilinear(sig, lx, ly)
        v = _bilinear(var, lx, ly)
        f = _nearest(flg, lx, ly, fill=0).astype(np.int32)
        s[~inside] = np.nan
        wl_full[~inside] = np.nan
        return (s.reshape(n, n), v.reshape(n, n), f.reshape(n, n), wl_full.reshape(n, n),
                bw_full.reshape(n, n), bits, psf, xpos, float(mjd))

    s, v, f, wl, bw, bits, psf, xpos, mjd = with_retries(work, tries=3)
    exp.signal, exp.var, exp.flags, exp.wl, exp.bw = s, v, f, wl, bw
    exp.flag_bits = bits
    exp.psf_fwhm = float(psf) if psf is not None else None
    exp.exptime = float(xpos) if xpos is not None else None
    exp.coverage = float(np.isfinite(s).mean())
    exp.mjd = mjd
    meta = json.dumps({"bits": {str(k): v for k, v in bits.items()}, "psf": exp.psf_fwhm,
                       "exp": exp.exptime, "cov": exp.coverage, "mjd": mjd})
    np.savez_compressed(cpath, signal=s, var=v, flags=f, wl=wl.astype(np.float16),
                        bw=bw.astype(np.float16), meta=np.array(meta))
    return exp


# ------------------------------------------------------------------------ uploads

def upload_index() -> list[dict]:
    idx = UPLOAD_DIR / "index.json"
    if idx.exists():
        try:
            return json.loads(idx.read_text())
        except Exception:
            return []
    return []


def save_upload_index(items: list[dict]):
    (UPLOAD_DIR / "index.json").write_text(json.dumps(items, indent=1))


def register_upload(path: Path, original_name: str) -> dict:
    """Validate a user-supplied SPHEREx Level-2 FITS file and index its footprint."""
    with fits.open(path, memmap=True) as hdul:
        names = [h.name for h in hdul]
        if "IMAGE" not in names:
            raise ValueError("Not a SPHEREx Level-2 image: no IMAGE extension")
        hdr = hdul["IMAGE"].header
        w = WCS(hdr)
        if not w.has_celestial:
            raise ValueError("IMAGE extension has no celestial WCS")
        foot = w.calc_footprint(axes=(hdr["NAXIS1"], hdr["NAXIS2"])).tolist()
        mjd = hdr.get("MJD-AVG") or hdr.get("MJD-OBS")
        if mjd is None:
            raise ValueError("Missing MJD-AVG / MJD-OBS")
        det = int(hdr.get("DETECTOR", 0))
        for need in ("ZODI", "VARIANCE", "FLAGS"):
            if need not in names:
                raise ValueError(f"Missing {need} extension")
    item = {
        "file": path.name, "name": original_name, "detector": det, "mjd": float(mjd),
        "date": mjd_to_iso(float(mjd)), "footprint": foot, "obs_id": str(hdr.get("OBSID", path.stem)),
        "uploaded": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    items = [i for i in upload_index() if i["file"] != path.name] + [item]
    save_upload_index(items)
    return item


def _point_in_poly(ra, dec, poly):
    # small-field approximation in a local tangent frame
    cd = math.cos(math.radians(dec))
    pts = [(((p[0] - ra + 540) % 360 - 180) * cd, p[1] - dec) for p in poly]
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > 0) != (yj > 0) and 0 < (xj - xi) * (0 - yi) / (yj - yi + 1e-30) + xi:
            inside = not inside
        j = i
    return inside


def uploads_covering(ra, dec, radius_deg) -> list[Exposure]:
    out = []
    for it in upload_index():
        poly = it["footprint"]
        near = _point_in_poly(ra, dec, poly) or any(
            math.hypot(((p[0] - ra + 540) % 360 - 180) * math.cos(math.radians(dec)), p[1] - dec) < radius_deg + 3.6
            for p in poly)
        if near:
            out.append(Exposure(
                did=f"upload:{it['file']}", obs_id=it["obs_id"], detector=it["detector"], mjd=it["mjd"],
                url=str(UPLOAD_DIR / it["file"]), em_min_um=0.75, em_max_um=5.0, source="upload"))
    return out


# -------------------------------------------------------------------------- fields

@dataclass
class FieldJob:
    id: str
    params: dict
    state: str = "queued"  # queued | searching | fetching | done | error
    message: str = ""
    total: int = 0
    done: int = 0
    exposures: list = field(default_factory=list)
    n: int = 0
    grid: Optional[WCS] = None
    center: tuple = (0.0, 0.0)
    epochs: list = field(default_factory=list)
    created: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def status(self) -> dict:
        out = {"id": self.id, "state": self.state, "message": self.message,
               "total": self.total, "done": self.done, "params": self.params}
        if self.state == "done":
            out["field"] = self.field_meta()
        return out

    def field_meta(self) -> dict:
        good = [e for e in self.exposures if e.signal is not None]
        p = self.params
        track = None
        if p.get("pmra") is not None and p.get("pmdec") is not None:
            track = []
            for ep in self.epochs:
                r, d = propagate(p["ra"], p["dec"], p["pmra"], p["pmdec"], p.get("pos_epoch", 2000.0),
                                 mjd_to_year(ep["mjd"]))
                x, y = self.grid.world_to_pixel_values(r, d)
                track.append({"epoch": ep["index"], "ra": r, "dec": d, "x": float(x), "y": float(y)})
        return {
            "n": self.n,
            "pixel_scale_arcsec": PIXEL_SCALE_ARCSEC,
            "fov_arcmin": round(self.n * PIXEL_SCALE_ARCSEC / 60.0, 3),
            "center_ra": self.center[0],
            "center_dec": self.center[1],
            "epochs": self.epochs,
            "exposures": [e.meta(self.n) for e in good],
            "failed": [{"did": e.did, "error": e.error} for e in self.exposures if e.signal is None],
            "track": track,
            "flag_bits": {str(k): v for k, v in (good[0].flag_bits if good else DEFAULT_FLAG_BITS).items()},
            "hard_flags": sorted(HARD_FLAGS),
            "contamination_flags": sorted(CONTAM_FLAGS),
        }


JOBS: dict[str, FieldJob] = {}
JOB_KEYS: dict[str, str] = {}
POOL = ThreadPoolExecutor(64)  # S3 range reads are latency-bound; high parallelism pays off
MAX_JOBS = 4


def group_epochs(exps: list[Exposure], gap_days: float = 20.0) -> list[dict]:
    """SPHEREx revisits a sky position in visits spaced by ~6 months; cluster by time."""
    order = sorted(range(len(exps)), key=lambda i: exps[i].mjd)
    groups: list[list[int]] = []
    for i in order:
        if groups and exps[i].mjd - exps[groups[-1][-1]].mjd <= gap_days:
            groups[-1].append(i)
        else:
            groups.append([i])
    out = []
    for gi, g in enumerate(groups):
        mjds = [exps[i].mjd for i in g]
        for i in g:
            exps[i].epoch = gi  # type: ignore[attr-defined]
        out.append({
            "index": gi,
            "mjd": float(np.mean(mjds)),
            "mjd_min": float(min(mjds)),
            "mjd_max": float(max(mjds)),
            "date": mjd_to_iso(float(np.mean(mjds)))[:10],
            "n_exposures": len(g),
            "detectors": sorted({exps[i].detector for i in g}),
        })
    return out


def start_field(params: dict) -> FieldJob:
    key = json.dumps(params, sort_keys=True) + f"|uploads={len(upload_index())}"
    if key in JOB_KEYS and JOB_KEYS[key] in JOBS and JOBS[JOB_KEYS[key]].state != "error":
        return JOBS[JOB_KEYS[key]]
    job = FieldJob(id=uuid.uuid4().hex[:12], params=params)
    JOBS[job.id] = job
    JOB_KEYS[key] = job.id
    # evict old jobs (pixel cubes are large)
    for old in sorted(JOBS.values(), key=lambda j: j.created)[:-MAX_JOBS]:
        JOBS.pop(old.id, None)
    threading.Thread(target=_run_field, args=(job,), daemon=True).start()
    return job


def _run_field(job: FieldJob):
    p = job.params
    try:
        fov_deg = p["fov_arcmin"] / 60.0
        n = int(math.ceil(p["fov_arcmin"] * 60.0 / PIXEL_SCALE_ARCSEC))
        n += (n + 1) % 2  # odd so the target sits on the central pixel
        job.n = n
        job.state, job.message = "searching", f"Querying IRSA ({p['release']}) for SPHEREx exposures..."
        ra, dec = p["ra"], p["dec"]
        releases = [r for r in p["release"].split("+") if r and r != "uploads-only"]

        def query_all(ra_, dec_):
            # Several releases may be combined ("spherex_dr1+spherex_qr3"). The same exposure can
            # appear in more than one; keep the copy from the first-listed release.
            seen, out = set(), []
            for rel in releases:
                for r in sia_query(rel, ra_, dec_, 0.001):
                    k = r["obs_publisher_did"].split("?", 1)[-1]
                    if k not in seen:
                        seen.add(k)
                        r["_release"] = rel
                        out.append(r)
            return out

        rows = query_all(ra, dec)

        # centre on the target's position at the mean epoch of the data (proper motion)
        if p.get("pmra") is not None and rows:
            mean_mjd = float(np.mean([float(r["t_min"]) for r in rows]))
            ra, dec = propagate(ra, dec, p["pmra"], p["pmdec"], p.get("pos_epoch", 2000.0), mjd_to_year(mean_mjd))
            rows = query_all(ra, dec)
        job.center = (ra, dec)
        job.grid = make_grid_wcs(ra, dec, n)

        exps: list[Exposure] = []
        for r in rows:
            # IRSA mirrors every file on AWS Open Data under the same path; reading from S3
            # avoids IRSA's "server busy" throttling. (The cloud_access CSV column contains
            # unquoted JSON, so the key is derived from the archive path instead.)
            url = r["access_url"]
            if IBE_PREFIX in url:
                url = S3_HTTP + url.split(IBE_PREFIX, 1)[1]
            det = int(r["energy_bandpassname"].split("D")[-1]) if "D" in r["energy_bandpassname"] else 0
            exps.append(Exposure(
                did=r["obs_publisher_did"], obs_id=r["obs_id"], detector=det,
                mjd=0.5 * (float(r["t_min"]) + float(r["t_max"])), url=url,
                em_min_um=float(r["em_min"]) * 1e6, em_max_um=float(r["em_max"]) * 1e6, source=r["_release"]))
        if p.get("include_uploads", True):
            have = {(e.obs_id, e.detector) for e in exps}
            exps += [u for u in uploads_covering(ra, dec, fov_deg) if (u.obs_id, u.detector) not in have]
        if p.get("detectors"):
            exps = [e for e in exps if e.detector in p["detectors"]]
        if not exps:
            job.state = "error"
            job.message = ("No SPHEREx exposures cover this position in " + " + ".join(releases) +
                           ". Try another release or upload a FITS file.")
            return

        job.total = len(exps)
        job.state, job.message = "fetching", f"Reading {len(exps)} exposures (only the pixels in your field)..."
        futs = {POOL.submit(resample_exposure, e, job.grid, n, p.get("strict", False)): e for e in exps}
        for f in as_completed(futs):
            e = futs[f]
            try:
                f.result()
            except Exception as ex:
                e.error = str(ex)[:200]
                e.signal = None
            with job.lock:
                job.done += 1
        good = [e for e in exps if e.signal is not None and e.coverage > 0]
        if not good:
            job.state, job.message = "error", "All exposure reads failed (IRSA/AWS busy?). Please retry."
            job.exposures = exps
            return
        job.exposures = good + [e for e in exps if e.signal is None]
        job.epochs = group_epochs(good, p.get("epoch_gap_days", 20.0))
        job.state = "done"
        job.message = f"{len(good)} exposures in {len(job.epochs)} epochs"
    except Exception as ex:  # pragma: no cover
        job.state, job.message = "error", f"{type(ex).__name__}: {ex}"


def _select(job: FieldJob, stack: str):
    good = [e for e in job.exposures if e.signal is not None]
    lo, hi, det = None, None, None
    if stack.startswith("D"):
        det = int(stack[1:])
    elif stack.startswith("wl:"):
        a, b = stack[3:].split(":")
        lo, hi = float(a), float(b)
    return good, det, lo, hi


def coadd(exps: list[Exposure], n: int, det=None, lo=None, hi=None):
    """Inverse-variance weighted mean surface brightness (MJy/sr)."""
    num = np.zeros((n, n), np.float64)
    den = np.zeros((n, n), np.float64)
    cnt = np.zeros((n, n), np.int32)
    for e in exps:
        if det is not None and e.detector != det:
            continue
        s, v = e.signal, e.var
        ok = np.isfinite(s) & np.isfinite(v) & (v > 0)
        if lo is not None:
            ok &= np.isfinite(e.wl) & (e.wl >= lo) & (e.wl <= hi)
        if not ok.any():
            continue
        w = np.where(ok, 1.0 / np.where(ok, v, 1.0), 0.0)
        num += np.where(ok, s, 0.0) * w
        den += w
        cnt += ok
    with np.errstate(invalid="ignore", divide="ignore"):
        img = np.where(den > 0, num / den, np.nan).astype(np.float32)
    return img, cnt


def epoch_frames(job: FieldJob, stack: str) -> list[dict]:
    good, det, lo, hi = _select(job, stack)
    frames = []
    for ep in job.epochs:
        members = [e for e in good if getattr(e, "epoch", -1) == ep["index"]]
        img, cnt = coadd(members, job.n, det, lo, hi)
        used = [e for e in members if (det is None or e.detector == det)]
        frames.append({"epoch": ep, "image": img, "count": cnt, "n_used": len(used)})
    return frames


def single_frame(job: FieldJob, did: str) -> Optional[Exposure]:
    for e in job.exposures:
        if e.did == did and e.signal is not None:
            return e
    return None


def aperture_spectrum(job: FieldJob, ra: float, dec: float, radius_arcsec: float,
                      pmra: Optional[float] = None, pmdec: Optional[float] = None,
                      pos_epoch: float = 2000.0) -> list[dict]:
    """
    Aperture photometry on every exposure -> one spectral point per exposure.
    Flux = sum(zodi-subtracted SB - local median background) * pixel solid angle.
    Not aperture-corrected; masked pixels are excluded (reported as masked_frac).
    If proper motion is given, the aperture follows the source exposure by exposure.
    """
    n = job.n
    yy, xx = np.mgrid[0:n, 0:n]
    r_pix = max(1.0, radius_arcsec / PIXEL_SCALE_ARCSEC)
    r_in, r_out = r_pix + 1.5, r_pix + 4.0
    out = []
    skipped = 0
    for e in job.exposures:
        if e.signal is None:
            continue
        if pmra is not None and pmdec is not None:
            r_, d_ = propagate(ra, dec, pmra, pmdec, pos_epoch, mjd_to_year(e.mjd))
        else:
            r_, d_ = ra, dec
        cx, cy = job.grid.world_to_pixel_values(r_, d_)
        d2 = (xx - cx) ** 2 + (yy - cy) ** 2
        ap = d2 <= r_pix ** 2
        ann = (d2 >= r_in ** 2) & (d2 <= r_out ** 2)
        if not ap.any():
            continue
        s, v = e.signal, e.var
        okap = ap & np.isfinite(s)
        n_ap = int(ap.sum())
        masked = 1.0 - okap.sum() / n_ap
        if okap.sum() == 0 or masked > 0.5:
            skipped += 1
            continue
        bkg_pix = s[ann & np.isfinite(s)]
        bkg = float(np.median(bkg_pix)) if bkg_pix.size >= 5 else 0.0
        # scale up the measured pixels to the full aperture area (masked-pixel fill)
        total = float(np.sum(s[okap] - bkg)) * (n_ap / okap.sum())
        varsum = float(np.nansum(v[okap])) * (n_ap / okap.sum())
        if bkg_pix.size >= 5:
            varsum += (1.253 * np.std(bkg_pix) / math.sqrt(bkg_pix.size)) ** 2 * n_ap ** 2
        wl = e.wl[ap & np.isfinite(e.wl)]
        bw = e.bw[ap & np.isfinite(e.bw)]
        if wl.size == 0:
            continue
        fl = 0
        for f in e.flags[ap]:
            fl |= int(f)
        names = decode_flags(fl, e.flag_bits)
        flux = total * MJYSR_TO_UJY_PER_PIX
        err = math.sqrt(max(varsum, 0.0)) * MJYSR_TO_UJY_PER_PIX
        out.append({
            "did": e.did, "detector": e.detector, "epoch": getattr(e, "epoch", 0),
            "mjd": round(e.mjd, 5), "date": mjd_to_iso(e.mjd)[:10],
            "wavelength_um": round(float(np.median(wl)), 4),
            "bandwidth_um": round(float(np.median(bw)), 4) if bw.size else None,
            "flux_ujy": round(flux, 3), "flux_err_ujy": round(err, 3),
            "snr": round(flux / err, 2) if err > 0 else None,
            "masked_frac": round(masked, 3),
            "flags": [x for x in names if x not in ("FULLSAMPLE", "SOURCE")],
            "contaminated": any(x in CONTAM_FLAGS for x in names),
            "x": float(cx), "y": float(cy),
        })
    out.sort(key=lambda p: p["wavelength_um"])
    return out, skipped
