"""Sehat Saathi (صحت ساتھی) — FastAPI backend.

An AI health-triage assistant for rural Pakistan. It classifies urgency only;
it never diagnoses or prescribes. All AI calls go through this backend so the
DashScope API key never reaches the browser.
"""
from __future__ import annotations

import logging
import os

import io

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from clinics import get_clinics  # noqa: E402
from models import (  # noqa: E402
    Clinic,
    HealthResponse,
    TriageRequest,
    TriageResponse,
)
from triage import is_mock_mode, triage  # noqa: E402

app = FastAPI(
    title="Sehat Saathi API",
    description="AI health-triage assistant for rural Pakistan.",
    version="1.0.0",
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


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Quick demo-day sanity check."""
    return HealthResponse(status="ok", mock_mode=is_mock_mode())


@app.post("/api/triage", response_model=TriageResponse)
def triage_endpoint(req: TriageRequest) -> TriageResponse:
    """Classify the urgency of a symptom description."""
    return triage(req.text)


@app.get("/api/clinics", response_model=list[Clinic])
def clinics_endpoint(city: str | None = None, province: str | None = None) -> list[Clinic]:
    """Return nearby clinics / hospitals for the selected city.

    Without a city, returns a representative default list.
    """
    return get_clinics(city=city, province=province)


# Cache a few recently synthesized clips in memory (advice repeats on replay).
_TTS_CACHE: dict[tuple[str, str], bytes] = {}
_TTS_CACHE_MAX = 32
# gTTS only supports certain language codes; map ours onto supported ones.
_TTS_LANG_MAP = {"ur": "ur", "hi": "hi", "en": "en"}


@app.get("/api/tts")
def tts_endpoint(
    text: str = Query(..., min_length=1, max_length=1000),
    lang: str = Query("ur"),
) -> Response:
    """Return real spoken Urdu (or Hindi/English) audio for `text`.

    Uses gTTS so the voice actually pronounces Urdu script — browser
    SpeechSynthesis on most machines has no Urdu voice and mangles the text
    (often reading only the digits). The frontend uses this first and only
    falls back to browser speech if it fails.
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
        logging.getLogger("sehat_saathi").error("TTS failed: %s", exc)
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
    return {
        "app": "Sehat Saathi",
        "docs": "/docs",
        "health": "/api/health",
    }
