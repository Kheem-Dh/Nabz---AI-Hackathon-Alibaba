"""Nabz (نبض) — FastAPI backend.

A voice-first, Urdu-first AI health companion for underserved communities in
Pakistan. It provides non-diagnostic triage and can show evidence-validated
generic medication information, but never issues a prescription. Every AI call
goes through this backend so the DashScope API key never reaches the browser.

This module only wires the application together: routers live in their own
modules (auth, profiles, triage, labreport, prescription, summary, clinics).
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Resolve the backend environment relative to this file. Relying on the shell's
# current directory caused a configured key in server/.env to be missed when
# Uvicorn was launched from the repository root, silently activating demo mode.
load_dotenv(Path(__file__).with_name(".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Import after load_dotenv so modules read env at import time correctly.
from auth import router as auth_router  # noqa: E402
from analytics import router as analytics_router  # noqa: E402
from chat_attach import router as chat_attach_router  # noqa: E402
from clinics import get_clinics  # noqa: E402
from db import init_db  # noqa: E402
from dashboard import router as dashboard_router  # noqa: E402
from demo import router as demo_router  # noqa: E402
from documents import router as documents_router  # noqa: E402
from facilities import router as facilities_router  # noqa: E402
from labreport import router as labreport_router  # noqa: E402
from location import router as location_router  # noqa: E402
from medicine_evidence import router as medicine_evidence_router  # noqa: E402
from observability import RequestTelemetryMiddleware  # noqa: E402
from prescription import router as prescription_router  # noqa: E402
from privacy import router as privacy_router  # noqa: E402
from profiles import router as profiles_router  # noqa: E402
from readiness import readiness_checks  # noqa: E402
from runtime import (  # noqa: E402
    RuntimeSettings,
    validate_startup_configuration,
)
from schemas import Clinic, HealthResponse  # noqa: E402
from sessions import router as triage_router  # noqa: E402
from triage_stream import router as triage_stream_router  # noqa: E402
from voice_stt import router as voice_stt_router  # noqa: E402
from summary import router as summary_router  # noqa: E402
import tts_engine  # noqa: E402
from handoff import router as handoff_router  # noqa: E402
from guest_triage import router as guest_triage_router  # noqa: E402
from safety_eval import router as safety_eval_router  # noqa: E402
from triage import (  # noqa: E402
    get_model_name,
    get_request_timeout_seconds,
    has_ai_credentials,
    triage_engine_mode,
)
from vision import get_vl_model  # noqa: E402

logger = logging.getLogger("nabz")
misc_router = APIRouter()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Validate the release contract before accepting any traffic."""
    settings: RuntimeSettings = _app.state.runtime_settings
    validate_startup_configuration(settings)
    init_db()
    logger.info(
        "Nabz backend started (environment=%s mock_mode=%s demo_enabled=%s triage_engine=%s)",
        settings.app_env,
        settings.mock_mode,
        settings.demo_enabled,
        triage_engine_mode(),
    )
    yield


# --- Misc endpoints ----------------------------------------------------------


