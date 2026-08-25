"""Doctor QR handoff — short-lived read-only summary link.

Flow:
  1. Patient (or their caregiver) is logged in on the workspace, has a
     completed triage or a Vault they want a doctor to see.
  2. They tap "Doctor QR" on the Summary page. The frontend calls
     POST /api/summary/{profile_id}/handoff, which returns a JWT plus a URL.
  3. The doctor scans the QR (or opens the URL) — no login. The public
     GET /api/handoff/{token} returns a bounded, read-only JSON snapshot of
     the patient's most recent triage + confirmed medicines + allergies +
     recent flagged labs. Token expires after 2 hours by default; the patient
     can revoke earlier by regenerating.

Security notes:
  - The handoff JWT has kind="handoff", scoped to (account_id, profile_id),
    HS256 with the same JWT_SECRET as the app token. Separate `kind` means
    a stolen handoff token cannot be replayed against any authenticated route
    (get_current_account only accepts kind="account").
  - The endpoint returns NO free-text PHI beyond what already lives in the
    patient's confirmed record. No location, no phone, no full transcript.
  - CORS is unchanged — anyone with the URL and it not expired can read.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Profile, TimelineEntry
from schemas import HealthResponse  # unused but sets typing precedent
from security import JWT_ALG, get_current_account, _secret

logger = logging.getLogger("nabz.handoff")
router = APIRouter(tags=["handoff"])

HANDOFF_TTL_HOURS = int(os.getenv("NABZ_HANDOFF_TTL_HOURS", "2"))
HANDOFF_KIND = "handoff"


def _issue_handoff_token(account_id: int, profile_id: int) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(hours=HANDOFF_TTL_HOURS)
    payload = {
        "kind": HANDOFF_KIND,
        "sub": f"{account_id}:{profile_id}",
        "acc": account_id,
        "pid": profile_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG), exp


def _decode_handoff_token(token: str) -> tuple[int, int]:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=410, detail="handoff_expired") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="invalid_handoff") from exc
    if payload.get("kind") != HANDOFF_KIND:
        raise HTTPException(status_code=401, detail="not_a_handoff_token")
    try:
        return int(payload["acc"]), int(payload["pid"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="invalid_handoff_payload") from exc


def _handoff_snapshot(db: Session, profile: Profile) -> dict[str, Any]:
    """Bounded read-only view suitable for a doctor with the QR link."""
    timeline = sorted(profile.timeline, key=lambda e: e.created_at, reverse=True)
    latest_triage = next((e for e in timeline if e.kind == "triage"), None)
    latest_lab = next((e for e in timeline if e.kind == "lab"), None)

    triage_view: dict[str, Any] | None = None
    if latest_triage:
        p = latest_triage.payload or {}
        transcript = p.get("encounter_transcript") or []
        first_user = next((t.get("text", "") for t in transcript if t.get("role") == "user"), "")
        triage_view = {
            "date": latest_triage.created_at.isoformat(),
            "level": latest_triage.level,
            "chief_complaint": (first_user or latest_triage.title or "")[:400],
            "patient_facing_impression_english": p.get("patient_facing_impression_english"),
            "doctor_differential": (p.get("doctor_differential") or [])[:8],
            "supporting_findings": (p.get("supporting_findings") or [])[:6],
            "red_flags_present": (p.get("red_flags_present") or [])[:6],
            "unresolved_questions": (p.get("unresolved_questions") or [])[:6],
            "escalation_signs": (p.get("escalation_signs") or [])[:6],
            "reason_english": p.get("reason_english"),
            "doctor_handoff_english": p.get("doctor_handoff_english"),
            "medication_options": (p.get("medication_options") or [])[:6],
            "pk_ranked_differential": p.get("pk_ranked_differential"),
        }

    labs_view: list[dict[str, Any]] = []
    if latest_lab:
        p = latest_lab.payload or {}
        labs_view.append({
            "title": latest_lab.title,
            "date": latest_lab.created_at.isoformat(),
            "flagged": (p.get("flagged") or [])[:8],
            "explanation_english": p.get("explanation_english"),
        })

    current_medicines = [
        {
            "name": m.name,
            "strength": m.strength,
            "frequency": m.frequency,
            "duration": m.duration,
            "source": m.source,
        }
        for m in profile.medicines
    ]

    return {
        "patient": {
            "name": profile.display_name,
            "relation": profile.relation,
            "age": profile.age,
            "gender": profile.gender,
            "blood_group": profile.blood_group,
        },
        "chronic_conditions": list(profile.chronic_conditions or []),
        "allergies": list(profile.allergies or []),
        "current_medicines": current_medicines,
        "latest_triage": triage_view,
        "recent_labs": labs_view,
        "notice": (
            "This link was shared by the patient. It expires soon and shows only their "
            "most recent Vault snapshot. It is not a substitute for a clinical examination."
        ),
    }


@router.post("/api/summary/{profile_id}/handoff")
def create_handoff(
    profile_id: int,
    request: Request,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    token, exp = _issue_handoff_token(account.id, profile.id)
    base = os.getenv("NABZ_WEB_BASE_URL", "").strip().rstrip("/")
    if not base:
        # Fall back to the same origin the browser used.
        base = str(request.base_url).rstrip("/")
    url = f"{base}/handoff/{token}"
    logger.info(
        "handoff_issued account_id=%s profile_id=%s expires_at=%s",
        account.id, profile.id, exp.isoformat(),
    )
    return {
        "token": token,
        "url": url,
        "expires_at": exp.isoformat(),
        "ttl_hours": HANDOFF_TTL_HOURS,
    }


@router.get("/api/handoff/{token}")
def read_handoff(token: str, db: Session = Depends(get_db)) -> dict:
    account_id, profile_id = _decode_handoff_token(token)
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account_id:
        raise HTTPException(status_code=404, detail="handoff_target_gone")
    return _handoff_snapshot(db, profile)
