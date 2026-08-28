"""Urdu text-to-speech: a real neural voice, with a safe fallback.

Meta's MMS-TTS (facebook/mms-tts-urd) is an open-source VITS-based model
trained specifically on Urdu — a genuine neural voice, not the older
formant/wrapper approach gTTS uses. It is loaded lazily (first Urdu request
only, never at app startup) and cached in memory for the life of the
process. Any failure — missing torch, out-of-memory, a slow/failed model
download — falls back to gTTS automatically so the endpoint never breaks in
a resource-constrained deployment; it just degrades to what was already
working.

NABZ_TTS_ENGINE controls this:
  auto  (default) — try MMS for Urdu, fall back to gTTS on any failure
  mms   — MMS only, no fallback (fails loudly so you notice in dev)
  gtts  — skip MMS entirely, use gTTS for everything (small/low-memory hosts)

Operational note: the MMS checkpoint (~145 MB) downloads into the Hugging
Face cache on first use. On a host without a persistent disk (e.g. a free
Render instance that respins), this download repeats after every redeploy
or spin-down/wake cycle, adding a one-time delay to the first Urdu request.
"""
from __future__ import annotations

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
_mms_load_failed = False


def _engine_mode() -> str:
    return os.getenv("NABZ_TTS_ENGINE", "auto").strip().lower()


def _load_mms():
    """Load and cache the MMS model + tokenizer. Raises on any failure."""
    global _mms_model, _mms_tokenizer
    if _mms_model is not None:
        return _mms_model, _mms_tokenizer
    from transformers import AutoTokenizer, VitsModel  # heavy import, lazy on purpose

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


def _synthesize_gtts(text: str, gtts_lang: str) -> tuple[bytes, str]:
    from gtts import gTTS

    buf = io.BytesIO()
    gTTS(text=text, lang=gtts_lang).write_to_fp(buf)
    return buf.getvalue(), "audio/mpeg"


def synthesize(text: str, lang: str) -> tuple[bytes, str]:
    """Return (audio_bytes, content_type) for the given text and language.

    Only Urdu gets the MMS neural voice — English/Hindi keep gTTS, since a
    separate MMS checkpoint per language is out of scope for now.
    """
    global _mms_load_failed
    mode = _engine_mode()
    gtts_lang = {"ur": "ur", "hi": "hi", "en": "en"}.get(lang, "ur")

    want_mms = lang == "ur" and mode in {"auto", "mms"} and not _mms_load_failed
    if want_mms:
        try:
            audio = _synthesize_mms(text)
            return audio, "audio/wav"
        except Exception as exc:  # noqa: BLE001
            if mode == "mms":
                raise
            _mms_load_failed = True
            logger.warning(
                "MMS-TTS unavailable (%s: %s) — falling back to gTTS for this process",
                type(exc).__name__, exc,
            )

    return _synthesize_gtts(text, gtts_lang)
