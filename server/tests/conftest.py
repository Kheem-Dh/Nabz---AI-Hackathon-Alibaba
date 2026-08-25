"""Pytest fixtures for the Nabz backend — all in MOCK_MODE, on a temp DB.

Environment must be set BEFORE importing db/main because the SQLAlchemy engine
is created at import time from DATABASE_URL.
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

# --- Configure environment before any app import --------------------------
os.environ["MOCK_MODE"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["NABZ_ENABLE_DEMO"] = "true"
os.environ.pop("DASHSCOPE_API_KEY", None)
os.environ["JWT_SECRET"] = "test-secret-nabz"
os.environ["NABZ_ADMIN_IDENTIFIERS"] = "admin@nabz.test"

_TMP_DB = Path(tempfile.gettempdir()) / f"nabz_test_{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
_TMP_UPLOADS = Path(tempfile.gettempdir()) / f"nabz_uploads_{uuid.uuid4().hex}"
os.environ["NABZ_UPLOAD_DIR"] = str(_TMP_UPLOADS)

# Make the server package importable when pytest runs from repo root or server/.
SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from db import init_db  # noqa: E402
from main import app  # noqa: E402
from fake_ai_provider import fake_ai_turn  # noqa: E402
from triage import set_turn_provider_for_tests  # noqa: E402

set_turn_provider_for_tests(fake_ai_turn)


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    init_db()
    yield
    try:
        _TMP_DB.unlink()
    except OSError:
        pass
    if _TMP_UPLOADS.exists():
        for path in _TMP_UPLOADS.iterdir():
            path.unlink()
        _TMP_UPLOADS.rmdir()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def auth(client: TestClient):
    """Register a fresh account and return (headers, account, self_profile_id)."""
    phone = f"03{uuid.uuid4().int % 10**9:09d}"
    resp = client.post(
        "/api/auth/register",
        json={"full_name": "Test User", "phone": phone, "password": "secret123"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    consent = client.put(
        "/api/privacy/consents",
        headers=headers,
        json={
            "choices": {"health_data_storage": True, "ai_processing": True},
            "source": "existing_user_gate",
        },
    )
    assert consent.status_code == 200, consent.text
    profiles = client.get("/api/profiles", headers=headers).json()
    self_id = profiles[0]["id"]
    return headers, resp.json()["account"], self_id
