"""Privacy-safe request correlation and structured access telemetry."""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any

from starlette.datastructures import MutableHeaders


logger = logging.getLogger("nabz.requests")
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_NUMERIC_PATH_SEGMENT = re.compile(r"(?<=/)\d+(?=/|$)")


def _request_id(scope: dict[str, Any]) -> str:
    for key, value in scope.get("headers", []):
        if key.lower() == b"x-request-id":
            supplied = value.decode("latin-1").strip()
            if _SAFE_REQUEST_ID.fullmatch(supplied):
                return supplied
    return uuid.uuid4().hex


def _safe_path(scope: dict[str, Any]) -> str:
    """Use route templates when available and suppress raw numeric record IDs."""
    route = scope.get("route")
    template = getattr(route, "path", "") if route is not None else ""
    return template or _NUMERIC_PATH_SEGMENT.sub(":id", scope.get("path", ""))


class RequestTelemetryMiddleware:
    """Emit one JSON event per request without logging query strings or bodies."""

    def __init__(self, app: Any, environment: str) -> None:
        self.app = app
        self.environment = environment

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(scope)
        started = time.perf_counter()
        status_code = 500
        failed = False

        async def send_with_headers(message: dict) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = int(message.get("status", 500))
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
                headers["Server-Timing"] = f"app;dur={elapsed_ms}"
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        except Exception as exc:
            failed = True
            logger.exception(
                json.dumps(
                    {
                        "event": "request_error",
                        "request_id": request_id,
                        "environment": self.environment,
                        "method": scope.get("method", ""),
                        "path": _safe_path(scope),
                        "error_type": type(exc).__name__,
                    },
                    separators=(",", ":"),
                )
            )
            raise
        finally:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            level = logging.ERROR if failed or status_code >= 500 else logging.INFO
            logger.log(
                level,
                json.dumps(
                    {
                        "event": "request_completed",
                        "request_id": request_id,
                        "environment": self.environment,
                        "method": scope.get("method", ""),
                        "path": _safe_path(scope),
                        "status": status_code,
                        "latency_ms": elapsed_ms,
                        "error": failed or status_code >= 500,
                    },
                    separators=(",", ":"),
                ),
            )
