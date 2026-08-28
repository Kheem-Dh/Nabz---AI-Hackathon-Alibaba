"""Cloud Urdu speech-to-text — /api/voice/transcribe.

The frontend records audio with MediaRecorder (works in Firefox, in-app
browsers, and offline Safari where webkitSpeechRecognition doesn't) and POSTs
the blob here. We forward to Qwen3.5-Omni via DashScope's OpenAI-compatible
chat.completions endpoint using an audio content-part.

Mock mode returns a canned Urdu transcript so demos work with zero credentials.
Language is Urdu by default but caller can override via ?lang=ur|en|hi.
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from models_db import Account
from security import get_current_account
from triage import is_mock_mode
from vision import DASHSCOPE_BASE_URL

logger = logging.getLogger("nabz.voice.stt")
router = APIRouter(prefix="/api/voice", tags=["voice"])

MAX_AUDIO_BYTES = 15 * 1024 * 1024  # 15 MB — ~2 min of Opus at 128 kbps
# The legacy qwen-omni-turbo only supports Chinese/English audio input.
# Qwen3.5-Omni explicitly supports Urdu and mixed Urdu/English speech.
_OMNI_MODEL = os.getenv("NABZ_STT_MODEL", "qwen3.5-omni-plus")

_ACCEPTED_MIMES = {
    "audio/webm", "audio/ogg", "audio/opus", "audio/mp4", "audio/mpeg",
    "audio/wav", "audio/x-wav", "audio/m4a", "audio/x-m4a", "audio/aac",
    "audio/flac",
}

_MIME_TO_FORMAT = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mp4": "mp4",
    "audio/m4a": "mp4",
    "audio/x-m4a": "mp4",
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
}


class TranscriptOut(BaseModel):
    transcript: str
    language: str
    provider: str  # "cloud" | "mock"
    duration_ms: Optional[int] = None


def _mock_urdu_transcript(lang: str) -> TranscriptOut:
    text = (
        "میرے سر میں دو دن سے درد ہے، متلی بھی ہو رہی ہے۔"
        if lang.startswith("ur")
        else "I have a headache for two days and some nausea."
    )
    return TranscriptOut(transcript=text, language=lang or "ur", provider="mock")


@router.post("/transcribe", response_model=TranscriptOut)
async def transcribe(
    lang: str = Form("ur"),
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
) -> TranscriptOut:
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="empty_audio")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio_too_large")
    content_type = (file.content_type or "").lower().strip()
    if content_type and content_type not in _ACCEPTED_MIMES:
        # Some browsers report generic types; only reject the obviously wrong.
        if not content_type.startswith("audio/"):
            raise HTTPException(status_code=415, detail=f"unsupported_audio:{content_type}")

    if is_mock_mode():
        return _mock_urdu_transcript(lang)

    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="voice_transcription_unavailable")

    fmt = _MIME_TO_FORMAT.get(content_type) or (
        "wav" if (file.filename or "").lower().endswith(".wav")
        else "mp3" if (file.filename or "").lower().endswith(".mp3")
        else "webm"
    )
    b64 = base64.b64encode(audio).decode("ascii")
    data_url = f"data:{content_type or 'audio/webm'};base64,{b64}"

    system_prompt = (
        "You are an accurate speech-to-text engine for Pakistani patients. "
        "Transcribe the audio verbatim in the language spoken (Urdu, Roman Urdu, or English). "
        "Preserve numbers and punctuation. Do NOT translate, summarise, or answer. "
        "Return ONLY the transcript text with no leading label."
    )
    user_part_text = (
        f"Transcribe this clip. Expected language: {lang}. "
        "If mixed Urdu/English, keep both in the language they were spoken."
    )

    try:
        from openai import OpenAI

        client = OpenAI(
            api_key=api_key,
            base_url=DASHSCOPE_BASE_URL,
            timeout=45,
        )
        completion = client.chat.completions.create(
            model=_OMNI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_part_text},
                        {"type": "input_audio", "input_audio": {"data": data_url, "format": fmt}},
                    ],
                },
            ],
            temperature=0.0,
            modalities=["text"],
            stream=True,
            stream_options={"include_usage": True},
        )
        parts: list[str] = []
        for chunk in completion:
            if chunk.choices and chunk.choices[0].delta.content:
                parts.append(chunk.choices[0].delta.content)
        raw = "".join(parts).strip()
        if not raw:
            raise RuntimeError("speech model returned an empty transcript")
    except Exception as exc:  # noqa: BLE001
        logger.error("Cloud STT failed (model=%s): %s", _OMNI_MODEL, exc, exc_info=True)
        # Never fabricate a patient's words in live mode. The frontend keeps
        # the recording flow recoverable and lets the user retry or type.
        raise HTTPException(
            status_code=503,
            detail="voice_transcription_failed",
        ) from exc

    return TranscriptOut(transcript=raw, language=lang, provider="cloud")


@router.get("/health")
def voice_health() -> dict:
    return {
        "mock_mode": is_mock_mode(),
        "stt_model": _OMNI_MODEL,
        "max_bytes": MAX_AUDIO_BYTES,
    }
