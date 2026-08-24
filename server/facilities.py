"""Facility service — /api/facilities/nearby.

Given the account's current coordinates (or the coarse city center of a
manually-picked location) and an urgency level, rank facilities by:

  score = severity_fit + facility_type_fit + distance_score + verified_bonus
        + emergency_capability_bonus

The dataset here is the curated + demo layer (the winning plan's three-layer
strategy). If a MAPS_PROVIDER env var is set later, a live-provider fetch can
be added without changing the response schema.
"""
from __future__ import annotations

import logging
import urllib.parse
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import get_db
from facilities_data import ALL_FACILITIES, CITY_CENTERS, FACILITIES
from location import _haversine_km  # small helper, re-used
from models_db import Account, LocationPreference
from schemas import (
    Facility,
    LocationLabel,
    NearbyFacilitiesResponse,
    TriageLevel,
)
from security import get_current_account

logger = logging.getLogger("nabz.facilities")
router = APIRouter(prefix="/api/facilities", tags=["facilities"])


def _directions_url(lat: float | None, lon: float | None, name: str, city: str) -> str:
    if lat is not None and lon is not None:
        return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lon}"
    q = urllib.parse.quote_plus(f"{name} {city}")
    return f"https://www.google.com/maps/search/?api=1&query={q}"


def _score_facility(
    fac: dict, urgency: TriageLevel, dist_km: Optional[float]
) -> tuple[float, str]:
    """Return (score, reason)."""
    score = 0.0
    reason = "Nearby facility"

    if urgency == TriageLevel.EMERGENCY:
        if fac.get("emergency_capable"):
            score += 100
            reason = "Nearest emergency-capable hospital"
        else:
            score -= 20
            reason = "Not an emergency-capable facility"
    elif urgency == TriageLevel.DOCTOR_24H:
        if fac["type"] in {"clinic", "bhu"}:
            score += 30
            reason = "Nearby clinic / BHU"
        elif fac["type"] == "hospital":
            score += 20
            reason = "Nearby hospital"
    else:  # HOME_CARE
        if fac["type"] in {"pharmacy", "clinic"}:
            score += 10
            reason = "Nearby clinic / pharmacy if needed"
        else:
            score += 5

    if dist_km is not None:
        # Closer = higher score. Cap so a very close inappropriate facility
        # doesn't outrank a slightly farther appropriate one.
        distance_score = max(0.0, 40.0 - min(dist_km, 40.0))
        score += distance_score
        if dist_km <= 2:
            reason = f"{reason} — {dist_km:.1f} km away"
        elif dist_km <= 15:
            reason = f"{reason} — {dist_km:.0f} km away"

    if fac.get("phone"):
        score += 2  # verified contact bonus

    return score, reason


def _origin_from_pref(pref: LocationPreference | None) -> tuple[float, float, str] | None:
    """Return (lat, lon, source) from the stored preference (or None)."""
    if not pref:
        return None
    if pref.latitude is not None and pref.longitude is not None:
        return (pref.latitude, pref.longitude, "coords")
    # Manual city → coarse city center
    if pref.city:
        c = CITY_CENTERS.get(pref.city.strip().lower())
        if c:
            return (c[0], c[1], "city-center")
    return None


@router.get("/nearby", response_model=NearbyFacilitiesResponse)
def nearby(
    urgency: TriageLevel = Query(TriageLevel.DOCTOR_24H),
    latitude: Optional[float] = Query(default=None, ge=-90, le=90),
    longitude: Optional[float] = Query(default=None, ge=-180, le=180),
    limit: int = Query(default=6, ge=1, le=20),
    type: Optional[str] = Query(default=None, description="Filter: hospital | clinic | bhu | blood_bank"),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> NearbyFacilitiesResponse:
    pref = (
        db.query(LocationPreference)
        .filter(LocationPreference.account_id == account.id)
        .first()
    )

    origin: tuple[float, float, str] | None
    if latitude is not None and longitude is not None:
        origin = (latitude, longitude, "coords")
    else:
        origin = _origin_from_pref(pref)

    if origin is None and not pref:
        raise HTTPException(status_code=400, detail="no_location_available")

    # Choose source dataset. Blood banks are the only "type" that pulls from
    # ALL_FACILITIES (which includes them); otherwise the clinical set only.
    if type and type.strip().lower() == "blood_bank":
        source_dataset = [f for f in ALL_FACILITIES if f["type"] == "blood_bank"]
    elif type:
        wanted = type.strip().lower()
        source_dataset = [f for f in ALL_FACILITIES if f["type"] == wanted]
    else:
        source_dataset = FACILITIES

    if origin is None:
        # No coordinates and no city center match → return unranked list but keep
        # the response usable so the UI can still render something meaningful.
        facilities = [
            Facility(
                id=f["id"],
                name=f["name"],
                type=f["type"],
                area=f["area"],
                city=f["city"],
                province=f.get("province"),
                phone=f.get("phone"),
                latitude=f.get("latitude"),
                longitude=f.get("longitude"),
                distance_km=None,
                directions_url=_directions_url(
                    f.get("latitude"), f.get("longitude"), f["name"], f["city"]
                ),
                reason="Nearby facility",
                source="curated",
                emergency_capable=bool(f.get("emergency_capable")),
                hours=f.get("hours"),
            )
            for f in source_dataset[:limit]
        ]
        return NearbyFacilitiesResponse(
            location=LocationLabel(
                label=pref.label if pref else "Pakistan",
                city=pref.city if pref else None,
                province=pref.province if pref else None,
                source="manual" if (pref and pref.manual) else "curated",
            ),
            urgency=urgency,
            facilities=facilities,
            fresh=False,
        )

    olat, olon, _origin_kind = origin

    ranked = []
    for f in source_dataset:
        dist = None
        if f.get("latitude") is not None and f.get("longitude") is not None:
            dist = round(_haversine_km(olat, olon, f["latitude"], f["longitude"]), 1)
        score, reason = _score_facility(f, urgency, dist)
        ranked.append((score, dist, reason, f))

    ranked.sort(key=lambda t: (-t[0], t[1] if t[1] is not None else 999))
    top = ranked[:limit]

    facilities_out = [
        Facility(
            id=f["id"],
            name=f["name"],
            type=f["type"],
            area=f["area"],
            city=f["city"],
            province=f.get("province"),
            phone=f.get("phone"),
            latitude=f.get("latitude"),
            longitude=f.get("longitude"),
            distance_km=dist,
            directions_url=_directions_url(
                f.get("latitude"), f.get("longitude"), f["name"], f["city"]
            ),
            reason=reason,
            source="curated",
            emergency_capable=bool(f.get("emergency_capable")),
            hours=f.get("hours"),
        )
        for score, dist, reason, f in top
    ]

    label = LocationLabel(
        label=pref.label if pref else f"{olat:.3f}, {olon:.3f}",
        city=pref.city if pref else None,
        district=pref.district if pref else None,
        province=pref.province if pref else None,
        country="Pakistan",
        latitude=olat,
        longitude=olon,
        source="manual" if (pref and pref.manual) else "reverse-geocode",
    )

    return NearbyFacilitiesResponse(
        location=label, urgency=urgency, facilities=facilities_out, fresh=True
    )
