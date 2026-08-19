"""Prescription / medicine-paper extraction via Qwen-VL.

Reads a printed OR handwritten clinician-issued prescription and returns
STRUCTURED, per-field-confidence JSON for the user to CONFIRM before anything
is saved. It never invents a medicine or a dose. Extraction is document
reading — not prescribing.

Flow:
  POST /api/prescription          -> extract (multipart image + profile_id)
  POST /api/prescription/confirm  -> save reviewed medicines to the profile
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Medicine, Profile, TimelineEntry
from schemas import (
    ExtractedMedicine,
    PrescriptionConfirmRequest,
    PrescriptionOut,
)
from security import get_current_account
from triage import is_mock_mode
from vision import analyze_image

router = APIRouter(prefix="/api", tags=["prescription"])

SERVER_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = SERVER_DIR / "uploads"


_RX_SYSTEM_PROMPT = """\
You are a medical vision assistant reading a doctor's prescription for a
Pakistani patient. The prescription may be printed OR handwritten and messy.

Your job is ONLY to read and transcribe what is written. You MUST NOT invent,
guess, "correct", or complete any medicine, strength, frequency, or duration.
If a field is hard to read, lower its confidence. If the whole page is
illegible, set "unreadable": true and return an empty medicines list.

Return STRICT JSON only, no markdown:
{
  "date": "YYYY-MM-DD or best guess, else null",
  "doctor_name": "…or null…",
  "clinic": "…or null…",
  "medicines": [
    {
      "name": "as written",
      "strength": "e.g. 250 mg or null",
      "frequency": "e.g. 1+0+1 / three times a day / null",
      "duration": "e.g. 5 days / null",
      "notes": "e.g. after food / null",
      "confidence": 0.0-1.0
    }
  ],
  "unreadable": false,
  "raw_text": "everything you could read, verbatim"
}
Confidence must reflect legibility. Never output a medicine you are not
actually reading on the page.
"""


def _mock_prescription() -> dict[str, Any]:
    """Realistic 2-medicine extraction with one deliberately low-confidence field."""
    return {
        "date": "2026-08-14",
        "doctor_name": "Dr. A. Khan",
        "clinic": "Shifa Family Clinic, Peshawar",
        "medicines": [
            {
                "name": "Amoxicillin",
                "strength": "500 mg",
                "frequency": "1+0+1",
                "duration": "5 days",
                "notes": "After food",
                "confidence": 0.93,
            },
            {
                # Deliberately ambiguous handwriting — flagged low so the user
                # must check it on the confirmation screen.
                "name": "Paracetamol (?)",
                "strength": "500 mg",
                "frequency": "as needed for fever",
                "duration": "3 days",
                "notes": "if temperature > 100",
                "confidence": 0.42,
            },
        ],
        "unreadable": False,
        "raw_text": (
            "Dr. A. Khan — Shifa Family Clinic\n14/08/2026\n"
            "Amoxicillin 500mg 1+0+1 x5d after food\n"
            "Paracetamol 500mg SOS fever x3d"
        ),
    }


def _store_upload(profile_id: int, payload: bytes, filename: str) -> str:
    """Persist the original prescription image and return a stored reference.

    Keeping the source paper lets the user view the original later — important
    because we never trust extraction blindly.
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename or "rx.jpg").suffix or ".jpg"
    stored_name = f"rx_{profile_id}_{uuid.uuid4().hex}{suffix}"
    (UPLOAD_DIR / stored_name).write_bytes(payload)
    return f"uploads/{stored_name}"


