"""Runtime environment contract for development, staging, and production."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class RuntimeConfigurationError(RuntimeError):
    """Raised when environment configuration cannot safely start the app."""


_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}
_VALID_ENVIRONMENTS = {"development", "staging", "production", "test"}
_DEFAULT_DATABASE_URL = f"sqlite:///{Path(__file__).resolve().parent / 'nabz.db'}"
_INSECURE_JWT_VALUES = {
    "",
    "change-me-nabz-dev-secret",
    "replace-with-a-long-random-production-secret",
    "secret",
}


def _placeholder(value: str) -> bool:
    lowered = value.strip().lower()
    return "replace-with" in lowered or "change-me" in lowered


def _boolean(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    value = raw.strip().lower()
    if value in _TRUE:
        return True
    if value in _FALSE:
        return False
    raise RuntimeConfigurationError(
        f"{name} must be one of true/false, 1/0, yes/no, or on/off"
    )


@dataclass(frozen=True)
class RuntimeSettings:
    app_env: str
    mock_mode: bool
    demo_enabled: bool
    api_docs_enabled: bool
    database_url: str
    ai_api_key: str
    jwt_secret: str
    storage_backend: str
    s3_bucket: str
    s3_region: str
    s3_endpoint_url: str
    aws_access_key_id: str
    aws_secret_access_key: str
    cors_origins: tuple[str, ...]
    readiness_check_s3: bool
    # Explicit demo-only escape hatch for hosts without object storage. The
    # default remains fail-closed in production because local disks are not
    # durable across a Render deploy/restart.
    allow_ephemeral_local_storage: bool = False

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @classmethod
    def from_env(cls) -> "RuntimeSettings":
        app_env = os.getenv("APP_ENV", "development").strip().lower()
        if app_env not in _VALID_ENVIRONMENTS:
            allowed = ", ".join(sorted(_VALID_ENVIRONMENTS))
            raise RuntimeConfigurationError(f"APP_ENV must be one of: {allowed}")

        mock_mode = _boolean("MOCK_MODE", False)
        is_production = app_env == "production"
        demo_enabled = _boolean(
            "NABZ_ENABLE_DEMO", mock_mode and not is_production
        )
        requested_docs = _boolean("NABZ_ENABLE_API_DOCS", not is_production)
        origins = tuple(
            value.strip()
            for value in os.getenv(
                "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
            ).split(",")
            if value.strip()
        )
        return cls(
            app_env=app_env,
            mock_mode=mock_mode,
            demo_enabled=demo_enabled,
            api_docs_enabled=requested_docs and not is_production,
            database_url=os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL).strip(),
            ai_api_key=os.getenv("DASHSCOPE_API_KEY", "").strip(),
            jwt_secret=os.getenv("JWT_SECRET", "change-me-nabz-dev-secret").strip(),
            storage_backend=os.getenv("NABZ_STORAGE_BACKEND", "local").strip().lower(),
            s3_bucket=os.getenv("NABZ_S3_BUCKET", "").strip(),
            s3_region=os.getenv("NABZ_S3_REGION", "").strip(),
            s3_endpoint_url=os.getenv("NABZ_S3_ENDPOINT_URL", "").strip(),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "").strip(),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "").strip(),
            cors_origins=origins,
            readiness_check_s3=_boolean("NABZ_READINESS_CHECK_S3", is_production),
            allow_ephemeral_local_storage=_boolean(
                "NABZ_ALLOW_EPHEMERAL_LOCAL_STORAGE", False
            ),
        )


def configuration_errors(settings: RuntimeSettings) -> list[str]:
    """Return stable error codes without leaking secret values."""
    errors: list[str] = []
    if settings.storage_backend not in {"local", "s3"}:
        errors.append("invalid_storage_backend")
    if bool(settings.aws_access_key_id) != bool(settings.aws_secret_access_key):
        errors.append("incomplete_aws_credentials")

    if not settings.is_production:
        # Staging must also reject weak JWT secrets — it may process real patient
        # data and a compromised staging token can be replayed against production
        # if the same secret is accidentally shared.
        if settings.app_env == "staging" and (
            settings.jwt_secret.lower() in _INSECURE_JWT_VALUES
            or len(settings.jwt_secret) < 32
        ):
            errors.append("secure_jwt_secret_required_in_staging")
        return errors

    if settings.mock_mode:
        errors.append("mock_mode_forbidden_in_production")
    if settings.demo_enabled:
        errors.append("demo_routes_forbidden_in_production")
    if not settings.database_url:
        errors.append("database_url_required")
    if not settings.ai_api_key or _placeholder(settings.ai_api_key):
        errors.append("dashscope_api_key_required")
    if (
        settings.jwt_secret.lower() in _INSECURE_JWT_VALUES
        or len(settings.jwt_secret) < 32
    ):
        errors.append("secure_jwt_secret_required")
    if settings.storage_backend != "s3" and not settings.allow_ephemeral_local_storage:
        errors.append("s3_storage_required_in_production")
    if settings.storage_backend == "s3":
        if not settings.s3_bucket or _placeholder(settings.s3_bucket):
            errors.append("s3_bucket_required")
        if not settings.s3_region and not settings.s3_endpoint_url:
            errors.append("s3_region_or_endpoint_required")
        if settings.s3_endpoint_url and (
            not settings.aws_access_key_id or not settings.aws_secret_access_key
        ):
            errors.append("s3_compatible_credentials_required")
    return errors


def validate_startup_configuration(settings: RuntimeSettings) -> None:
    errors = configuration_errors(settings)
    if errors:
        raise RuntimeConfigurationError(
            "Invalid runtime configuration: " + ", ".join(errors)
        )
