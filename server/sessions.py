"""HTTP routes for the conversational triage state machine."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Profile, TimelineEntry, TriageSession
from schemas import (
    TriageAnalysis,
    TriageAnswerRequest,
    TriageStartRequest,
    TriageTurn,
)
from security import get_current_account
from triage import next_turn

router = APIRouter(prefix="/api/triage", tags=["triage"])


def _profile_payload(profile: Profile) -> dict[str, Any]:
    recent_entries = sorted(
        list(profile.timeline), key=lambda entry: entry.created_at, reverse=True
    )[:8]
    return {
        "id": profile.id,
        "display_name": profile.display_name,
        "relation": profile.relation,
        "age": profile.age,
        "gender": profile.gender,
        "blood_group": profile.blood_group,
        "chronic_conditions": list(profile.chronic_conditions or []),
        "allergies": list(profile.allergies or []),
        "notes": profile.notes,
        "current_medicines": [
            {
                "name": medicine.name,
                "strength": medicine.strength,
                "frequency": medicine.frequency,
                "duration": medicine.duration,
                "source": medicine.source,
                "prescription_date": medicine.prescription_date,
            }
            for medicine in profile.medicines
        ],
        "recent_record": [
            {
                "kind": entry.kind,
                "title": entry.title,
                "subtitle": entry.subtitle,
                "level": entry.level,
                "date": entry.created_at.isoformat(),
                "flagged_lab_values": (entry.payload or {}).get("flagged", [])[:6]
                if entry.kind == "lab"
                else [],
            }
            for entry in recent_entries
        ],
    }


def _load_profile(db: Session, account: Account, profile_id: int) -> Profile:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return profile


def _record_result(db: Session, session: TriageSession, profile: Profile, turn: TriageTurn) -> None:
    """Persist the final triage result and add a timeline entry.

    The full conversation transcript is attached to the timeline payload so
    the doctor dashboard can render the encounter without a second lookup.
    """
    session.status = "closed"
    session.result_level = turn.level.value if turn.level else None
    session.result_payload = turn.model_dump(mode="json")

    payload = turn.model_dump(mode="json")
    payload["encounter_transcript"] = list(session.turns or [])
    payload["session_id"] = session.id

    entry = TimelineEntry(
        profile_id=profile.id,
        kind="triage",
        title=(turn.advice_english or "")[:180] or f"Triage: {session.result_level}",
        subtitle=turn.reason_english,
        level=session.result_level,
        payload=payload,
    )
    db.add(entry)


def _turn_from_session(db: Session, session: TriageSession, profile: Profile) -> TriageTurn:
    turn = next_turn(
        _profile_payload(profile),
        session_id=session.id,
        turns=list(session.turns or []),
    )
    # Persist assistant turn.
    if turn.type == "question":
        session.turns = list(session.turns or []) + [
            {
                "role": "assistant",
                "kind": "question",
                "text": turn.question_urdu or "",
                "text_english": turn.question_english or "",
                "quick_replies": [q.model_dump() for q in turn.quick_replies],
            }
        ]
        session.analysis = turn.analysis.model_dump(mode="json")
    else:
        session.analysis = turn.analysis.model_dump(mode="json")
        _record_result(db, session, profile, turn)
    db.add(session)
    db.commit()
    db.refresh(session)
    # Ensure the turn's questions_asked reflects post-persist state.
    turn.analysis = TriageAnalysis(
        collected=turn.analysis.collected,
        still_checking_urdu=turn.analysis.still_checking_urdu,
        still_checking_english=turn.analysis.still_checking_english,
        confidence=turn.analysis.confidence,
        questions_asked=sum(
            1 for t in session.turns if t.get("role") == "assistant" and t.get("kind") == "question"
        ),
    )
    return turn


@router.post("/start", response_model=TriageTurn)
def start(
    payload: TriageStartRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> TriageTurn:
    profile = _load_profile(db, account, payload.profile_id)

    session = TriageSession(
        profile_id=profile.id,
        initial_text=payload.text.strip(),
        turns=[{"role": "user", "text": payload.text.strip()}],
        analysis={},
        status="open",
    )
    db.add(session)
    db.flush()

    return _turn_from_session(db, session, profile)


@router.post("/answer", response_model=TriageTurn)
def answer(
    payload: TriageAnswerRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> TriageTurn:
    session = db.get(TriageSession, payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    profile = _load_profile(db, account, session.profile_id)
    if session.status == "closed":
        raise HTTPException(status_code=409, detail="session_closed")

    session.turns = list(session.turns or []) + [
        {"role": "user", "text": payload.text.strip()}
    ]

    return _turn_from_session(db, session, profile)
