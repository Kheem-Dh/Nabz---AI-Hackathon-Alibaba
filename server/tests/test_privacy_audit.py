"""Versioned consent enforcement and privacy-safe account audit history."""
from __future__ import annotations

import uuid


def _register(client, name: str = "Privacy User"):
    phone = f"03{uuid.uuid4().int % 10**9:09d}"
    response = client.post(
        "/api/auth/register",
        json={"full_name": name, "phone": phone, "password": "secret123"},
    )
    assert response.status_code == 200, response.text
    headers = {"Authorization": f"Bearer {response.json()['token']}"}
    profile_id = client.get("/api/profiles", headers=headers).json()[0]["id"]
    return headers, profile_id


def _accept(client, headers, **choices):
    return client.put(
        "/api/privacy/consents",
        headers=headers,
        json={"choices": choices, "source": "existing_user_gate"},
    )


def test_consent_is_versioned_and_required_for_clinical_writes(client):
    headers, profile_id = _register(client)

    initial = client.get("/api/privacy/consents", headers=headers)
    assert initial.status_code == 200
    assert initial.json()["complete"] is False
    assert initial.json()["consents"]["health_data_storage"]["required_version"] == "2026-08-25"

    denied = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": profile_id, "text": "I have had a fever for two days"},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"].startswith("consent_required:")

    storage_only = _accept(client, headers, health_data_storage=True)
    assert storage_only.status_code == 200
    assert storage_only.json()["complete"] is False
    denied_ai = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": profile_id, "text": "I have had a fever for two days"},
    )
    assert denied_ai.status_code == 403
    assert "ai_processing" in denied_ai.json()["detail"]

    accepted = _accept(client, headers, ai_processing=True)
    assert accepted.status_code == 200
    assert accepted.json()["complete"] is True

    allowed = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": profile_id, "text": "I have had a fever for two days"},
    )
    assert allowed.status_code == 200, allowed.text

    revoked = _accept(client, headers, ai_processing=False)
    assert revoked.status_code == 200
    assert revoked.json()["complete"] is False
    denied_after_revoke = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": profile_id, "text": "I have a new cough"},
    )
    assert denied_after_revoke.status_code == 403


def test_audit_activity_is_account_scoped_and_contains_no_clinical_text(client):
    headers_a, profile_a = _register(client, "Audit A")
    headers_b, _profile_b = _register(client, "Audit B")
    assert _accept(client, headers_a, health_data_storage=True, ai_processing=True).status_code == 200
    assert _accept(client, headers_b, health_data_storage=True, ai_processing=True).status_code == 200

    secret_text = "private symptom phrase unique audit test"
    triage = client.post(
        "/api/triage/start",
        headers=headers_a,
        json={"profile_id": profile_a, "text": secret_text},
    )
    assert triage.status_code == 200, triage.text

    activity_a = client.get("/api/privacy/activity", headers=headers_a).json()["events"]
    activity_b = client.get("/api/privacy/activity", headers=headers_b).json()["events"]
    assert any(event["type"] == "triage.started" for event in activity_a)
    assert not any(event["type"] == "triage.started" for event in activity_b)
    assert secret_text not in str(activity_a)
    assert all("filename" not in str(event).lower() for event in activity_a)
