"""Authenticated mock-only demo record seeding.

The endpoint creates a realistic, clearly synthetic longitudinal Vault for a
selected profile. It is unavailable in real mode and idempotent per profile.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Medicine, Profile, TimelineEntry
from security import get_current_account
from storage import store_upload
from triage import is_mock_mode

router = APIRouter(prefix="/api/demo", tags=["demo"])
DEMO_VERSION = "hassan-v1"

_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6300010000050001a5f645400000000049454e44ae4260"
    "82"
)


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

    now = datetime.now(timezone.utc)
    lab_ref = store_upload(profile.id, _PNG, "hassan_cbc_demo.png", "demo_lab")
    rx_ref = store_upload(profile.id, _PNG, "hassan_confirmed_rx_demo.png", "demo_rx")
    xray_ref = store_upload(profile.id, _PNG, "hassan_chest_xray_demo.png", "demo_xray")
    skin_ref = store_upload(profile.id, _PNG, "hassan_skin_progress_demo.png", "demo_skin")

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
                "size_bytes": len(_PNG),
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
                "size_bytes": len(_PNG),
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
                "size_bytes": len(_PNG),
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
                "size_bytes": len(_PNG),
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
