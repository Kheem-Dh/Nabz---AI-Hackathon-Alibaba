"""Private upload storage helpers.

Files are never mounted as public static assets. Routes resolve a stored
reference only after authenticating the account and checking profile ownership.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

SERVER_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("NABZ_UPLOAD_DIR", str(SERVER_DIR / "uploads"))).resolve()
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_SUFFIXES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".heic",
    ".heif",
    ".bmp",
    ".tif",
    ".tiff",
    ".pdf",
    ".dcm",
    ".dicom",
}
CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".pdf": "application/pdf",
    ".dcm": "application/dicom",
    ".dicom": "application/dicom",
}


def content_type_for_filename(filename: str) -> str:
    """Return a server-controlled MIME type; never trust upload headers."""
    return CONTENT_TYPES.get(Path(filename or "").suffix.lower(), "application/octet-stream")


def _storage_backend() -> str:
    return os.getenv("NABZ_STORAGE_BACKEND", "local").strip().lower()


def _s3_client() -> Any:
    try:
        import boto3  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised only in cloud deployments
        raise RuntimeError("boto3_required_for_s3_storage") from exc
    kwargs: dict[str, Any] = {}
    endpoint = os.getenv("NABZ_S3_ENDPOINT_URL", "").strip()
    region = os.getenv("NABZ_S3_REGION", "").strip()
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    if region:
        kwargs["region_name"] = region
    return boto3.client("s3", **kwargs)


def _s3_bucket() -> str:
    bucket = os.getenv("NABZ_S3_BUCKET", "").strip()
    if not bucket:
        raise RuntimeError("NABZ_S3_BUCKET_required")
    return bucket


def _validate_vault_upload(payload: bytes, filename: str, content_type: str | None) -> str:
    if not payload:
        raise ValueError("empty_upload")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ValueError("file_too_large_max_25mb")

    suffix = Path(filename or "document").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError(f"unsupported_type:{content_type or suffix or 'unknown'}")
    if suffix in {".dcm", ".dicom"}:
        if len(payload) < 132 or payload[128:132] != b"DICM":
            raise ValueError("file_signature_not_recognized")
        return "application/dicom"
    from vision import validate_upload

    mime, error = validate_upload(payload, filename, content_type)
    if error:
        raise ValueError(error)
    return mime


def store_upload(
    profile_id: int,
    payload: bytes,
    filename: str,
    prefix: str,
    content_type: str | None = None,
) -> str:
    mime = _validate_vault_upload(payload, filename, content_type)
    suffix = Path(filename or "document").suffix.lower()
    stored_name = f"{prefix}_{profile_id}_{uuid.uuid4().hex}{suffix}"

    if _storage_backend() == "s3":
        bucket = _s3_bucket()
        key = f"profiles/{profile_id}/{stored_name}"
        _s3_client().put_object(
            Bucket=bucket,
            Key=key,
            Body=payload,
            ContentType=mime,
            ServerSideEncryption=os.getenv("NABZ_S3_SSE", "AES256"),
        )
        return f"s3://{bucket}/{key}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
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
    if stored_ref.startswith("s3://"):
        bucket_and_key = stored_ref.removeprefix("s3://")
        bucket, separator, key = bucket_and_key.partition("/")
        if separator and bucket and key:
            _s3_client().delete_object(Bucket=bucket, Key=key)
        return
    path = resolve_upload_ref(stored_ref)
    if path and path.is_file():
        path.unlink()


def presigned_download_url(stored_ref: str, filename: str, expires_seconds: int = 300) -> str | None:
    if not stored_ref.startswith("s3://"):
        return None
    bucket_and_key = stored_ref.removeprefix("s3://")
    bucket, separator, key = bucket_and_key.partition("/")
    if not separator or not bucket or not key:
        return None
    return _s3_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentDisposition": f'inline; filename="{Path(filename).name}"',
        },
        ExpiresIn=max(60, min(expires_seconds, 900)),
    )
