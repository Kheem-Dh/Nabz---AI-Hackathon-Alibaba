"""Dependency checks used by the orchestrator readiness probe."""
from __future__ import annotations

import logging

from sqlalchemy import text

from db import engine
from runtime import RuntimeSettings, configuration_errors
from storage import UPLOAD_DIR, _s3_bucket, _s3_client


logger = logging.getLogger("nabz.readiness")


def readiness_checks(settings: RuntimeSettings) -> tuple[bool, dict[str, str]]:
    checks: dict[str, str] = {}
    errors = configuration_errors(settings)
    checks["configuration"] = "ok" if not errors else "invalid"

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        logger.error("Database readiness check failed: %s", type(exc).__name__)
        checks["database"] = "unavailable"

    try:
        if settings.storage_backend == "s3":
            if settings.readiness_check_s3:
                _s3_client().head_bucket(Bucket=_s3_bucket())
            checks["storage"] = "ok"
        elif settings.storage_backend == "local":
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            checks["storage"] = "ok" if UPLOAD_DIR.is_dir() else "unavailable"
        else:
            checks["storage"] = "invalid"
    except Exception as exc:  # noqa: BLE001
        logger.error("Storage readiness check failed: %s", type(exc).__name__)
        checks["storage"] = "unavailable"

    checks["ai"] = "configured" if settings.ai_api_key else "unconfigured"
    required = {"configuration": "ok", "database": "ok", "storage": "ok"}
    if settings.is_production:
        required["ai"] = "configured"
    ready = all(checks.get(name) == expected for name, expected in required.items())
    return ready, checks
