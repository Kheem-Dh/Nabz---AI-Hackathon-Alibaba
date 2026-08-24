"""Browser-facing SSE progress for triage turns.

Wraps the existing synchronous triage orchestrator in a small background
thread so the caller can stream progress events while the model runs. The
final `turn` event carries the complete TriageTurn as JSON — the client
never sees partial model text (safety), only structured milestone events.

Endpoints (POST, form-encoded so the browser can pass a bearer token via
Authorization header the same way it does for JSON endpoints):

  POST /api/triage/stream/start   {profile_id, text}
  POST /api/triage/stream/answer  {session_id, text}

Both return `text/event-stream`. Client disconnect aborts the emit loop
(the underlying model call already has a 60s timeout).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db import SessionLocal, get_db
from models_db import Account, Profile, TriageSession
from schemas import TriageAnalysis, TriageTurn
from security import get_current_account
from sessions import _load_profile, _turn_from_session

logger = logging.getLogger("nabz.triage.sse")

router = APIRouter(prefix="/api/triage/stream", tags=["triage-stream"])


class StartBody(BaseModel):
    profile_id: int
    text: str = Field(..., min_length=1, max_length=2000)


class AnswerBody(BaseModel):
    session_id: int
    text: str = Field(..., min_length=1, max_length=2000)


# SSE-safe event framer.
def _sse(event: str, data: dict | str) -> str:
    if not isinstance(data, str):
        data = json.dumps(data, ensure_ascii=False)
    # Every "data:" line must be prefixed; join over \n.
    lines = "\n".join(f"data: {line}" for line in data.split("\n"))
    return f"event: {event}\n{lines}\n\n"


# ---- Milestone script -----------------------------------------------------
# Sequenced BEFORE the background thread returns so the user sees motion even
# on very fast turns. Each entry: (event, delay_seconds, payload_dict).
_PROGRESS_SCRIPT = [
    ("progress", 0.00, {"stage": "queued", "message": "Received your input"}),
    ("progress", 0.20, {"stage": "safety_check", "message": "Checking for red-flag symptoms"}),
    ("progress", 0.40, {"stage": "context", "message": "Reading Vault context"}),
    ("progress", 0.60, {"stage": "reasoning", "message": "Asking the clinical model"}),
    ("progress", 1.20, {"stage": "structuring", "message": "Structuring the response"}),
]


def _resolve_session_and_profile(db: Session, account: Account, session_id: int):
    session = db.get(TriageSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    profile = _load_profile(db, account, session.profile_id)
    return session, profile


async def _run_turn_async(session_id: int) -> dict:
    """Execute the blocking triage in a worker thread; return the JSON turn."""

    def _work() -> dict:
        # Use a fresh DB session — SQLAlchemy sessions are not thread-safe.
        local_db = SessionLocal()
        try:
            session = local_db.get(TriageSession, session_id)
            if session is None:
                raise RuntimeError("session_disappeared")
            profile = local_db.get(Profile, session.profile_id)
            if profile is None:
                raise RuntimeError("profile_disappeared")
            turn = _turn_from_session(local_db, session, profile)
            payload = turn.model_dump(mode="json")
            return payload
        finally:
            local_db.close()

    return await asyncio.to_thread(_work)


async def _stream(session_id: int, request) -> AsyncIterator[str]:
    started = time.perf_counter()
    yield _sse("start", {"session_id": session_id, "ts": started})

    # Kick off the blocking work in the background.
    task = asyncio.create_task(_run_turn_async(session_id))

    # Emit paced progress events until the task finishes.
    for event_name, delay, payload in _PROGRESS_SCRIPT:
        if task.done():
            break
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            task.cancel()
            raise
        # Client disconnect check — starlette exposes this on the request.
        if request is not None:
            try:
                if await request.is_disconnected():
                    task.cancel()
                    return
            except Exception:  # noqa: BLE001
                pass
        yield _sse(event_name, payload)

    # Wait for the actual turn to complete, emitting a heartbeat every 2s.
    while not task.done():
        try:
            await asyncio.sleep(2.0)
        except asyncio.CancelledError:
            task.cancel()
            raise
        if request is not None:
            try:
                if await request.is_disconnected():
                    task.cancel()
                    return
            except Exception:  # noqa: BLE001
                pass
        yield _sse("progress", {"stage": "reasoning", "message": "Still working…"})

    try:
        payload = task.result()
    except Exception as exc:  # noqa: BLE001
        logger.error("triage stream failed: %s", exc, exc_info=True)
        yield _sse("error", {"message": str(exc)})
        return

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    yield _sse("progress", {"stage": "complete", "message": "Ready", "latency_ms": elapsed_ms})
    yield _sse("turn", payload)


@router.post("/start")
async def stream_start(
    payload: StartBody,
    request: Request = None,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    # Create the session synchronously — cheap, DB-only.
    profile = _load_profile(db, account, payload.profile_id)
    session = TriageSession(
        profile_id=profile.id,
        initial_text=payload.text.strip(),
        turns=[{"role": "user", "text": payload.text.strip()}],
        analysis={},
        status="open",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    session_id = session.id

    async def gen():
        async for chunk in _stream(session_id, request):
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
    })


@router.post("/answer")
async def stream_answer(
    payload: AnswerBody,
    request: Request = None,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    session = db.get(TriageSession, payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    _profile = _load_profile(db, account, session.profile_id)
    if session.status == "closed":
        raise HTTPException(status_code=409, detail="session_closed")

    session.turns = list(session.turns or []) + [
        {"role": "user", "text": payload.text.strip()}
    ]
    db.commit()
    session_id = session.id

    async def gen():
        async for chunk in _stream(session_id, request):
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
    })
