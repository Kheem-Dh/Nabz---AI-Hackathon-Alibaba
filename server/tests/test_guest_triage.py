"""Public temporary assessment contract and privacy boundaries."""
from __future__ import annotations

from db import SessionLocal
from models_db import Account, GuestTriageSession, Profile, TriageSession


def _counts():
    with SessionLocal() as db:
        return (
            db.query(Account).count(),
            db.query(Profile).count(),
            db.query(TriageSession).count(),
        )


def test_guest_requires_explicit_temporary_processing_consent(client):
    response = client.post(
        "/api/guest/triage/start",
        json={"text": "I have a headache", "consent": False},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "guest_consent_required"


def test_guest_assessment_is_anonymous_opaque_and_completes(client):
    before = _counts()
    response = client.post(
        "/api/guest/triage/start",
        json={"text": "I have a headache", "consent": True},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    token = body["state_token"]
    assert len(token) >= 32
    assert body["turn"]["type"] == "question"
    assert body["turn"]["question_english"]
    assert _counts() == before

    with SessionLocal() as db:
        temporary = db.query(GuestTriageSession).one()
        assert temporary.token_hash != token
        assert token not in str(temporary.turns)

    for _ in range(6):
        response = client.post(
            "/api/guest/triage/answer",
            json={"state_token": token, "text": "No"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        if body["turn"]["type"] == "result":
            break
    assert body["turn"]["type"] == "result"
    assert body["turn"]["level"] in {"EMERGENCY", "DOCTOR_24H", "HOME_CARE"}
    assert _counts() == before

    closed = client.post(
        "/api/guest/triage/answer",
        json={"state_token": token, "text": "Another answer"},
    )
    assert closed.status_code == 409

    cleared = client.delete(f"/api/guest/triage/{token}")
    assert cleared.status_code == 204
    with SessionLocal() as db:
        assert db.query(GuestTriageSession).count() == 0


def test_guest_token_is_required_and_invalid_tokens_are_rejected(client):
    response = client.post(
        "/api/guest/triage/answer",
        json={"state_token": "x" * 48, "text": "No"},
    )
    assert response.status_code == 404
