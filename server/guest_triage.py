"""Anonymous, short-lived conversational triage.

This is the public "try Nabz" surface. It deliberately stores no identity,
phone number, location or Vault record. A random opaque bearer token grants
access to one temporary assessment and expires after a short interval.
"""
from __future__ import annotations

import hashlib
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session

from ai_billing import guest_usage_context
from db import get_db
from models_db import GuestTriageSession
from schemas import (
    GuestTriageAnswerRequest,
    GuestTriageChatRequest,
    GuestTriageChatResponse,
    GuestTriageRetryRequest,
    GuestTriageStartRequest,
    GuestTriageTurnResponse,
    TriageAnalysis,
    TriageChatResponse,
    TriageTurn,
)
from triage import is_mock_mode, next_turn, qwen_followup_chat
from vision import describe_image_structured, validate_upload

router = APIRouter(prefix="/api/guest/triage", tags=["guest-triage"])

_TTL_MINUTES = max(15, min(int(os.getenv("NABZ_GUEST_TTL_MINUTES", "120")), 360))
_RATE_WINDOW_SECONDS = 10 * 60
_RATE_LIMIT = max(12, int(os.getenv("NABZ_GUEST_RATE_LIMIT", "60")))
_rate_events: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = threading.Lock()


def _mock_attachment() -> dict[str, Any]:
    return {
        "description": (
            "منسلک فائل موصول ہوگئی ہے۔ "
            "The attached file is available as supporting context; visible details require clinician review."
        ),
        "description_english": (
            "The attached file is available as supporting context; visible details require clinician review."
        ),
        "description_urdu": "منسلک فائل معاون معلومات کے طور پر موصول ہوگئی ہے؛ ڈاکٹر اس کی تصدیق کریں۔",
        "visible_features": [],
        "concern_flags": [],
        "urgency_hint": "clinician_soon",
        "not_a_clinical_image": False,
        "mock": True,
    }


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _client_key(request: Request) -> str:
    # Remote address is used only in volatile process memory for abuse control;
    # it is never written to the clinical session or request body logs.
    return request.client.host if request.client else "unknown"


def _rate_limit(request: Request) -> None:
    key = _client_key(request)
    now = time.monotonic()
    with _rate_lock:
        events = _rate_events[key]
        while events and now - events[0] > _RATE_WINDOW_SECONDS:
            events.popleft()
        if len(events) >= _RATE_LIMIT:
            raise HTTPException(status_code=429, detail="guest_rate_limit")
        events.append(now)


GUEST_FOLLOWUP_LIMIT = max(1, min(int(os.getenv("NABZ_GUEST_FOLLOWUP_LIMIT", "3")), 3))


def _guest_profile() -> dict[str, Any]:
    """Minimal safe context; guest is assumed adult until proven otherwise.

    Setting is_guest + assumed_adult unlocks OTC nominations in the prompt.
    The model is instructed to still ask about allergies and pregnancy before
    nominating any drug, and the server-side safety filter enforces the same.
    """
    return {
        "id": 0,
        "display_name": "آپ",
        "relation": "Self",
        "age": None,
        "gender": None,
        "blood_group": None,
        "date_of_birth": None,
        "weight_kg": None,
        "blood_pressure": None,
        "recent_vitals": [],
        "chronic_conditions": [],
        "allergies": [],
        "notes": None,
        "current_medicines": [],
        "recent_timeline": [],
        "relevant_documents": [],
        "recent_triage_history": [],
        "is_guest": True,
        "assumed_adult": True,
    }


def _count_guest_followups(turns: list[dict[str, Any]]) -> int:
    return sum(1 for t in (turns or []) if t.get("kind") == "followup_user")


def _load_session(db: Session, token: str) -> GuestTriageSession:
    session = (
        db.query(GuestTriageSession)
        .filter(GuestTriageSession.token_hash == _token_hash(token))
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="guest_session_not_found")
    # SQLite may round-trip DateTime without tzinfo. Both values still represent
    # UTC because every write in this module is UTC.
    expiry = session.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= _now():
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=410, detail="guest_session_expired")
    return session


