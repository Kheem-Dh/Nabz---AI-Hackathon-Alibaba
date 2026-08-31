"""Production environment contract, route gating, and request telemetry."""
from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from main import create_app
from runtime import (
    RuntimeConfigurationError,
    RuntimeSettings,
    configuration_errors,
)


def _production_settings() -> RuntimeSettings:
    return RuntimeSettings(
        app_env="production",
        mock_mode=False,
        demo_enabled=False,
        api_docs_enabled=False,
        database_url="sqlite:////data/nabz.db",
        ai_api_key="production-ai-key",
        jwt_secret="a" * 64,
        storage_backend="s3",
        s3_bucket="private-medical-vault",
        s3_region="ap-southeast-1",
        s3_endpoint_url="",
        aws_access_key_id="",
        aws_secret_access_key="",
        cors_origins=(),
        readiness_check_s3=False,
        allow_ephemeral_local_storage=False,
    )


def test_valid_production_configuration_has_no_errors():
    assert configuration_errors(_production_settings()) == []


def test_production_configuration_rejects_mock_local_and_missing_secrets():
    invalid = replace(
        _production_settings(),
        mock_mode=True,
        demo_enabled=True,
        database_url="",
        ai_api_key="",
        jwt_secret="replace-with-a-long-random-production-secret",
        storage_backend="local",
        s3_bucket="",
        s3_region="",
    )
    assert set(configuration_errors(invalid)) >= {
        "mock_mode_forbidden_in_production",
        "demo_routes_forbidden_in_production",
        "database_url_required",
        "dashscope_api_key_required",
        "secure_jwt_secret_required",
        "s3_storage_required_in_production",
    }


def test_production_can_explicitly_use_ephemeral_local_storage_for_demo():
    demo = replace(
        _production_settings(),
        storage_backend="local",
        allow_ephemeral_local_storage=True,
    )
    assert configuration_errors(demo) == []


def test_invalid_production_configuration_fails_application_startup():
    invalid = replace(_production_settings(), mock_mode=True)
    with pytest.raises(RuntimeConfigurationError, match="mock_mode_forbidden"):
        with TestClient(create_app(invalid)):
            pass


def test_production_disables_docs_demo_routes_and_sensitive_health_details():
    client = TestClient(create_app(_production_settings()))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
    assert client.post("/api/demo/hassan").status_code == 404

    detail = client.get("/api/health/detail")
    assert detail.status_code == 200
    assert detail.json() == {
        "status": "ok",
        "environment": "production",
        "mock_mode": False,
        "demo_enabled": False,
        "triage_engine": "live_ai",
        "ai_configured": True,
    }


def test_request_correlation_and_timing_headers_are_returned():
    client = TestClient(create_app(_production_settings()))
    response = client.get(
        "/api/health/live", headers={"X-Request-ID": "deploy-smoke-123"}
    )
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "deploy-smoke-123"
    assert response.headers["server-timing"].startswith("app;dur=")
    assert response.json() == {"status": "alive", "environment": "production"}


def test_production_forces_api_docs_off_even_if_requested(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("NABZ_ENABLE_API_DOCS", "true")
    settings = RuntimeSettings.from_env()
    assert settings.api_docs_enabled is False
