"""Deterministic, patient-specific Home dashboard."""
from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from documents import list_profile_documents
from medicine_evidence import evidence_for_medicine
from models_db import Account, Profile, TimelineEntry
from schemas import DashboardOut, MedicineOut, TimelineEntryOut
from security import get_current_account

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _latest(entries: list[TimelineEntry], kind: str) -> TimelineEntry | None:
    return next((entry for entry in entries if entry.kind == kind), None)


@router.get("/{profile_id}", response_model=DashboardOut)
def get_dashboard(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> DashboardOut:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")

    entries = sorted(profile.timeline, key=lambda entry: entry.created_at, reverse=True)
    documents = list_profile_documents(profile)
    counts = dict(Counter(document.document_type for document in documents))
    triage = _latest(entries, "triage")
    lab = _latest(entries, "lab")

    latest_triage = None
    if triage:
        latest_triage = {
            "level": triage.level,
            "title": triage.title,
            "date": triage.created_at.isoformat(),
        }
    latest_lab = None
    if lab:
        latest_lab = {
            "title": lab.title,
            "flagged_count": len((lab.payload or {}).get("flagged", [])),
            "date": lab.created_at.isoformat(),
        }

    condition_count = len(profile.chronic_conditions or [])
    allergy_count = len(profile.allergies or [])
    medicine_count = len(profile.medicines)
    summary_urdu = (
        f"یہ {profile.display_name} کا ذاتی صحت ریکارڈ ہے۔ "
        f"اس میں {len(documents)} دستاویزات، {medicine_count} تصدیق شدہ ادویات، "
        f"{condition_count} درج دائمی کیفیات اور {allergy_count} الرجیز ہیں۔"
    )
    summary_english = (
        f"This is {profile.display_name}'s private health record: {len(documents)} "
        f"documents, {medicine_count} confirmed medicines, {condition_count} recorded "
        f"chronic conditions, and {allergy_count} allergies."
    )

    return DashboardOut(
        profile_id=profile.id,
        patient_name=profile.display_name,
        relation=profile.relation,
        age=profile.age,
        gender=profile.gender,
        blood_group=profile.blood_group,
        profile_notes=profile.notes,
        chronic_conditions=list(profile.chronic_conditions or []),
        allergies=list(profile.allergies or []),
        current_medicines=[MedicineOut.model_validate(med) for med in profile.medicines],
        medicine_evidence=[
            evidence_for_medicine(medicine)
            for medicine in profile.medicines
            if medicine.source == "prescription"
        ],
        document_counts=counts,
        document_total=len(documents),
        latest_triage=latest_triage,
        latest_lab=latest_lab,
        recent_documents=documents[:3],
        recent_activity=[TimelineEntryOut.model_validate(entry) for entry in entries[:5]],
        summary_urdu=summary_urdu,
        summary_english=summary_english,
    )