def _append_assistant(session: GuestTriageSession, turn: TriageTurn) -> None:
    if turn.type != "question":
        return
    session.turns = list(session.turns or []) + [{
        "role": "assistant",
        "kind": "image_request" if turn.image_request else "question",
        "text": turn.question_urdu or "",
        "text_english": turn.question_english or "",
        "quick_replies": [reply.model_dump() for reply in turn.quick_replies],
        "question_goal": turn.question_goal,
        "why_this_matters": turn.why_this_matters,
        "encounter_title": turn.encounter_title,
        "clinical_state": (
            turn.clinical_state.model_dump(mode="json") if turn.clinical_state else None
        ),
    }]


def _next(db: Session, session: GuestTriageSession, token: str) -> GuestTriageTurnResponse:
    turn = next_turn(
        _guest_profile(), session.id, list(session.turns or []),
        usage_context=guest_usage_context(
            db, guest_session_id=session.id, operation="triage_turn"
        ),
    )
    _append_assistant(session, turn)
    session.analysis = turn.analysis.model_dump(mode="json")
    if turn.type == "result":
        session.result_payload = turn.model_dump(mode="json")
        # An availability response remains retryable and is not a clinical result.
        session.status = "open" if turn.response_source == "ai_unavailable" else "closed"
    db.add(session)
    db.commit()
    db.refresh(session)
    if turn.type == "question":
        question_count = sum(
            1 for item in session.turns
            if item.get("role") == "assistant"
            and item.get("kind") in {"question", "image_request"}
        )
        reported_progress = max(
            turn.analysis.completeness,
            turn.analysis.confidence,
        )
        question_floor = min(0.15 + max(0, question_count - 1) * 0.18, 0.87)
        progress = max(reported_progress, question_floor)
        turn.analysis = TriageAnalysis(
            collected=turn.analysis.collected,
            still_checking_urdu=turn.analysis.still_checking_urdu,
            still_checking_english=turn.analysis.still_checking_english,
            confidence=progress,
            completeness=progress,
            questions_asked=question_count,
        )
    return GuestTriageTurnResponse(
        state_token=token,
        expires_at=session.expires_at,
        turn=turn,
    )


