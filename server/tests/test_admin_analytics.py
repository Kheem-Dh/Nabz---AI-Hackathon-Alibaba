"""Owner analytics authorization, usage counters, and privacy-safe logs."""
from __future__ import annotations

import uuid


def _register_admin(client):
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Nabz Owner",
            "phone": f"03{uuid.uuid4().int % 10**9:09d}",
            "email": "admin@nabz.test",
            "password": "secret123",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["account"]["is_admin"] is True
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_admin_endpoints_reject_normal_authenticated_user(client, auth):
    headers, account, _profile_id = auth
    assert account["is_admin"] is False
    assert client.get("/api/admin/overview", headers=headers).status_code == 403
    assert client.get("/api/admin/logs", headers=headers).status_code == 403


def test_owner_sees_real_usage_and_privacy_safe_request_logs(client):
    headers = _register_admin(client)
    session_key = "owner_session_123456789"

    first = client.post(
        "/api/analytics/heartbeat",
        headers=headers,
        json={"session_key": session_key, "path": "/admin?secret=no", "page_view": True},
    )
    second = client.post(
        "/api/analytics/heartbeat",
        headers=headers,
        json={"session_key": session_key, "path": "/admin", "active_seconds": 30},
    )
    assert first.status_code == second.status_code == 200

    # Produce an authenticated route event before fetching the console.
    assert client.get("/api/profiles", headers=headers).status_code == 200
    overview = client.get("/api/admin/overview?days=14", headers=headers)
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["overview"]["total_users"] >= 1
    assert body["overview"]["active_24h"] >= 1
    assert body["overview"]["total_active_seconds"] >= 1
    assert len(body["series"]) == 14
    owner = next(user for user in body["recent_users"] if user["email"] == "admin@nabz.test")
    assert owner["sessions"] == 1

    logs = client.get("/api/admin/logs", headers=headers)
    assert logs.status_code == 200
    rows = logs.json()["logs"]
    assert any(row["path"] == "/api/profiles" and row["account_id"] for row in rows)
    assert all("?" not in row["path"] for row in rows)
    assert all("body" not in row and "token" not in row for row in rows)
