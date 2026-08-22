"""Small, cached client for the official DailyMed v2 SPL service.

Only generic drug names leave Nabz. No patient, transcript, diagnosis, or
Vault data is ever sent to DailyMed. DailyMed supplies current label metadata;
it does not select a medicine or replace Nabz's allergy/urgency safety gates.
"""
from __future__ import annotations

import logging
import os
import re
from functools import lru_cache
from typing import Any

import httpx

logger = logging.getLogger("nabz.dailymed")

DAILYMED_SPLS_URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json"

# Last-known reviewed labels keep the UI useful during a short DailyMed outage.
# Production still attempts the live v2 service first. These are label
# references, not medication recommendations and not proof of FDA approval.
_REVIEWED_LABEL_CACHE: dict[str, dict[str, str | int]] = {
    "acetaminophen": {
        "setid": "1098d0e7-8202-4018-a2d2-b0c80ee58b56",
        "title": "ACETAMINOPHEN TABLET, FILM COATED [SAM'S WEST INC]",
        "spl_version": 3,
        "published_date": "Aug 20, 2026",
    },
    "cetirizine": {
        "setid": "4913192a-7364-3f19-e054-00144ff8d46c",
        "title": "CETIRIZINE HYDROCHLORIDE TABLET [NUCARE PHARMACEUTICALS, INC.]",
        "spl_version": 6,
        "published_date": "Aug 21, 2026",
    },
}


def _normalized_generic(name: str) -> str:
    value = re.sub(r"[^a-z]", "", (name or "").lower())
    return "acetaminophen" if value == "paracetamol" else value


def _label_score(item: dict[str, Any], generic: str) -> int:
    title = str(item.get("title") or "").upper()
    target = generic.upper()
    if not item.get("setid") or target not in title:
        return -1
    # Prefer a single-ingredient label whose title begins with the generic.
    score = 10
    if title.startswith(f"{target} "):
        score += 100
    if title.startswith(f"{target} ("):
        score += 80
    if f"({target})" in title or f"({target} HYDROCHLORIDE)" in title:
        score += 40
    # Combination titles commonly use comma-separated active ingredients.
    if title.startswith(f"{target},"):
        score -= 100
    if " TABLET" in title:
        score += 35
    if any(form in title for form in (" INJECTION", " INTRAVENOUS", " SUPPOSITORY")):
        score -= 80
    return score


def _as_label(item: dict[str, Any], generic: str, source_status: str) -> dict[str, Any]:
    setid = str(item.get("setid") or "").strip()
    return {
        "generic_name": generic,
        "setid": setid,
        "title": str(item.get("title") or "DailyMed drug label").strip()[:500],
        "spl_version": int(item.get("spl_version") or 0),
        "published_date": str(item.get("published_date") or "Unknown"),
        "source_url": f"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={setid}",
        "source_status": source_status,
    }


@lru_cache(maxsize=32)
def lookup_dailymed_label(generic_name: str) -> dict[str, Any] | None:
    """Return the best current human SPL label for an allowlisted generic.

    Results are process-cached. In MOCK_MODE no external request is made.
    """
    generic = _normalized_generic(generic_name)
    cached = _REVIEWED_LABEL_CACHE.get(generic)
    if not cached:
        return None

    mock_mode = os.getenv("MOCK_MODE", "").strip().lower() in {
        "1", "true", "yes", "on"
    }
    live_enabled = os.getenv("NABZ_DAILYMED_LIVE", "true").strip().lower() not in {
        "0", "false", "no", "off"
    }
    if live_enabled and not mock_mode:
        try:
            timeout = min(max(float(os.getenv("NABZ_DAILYMED_TIMEOUT_SECONDS", "4")), 1.0), 10.0)
            response = httpx.get(
                DAILYMED_SPLS_URL,
                params={
                    "drug_name": generic,
                    "name_type": "generic",
                    "pagesize": 10,
                    "page": 1,
                },
                timeout=timeout,
                follow_redirects=False,
                headers={"Accept": "application/json", "User-Agent": "Nabz/2.0"},
            )
            response.raise_for_status()
            payload = response.json()
            rows = payload.get("data") if isinstance(payload, dict) else None
            candidates = [item for item in (rows or []) if isinstance(item, dict)]
            chosen = max(candidates, key=lambda item: _label_score(item, generic), default=None)
            if chosen is not None and _label_score(chosen, generic) >= 50:
                return _as_label(chosen, generic, "live_dailymed")
        except Exception as exc:  # noqa: BLE001
            logger.warning("DailyMed lookup failed for %s: %s", generic, exc)

    return _as_label(cached, generic, "reviewed_cache")