@router.post("/start", response_model=GuestTriageTurnResponse)
def start_guest_triage(
    payload: GuestTriageStartRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> GuestTriageTurnResponse:
    _rate_limit(request)
    if payload.consent is not True:
        raise HTTPException(status_code=422, detail="guest_consent_required")

    # Opportunistic retention cleanup keeps anonymous data bounded without a
    # background worker. It is safe if multiple workers perform it together.
    db.query(GuestTriageSession).filter(GuestTriageSession.expires_at <= _now()).delete(
        synchronize_session=False
    )
    token = secrets.token_urlsafe(36)
    session = GuestTriageSession(
        token_hash=_token_hash(token),
        turns=[{"role": "user", "text": payload.text.strip()}],
        analysis={},
        status="open",
        consented_at=_now(),
        expires_at=_now() + timedelta(minutes=_TTL_MINUTES),
    )
    db.add(session)
    db.flush()
    return _next(db, session, token)


@router.post("/answer", response_model=GuestTriageTurnResponse)
def answer_guest_triage(
    payload: GuestTriageAnswerRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> GuestTriageTurnResponse:
    _rate_limit(request)
    session = _load_session(db, payload.state_token)
    if session.status == "closed":
        raise HTTPException(status_code=409, detail="guest_session_closed")
    session.turns = list(session.turns or []) + [
        {"role": "user", "text": payload.text.strip()}
    ]
    return _next(db, session, payload.state_token)


@router.post("/retry", response_model=GuestTriageTurnResponse)
def retry_guest_triage(
    payload: GuestTriageRetryRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> GuestTriageTurnResponse:
    _rate_limit(request)
    session = _load_session(db, payload.state_token)
    if session.status == "closed":
        raise HTTPException(status_code=409, detail="guest_session_closed")
    return _next(db, session, payload.state_token)


@router.post("/chat", response_model=GuestTriageChatResponse)
def chat_about_guest_result(
    payload: GuestTriageChatRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> GuestTriageChatResponse:
    _rate_limit(request)
    session = _load_session(db, payload.state_token)
    if session.status != "closed" or not session.result_payload:
        raise HTTPException(status_code=409, detail="guest_assessment_not_complete")
    existing = list(session.turns or [])
    if _count_guest_followups(existing) >= GUEST_FOLLOWUP_LIMIT:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "guest_followup_limit_reached",
                "limit": GUEST_FOLLOWUP_LIMIT,
                "message": (
                    "You have used all free follow-up questions for this guest "
                    "session. Create a private Vault (free, 20 seconds) to keep "
                    "asking and to save this conversation to your family record."
                ),
            },
        )
    answer = qwen_followup_chat(
        _guest_profile(), session.id, dict(session.result_payload), existing, payload.text.strip(),
        usage_context=guest_usage_context(
            db, guest_session_id=session.id, operation="followup_chat"
        ),
    )
    session.turns = existing + [
        {"role": "user", "kind": "followup_user", "text": payload.text.strip()},
        {
            "role": "assistant",
            "kind": "followup_assistant",
            "text": answer.answer_urdu,
            "text_english": answer.answer_english,
            "response_source": answer.response_source,
            "safety_note": answer.safety_note,
        },
    ]
    db.add(session)
    db.commit()
    db.refresh(session)
    used = _count_guest_followups(session.turns or [])
    return GuestTriageChatResponse(
        state_token=payload.state_token,
        expires_at=session.expires_at,
        answer=TriageChatResponse.model_validate(answer),
        followups_used=used,
        followups_limit=GUEST_FOLLOWUP_LIMIT,
        registration_required=used >= GUEST_FOLLOWUP_LIMIT,
    )


@router.post("/attach")
async def attach_guest_file(
    request: Request,
    file: UploadFile = File(...),
    consent: bool = Form(...),
    state_token: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Describe a temporary attachment without saving its raw bytes.

    This endpoint is intentionally available before the first assessment turn
    so a guest can begin with a report or clinical photo. The returned factual
    description is the only content the browser may add to the transcript.
    """
    _rate_limit(request)
    if consent is not True:
        raise HTTPException(status_code=422, detail="guest_consent_required")
    if state_token and not 32 <= len(state_token) <= 160:
        raise HTTPException(status_code=422, detail="invalid_guest_state_token")
    if state_token:
        _load_session(db, state_token)

    payload = await file.read()
    filename = file.filename or "attachment"
    mime, err = validate_upload(payload, filename, file.content_type)
    if err:
        raise HTTPException(status_code=400, detail=err)

    if is_mock_mode():
        return _mock_attachment()

    structured = describe_image_structured(payload, filename, mime, "Guest patient")
    if not structured or not (
        structured.get("description_english") or structured.get("description_urdu")
    ):
        raise HTTPException(status_code=422, detail="could_not_describe_attachment")

    urdu = structured.get("description_urdu") or ""
    english = structured.get("description_english") or ""
    return {
        "description": " · ".join(part for part in (urdu, english) if part),
        "description_english": english or None,
        "description_urdu": urdu or None,
        "visible_features": structured.get("visible_features", []),
        "concern_flags": structured.get("concern_flags", []),
        "urgency_hint": structured.get("urgency_hint"),
        "not_a_clinical_image": structured.get("not_a_clinical_image", False),
        "mock": False,
    }


@router.delete("/{state_token}", status_code=204)
def clear_guest_triage(
    state_token: str,
    response: Response,
    db: Session = Depends(get_db),
) -> Response:
    session = (
        db.query(GuestTriageSession)
        .filter(GuestTriageSession.token_hash == _token_hash(state_token))
        .first()
    )
    if session is not None:
        db.delete(session)
        db.commit()
    response.status_code = 204
    return response
