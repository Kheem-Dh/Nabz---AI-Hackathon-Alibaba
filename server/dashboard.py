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
        p = triage.payload or {}
        latest_triage = {
            "level": triage.level,
            "title": triage.title,
            "subtitle": triage.subtitle,
            "date": triage.created_at.isoformat(),
            # Doctor-facing details (winning-plan CORE CHANGE 8).
            "patient_facing_impression_english": p.get("patient_facing_impression_english"),
            "doctor_differential": p.get("doctor_differential", []) or [],
            "supporting_findings": p.get("supporting_findings", []) or [],
            "findings_against": p.get("findings_against", []) or [],
            "unresolved_questions": p.get("unresolved_questions", []) or [],
            "red_flags_present": p.get("red_flags_present", []) or [],
            "red_flags_denied": p.get("red_flags_denied", []) or [],
            "escalation_signs": p.get("escalation_signs", []) or [],
            "medication_options": p.get("medication_options", []) or [],
            "vault_context_used": p.get("vault_context_used", []) or [],
            "clinical_state": p.get("clinical_state"),
            "encounter_transcript": p.get("encounter_transcript", []) or [],
            "reason_english": p.get("reason_english"),
            "doctor_handoff_english": p.get("doctor_handoff_english"),
            "advice_english": p.get("advice_english"),
            "mock": bool(p.get("mock")),
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
        date_of_birth=profile.date_of_birth,
        weight_kg=profile.weight_kg,
        bp_systolic=profile.bp_systolic,
        bp_diastolic=profile.bp_diastolic,
        bp_recorded_at=profile.bp_recorded_at,
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
