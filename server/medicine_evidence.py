"""WHO reference cards for clinician-confirmed Vault medicines only.

This module never selects a drug for a symptom. It annotates an existing
clinician-prescribed medicine with source context from the current WHO Model
List of Essential Medicines.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Medicine, Profile
from schemas import MedicineEvidenceOut
from security import get_current_account

router = APIRouter(prefix="/api/medicine-evidence", tags=["medicine-evidence"])

WHO_2025_EML_TITLE = "WHO Model List of Essential Medicines — 24th list (2025)"
WHO_2025_EML_URL = "https://www.who.int/publications/i/item/B09474"

_WHO_REFERENCES = {
    "cetirizine": {
        "status": "WHO 2025 EML therapeutic alternative",
        "summary": (
            "The WHO 2025 Model List includes cetirizine as a therapeutic "
            "alternative to loratadine in the antiallergics section. This is "
            "population-level essential-medicine context, not a recommendation "
            "for the current symptom."
        ),
        "url": "https://list.essentialmeds.org/medicines/633",
    },
}


def _normalized(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower())


def evidence_for_medicine(medicine: Medicine) -> MedicineEvidenceOut:
    key = _normalized(medicine.name)
    reference = next(
        (value for name, value in _WHO_REFERENCES.items() if key.startswith(name)), None
    )
    details = " ".join(
        value for value in [medicine.strength, medicine.frequency, medicine.duration] if value
    )
    if reference:
        return MedicineEvidenceOut(
            medicine_id=medicine.id,
            medicine_name=medicine.name,
            recorded_details=details,
            source_status=reference["status"],
            evidence_summary=reference["summary"],
            who_source_title=WHO_2025_EML_TITLE,
            who_source_url=reference["url"],
            safety_note=(
                "Continue, stop, or change this medicine only according to the "
                "prescribing clinician or pharmacist; Nabz has not selected it."
            ),
        )
    return MedicineEvidenceOut(
        medicine_id=medicine.id,
        medicine_name=medicine.name,
        recorded_details=details,
        source_status="No curated WHO match shown",
        evidence_summary=(
            "Nabz has not verified a medicine-specific WHO entry for this "
            "recorded name. This does not mean the medicine is ineffective or unsafe."
        ),
        who_source_title=WHO_2025_EML_TITLE,
        who_source_url=WHO_2025_EML_URL,
        safety_note=(
            "This is a record of a clinician prescription, not a Nabz recommendation. "
            "Ask the prescriber or pharmacist before making any change."
        ),
    )


@router.get("/{profile_id}", response_model=list[MedicineEvidenceOut])
def get_medicine_evidence(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[MedicineEvidenceOut]:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return [
        evidence_for_medicine(medicine)
        for medicine in profile.medicines
        if medicine.source == "prescription"
    ]