@misc_router.get("/api/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    """Quick demo-day sanity check."""
    settings: RuntimeSettings = request.app.state.runtime_settings
    return HealthResponse(status="ok", mock_mode=settings.mock_mode)


@misc_router.get("/api/health/live")
def health_live(request: Request) -> dict[str, str]:
    """Process liveness: this endpoint never calls external dependencies."""
    settings: RuntimeSettings = request.app.state.runtime_settings
    return {"status": "alive", "environment": settings.app_env}


@misc_router.get("/api/health/ready")
def health_ready(request: Request) -> Response:
    """Readiness for routing traffic: configuration, DB, storage, and AI."""
    settings: RuntimeSettings = request.app.state.runtime_settings
    ready, checks = readiness_checks(settings)
    payload = {
        "status": "ready" if ready else "not_ready",
        "environment": settings.app_env,
        "checks": checks,
    }
    return JSONResponse(payload, status_code=200 if ready else 503)


@misc_router.get("/api/health/detail")
def health_detail(request: Request) -> dict:
    """Extended health card for the pre-demo hidden dev gesture."""
    settings: RuntimeSettings = request.app.state.runtime_settings
    if settings.is_production:
        # The workspace only needs connectivity and AI availability. Do not
        # expose provider names or operational tuning on the production edge.
        return {
            "status": "ok",
            "environment": settings.app_env,
            "mock_mode": False,
            "demo_enabled": False,
            "triage_engine": "live_ai",
            "ai_configured": True,
        }
    return {
        "status": "ok",
        "environment": settings.app_env,
        "mock_mode": settings.mock_mode,
        "demo_enabled": settings.demo_enabled,
        "triage_engine": triage_engine_mode(),
        "ai_configured": has_ai_credentials(),
        "text_model": get_model_name(),
        "triage_timeout_seconds": get_request_timeout_seconds(),
        "vision_model": get_vl_model(),
        "location_provider": (
            "disabled"
            if os.getenv("NABZ_DISABLE_NOMINATIM", "").lower() in {"1", "true", "yes"}
            else "nominatim+offline-fallback"
        ),
        "facilities_layer": "curated",
    }


@misc_router.get("/api/clinics", response_model=list[Clinic])
def clinics_endpoint(
    city: str | None = None, province: str | None = None
) -> list[Clinic]:
    """Return sample KP health facilities, optionally reordered by city."""
    return get_clinics(city=city, province=province)


# Cache a few recently synthesized clips in memory (advice repeats on replay).
_TTS_CACHE: dict[tuple[str, str], tuple[bytes, str]] = {}
_TTS_CACHE_MAX = 32


@misc_router.get("/api/tts")
def tts_endpoint(
    text: str = Query(..., min_length=1, max_length=1000),
    lang: str = Query("ur"),
) -> Response:
    """Return real spoken audio for `text`.

    Urdu uses the MMS-TTS neural voice (server/tts_engine.py) with an
    automatic fallback to gTTS if that model can't load in this environment.
    English/Hindi use gTTS. The frontend tries this endpoint first and only
    falls back to the browser's own speech synthesis if it fails.
    """
    key = (lang, text)
    if key in _TTS_CACHE:
        audio, content_type = _TTS_CACHE[key]
        return Response(content=audio, media_type=content_type)

    try:
        audio, content_type = tts_engine.synthesize(text, lang)
    except Exception as exc:  # noqa: BLE001
        logger.error("TTS failed: %s", exc)
        raise HTTPException(status_code=503, detail="tts_unavailable")

    if len(_TTS_CACHE) >= _TTS_CACHE_MAX:
        _TTS_CACHE.pop(next(iter(_TTS_CACHE)))
    _TTS_CACHE[key] = (audio, content_type)
    return Response(
        content=audio,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@misc_router.get("/")
def root(request: Request) -> dict[str, str]:
    settings: RuntimeSettings = request.app.state.runtime_settings
    payload = {"app": "Nabz", "health": "/api/health/live"}
    if settings.api_docs_enabled:
        payload["docs"] = "/docs"
    return payload


def create_app(settings: RuntimeSettings | None = None) -> FastAPI:
    """Build an app whose public surface is fixed by its runtime environment."""
    settings = settings or RuntimeSettings.from_env()
    docs_url = "/docs" if settings.api_docs_enabled else None
    redoc_url = "/redoc" if settings.api_docs_enabled else None
    openapi_url = "/openapi.json" if settings.api_docs_enabled else None
    application = FastAPI(
        title="Nabz API",
        description="Voice-first, Urdu-first AI health companion for Pakistan.",
        version="2.0.0",
        lifespan=lifespan,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )
    application.state.runtime_settings = settings

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_middleware(
        RequestTelemetryMiddleware,
        environment=settings.app_env,
    )

    application.include_router(auth_router)
    application.include_router(analytics_router)
    application.include_router(profiles_router)
    application.include_router(location_router)
    application.include_router(facilities_router)
    application.include_router(triage_router)
    application.include_router(guest_triage_router)
    application.include_router(triage_stream_router)
    application.include_router(voice_stt_router)
    application.include_router(chat_attach_router)
    application.include_router(labreport_router)
    application.include_router(prescription_router)
    application.include_router(privacy_router)
    application.include_router(summary_router)
    application.include_router(handoff_router)
    application.include_router(safety_eval_router)
    application.include_router(documents_router)
    application.include_router(dashboard_router)
    if settings.demo_enabled and not settings.is_production:
        application.include_router(demo_router)
    application.include_router(medicine_evidence_router)
    application.include_router(misc_router)
    return application


app = create_app()