def _to_out(profile_id: int, data: dict[str, Any], mock: bool) -> PrescriptionOut:
    meds: list[ExtractedMedicine] = []
    for m in data.get("medicines", []) or []:
        if not isinstance(m, dict):
            continue
        name = str(m.get("name", "")).strip()
        if not name:
            continue
        try:
            conf = float(m.get("confidence", 1.0))
        except (TypeError, ValueError):
            conf = 0.5
        meds.append(
            ExtractedMedicine(
                name=name,
                strength=(str(m["strength"]).strip() if m.get("strength") else None),
                frequency=(str(m["frequency"]).strip() if m.get("frequency") else None),
                duration=(str(m["duration"]).strip() if m.get("duration") else None),
                notes=(str(m["notes"]).strip() if m.get("notes") else None),
                confidence=max(0.0, min(1.0, conf)),
            )
        )
    out = PrescriptionOut(
        profile_id=profile_id,
        date=(str(data["date"]).strip() if data.get("date") else None),
        doctor_name=(str(data["doctor_name"]).strip() if data.get("doctor_name") else None),
        clinic=(str(data["clinic"]).strip() if data.get("clinic") else None),
        medicines=meds,
        unreadable=bool(data.get("unreadable", False)) or not meds,
        raw_text=str(data.get("raw_text", "")).strip(),
        mock=mock,
    )
    return out


def _owned_profile(db: Session, account: Account, profile_id: int) -> Profile:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return profile


@router.post("/prescription", response_model=PrescriptionOut)
async def extract_prescription(
    profile_id: int = Form(...),
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> PrescriptionOut:
    """Extract structured medicines from a prescription image for confirmation.

    Nothing is saved to the vault here — the frontend must call /confirm after
    the user reviews and edits the extracted fields.
    """
    profile = _owned_profile(db, account, profile_id)

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="empty_upload")

    image_ref = _store_upload(profile.id, payload, file.filename or "rx.jpg")

    if is_mock_mode():
        data = _mock_prescription()
        out = _to_out(profile.id, data, mock=True)
    else:
        user_prompt = (
            "Read this prescription and transcribe exactly what is written. "
            "Do not invent anything. Flag low-confidence fields."
        )
        data, _raw = analyze_image(
            payload, file.filename or "rx.jpg", _RX_SYSTEM_PROMPT, user_prompt
        )
        if not data:
            data = {
                "date": None,
                "doctor_name": None,
                "clinic": None,
                "medicines": [],
                "unreadable": True,
                "raw_text": "",
            }
        out = _to_out(profile.id, data, mock=False)

    # Record that a prescription image was captured (source of truth for the
    # "view original paper" feature). Confirmed medicines are added on /confirm.
    entry = TimelineEntry(
        profile_id=profile.id,
        kind="prescription",
        title="Prescription scanned",
        subtitle=out.clinic or out.doctor_name,
        payload={"extracted": out.model_dump(mode="json"), "image_ref": image_ref},
    )
    db.add(entry)
    db.commit()

    return out


@router.post("/prescription/confirm", response_model=list[dict])
def confirm_prescription(
    payload: PrescriptionConfirmRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Save user-reviewed medicines to the selected profile's vault + timeline.

    The vault is PATIENT-SPECIFIC: medicines attach only to this profile.
    """
    profile = _owned_profile(db, account, payload.profile_id)
    if not payload.medicines:
        raise HTTPException(status_code=400, detail="no_medicines_to_save")

    saved: list[Medicine] = []
    for m in payload.medicines:
        med = Medicine(
            profile_id=profile.id,
            name=m.name.strip(),
            strength=m.strength,
            frequency=m.frequency,
            duration=m.duration,
            notes=m.notes,
            source="prescription",
            prescription_date=payload.date,
        )
        db.add(med)
        saved.append(med)

    names = ", ".join(m.name for m in payload.medicines)
    entry = TimelineEntry(
        profile_id=profile.id,
        kind="prescription",
        title=f"Medicines added: {names[:160]}",
        subtitle=payload.clinic or payload.doctor_name,
        payload={
            "date": payload.date,
            "doctor_name": payload.doctor_name,
            "clinic": payload.clinic,
            "medicines": [m.model_dump() for m in payload.medicines],
        },
    )
    db.add(entry)
    db.commit()
    for med in saved:
        db.refresh(med)

    return [
        {
            "id": med.id,
            "name": med.name,
            "strength": med.strength,
            "frequency": med.frequency,
            "duration": med.duration,
            "notes": med.notes,
            "source": med.source,
            "prescription_date": med.prescription_date,
        }
        for med in saved
    ]
