"""External catalogs: CDS Sesame (name resolver), ESA Gaia DR3, IRSA CatWISE2020."""
from __future__ import annotations

import csv
import io
import math
import xml.etree.ElementTree as ET
from functools import lru_cache

from spherex import HTTP, with_retries

SESAME = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV"
GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
IRSA_SCS = "https://irsa.ipac.caltech.edu/SCS"

GAIA_EPOCH = 2016.0          # Gaia DR3 reference epoch
CATWISE_EPOCH_MJD = 57170.0  # CatWISE2020 ra_pm/dec_pm reference epoch (2015.4)


@lru_cache(maxsize=512)
def resolve(name: str) -> dict:
    r = with_retries(lambda: HTTP.get(SESAME + "?" + requests_quote(name), timeout=30, allow_redirects=True))
    r.raise_for_status()
    root = ET.fromstring(r.text)
    res = root.find(".//Resolver")
    if res is None or res.find("jradeg") is None:
        raise LookupError(f"Sesame could not resolve '{name}'")

    def t(tag):
        el = res.find(tag)
        return el.text.strip() if el is not None and el.text else None

    pm = res.find("pm")
    pmra = float(pm.find("pmRA").text) if pm is not None and pm.find("pmRA") is not None else None
    pmde = float(pm.find("pmDE").text) if pm is not None and pm.find("pmDE") is not None else None
    plx_el = res.find("plx/v")
    plx = float(plx_el.text) if plx_el is not None else None
    return {
        "query": name,
        "name": (t("oname") or name).replace("NAME ", "").replace("V* ", "").replace("* ", ""),
        "ra": float(t("jradeg")), "dec": float(t("jdedeg")),
        "pos_epoch": 2000.0,  # SIMBAD positions are ICRS at epoch J2000
        "pmra": pmra, "pmdec": pmde, "parallax_mas": plx,
        "distance_pc": round(1000.0 / plx, 3) if plx and plx > 0 else None,
        "otype": t("otype"), "sptype": t("spType"), "pos_ref": t("refPos"),
        "resolver": res.get("name", "Sesame"),
    }


def requests_quote(s: str) -> str:
    from urllib.parse import quote
    return quote(s)


@lru_cache(maxsize=128)
def gaia_cone(ra: float, dec: float, radius_deg: float, limit: int = 50000) -> list[dict]:
    q = (f"SELECT TOP {limit} source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, "
         f"phot_bp_mean_mag, phot_rp_mean_mag FROM gaiadr3.gaia_source "
         f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra},{dec},{radius_deg})) "
         f"ORDER BY phot_g_mean_mag ASC")
    r = with_retries(lambda: HTTP.get(GAIA_TAP, params={"REQUEST": "doQuery", "LANG": "ADQL",
                                                         "FORMAT": "csv", "QUERY": q}, timeout=90), tries=2)
    r.raise_for_status()
    out = []
    for row in csv.DictReader(io.StringIO(r.text)):
        f = lambda k: float(row[k]) if row.get(k) not in (None, "") else None  # noqa: E731
        out.append({"id": f"Gaia DR3 {row['source_id']}", "ra": f("ra"), "dec": f("dec"),
                    "pmra": f("pmra"), "pmdec": f("pmdec"), "parallax": f("parallax"),
                    "g": f("phot_g_mean_mag"), "bp": f("phot_bp_mean_mag"), "rp": f("phot_rp_mean_mag"),
                    "epoch": GAIA_EPOCH})
    return out


@lru_cache(maxsize=128)
def catwise_cone(ra: float, dec: float, radius_deg: float) -> list[dict]:
    r = with_retries(lambda: HTTP.get(IRSA_SCS, params={"table": "catwise_2020", "RA": ra, "DEC": dec,
                                                         "SR": radius_deg, "FORMAT": "csv"}, timeout=90))
    r.raise_for_status()
    out = []
    for row in csv.DictReader(io.StringIO(r.text)):
        f = lambda k: float(row[k]) if row.get(k) not in (None, "") else None  # noqa: E731
        pmra, pmdec = f("pmra"), f("pmdec")
        spmra, spmdec = f("sigpmra"), f("sigpmdec")
        out.append({
            "id": f"CatWISE {row['source_name']}", "ra": f("ra_pm"), "dec": f("dec_pm"),
            # CatWISE2020 proper motions are in arcsec/yr -> convert to mas/yr
            "pmra": pmra * 1000 if pmra is not None else None,
            "pmdec": pmdec * 1000 if pmdec is not None else None,
            "pm_err": math.hypot(spmra or 0, spmdec or 0) * 1000 if spmra is not None else None,
            "w1": f("w1mpro"), "w2": f("w2mpro"),
            "w2snr": f("w2snr_pm"),
            # clean = single blend component, no artifact (ab_flags) or contamination (cc_flags) flags
            "clean": row.get("nb") == "1" and row.get("ab_flags", "00").strip() in ("00", "")
                     and row.get("cc_flags", "0000").strip() in ("0000", ""),
            "epoch": 2015.4, "epoch_mjd": CATWISE_EPOCH_MJD,
        })
    return out


def _sep_arcsec(r1, d1, r2, d2):
    dra = ((r1 - r2 + 540) % 360 - 180) * math.cos(math.radians(0.5 * (d1 + d2)))
    return math.hypot(dra, d1 - d2) * 3600.0


def crossmatch(gaia: list[dict], wise: list[dict], radius_arcsec: float = 3.0, gaia_truncated: bool = False):
    """Flag CatWISE sources without a Gaia DR3 counterpart (both brought to epoch 2015.4)."""
    from spherex import propagate
    g2015 = []
    for g in gaia:
        if g["pmra"] is not None:
            r, d = propagate(g["ra"], g["dec"], g["pmra"], g["pmdec"], GAIA_EPOCH, 2015.4)
        else:
            r, d = g["ra"], g["dec"]
        g2015.append((r, d))
    # very bright stars produce halo/spike artifacts with spurious CatWISE motions
    bright = [(r, d, g["g"]) for (r, d), g in zip(g2015, gaia) if g["g"] is not None and g["g"] < 12]
    for w in wise:
        w["near_bright_star"] = any(
            _sep_arcsec(w["ra"], w["dec"], r, d) < (200.0 if gm < 9 else 60.0) for r, d, gm in bright)
        best = min((_sep_arcsec(w["ra"], w["dec"], r, d) for r, d in g2015), default=999.0)
        w["gaia_sep_arcsec"] = round(best, 2) if best < 999 else None
        w["no_gaia"] = best > radius_arcsec
        pm = math.hypot(w["pmra"] or 0, w["pmdec"] or 0)
        w["pm_total"] = round(pm, 1)
        sig = w.get("pm_err") or 1e9
        # significant motion: >5 sigma and >100 mas/yr, measured on a clean, well-detected source
        w["significant_pm"] = pm > 100 and pm > 5 * sig
        w["ir_only_mover_candidate"] = (w["no_gaia"] and w["significant_pm"] and w.get("clean", False)
                                        and (w.get("w2snr") or 0) >= 10 and not gaia_truncated
                                        and not w["near_bright_star"])
    return wise


