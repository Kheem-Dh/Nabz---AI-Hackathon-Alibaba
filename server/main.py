"""Nabz (نبض) — FastAPI backend.

A voice-first, Urdu-first AI health companion for underserved communities in
Pakistan. It triages urgency only — it never diagnoses a disease and never
prescribes or names a medicine. Every AI call goes through this backend so the
DashScope API key never reaches the browser.

This module only wires the application together: routers live in their own
modules (auth, profiles, triage, labreport, prescription, summary, clinics).
"""
from __future__ import annotations

import io
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Import after load_dotenv so modules read env at import time correctly.
from auth import router as auth_router  # noqa: E402
from clinics import get_clinics  # noqa: E402
from db import init_db  # noqa: E402
from labreport import router as labreport_router  # noqa: E402
from prescription import router as prescription_router  # noqa: E402
from profiles import router as profiles_router  # noqa: E402
from schemas import Clinic, HealthResponse  # noqa: E402
from sessions import router as triage_router  # noqa: E402
from summary import router as summary_router  # noqa: E402
from triage import is_mock_mode  # noqa: E402

logger = logging.getLogger("nabz")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create tables (idempotent) and log the current mode at startup."""
    init_db()
    logger.info("Nabz backend started (mock_mode=%s)", is_mock_mode())
    yield


app = FastAPI(
    title="Nabz API",
    description="Voice-first, Urdu-first AI health companion for Pakistan.",
    version="2.0.0",
    lifespan=lifespan,
)

# The API key must never reach the frontend; the browser only talks to us.
_ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Routers -----------------------------------------------------------------

app.include_router(auth_router)
app.include_router(profiles_router)
app.include_router(triage_router)
app.include_router(labreport_router)
app.include_router(prescription_router)
app.include_router(summary_router)


# --- Misc endpoints ----------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Quick demo-day sanity check."""
    return HealthResponse(status="ok", mock_mode=is_mock_mode())


@app.get("/api/clinics", response_model=list[Clinic])
def clinics_endpoint(
    city: str | None = None, province: str | None = None
) -> list[Clinic]:
    """Return sample KP health facilities, optionally reordered by city."""
    return get_clinics(city=city, province=province)


# Cache a few recently synthesized clips in memory (advice repeats on replay).
_TTS_CACHE: dict[tuple[str, str], bytes] = {}
_TTS_CACHE_MAX = 32
_TTS_LANG_MAP = {"ur": "ur", "hi": "hi", "en": "en"}


@app.get("/api/tts")
def tts_endpoint(
    text: str = Query(..., min_length=1, max_length=1000),
    lang: str = Query("ur"),
) -> Response:
    """Return real spoken Urdu (or Hindi/English) audio for `text`.

    Uses gTTS so the voice actually pronounces Urdu script — browser
    SpeechSynthesis on most machines has no Urdu voice. The frontend uses this
    first and only falls back to browser speech if it fails.
    """
    gtts_lang = _TTS_LANG_MAP.get(lang, "ur")
    key = (gtts_lang, text)
    if key in _TTS_CACHE:
        return Response(content=_TTS_CACHE[key], media_type="audio/mpeg")

    try:
        from gtts import gTTS

        buf = io.BytesIO()
        gTTS(text=text, lang=gtts_lang).write_to_fp(buf)
        audio = buf.getvalue()
    except Exception as exc:  # noqa: BLE001
        logger.error("TTS failed: %s", exc)
        raise HTTPException(status_code=503, detail="tts_unavailable")

    if len(_TTS_CACHE) >= _TTS_CACHE_MAX:
        _TTS_CACHE.pop(next(iter(_TTS_CACHE)))
    _TTS_CACHE[key] = audio
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"app": "Nabz", "docs": "/docs", "health": "/api/health"}
