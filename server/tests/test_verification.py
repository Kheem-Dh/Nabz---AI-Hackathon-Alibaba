"""Phone + email verification (soft gate) — all in MOCK_MODE.

In mock mode the OTP is returned as `dev_code`, so these tests exercise the
real create → send → verify path end to end without any SMS/SMTP provider.
"""
from __future__ import annotations

import uuid


def _register(client, email=None):
    phone = f"03{uuid.uuid4().int % 10**9:09d}"
    body = {"full_name": "Verify User", "phone": phone, "password": "secret123"}
    if email:
        body["email"] = email
    resp = client.post("/api/auth/register", json=body)
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}, resp.json()["account"], phone


def test_new_account_is_unverified(client):
    headers, account, _phone = _register(client)
    assert account["phone_verified"] is False
    assert account["email_verified"] is False
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["phone_verified"] is False


def test_soft_gate_unverified_can_use_app(client, auth):
    # The auth fixture account is unverified, yet protected routes still work.
    headers, _account, _self = auth
    assert client.get("/api/profiles", headers=headers).status_code == 200


def test_phone_otp_request_and_verify(client):
    headers, _account, _phone = _register(client)

    sent = client.post("/api/auth/request-otp", headers=headers, json={"channel": "phone"})
    assert sent.status_code == 200, sent.text
    body = sent.json()
    assert body["channel"] == "phone"
    assert body["sent"] is False           # no real provider in mock mode
    assert body["dev_code"] and body["dev_code"].isdigit()
    code = body["dev_code"]

    ok = client.post(
        "/api/auth/verify-otp", headers=headers, json={"channel": "phone", "code": code}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["phone_verified"] is True
    # /me now reflects it.
    assert client.get("/api/auth/me", headers=headers).json()["phone_verified"] is True


def test_wrong_code_is_rejected(client):
    headers, _account, _phone = _register(client)
    client.post("/api/auth/request-otp", headers=headers, json={"channel": "phone"})
    bad = client.post(
        "/api/auth/verify-otp", headers=headers, json={"channel": "phone", "code": "000000"}
    )
    assert bad.status_code == 400
    assert bad.json()["detail"].startswith("invalid_code")
    # Still unverified.
    assert client.get("/api/auth/me", headers=headers).json()["phone_verified"] is False


def test_verify_without_active_code(client):
    headers, _account, _phone = _register(client)
    resp = client.post(
        "/api/auth/verify-otp", headers=headers, json={"channel": "phone", "code": "123456"}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "no_active_code"


def test_resend_cooldown(client):
    headers, _account, _phone = _register(client)
    first = client.post("/api/auth/request-otp", headers=headers, json={"channel": "phone"})
    assert first.status_code == 200
    second = client.post("/api/auth/request-otp", headers=headers, json={"channel": "phone"})
    assert second.status_code == 429
    assert second.json()["detail"].startswith("resend_cooldown")


def test_email_otp_flow(client):
    email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    headers, account, _phone = _register(client, email=email)
    assert account["email"] == email

    sent = client.post("/api/auth/request-otp", headers=headers, json={"channel": "email"})
    assert sent.status_code == 200, sent.text
    code = sent.json()["dev_code"]
    assert code

    ok = client.post(
        "/api/auth/verify-otp", headers=headers, json={"channel": "email", "code": code}
    )
    assert ok.status_code == 200
    assert ok.json()["email_verified"] is True
    # Phone stays independently unverified.
    assert ok.json()["phone_verified"] is False


def test_email_otp_requires_email_on_account(client):
    headers, _account, _phone = _register(client)  # no email
    resp = client.post("/api/auth/request-otp", headers=headers, json={"channel": "email"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "no_email_on_account"


def test_request_otp_requires_auth(client):
    assert client.post("/api/auth/request-otp", json={"channel": "phone"}).status_code == 401


def test_email_login_duplicate_email_and_typo_validation(client):
    email = f"login_{uuid.uuid4().hex[:8]}@example.com"
    _headers, _account, _phone = _register(client, email=email)

    login = client.post(
        "/api/auth/login", json={"identifier": email.upper(), "password": "secret123"}
    )
    assert login.status_code == 200, login.text

    duplicate = client.post(
        "/api/auth/register",
        json={
            "full_name": "Duplicate Email",
            "phone": f"03{uuid.uuid4().int % 10**9:09d}",
            "password": "secret123",
            "email": email.upper(),
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "email_already_registered"

    typo = client.post(
        "/api/auth/register",
        json={
            "full_name": "Typo Email",
            "phone": f"03{uuid.uuid4().int % 10**9:09d}",
            "password": "secret123",
            "email": "faiza@example.combnn",
        },
    )
    assert typo.status_code == 422


def test_password_reset_with_email(client):
    email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    _headers, _account, _phone = _register(client, email=email)

    requested = client.post(
        "/api/auth/password-reset/request", json={"identifier": email}
    )
    assert requested.status_code == 200, requested.text
    code = requested.json()["dev_code"]
    assert code and len(code) == 6

    reset = client.post(
        "/api/auth/password-reset/confirm",
        json={"identifier": email, "code": code, "new_password": "newpass123"},
    )
    assert reset.status_code == 200, reset.text
    assert reset.json() == {"reset": True}
    assert client.post(
        "/api/auth/login", json={"identifier": email, "password": "newpass123"}
    ).status_code == 200


def test_password_reset_does_not_reveal_unknown_account(client):
    requested = client.post(
        "/api/auth/password-reset/request", json={"identifier": "missing@example.com"}
    )
    assert requested.status_code == 200
    assert requested.json()["dev_code"] is None
