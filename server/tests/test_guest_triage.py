"""Public temporary assessment contract and privacy boundaries."""
from __future__ import annotations

import base64

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
    first_progress = body["turn"]["analysis"]["completeness"]
    assert first_progress >= 0.15
    assert _counts() == before

    with SessionLocal() as db:
        temporary = db.query(GuestTriageSession).one()
        assert temporary.token_hash != token
        assert token not in str(temporary.turns)

    previous_progress = first_progress
    for _ in range(6):
        response = client.post(
            "/api/guest/triage/answer",
            json={"state_token": token, "text": "No"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        if body["turn"]["type"] == "result":
            break
        next_progress = body["turn"]["analysis"]["completeness"]
        assert next_progress > previous_progress
        previous_progress = next_progress
    assert body["turn"]["type"] == "result"
    with SessionLocal() as db:
        temporary = db.query(GuestTriageSession).one()
        assessment_questions = [
            turn for turn in temporary.turns
            if turn.get("role") == "assistant"
            and turn.get("kind") in {"question", "image_request"}
        ]
        assert len(assessment_questions) <= 3
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


def test_guest_attachment_requires_consent_and_is_not_persisted(client):
    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    denied = client.post(
        "/api/guest/triage/attach",
        data={"consent": "false"},
        files={"file": ("photo.png", tiny_png, "image/png")},
    )
    assert denied.status_code == 422
    assert denied.json()["detail"] == "guest_consent_required"

    accepted = client.post(
        "/api/guest/triage/attach",
        data={"consent": "true"},
        files={"file": ("photo.png", tiny_png, "image/png")},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["description"]
    assert accepted.json()["mock"] is True
    with SessionLocal() as db:
        assert db.query(GuestTriageSession).count() == 0


def test_guest_followup_stops_after_three_and_requests_registration(client):
    started = client.post(
        "/api/guest/triage/start",
        json={"text": "I have a headache", "consent": True},
    ).json()
    token = started["state_token"]
    turn = started["turn"]
    while turn["type"] != "result":
        response = client.post(
            "/api/guest/triage/answer",
            json={"state_token": token, "text": "No"},
        )
        assert response.status_code == 200
        turn = response.json()["turn"]

    for number in range(1, 4):
        response = client.post(
            "/api/guest/triage/chat",
            json={"state_token": token, "text": f"Follow-up {number}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["followups_used"] == number
        assert body["followups_limit"] == 3
        assert body["registration_required"] is (number == 3)

    blocked = client.post(
        "/api/guest/triage/chat",
        json={"state_token": token, "text": "Follow-up 4"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "guest_followup_limit_reached"
    assert blocked.json()["detail"]["limit"] == 3
