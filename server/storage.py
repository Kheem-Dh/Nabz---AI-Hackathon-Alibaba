"""Private upload storage helpers.

Files are never mounted as public static assets. Routes resolve a stored
reference only after authenticating the account and checking profile ownership.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("NABZ_UPLOAD_DIR", str(SERVER_DIR / "uploads"))).resolve()
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED_SUFFIXES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".pdf",
    ".dcm",
    ".dicom",
}
CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
    ".dcm": "application/dicom",
    ".dicom": "application/dicom",
}


def content_type_for_filename(filename: str) -> str:
    """Return a server-controlled MIME type; never trust upload headers."""
    return CONTENT_TYPES.get(Path(filename or "").suffix.lower(), "application/octet-stream")


def store_upload(profile_id: int, payload: bytes, filename: str, prefix: str) -> str:
    if not payload:
        raise ValueError("empty_upload")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ValueError("upload_too_large")

    suffix = Path(filename or "document").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError("unsupported_file_type")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{prefix}_{profile_id}_{uuid.uuid4().hex}{suffix}"
    (UPLOAD_DIR / stored_name).write_bytes(payload)
    return f"uploads/{stored_name}"


def resolve_upload_ref(stored_ref: str) -> Path | None:
    """Resolve only references created by this module; reject traversal."""
    if not stored_ref or not stored_ref.startswith("uploads/"):
        return None
    name = stored_ref.removeprefix("uploads/")
    if not name or Path(name).name != name:
        return None
    candidate = (UPLOAD_DIR / name).resolve()
    if candidate.parent != UPLOAD_DIR:
        return None
    return candidate


def delete_upload_ref(stored_ref: str) -> None:
    path = resolve_upload_ref(stored_ref)
    if path and path.is_file():
        path.unlink()
