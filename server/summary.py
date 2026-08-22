"""Doctor handoff summary.

GET /api/summary/{profile_id} builds a concise ENGLISH clinical summary from a
profile's stored data — basics, chief complaint from the latest triage, history,
current medicines, allergies, and recent labs. It is deterministic (no AI call
needed): the data already lives in the vault. The goal is to make a clinician's
limited time more effective — it does not replace the doctor.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from documents import list_profile_documents
from medicine_evidence import evidence_for_medicine
from models_db import Account, Profile, TimelineEntry
from schemas import SummaryResponse
from security import get_current_account

router = APIRouter(prefix="/api", tags=["summary"])


def _latest(entries: list[TimelineEntry], kind: str) -> TimelineEntry | None:
    matching = [e for e in entries if e.kind == kind]
    if not matching:
        return None
    return max(matching, key=lambda e: e.created_at)


@router.get("/summary/{profile_id}", response_model=SummaryResponse)
def summary(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> SummaryResponse:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")

    entries = list(profile.timeline)

    patient: dict[str, Any] = {
        "name": profile.display_name,
        "relation": profile.relation,
        "age": profile.age,
        "gender": profile.gender,
        "blood_group": profile.blood_group,
        "chronic_conditions": list(profile.chronic_conditions or []),
    }

    # Chief complaint + recent triage from the latest triage entry.
    latest_triage = _latest(entries, "triage")
    chief_complaint = "No recent triage on record."
    recent_triage: dict[str, Any] | None = None
    if latest_triage:
        payload = latest_triage.payload or {}
        chief_complaint = payload.get("advice_english") or latest_triage.title
        # Prefer the raw complaint if we captured a transcript.
        transcript = payload.get("encounter_transcript") or []
        first_user = next((t for t in transcript if t.get("role") == "user"), None)
        if first_user and first_user.get("text"):
            chief_complaint = first_user["text"]
        recent_triage = {
            "level": latest_triage.level,
            "reason": payload.get("reason_english"),
            "advice_english": payload.get("advice_english"),
            "date": latest_triage.created_at.isoformat(),
            "patient_facing_impression_english": payload.get("patient_facing_impression_english"),
            "doctor_differential": payload.get("doctor_differential", []) or [],
            "supporting_findings": payload.get("supporting_findings", []) or [],
            "findings_against": payload.get("findings_against", []) or [],
            "unresolved_questions": payload.get("unresolved_questions", []) or [],
            "red_flags_present": payload.get("red_flags_present", []) or [],
            "red_flags_denied": payload.get("red_flags_denied", []) or [],
            "escalation_signs": payload.get("escalation_signs", []) or [],
            "medication_options": payload.get("medication_options", []) or [],
            "vault_context_used": payload.get("vault_context_used", []) or [],
            "clinical_state": payload.get("clinical_state"),
            "encounter_transcript": transcript,
            "doctor_handoff_english": payload.get("doctor_handoff_english"),
            "mock": bool(payload.get("mock")),
        }

    # History = brief narrative from chronic conditions + notes.
    history_bits: list[str] = []
    if profile.chronic_conditions:
        history_bits.append(
            "Known: " + ", ".join(profile.chronic_conditions) + "."
        )
    if profile.notes:
        history_bits.append(profile.notes.strip())
    history = " ".join(history_bits) or "No significant history recorded."

    current_medications = [
        " ".join(
            p for p in [m.name, m.strength, m.frequency, m.duration] if p
        ).strip()
        for m in profile.medicines
    ]

    # Recent labs — flagged values first.
    recent_labs: list[dict[str, Any]] = []
    for e in sorted(
        [e for e in entries if e.kind == "lab"],
        key=lambda x: x.created_at,
        reverse=True,
    )[:3]:
        payload = e.payload or {}
        recent_labs.append(
            {
                "title": e.title,
                "date": e.created_at.isoformat(),
                "flagged": payload.get("flagged", []),
                "explanation_english": payload.get("explanation_english"),
            }
        )

    now = datetime.now(timezone.utc)
    reference = f"NABZ-{profile.id}-{now.strftime('%Y%m%d%H%M')}"

    return SummaryResponse(
        profile_id=profile.id,
        generated_at=now,
        reference=reference,
        patient=patient,
        chief_complaint=chief_complaint,
        history=history,
        current_medications=current_medications,
        allergies=list(profile.allergies or []),
        recent_triage=recent_triage,
        recent_labs=recent_labs,
        recent_documents=[
            {
                "title": document.title,
                "type": document.document_type,
                "date": document.created_at.isoformat(),
                "notes": document.notes,
                "extracted_summary": document.extracted_summary,
                "extracted_facts": document.extracted_facts,
                "attention_items": document.attention_items,
            }
            for document in list_profile_documents(profile)[:6]
        ],
        medicine_evidence=[
            evidence_for_medicine(medicine)
            for medicine in profile.medicines
            if medicine.source == "prescription"
        ],
        footer=(
            "Generated by Nabz to support — not replace — clinical assessment. "
            "Nabz does not diagnose or prescribe."
        ),
    )
