"""
SPHEREx Data Explorer API.

Run:  python -m uvicorn app:app --app-dir server --port 8000
The Vite dev server proxies /api -> http://localhost:8000.
"""
from __future__ import annotations

import base64
import re
import time
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import catalogs
import spherex as sx

app = FastAPI(title="SPHEREx Data Explorer API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(arr, dtype=np.float32).tobytes()).decode()


def job_or_404(job_id: str) -> sx.FieldJob:
    job = sx.JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Field expired - please reload it")
    if job.state != "done":
        raise HTTPException(409, f"Field not ready ({job.state})")
    return job


@app.get("/api/health")
def health():
    return {"ok": True, "time": time.time()}


# ---------------------------------------------------------------- releases & data

@app.get("/api/releases")
def releases(refresh: bool = False, extra: Optional[str] = None):
    extra_list = [e.strip() for e in (extra or "").split(",") if re.fullmatch(r"[A-Za-z0-9_]+", e.strip())]
    found = sx.discover_releases(refresh=refresh, extra=extra_list or None)
    all_sky = [r["name"] for r in found if r["all_sky"]]
    return {"releases": found, "latest": all_sky[0] if all_sky else (found[0]["name"] if found else None),
            # default = every all-sky release combined -> the most epochs (duplicates removed server-side)
            "default": "+".join(all_sky) if all_sky else None,
            "checked": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(sx._release_cache["t"]))
            if sx._release_cache["t"] else None}


@app.post("/api/uploads")
async def upload(file: UploadFile = File(...)):
    name = Path(file.filename or "upload.fits").name
    if not re.search(r"\.(fits|fit|fts)(\.gz)?$", name, re.I):
        raise HTTPException(400, "Please upload a SPHEREx Level-2 .fits file")
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    dest = sx.UPLOAD_DIR / safe
    with dest.open("wb") as fh:
        while chunk := await file.read(1 << 20):
            fh.write(chunk)
    try:
        item = sx.register_upload(dest, name)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, f"Rejected: {e}")
    return item


@app.get("/api/uploads")
def list_uploads():
    return sx.upload_index()


@app.delete("/api/uploads/{fname}")
def delete_upload(fname: str):
    items = sx.upload_index()
    keep = [i for i in items if i["file"] != fname]
    if len(keep) == len(items):
        raise HTTPException(404, "not found")
    (sx.UPLOAD_DIR / Path(fname).name).unlink(missing_ok=True)
    sx.save_upload_index(keep)
    return {"deleted": fname}


# ------------------------------------------------------------------------- fields

class FieldRequest(BaseModel):
    ra: float = Field(ge=0, lt=360)
    dec: float = Field(ge=-90, le=90)
    fov_arcmin: float = Field(default=5.0, ge=1.0, le=30.0)
    release: str = "spherex_dr1"
    pmra: Optional[float] = None   # mas/yr (incl. cos dec)
    pmdec: Optional[float] = None
    pos_epoch: float = 2000.0      # epoch of ra/dec (Julian year)
    strict: bool = False           # also mask contamination flags
    include_uploads: bool = True


@app.post("/api/field")
def create_field(req: FieldRequest):
    if not re.fullmatch(r"[A-Za-z0-9_+-]+", req.release):
        raise HTTPException(400, "bad release name")
    params = req.model_dump()
    params["ra"], params["dec"] = round(params["ra"], 6), round(params["dec"], 6)
    job = sx.start_field(params)
    return job.status()


@app.get("/api/field/{job_id}")
def field_status(job_id: str):
    job = sx.JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Field expired - please reload it")
    return job.status()


@app.get("/api/field/{job_id}/frames")
def field_frames(job_id: str, stack: str = "all"):
    """Per-epoch co-adds. stack = all | D1..D6 | wl:<min_um>:<max_um>"""
    job = job_or_404(job_id)
    if not re.fullmatch(r"all|D[1-6]|wl:[0-9.]+:[0-9.]+", stack):
        raise HTTPException(400, "bad stack")
    frames = sx.epoch_frames(job, stack)
    return {
        "n": job.n, "stack": stack,
        "frames": [{"epoch": f["epoch"], "n_used": f["n_used"], "image": b64(f["image"]),
                    "coverage_max": int(f["count"].max())} for f in frames],
    }


@app.get("/api/field/{job_id}/exposure")
def field_exposure(job_id: str, did: str):
    job = job_or_404(job_id)
    e = sx.single_frame(job, did)
    if not e:
        raise HTTPException(404, "exposure not found")
    return {"n": job.n, "meta": e.meta(job.n), "image": b64(e.signal),
            "wavelength": b64(e.wl), "flags": base64.b64encode(e.flags.astype(np.int32).tobytes()).decode()}


@app.get("/api/field/{job_id}/spectrum")
def field_spectrum(job_id: str, ra: float, dec: float, radius_arcsec: float = Query(12.3, ge=3, le=120),
                   pmra: Optional[float] = None, pmdec: Optional[float] = None, pos_epoch: float = 2000.0):
    job = job_or_404(job_id)
    pts, skipped = sx.aperture_spectrum(job, ra, dec, radius_arcsec, pmra, pmdec, pos_epoch)
    return {"ra": ra, "dec": dec, "radius_arcsec": radius_arcsec, "tracked": pmra is not None,
            "points": pts, "skipped_masked": skipped, "unit": "uJy",
            "note": "Aperture photometry on zodi-subtracted SPHEREx L2 images with local-annulus "
                    "background; not aperture-corrected (SPHEREx PSF FWHM ~ 1-2 pixels)."}


# ------------------------------------------------------------------ catalogs/names

@app.get("/api/resolve")
def resolve(name: str):
    try:
        return catalogs.resolve(name.strip())
    except LookupError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(502, f"Name resolver unavailable: {e}")


@app.get("/api/catalog")
def catalog(ra: float, dec: float, radius_arcmin: float = Query(3.0, ge=0.2, le=25)):
    rdeg = radius_arcmin / 60.0
    out = {"gaia": [], "catwise": [], "errors": {}}
    try:
        out["gaia"] = catalogs.gaia_cone(round(ra, 5), round(dec, 5), round(rdeg, 5))
    except Exception as e:
        out["errors"]["gaia"] = str(e)[:200]
    try:
        out["catwise"] = catalogs.catwise_cone(round(ra, 5), round(dec, 5), round(rdeg, 5))
    except Exception as e:
        out["errors"]["catwise"] = str(e)[:200]
    if out["catwise"]:
        truncated = len(out["gaia"]) >= 50000 or "gaia" in out["errors"]
        if truncated:
            out["errors"]["crossmatch"] = "Gaia list incomplete - infrared-only flags disabled for this field"
        catalogs.crossmatch(out["gaia"], out["catwise"], gaia_truncated=truncated)
    return out


# Serve the built frontend when present (production: `npm run build` then run this API).
_dist = Path(__file__).resolve().parent.parent / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="web")
