"""End-to-end API tests for Nabz — all run in MOCK_MODE (no credentials).

Covers: health, auth register/login, protected-route rejection, profile CRUD,
conversational triage (question -> result), emergency short-circuit, lab +
prescription structured shapes, prescription confirm, summary, clinics (8).
"""
from __future__ import annotations

import io

VALID_LEVELS = {"EMERGENCY", "DOCTOR_24H", "HOME_CARE"}


def _png_bytes() -> bytes:
    # Minimal 1x1 PNG — enough to exercise the multipart path in mock mode.
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000a49444154789c6300010000050001a5f645400000000049454e44ae4260"
        "82"
    )


# --- Health ------------------------------------------------------------------

def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["mock_mode"] is True


def test_clinics_returns_eight(client):
    clinics = client.get("/api/clinics").json()
    assert len(clinics) == 8
    for c in clinics:
        assert c["name"] and c["maps_query"]


# --- Auth --------------------------------------------------------------------

def test_register_and_login(client):
    phone = "03001234567"
    reg = client.post(
        "/api/auth/register",
        json={"full_name": "Ammi Jan", "phone": phone, "password": "pass1234"},
    )
    assert reg.status_code == 200, reg.text
    assert reg.json()["account"]["full_name"] == "Ammi Jan"
    assert reg.json()["token"]

    # Duplicate phone rejected.
    dup = client.post(
        "/api/auth/register",
        json={"full_name": "Someone", "phone": phone, "password": "pass1234"},
    )
    assert dup.status_code == 409

    login = client.post("/api/auth/login", json={"phone": phone, "password": "pass1234"})
    assert login.status_code == 200
    assert login.json()["token"]

    bad = client.post("/api/auth/login", json={"phone": phone, "password": "wrong"})
    assert bad.status_code == 401


def test_register_creates_self_profile(client, auth):
    headers, account, self_id = auth
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    profiles = client.get("/api/profiles", headers=headers).json()
    assert len(profiles) == 1
    assert profiles[0]["is_self"] is True


def test_protected_routes_reject_without_token(client):
    assert client.get("/api/profiles").status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/triage/start", json={"profile_id": 1, "text": "x"}).status_code == 401


# --- Profiles CRUD -----------------------------------------------------------

def test_profile_crud(client, auth):
    headers, _account, _self = auth
    created = client.post(
        "/api/profiles",
        headers=headers,
        json={
            "display_name": "Rayan",
            "relation": "Son",
            "age": 6,
            "gender": "male",
            "chronic_conditions": [],
            "allergies": ["penicillin"],
        },
    )
    assert created.status_code == 201, created.text
    pid = created.json()["id"]

    got = client.get(f"/api/profiles/{pid}", headers=headers)
    assert got.status_code == 200
    assert got.json()["display_name"] == "Rayan"

    upd = client.put(
        f"/api/profiles/{pid}",
        headers=headers,
        json={"display_name": "Rayan Khan", "age": 7, "allergies": ["penicillin"]},
    )
    assert upd.status_code == 200
    assert upd.json()["display_name"] == "Rayan Khan"
    assert upd.json()["age"] == 7

    deleted = client.delete(f"/api/profiles/{pid}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/profiles/{pid}", headers=headers).status_code == 404


def test_cannot_delete_self_profile(client, auth):
    headers, _account, self_id = auth
    resp = client.delete(f"/api/profiles/{self_id}", headers=headers)
    assert resp.status_code == 400


def test_profile_isolation_between_accounts(client, auth):
    headers_a, _a, _self_a = auth
    # Second account.
    reg = client.post(
        "/api/auth/register",
        json={"full_name": "Other", "phone": "03119998888", "password": "pass1234"},
    )
    headers_b = {"Authorization": f"Bearer {reg.json()['token']}"}
    profile_b = client.get("/api/profiles", headers=headers_b).json()[0]["id"]
    # Account A must not see account B's profile.
    assert client.get(f"/api/profiles/{profile_b}", headers=headers_a).status_code == 404


# --- Conversational triage ---------------------------------------------------

def test_triage_start_returns_question_then_result(client, auth):
    headers, _account, self_id = auth
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "teen din se bukhar hai"},
    )
    assert start.status_code == 200, start.text
    turn = start.json()
    assert turn["type"] == "question"
    assert turn["question_urdu"].strip()
    assert 2 <= len(turn["quick_replies"]) <= 4
    assert "analysis" in turn
    session_id = turn["session_id"]

    # Answer a few times until we reach a result (ceiling guarantees it).
    reached_result = False
    for _ in range(6):
        ans = client.post(
            "/api/triage/answer",
            headers=headers,
            json={"session_id": session_id, "text": "نہیں"},
        )
        assert ans.status_code == 200, ans.text
        body = ans.json()
        if body["type"] == "result":
            assert body["level"] in VALID_LEVELS
            assert body["advice_urdu"].strip()
            reached_result = True
            break
    assert reached_result


