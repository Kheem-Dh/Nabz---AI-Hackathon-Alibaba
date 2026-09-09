"""Natural Urdu text-to-speech with exact-language fallbacks.

Qwen3.5-Omni is preferred in live mode because it supports spoken Urdu and
produces a much more natural Pakistani-Urdu reading than the older MMS voice.
gTTS is the network fallback. Meta MMS remains available only as an explicit
opt-in because its Urdu checkpoint can sound unnatural for clinical prose.

NABZ_TTS_ENGINE controls this:
  auto  (default) — Qwen3.5-Omni for live Urdu, then gTTS
  qwen  — Qwen3.5-Omni only (fails loudly if unavailable)
  gtts  — gTTS only
  mms   — legacy local MMS only (explicit opt-in)
"""
from __future__ import annotations

import base64
import io
import logging
import os
import wave

logger = logging.getLogger("nabz.tts")

# Urdu has multiple MMS checkpoints split by script; Nabz writes Urdu in the
# Arabic/Nastaliq script (never Devanagari or Latin transliteration), so
# script_arabic is the correct one — the bare "mms-tts-urd" id doesn't exist.
_MMS_MODEL_ID = "facebook/mms-tts-urd-script_arabic"
_mms_model = None
_mms_tokenizer = None
_qwen_failed = False

_DASHSCOPE_BASE_URL = os.getenv(
    "DASHSCOPE_BASE_URL",
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
).strip()
_QWEN_TTS_MODEL = os.getenv("NABZ_TTS_MODEL", "qwen3.5-omni-plus").strip()
_QWEN_TTS_VOICE = os.getenv("NABZ_TTS_VOICE", "Tina").strip()


def _engine_mode() -> str:
    return os.getenv("NABZ_TTS_ENGINE", "auto").strip().lower()


def _load_mms():
    """Load and cache the MMS model + tokenizer. Raises on any failure."""
    global _mms_model, _mms_tokenizer
    if _mms_model is not None:
        return _mms_model, _mms_tokenizer
    try:
        # Heavy, and lazy on purpose: torch + transformers are not installed by
        # default, so the ~865 MB they add never lands in the deployed image.
        from transformers import AutoTokenizer, VitsModel
    except ImportError as exc:  # pragma: no cover - depends on optional extras
        raise RuntimeError(
            "mms_voice_not_installed: NABZ_TTS_ENGINE=mms needs the optional "
            "extras. Install them with "
            "`pip install -r requirements.txt -r requirements-mms.txt`, or "
            "unset NABZ_TTS_ENGINE to use the default Qwen -> gTTS chain."
        ) from exc

    logger.info("Loading MMS-TTS Urdu model (%s) — first call only", _MMS_MODEL_ID)
    tokenizer = AutoTokenizer.from_pretrained(_MMS_MODEL_ID)
    model = VitsModel.from_pretrained(_MMS_MODEL_ID)
    model.eval()
    _mms_model, _mms_tokenizer = model, tokenizer
    return model, tokenizer


def _synthesize_mms(text: str) -> bytes:
    import numpy as np
    import torch

    model, tokenizer = _load_mms()
    inputs = tokenizer(text, return_tensors="pt")
    with torch.no_grad():
        waveform = model(**inputs).waveform
    samples = waveform.squeeze().cpu().numpy()
    # Clip and scale float32 [-1, 1] to int16 PCM for a standard WAV file.
    samples = np.clip(samples, -1.0, 1.0)
    pcm16 = (samples * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(int(model.config.sampling_rate))
        wav_file.writeframes(pcm16.tobytes())
    return buf.getvalue()


def _pcm16_to_wav(pcm: bytes, sample_rate: int = 24000) -> bytes:
    """Wrap mono 16-bit PCM returned by Qwen in a browser-safe WAV file."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm)
    return buf.getvalue()


def _synthesize_qwen_urdu(text: str) -> bytes:
    """Read *text* in Urdu using Qwen3.5-Omni's multilingual audio output."""
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured")

    from openai import OpenAI

    client = OpenAI(
        api_key=api_key,
        base_url=_DASHSCOPE_BASE_URL,
        timeout=45,
    )
    stream = client.chat.completions.create(
        model=_QWEN_TTS_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a text-to-speech reader. Read the supplied text "
                    "exactly as written, without answering, translating, "
                    "paraphrasing, or adding words. Speak in natural Pakistani "
                    "Urdu at a calm, clear, moderate pace."
                ),
            },
            {"role": "user", "content": text},
        ],
        modalities=["text", "audio"],
        audio={"voice": _QWEN_TTS_VOICE, "format": "wav"},
        stream=True,
        stream_options={"include_usage": True},
    )

    chunks: list[str] = []
    for chunk in stream:
        if not chunk.choices:
            continue
        audio = getattr(chunk.choices[0].delta, "audio", None)
        if not audio:
            continue
        data = audio.get("data", "") if isinstance(audio, dict) else getattr(audio, "data", "")
        if data:
            chunks.append(data)

    if not chunks:
        raise RuntimeError("Qwen returned no audio")
    pcm = base64.b64decode("".join(chunks))
    if not pcm:
        raise RuntimeError("Qwen returned empty audio")
    return _pcm16_to_wav(pcm)


def _synthesize_gtts(text: str, gtts_lang: str) -> tuple[bytes, str]:
    from gtts import gTTS

    buf = io.BytesIO()
    gTTS(text=text, lang=gtts_lang).write_to_fp(buf)
    return buf.getvalue(), "audio/mpeg"


def synthesize(text: str, lang: str) -> tuple[bytes, str]:
    """Return (audio_bytes, content_type) for the given text and language.

    Urdu prefers Qwen3.5-Omni in auto mode. English/Hindi continue to use
    gTTS. The legacy MMS voice is used only when explicitly requested.
    """
    global _qwen_failed
    mode = _engine_mode()
    gtts_lang = {"ur": "ur", "hi": "hi", "en": "en"}.get(lang, "ur")

    if lang == "ur" and mode in {"auto", "qwen"} and not _qwen_failed:
        try:
            audio = _synthesize_qwen_urdu(text)
            return audio, "audio/wav"
        except Exception as exc:  # noqa: BLE001
            if mode == "qwen":
                raise
            _qwen_failed = True
            logger.warning(
                "Qwen Urdu TTS unavailable (%s: %s) — using gTTS for this process",
                type(exc).__name__, exc,
            )

    if lang == "ur" and mode == "mms":
        return _synthesize_mms(text), "audio/wav"

    return _synthesize_gtts(text, gtts_lang)
