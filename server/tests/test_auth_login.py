"""Login robustness + DB-hardening checks (all in MOCK_MODE, temp DB)."""
from __future__ import annotations

import uuid


def _rand_msisdn() -> str:
    """A random 10-digit PK mobile national number, e.g. 3451239876."""
    return f"3{uuid.uuid4().int % 10**9:09d}"


def test_login_works_across_phone_formats(client):
    msisdn = _rand_msisdn()
    reg = client.post(
        "/api/auth/register",
        json={"full_name": "Format User", "phone": f"0{msisdn}", "password": "secret123"},
    )
    assert reg.status_code == 200, reg.text

    # Registered as 0XXXXXXXXXX; every equivalent format must log in.
    for identifier in (f"+92{msisdn}", f"92{msisdn}", f"0{msisdn}", msisdn, f"0{msisdn[:3]}-{msisdn[3:]}"):
        resp = client.post(
            "/api/auth/login", json={"identifier": identifier, "password": "secret123"}
        )
        assert resp.status_code == 200, f"{identifier!r} -> {resp.status_code} {resp.text}"


def test_duplicate_phone_detected_across_formats(client):
    msisdn = _rand_msisdn()
    first = client.post(
        "/api/auth/register",
        json={"full_name": "First", "phone": f"0{msisdn}", "password": "secret123"},
    )
    assert first.status_code == 200
    dup = client.post(
        "/api/auth/register",
        json={"full_name": "Second", "phone": f"+92{msisdn}", "password": "secret123"},
    )
    assert dup.status_code == 409
    assert dup.json()["detail"] == "phone_already_registered"


def test_email_login_is_case_insensitive(client):
    email = f"Case_{uuid.uuid4().hex[:8]}@Example.COM"
    reg = client.post(
        "/api/auth/register",
        json={
            "full_name": "Case User",
            "phone": f"0{_rand_msisdn()}",
            "password": "secret123",
            "email": email,
        },
    )
    assert reg.status_code == 200, reg.text
    resp = client.post(
        "/api/auth/login", json={"identifier": email.upper(), "password": "secret123"}
    )
    assert resp.status_code == 200, resp.text


def test_wrong_password_still_rejected(client):
    msisdn = _rand_msisdn()
    client.post(
        "/api/auth/register",
        json={"full_name": "Pw User", "phone": f"0{msisdn}", "password": "secret123"},
    )
    resp = client.post(
        "/api/auth/login", json={"identifier": f"+92{msisdn}", "password": "wrongpass"}
    )
    assert resp.status_code == 401


# --- DB hardening ------------------------------------------------------------

def test_sqlite_foreign_keys_enabled():
    from db import engine

    with engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1


def test_email_unique_index_exists():
    # Expression indexes aren't reflectable via inspect(); read sqlite_master.
    from db import engine

    with engine.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master "
            "WHERE type='index' AND name='uq_accounts_email_lower'"
        ).fetchall()
    assert rows, "unique email index is missing"


def test_email_unique_index_is_enforced(client):
    """The DB constraint is a safety net behind the app-level 409 check."""
    import uuid as _uuid

    from db import SessionLocal
    from models_db import Account
    from security import hash_password

    email = f"dup_{_uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/auth/register",
        json={
            "full_name": "Owner",
            "phone": f"0{_rand_msisdn()}",
            "password": "secret123",
            "email": email,
        },
    )
    # Insert a second account with the same email (different case) directly,
    # bypassing the route's app-level check — the DB must reject it.
    session = SessionLocal()
    try:
        session.add(
            Account(
                full_name="Sneaky",
                phone=f"0{_rand_msisdn()}",
                email=email.upper(),
                password_hash=hash_password("secret123"),
            )
        )
        raised = False
        try:
            session.commit()
        except Exception:  # IntegrityError from the unique index
            raised = True
            session.rollback()
        assert raised, "duplicate email was not rejected by the DB"
    finally:
        session.close()


def test_delete_profile_cascades_children(client, auth):
    headers, _account, _self = auth
    created = client.post(
        "/api/profiles",
        headers=headers,
        json={"display_name": "Temp Kid", "relation": "Son", "age": 5},
    ).json()
    pid = created["id"]
    # Give the profile a triage session (a child row).
    client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": pid, "text": "halka sa zukam hai"},
    )
    assert client.delete(f"/api/profiles/{pid}", headers=headers).status_code == 204
    # Profile is gone; its children cascade-deleted (no orphan rows / errors).
    assert client.get(f"/api/profiles/{pid}", headers=headers).status_code == 404
