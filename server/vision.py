"""Qwen-VL vision helper — shared by lab-report and prescription routes.

Uses the OpenAI-compatible DashScope endpoint with image content parts. Accepts
JPG / PNG / WebP / GIF / HEIC / PDF (PDFs are converted to images page-by-page
with PyMuPDF — pip-only, no system deps). Never raises on failure — returns
(json_dict | None, raw_text) so callers can decide their own safe fallback.
"""
from __future__ import annotations

import base64
import io
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

# Server-side upload limits (winning plan §17).
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_PDF_PAGES_SENT = 2                # PDFs beyond page 2 are dropped (demo cap)
PDF_RENDER_DPI = 180                  # legibility trade-off vs. request size

ACCEPTED_IMAGE_MIMES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/bmp",
    "image/tiff",
}
ACCEPTED_PDF_MIMES = {"application/pdf"}
ACCEPTED_MIMES = ACCEPTED_IMAGE_MIMES | ACCEPTED_PDF_MIMES


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


_EXT_TO_MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic", ".heif": "image/heif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff", ".tiff": "image/tiff",
    ".pdf": "application/pdf",
}


def _guess_mime(filename: str, provided: str | None = None) -> str:
    """Return an ACCEPTED mime if the extension or provided content-type says
    so; return an empty string if neither is usable — the validator then
    rejects with a clear message instead of silently pretending it's a JPEG.
    """
    if provided:
        p = provided.strip().lower()
        if p in ACCEPTED_MIMES:
            return p
    lower = (filename or "").lower()
    for ext, mime in _EXT_TO_MIME.items():
        if lower.endswith(ext):
            return mime
    return ""


def _sniff_mime(payload: bytes) -> str:
    """Identify supported formats from bytes instead of trusting metadata."""
    head = payload[:32]
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"BM"):
        return "image/bmp"
    if head.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:16].lower()
        if any(marker in brand for marker in (b"heic", b"heif", b"heix", b"mif1", b"msf1")):
            return "image/heic"
    return ""


def _pdf_to_png_pages(pdf_bytes: bytes, max_pages: int = MAX_PDF_PAGES_SENT) -> list[bytes]:
    """Render up to `max_pages` PDF pages to PNG bytes using PyMuPDF."""
    try:
        import pymupdf  # type: ignore
    except Exception as exc:  # noqa: BLE001
        logger.error("pymupdf import failed — cannot process PDF: %s", exc)
        return []

    pages: list[bytes] = []
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        logger.error("pymupdf could not open uploaded PDF: %s", exc)
        return []

    try:
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            matrix = pymupdf.Matrix(PDF_RENDER_DPI / 72, PDF_RENDER_DPI / 72)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            pages.append(pix.tobytes("png"))
    finally:
        doc.close()
    return pages


def validate_upload(payload: bytes, filename: str, content_type: str | None) -> tuple[str, str | None]:
    """Return (mime, error). If mime is empty, the upload should be rejected."""
    if not payload:
        return "", "empty_upload"
    if len(payload) > MAX_UPLOAD_BYTES:
        return "", f"file_too_large_max_{MAX_UPLOAD_BYTES // (1024 * 1024)}mb"
    declared = _guess_mime(filename, content_type)
    detected = _sniff_mime(payload)
    if not declared or declared not in ACCEPTED_MIMES:
        display = declared or (content_type or "unknown")
        return "", f"unsupported_type:{display}"
    if not detected:
        return "", "file_signature_not_recognized"
    compatible = declared == detected or {
        declared, detected
    } <= {"image/heic", "image/heif"} or {
        declared, detected
    } <= {"image/jpeg", "image/jpg"}
    if not compatible:
        return "", f"file_signature_mismatch:{declared}:{detected}"
    return detected, None


def _image_parts_from_upload(
    payload: bytes, filename: str, content_type: str | None
) -> tuple[list[dict], str | None]:
    """Return (openai-content-parts, error). Handles PDF conversion transparently."""
    mime, err = validate_upload(payload, filename, content_type)
    if err:
        return [], err

    if mime in ACCEPTED_PDF_MIMES:
        pages = _pdf_to_png_pages(payload)
        if not pages:
            return [], "pdf_render_failed"
        return (
            [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64,"
                        + base64.b64encode(p).decode("ascii")
                    },
                }
                for p in pages
            ],
            None,
        )

    b64 = base64.b64encode(payload).decode("ascii")
    return (
        [
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            }
        ],
        None,
    )


def analyze_image(
    image_bytes: bytes,
    filename: str,
    system_prompt: str,
    user_prompt: str,
    content_type: str | None = None,
) -> tuple[dict[str, Any] | None, str]:
    """Send an image (or a PDF, expanded to page images) + prompts to Qwen-VL.

    Returns (parsed_json_or_none, raw). Never raises.
    """
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        return None, ""

    parts, err = _image_parts_from_upload(image_bytes, filename, content_type)
    if err or not parts:
        logger.info("Vision upload rejected: %s", err)
        return None, err or "no_image_parts"

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
                    "content": [{"type": "text", "text": user_prompt}, *parts],
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


def describe_image(
    image_bytes: bytes,
    filename: str,
    content_type: str | None,
    profile_name: str,
) -> str | None:
    """Small helper used by the chat-attach flow: return a short, factual
    English description of what is visibly present in the image / PDF."""
    system = (
        "You are a careful medical visual assistant. Describe ONLY what is "
        "visibly present in the image. Do NOT diagnose. Do NOT recommend a "
        "medicine. If uncertain, say so. Return STRICT JSON of the form "
        '{"description_english":"…","description_urdu":"…"} in 1–2 short '
        "sentences per language."
    )
    user = (
        f"The active patient is {profile_name}. Describe visible features "
        "briefly and factually — no diagnosis, no treatment advice."
    )
    data, _raw = analyze_image(image_bytes, filename, system, user, content_type)
    if not isinstance(data, dict):
        return None
    en = str(data.get("description_english", "")).strip()
    ur = str(data.get("description_urdu", "")).strip()
    parts = [ur, en] if (ur or en) else []
    return " · ".join(p for p in parts if p) or None
