"""Authenticated mock-only demo record seeding.

The endpoint creates a realistic, clearly synthetic longitudinal Vault for a
selected profile. It is unavailable in real mode and idempotent per profile.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from demo_fixtures import build_hassan_fixtures
from models_db import Account, Medicine, Profile, TimelineEntry
from security import get_current_account
from storage import store_upload
from triage import is_mock_mode

router = APIRouter(prefix="/api/demo", tags=["demo"])
DEMO_VERSION = "hassan-v2-readable"
HASSAN_PROFILE_NAME = "Hassan"
HASSAN_RELATION = "Demo patient"


def seed_profile(profile: Profile, db: Session) -> bool:
    if any((entry.payload or {}).get("demo_seed") == DEMO_VERSION for entry in profile.timeline):
        return False

    profile.age = profile.age if profile.age is not None else 34
    profile.gender = profile.gender or "Male"
    profile.blood_group = profile.blood_group or "B+"
    profile.chronic_conditions = list(
        dict.fromkeys([*(profile.chronic_conditions or []), "Seasonal asthma", "Migraine history"])
    )
    profile.allergies = list(
        dict.fromkeys([*(profile.allergies or []), "Ibuprofen — reported rash"])
    )
    profile.notes = profile.notes or (
        "Seasonal breathing symptoms are worse with dust. Previous right-arm "
        "redness settled without admission. No surgery recorded."
    )

    fixtures = build_hassan_fixtures()
    now = datetime.now(timezone.utc)
    lab_bytes = fixtures["hassan_cbc_demo.png"]
    rx_bytes = fixtures["hassan_confirmed_rx_demo.png"]
    xray_bytes = fixtures["hassan_chest_xray_demo.png"]
    skin_bytes = fixtures["hassan_skin_progress_demo.png"]
    lab_ref = store_upload(profile.id, lab_bytes, "hassan_cbc_demo.png", "demo_lab")
    rx_ref = store_upload(profile.id, rx_bytes, "hassan_confirmed_rx_demo.png", "demo_rx")
    xray_ref = store_upload(profile.id, xray_bytes, "hassan_chest_xray_demo.png", "demo_xray")
    skin_ref = store_upload(profile.id, skin_bytes, "hassan_skin_progress_demo.png", "demo_skin")

    lab_size = len(lab_bytes)
    rx_size = len(rx_bytes)
    xray_size = len(xray_bytes)
    skin_size = len(skin_bytes)

    medicine = Medicine(
        profile_id=profile.id,
        name="Cetirizine",
        strength="10 mg",
        frequency="Once nightly",
        duration="7 days",
        notes="Transcribed from demo clinician prescription; not recommended by Nabz.",
        source="prescription",
        prescription_date=(now - timedelta(days=12)).date().isoformat(),
    )
    db.add(medicine)

    common = {"demo_seed": DEMO_VERSION, "synthetic": True}
    entries = [
        TimelineEntry(
            profile_id=profile.id,
            kind="lab",
            title="Complete Blood Count — demo",
            subtitle="Karachi Community Lab",
            created_at=now - timedelta(days=18),
            payload={
                **common,
                "report_title": "Complete Blood Count",
                "report_date": (now - timedelta(days=18)).date().isoformat(),
                "flagged": [
                    {
                        "name": "Haemoglobin",
                        "value": "11.2",
                        "unit": "g/dL",
                        "normal_range": "13–17",
                        "flag": "low",
                    }
                ],
                "explanation_english": "One value is below the printed reference range; discuss it with a clinician.",
                "image_ref": lab_ref,
                "original_filename": "hassan_cbc_demo.png",
                "content_type": "image/png",
                "size_bytes": lab_size,
            },
        ),
        TimelineEntry(
            profile_id=profile.id,
            kind="prescription",
            title="Clinician-confirmed prescription — demo",
            subtitle="Dr Sara Khan · Family Clinic",
            created_at=now - timedelta(days=12),
            payload={
                **common,
                "date": (now - timedelta(days=12)).date().isoformat(),
                "doctor_name": "Dr Sara Khan",
                "clinic": "Family Clinic",
                "medicines": [
                    {
                        "name": "Cetirizine",
                        "strength": "10 mg",
                        "frequency": "Once nightly",
                        "duration": "7 days",
                    }
                ],
                "image_ref": rx_ref,
                "original_filename": "hassan_confirmed_rx_demo.png",
                "content_type": "image/png",
                "size_bytes": rx_size,
            },
        ),
        TimelineEntry(
            profile_id=profile.id,
            kind="document",
            title="Chest X-ray — previous clinic visit (demo)",
            subtitle="X-ray",
            created_at=now - timedelta(days=42),
            payload={
                **common,
                "document_type": "xray",
                "stored_ref": xray_ref,
                "original_filename": "hassan_chest_xray_demo.png",
                "content_type": "image/png",
                "size_bytes": xray_size,
                "notes": "Synthetic demo record; no imaging interpretation by Nabz.",
            },
        ),
        TimelineEntry(
            profile_id=profile.id,
            kind="document",
            title="Right-arm skin progress photo (demo)",
            subtitle="Skin photo",
            created_at=now - timedelta(days=3),
            payload={
                **common,
                "document_type": "skin",
                "stored_ref": skin_ref,
                "original_filename": "hassan_skin_progress_demo.png",
                "content_type": "image/png",
                "size_bytes": skin_size,
                "notes": "Patient-recorded progress photo; Nabz does not diagnose from this image.",
            },
        ),
        TimelineEntry(
            profile_id=profile.id,
            kind="triage",
            title="Seasonal cough reviewed (demo)",
            subtitle="No emergency red flags were reported.",
            level="HOME_CARE",
            created_at=now - timedelta(days=65),
            payload={**common, "reason_english": "Synthetic prior urgency record."},
        ),
    ]
    db.add_all(entries)
    db.commit()
    return True


@router.post("/seed/{profile_id}")
def seed_demo_profile(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if not is_mock_mode():
        raise HTTPException(status_code=404, detail="not_found")
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    seeded = seed_profile(profile, db)
    return {"profile_id": profile.id, "seeded": seeded, "demo_version": DEMO_VERSION}


@router.post("/hassan")
def load_hassan(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """One-click: create the Hassan profile if missing, seed it, return the id.

    Mock-mode only. Idempotent — safe to call repeatedly. Each account gets
    its own Hassan profile; nothing crosses accounts.
    """
    if not is_mock_mode():
        raise HTTPException(status_code=404, detail="not_found")

    profile = (
        db.query(Profile)
        .filter(
            Profile.account_id == account.id,
            Profile.display_name == HASSAN_PROFILE_NAME,
            Profile.relation == HASSAN_RELATION,
        )
        .first()
    )
    if profile is None:
        profile = Profile(
            account_id=account.id,
            display_name=HASSAN_PROFILE_NAME,
            relation=HASSAN_RELATION,
            age=34,
            gender="Male",
            blood_group="B+",
            chronic_conditions=[],
            allergies=[],
            is_self=False,
        )
        db.add(profile)
        db.flush()

    seeded = seed_profile(profile, db)
    db.refresh(profile)
    return {
        "profile_id": profile.id,
        "display_name": profile.display_name,
        "seeded": seeded,
        "demo_version": DEMO_VERSION,
    }