def test_skin_mark_gets_skin_specific_questions(client, auth):
    headers, _account, self_id = auth
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "mere right arm pe surkh nishan hai"},
    )
    assert start.status_code == 200, start.text
    first = start.json()
    assert first["type"] == "question"
    assert "نشان" in first["question_urdu"]
    assert "سانس" not in first["question_urdu"]
    assert "breath" not in (first["question_english"] or "").lower()
    assert any(
        fact["value_english"] == "Skin mark or redness"
        for fact in first["analysis"]["collected"]
    )
    assert any(
        fact["value_english"] == "Right arm"
        for fact in first["analysis"]["collected"]
    )

    answer = client.post(
        "/api/triage/answer",
        headers=headers,
        json={"session_id": first["session_id"], "text": "aaj se"},
    )
    assert answer.status_code == 200, answer.text
    second = answer.json()
    assert second["type"] == "question"
    related = f"{second['question_urdu']} {second['question_english']}".lower()
    assert any(word in related for word in ["خارش", "درد", "پھیل", "itch", "pain", "spread"])
    assert "سانس" not in second["question_urdu"]
    assert "breath" not in (second["question_english"] or "").lower()


def test_yes_to_breathing_question_short_circuits(client, auth):
    headers, _account, self_id = auth
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "teen din se khansi hai"},
    ).json()
    assert start["type"] == "question"
    assert "سانس" in start["question_urdu"]

    answer = client.post(
        "/api/triage/answer",
        headers=headers,
        json={"session_id": start["session_id"], "text": "ہاں"},
    ).json()
    assert answer["type"] == "result"
    assert answer["level"] == "EMERGENCY"
    assert answer["analysis"]["questions_asked"] == 1


def test_emergency_short_circuits_on_first_turn(client, auth):
    headers, _account, self_id = auth
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "seenay mein dard hai aur saans nahi aa rahi"},
    )
    assert start.status_code == 200
    turn = start.json()
    assert turn["type"] == "result"
    assert turn["level"] == "EMERGENCY"
    # No questions were asked before escalating.
    assert turn["analysis"]["questions_asked"] == 0


def test_suicidal_input_is_emergency(client, auth):
    headers, _account, self_id = auth
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "I am having suicidal thoughts"},
    )
    assert start.json()["type"] == "result"
    assert start.json()["level"] == "EMERGENCY"


def test_triage_personalizes_by_name(client, auth):
    headers, _account, _self = auth
    created = client.post(
        "/api/profiles",
        headers=headers,
        json={"display_name": "Bilal", "relation": "Brother", "age": 20},
    ).json()
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": created["id"], "text": "halka sa zukam hai"},
    ).json()
    assert start["patient_name"] == "Bilal"


# --- Lab report --------------------------------------------------------------

def test_labreport_structured_shape(client, auth):
    headers, _account, self_id = auth
    resp = client.post(
        "/api/labreport",
        headers=headers,
        data={"profile_id": str(self_id)},
        files={"file": ("cbc.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["values"]
    assert body["explanation_urdu"].strip()
    assert body["explanation_english"].strip()
    # Mock flags Haemoglobin/Iron as out-of-range.
    assert any(v["flag"] == "low" for v in body["flagged"])
    assert body["mock"] is True


# --- Prescription ------------------------------------------------------------

def test_prescription_extract_and_confirm(client, auth):
    headers, _account, self_id = auth
    resp = client.post(
        "/api/prescription",
        headers=headers,
        data={"profile_id": str(self_id)},
        files={"file": ("rx.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert resp.status_code == 200, resp.text
    rx = resp.json()
    assert len(rx["medicines"]) == 2
    # One field is deliberately low-confidence.
    assert any(m["confidence"] < 0.6 for m in rx["medicines"])
    assert rx["mock"] is True

    confirm = client.post(
        "/api/prescription/confirm",
        headers=headers,
        json={
            "profile_id": self_id,
            "date": rx["date"],
            "doctor_name": rx["doctor_name"],
            "clinic": rx["clinic"],
            "medicines": rx["medicines"],
        },
    )
    assert confirm.status_code == 200, confirm.text
    saved = confirm.json()
    assert len(saved) == 2

    # Confirmed medicines now live on the profile.
    profile = client.get(f"/api/profiles/{self_id}", headers=headers).json()
    assert len(profile["medicines"]) == 2
    assert all(m["source"] == "prescription" for m in profile["medicines"])


# --- Summary -----------------------------------------------------------------

def test_summary_generates(client, auth):
    headers, _account, self_id = auth
    # Give the profile a triage on record first.
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "seenay mein dard hai"},
    ).json()
    assert start["level"] == "EMERGENCY"

    resp = client.get(f"/api/summary/{self_id}", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["profile_id"] == self_id
    assert body["reference"].startswith("NABZ-")
    assert body["recent_triage"] is not None
    assert body["recent_triage"]["level"] == "EMERGENCY"


# --- Validation --------------------------------------------------------------

def test_empty_triage_text_rejected(client, auth):
    headers, _account, self_id = auth
    resp = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "   "},
    )
    assert resp.status_code == 422
