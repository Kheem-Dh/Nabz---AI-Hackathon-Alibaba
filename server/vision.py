"""Qwen-VL vision helper — shared by lab-report and prescription routes.

Uses the OpenAI-compatible DashScope endpoint with image content parts. Never
raises on failure — returns (json_dict | None, raw_text) so callers can decide
their own safe fallback.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger("nabz.vision")

DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"

# Model routing (winning plan §6.1). Prefer NABZ_VL_MODEL (e.g. qwen3.7-plus
# for structured extraction), fall back to legacy QWEN_VL_MODEL, then a safe
# default. NABZ_VL_OCR_FALLBACK (e.g. qwen-vl-ocr) is documented for future
# handwriting-heavy retries.
_VL_MODEL_CHAIN = ("NABZ_VL_MODEL", "QWEN_VL_MODEL")
_DEFAULT_VL_MODEL = "qwen-vl-plus"
REQUEST_TIMEOUT_SECONDS = 60


def get_vl_model() -> str:
    for env_var in _VL_MODEL_CHAIN:
        val = os.getenv(env_var, "").strip()
        if val:
            return val
    return _DEFAULT_VL_MODEL


def get_vl_ocr_fallback() -> str | None:
    val = os.getenv("NABZ_VL_OCR_FALLBACK", "").strip()
    return val or None


def _strip_fences(raw: str) -> str:
    t = raw.strip()
    t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _guess_mime(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".pdf"):
        return "application/pdf"
    return "image/jpeg"


def analyze_image(
    image_bytes: bytes,
    filename: str,
    system_prompt: str,
    user_prompt: str,
) -> tuple[dict[str, Any] | None, str]:
    """Send an image + prompts to Qwen-VL. Returns (parsed_json_or_none, raw)."""
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        return None, ""

    mime = _guess_mime(filename)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    try:
        from openai import OpenAI

        client = OpenAI(
            api_key=api_key,
            base_url=DASHSCOPE_BASE_URL,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        completion = client.chat.completions.create(
            model=get_vl_model(),
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        logger.error("Qwen-VL call failed: %s", exc, exc_info=True)
        return None, ""

    try:
        return json.loads(_strip_fences(raw)), raw
    except Exception as exc:  # noqa: BLE001
        logger.error("Qwen-VL JSON parse failed (%s). Raw: %s", exc, raw)
        return None, raw
