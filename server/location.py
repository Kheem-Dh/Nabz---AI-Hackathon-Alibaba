"""Location routes — reverse-geocode + persist the user's care location.

The winning plan (§3, §5) makes location a first-class first-run input. This
router owns:

  POST /api/location/resolve   lat/lon → human-readable label
  POST /api/location/confirm   persist LocationPreference
  GET  /api/location/me        current preference

Reverse-geocoding uses Nominatim (OpenStreetMap) when the network is reachable
and falls back to a coarse Pakistan-city lookup otherwise, so the endpoint
always answers — critical for a demo on flaky Wi-Fi.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from facilities_data import CITY_CENTERS
from models_db import Account, LocationPreference
from schemas import (
    LocationConfirmRequest,
    LocationLabel,
    LocationPreferenceOut,
    LocationResolveRequest,
)
from security import get_current_account

logger = logging.getLogger("nabz.location")
router = APIRouter(prefix="/api/location", tags=["location"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_TIMEOUT = 5.0
LOCATION_FRESH_MINUTES = 10


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def _offline_reverse(lat: float, lon: float) -> LocationLabel:
    """Guess the nearest known Pakistani city center from a coordinate."""
    if not CITY_CENTERS:
        return LocationLabel(
            label="Pakistan",
            city=None,
            province=None,
            country="Pakistan",
            latitude=lat,
            longitude=lon,
            source="curated",
        )
    best = min(
        CITY_CENTERS.items(),
        key=lambda kv: _haversine_km(lat, lon, kv[1][0], kv[1][1]),
    )
    city_name = best[0].title()
    return LocationLabel(
        label=f"{city_name}, Pakistan",
        city=city_name,
        province=None,
        country="Pakistan",
        latitude=lat,
        longitude=lon,
        source="curated",
    )


def _nominatim_reverse(lat: float, lon: float) -> LocationLabel | None:
    if os.getenv("NABZ_DISABLE_NOMINATIM", "").lower() in {"1", "true", "yes"}:
        return None
    try:
        resp = httpx.get(
            NOMINATIM_URL,
            params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 14, "addressdetails": 1},
            headers={"User-Agent": "Nabz/2.0 (hackathon)"},
            timeout=NOMINATIM_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.info("Nominatim unreachable, falling back to offline lookup: %s", exc)
        return None

    addr = data.get("address", {}) or {}
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("suburb")
    )
    district = addr.get("county") or addr.get("state_district")
    province = addr.get("state")
    country = addr.get("country")
    display = data.get("display_name") or ", ".join(
        p for p in [addr.get("suburb"), city, province, country] if p
    ) or "Location"

    return LocationLabel(
        label=display[:200],
        city=city,
        district=district,
        province=province,
        country=country,
        latitude=lat,
        longitude=lon,
        source="reverse-geocode",
    )


@router.post("/resolve", response_model=LocationLabel)
def resolve(
    payload: LocationResolveRequest,
    _account: Account = Depends(get_current_account),
) -> LocationLabel:
    label = _nominatim_reverse(payload.latitude, payload.longitude) or _offline_reverse(
        payload.latitude, payload.longitude
    )
    if payload.accuracy_m is not None:
        label = label.model_copy(update={"accuracy_m": payload.accuracy_m})
    return label


def _to_out(pref: LocationPreference) -> LocationPreferenceOut:
    now = datetime.now(timezone.utc)
    stamp = pref.last_confirmed_at
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    fresh = now - stamp <= timedelta(minutes=LOCATION_FRESH_MINUTES)
    return LocationPreferenceOut(
        label=pref.label,
        city=pref.city,
        district=pref.district,
        province=pref.province,
        latitude=pref.latitude,
        longitude=pref.longitude,
        permission_state=pref.permission_state,
        last_confirmed_at=pref.last_confirmed_at,
        fresh=fresh,
    )


@router.get("/cities", response_model=list[dict])
def list_known_cities() -> list[dict]:
    """Return the curated Pakistan city list used to validate manual entry."""
    out: list[dict] = []
    for slug, (lat, lon) in sorted(CITY_CENTERS.items()):
        out.append({
            "slug": slug,
            "name": slug.title(),
            "latitude": lat,
            "longitude": lon,
        })
    return out


@router.post("/confirm", response_model=LocationPreferenceOut)
def confirm(
    payload: LocationConfirmRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> LocationPreferenceOut:
    # Server-side validation for manual entries (winning-plan item #5): the
    # city MUST match a known Pakistan city. A GPS-confirmed entry (manual=false)
    # is trusted because reverse-geocode already produced the label.
    if payload.manual:
        if not payload.city or payload.city.strip().lower() not in CITY_CENTERS:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "unknown_city",
                    "message": "That city is not on our list. Use current location or pick from the list.",
                    "known_cities": [k.title() for k in sorted(CITY_CENTERS.keys())],
                },
            )

    pref = (
        db.query(LocationPreference)
        .filter(LocationPreference.account_id == account.id)
        .first()
    )
    if not pref:
        pref = LocationPreference(account_id=account.id, label=payload.label)
        db.add(pref)

    pref.label = payload.label
    pref.city = payload.city
    pref.district = payload.district
    pref.province = payload.province
    # If a manual city matches a known centre and no coords were provided,
    # fill from the city centre so /api/facilities/nearby has an origin.
    if payload.manual and payload.city and payload.latitude is None and payload.longitude is None:
        center = CITY_CENTERS.get(payload.city.strip().lower())
        if center:
            pref.latitude, pref.longitude = center
        else:
            pref.latitude = payload.latitude
            pref.longitude = payload.longitude
    else:
        pref.latitude = payload.latitude
        pref.longitude = payload.longitude
    pref.permission_state = "manual" if payload.manual else "granted"
    pref.last_confirmed_at = datetime.now(timezone.utc)
    pref.manual = payload.manual
    db.commit()
    db.refresh(pref)
    return _to_out(pref)


@router.get("/me", response_model=LocationPreferenceOut)
def current(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> LocationPreferenceOut:
    pref = (
        db.query(LocationPreference)
        .filter(LocationPreference.account_id == account.id)
        .first()
    )
    if not pref:
        raise HTTPException(status_code=404, detail="no_location_set")
    return _to_out(pref)
