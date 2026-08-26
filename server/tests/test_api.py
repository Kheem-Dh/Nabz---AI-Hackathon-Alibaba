"""End-to-end API tests for Nabz — all run in MOCK_MODE (no credentials).

Covers: health, auth register/login, protected-route rejection, profile CRUD,
conversational triage (question -> result), emergency short-circuit, lab +
prescription structured shapes, prescription confirm, summary, clinics (8).
"""
from __future__ import annotations

import io
import json
from datetime import date

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


def test_registration_rejects_weak_passwords(client):
    too_short = client.post(
        "/api/auth/register",
        json={"full_name": "Weak User", "phone": "03001234568", "password": "abc123"},
    )
    assert too_short.status_code == 422

    missing_digit = client.post(
        "/api/auth/register",
        json={"full_name": "Weak User", "phone": "03001234569", "password": "passwordonly"},
    )
    assert missing_digit.status_code == 422


def test_register_creates_self_profile(client, auth):
    headers, account, self_id = auth
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    profiles = client.get("/api/profiles", headers=headers).json()
    assert len(profiles) == 1
    assert profiles[0]["is_self"] is True


def test_registration_dob_populates_self_profile(client):
    reg = client.post(
        "/api/auth/register",
        json={
            "full_name": "DOB User",
            "phone": "03001234560",
            "password": "secret123",
            "date_of_birth": "1996-04-12",
        },
    )
    assert reg.status_code == 200, reg.text
    headers = {"Authorization": f"Bearer {reg.json()['token']}"}
    profiles = client.get("/api/profiles", headers=headers).json()
    assert profiles[0]["date_of_birth"] == "1996-04-12"
    assert profiles[0]["age"] >= 29


def test_profile_rejects_implausible_newborn_weight(client, auth):
    headers, _account, self_id = auth
    response = client.put(
        f"/api/profiles/{self_id}",
        headers=headers,
        json={
            "display_name": "Baby Test",
            "relation": "Self",
            "date_of_birth": date.today().isoformat(),
            "weight_kg": 20,
        },
    )
    assert response.status_code == 422
    assert "weight is not plausible" in response.text


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


def test_profile_clinical_context_is_validated_and_exposed(client, auth):
    headers, _account, _self = auth
    created = client.post(
        "/api/profiles",
        headers=headers,
        json={
            "display_name": "Clinical Context",
            "relation": "Mother",
            "date_of_birth": "1980-04-10",
            "blood_group": "o+",
            "weight_kg": 68.5,
            "bp_systolic": 128,
            "bp_diastolic": 82,
            "bp_recorded_at": "2026-08-24",
        },
    )
    assert created.status_code == 201, created.text
    profile = created.json()
    assert profile["blood_group"] == "O+"
    assert profile["date_of_birth"] == "1980-04-10"
    assert profile["weight_kg"] == 68.5
    assert profile["bp_systolic"] == 128
    assert profile["vitals_history"][-1] == {
        "systolic": 128, "diastolic": 82, "recorded_at": "2026-08-24",
    }
    dashboard = client.get(f"/api/dashboard/{profile['id']}", headers=headers).json()
    assert dashboard["date_of_birth"] == "1980-04-10"
    assert dashboard["bp_diastolic"] == 82

    invalid = client.post(
        "/api/profiles",
        headers=headers,
        json={"display_name": "Bad vitals", "blood_group": "random", "bp_systolic": 120},
    )
    assert invalid.status_code == 422


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


def test_triage_history_is_named_dated_and_account_scoped(client, auth):
    headers, _account, self_id = auth
    started = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "right arm par surkh nishan hai"},
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    history = client.get(
        f"/api/triage/history?profile_id={self_id}", headers=headers,
    )
    assert history.status_code == 200
    item = next(row for row in history.json() if row["id"] == session_id)
    assert item["title"]
    assert item["preview"] == "right arm par surkh nishan hai"
    assert item["created_at"] and item["updated_at"]

    detail = client.get(f"/api/triage/history/{session_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["turns"][0]["role"] == "user"

    other = client.post(
        "/api/auth/register",
        json={"full_name": "Other User", "phone": "03334445555", "password": "pass1234"},
    ).json()
    other_headers = {"Authorization": f"Bearer {other['token']}"}
    assert client.get(
        f"/api/triage/history/{session_id}", headers=other_headers,
    ).status_code == 404
    assert client.get(
        f"/api/triage/history?profile_id={self_id}", headers=other_headers,
    ).status_code == 404


def test_family_members_have_separate_chat_histories(client, auth):
    headers, _account, self_id = auth
    mother = client.post(
        "/api/profiles",
        headers=headers,
        json={"display_name": "Ammi", "relation": "Mother", "age": 58},
    ).json()
    son = client.post(
        "/api/profiles",
        headers=headers,
        json={"display_name": "Ali", "relation": "Son", "age": 16},
    ).json()

    self_session = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "self headache"},
    ).json()["session_id"]
    mother_session = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": mother["id"], "text": "mother knee pain"},
    ).json()["session_id"]

    self_history = client.get(
        f"/api/triage/history?profile_id={self_id}", headers=headers,
    ).json()
    mother_history = client.get(
        f"/api/triage/history?profile_id={mother['id']}", headers=headers,
    ).json()
    son_history = client.get(
        f"/api/triage/history?profile_id={son['id']}", headers=headers,
    ).json()

    assert [item["id"] for item in self_history] == [self_session]
    assert [item["id"] for item in mother_history] == [mother_session]
    assert son_history == []
    assert mother_history[0]["profile_id"] == mother["id"]


def test_ai_timeout_session_remains_retryable(client, auth, monkeypatch):
    import sessions
    from fake_ai_provider import fake_ai_turn
    from triage import _ai_unavailable_turn

    headers, _account, self_id = auth
    calls = 0

    def unavailable_then_ai(profile, session_id, turns):
        nonlocal calls
        calls += 1
        if calls == 1:
            return _ai_unavailable_turn(profile, session_id, turns, "Request timed out")
        return fake_ai_turn(profile, session_id, turns)

    monkeypatch.setattr(sessions, "next_turn", unavailable_then_ai)
    first = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "mere right bazu pe surkh nishan hai"},
    )
    assert first.status_code == 200
    assert first.json()["response_source"] == "ai_unavailable"
    session_id = first.json()["session_id"]

    history = client.get(
        f"/api/triage/history?profile_id={self_id}", headers=headers,
    ).json()
    saved = next(item for item in history if item["id"] == session_id)
    assert saved["status"] == "open"
    assert saved["result_level"] is None

    retried = client.post(f"/api/triage/retry/{session_id}", headers=headers)
    assert retried.status_code == 200
    assert retried.json()["response_source"] == "test_model"
    assert retried.json()["type"] == "question"


def test_ai_requested_image_is_observed_and_added_to_same_transcript(client, auth, monkeypatch):
    import sessions
    from fake_ai_provider import fake_ai_turn
    from schemas import ClinicalState, TriageAnalysis, TriageImageRequest, TriageTurn

    headers, _account, self_id = auth

    def image_request_then_continue(profile, session_id, turns):
        if not any(turn.get("kind") == "image" for turn in turns):
            return TriageTurn(
                type="question",
                session_id=session_id,
                patient_name=profile["display_name"],
                question_urdu="اگر آسان ہو تو نشان کی تصویر بھیجیں۔",
                question_english="If comfortable, share a photo of the mark.",
                image_request=TriageImageRequest(
                    prompt_urdu="اچھی روشنی میں نشان اور اردگرد کی جلد دکھائیں۔",
                    prompt_english="Show the mark and surrounding skin in good light.",
                    why_this_may_help="Visible features may refine the differential.",
                ),
                clinical_state=ClinicalState(chief_complaint="visible mark"),
                analysis=TriageAnalysis(confidence=0.5),
                response_source="test_model",
            )
        return fake_ai_turn(profile, session_id, turns)

    monkeypatch.setattr(sessions, "next_turn", image_request_then_continue)
    monkeypatch.setattr(sessions, "analyze_image", lambda *_args, **_kwargs: ({
        "quality_acceptable": True,
        "quality_notes": "Well lit",
        "objective_observations": ["Flat red area with a defined border"],
        "concerning_visible_features": [],
        "limitations": ["Tenderness cannot be assessed from an image"],
        "summary_english": "A flat localized red area is visible.",
        "summary_urdu": "ایک چپٹا مقامی سرخ نشان نظر آ رہا ہے۔",
    }, "{}"))

    started = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "mere bazu pe nishan hai"},
    )
    assert started.status_code == 200
    assert started.json()["image_request"]["optional"] is True
    session_id = started.json()["session_id"]

    uploaded = client.post(
        "/api/triage/image",
        headers=headers,
        data={"session_id": str(session_id)},
        files={"file": ("mark.png", _png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text

    detail = client.get(f"/api/triage/history/{session_id}", headers=headers).json()
    image_turn = next(turn for turn in detail["turns"] if turn.get("kind") == "image")
    assert image_turn["image_analysis"]["quality_acceptable"] is True
    assert "flat localized" in image_turn["text_english"].lower()

    documents = client.get(
        f"/api/documents?profile_id={self_id}", headers=headers,
    ).json()
    assert documents == []


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
    assert start.json()["response_source"] == "safety_protocol"
    assert "trusted" in start.json()["advice_english"].lower()


def test_mental_distress_gets_safety_check_then_prompt_support(client, auth):
    headers, _account, self_id = auth
    start = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "I feel depressed and hopeless"},
    ).json()
    assert start["type"] == "question"
    assert start["question_goal"] == "mental_health_immediate_safety"
    assert start["response_source"] == "safety_protocol"

    safe = client.post(
        "/api/triage/answer",
        headers=headers,
        json={"session_id": start["session_id"], "text": "No, I am safe right now"},
    ).json()
    assert safe["type"] == "result"
    assert safe["level"] == "DOCTOR_24H"
    assert safe["response_source"] == "safety_protocol"
    assert safe["medication_options"] == []


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
    assert body["saved"] is False
    assert not any(
        item["document_type"] == "lab"
        for item in client.get(f"/api/documents?profile_id={self_id}", headers=headers).json()
    )

    confirmed = client.post(
        "/api/labreport/confirm",
        headers=headers,
        data={"profile_id": str(self_id), "report_json": json.dumps(body)},
        files={"file": ("cbc.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["saved"] is True
    assert any(
        item["document_type"] == "lab"
        for item in client.get(f"/api/documents?profile_id={self_id}", headers=headers).json()
    )


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
    # Extraction is temporary: the paper and medicines enter the Vault only
    # after the explicit confirmation request below.
    before_confirm = client.get(
        f"/api/documents?profile_id={self_id}", headers=headers
    ).json()
    assert not any(item["document_type"] == "prescription" for item in before_confirm)

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
    confirmation_entry_id = saved[0]["confirmation_entry_id"]

    source = client.post(
        "/api/documents/prescription-source",
        headers=headers,
        data={
            "profile_id": str(self_id),
            "confirmation_entry_id": str(confirmation_entry_id),
        },
        files={"file": ("rx.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert source.status_code == 200, source.text
    assert source.json()["document_type"] == "prescription"
    assert source.json()["content_type"] == "image/png"

    # Confirmed medicines now live on the profile.
    profile = client.get(f"/api/profiles/{self_id}", headers=headers).json()
    assert len(profile["medicines"]) == 2
    assert all(m["source"] == "prescription" for m in profile["medicines"])


def test_prescription_cannot_bypass_confirmation_in_generic_vault(client, auth):
    headers, _account, self_id = auth
    response = client.post(
        "/api/documents",
        headers=headers,
        data={"profile_id": str(self_id), "document_type": "prescription"},
        files={"file": ("rx.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "use_prescription_confirmation_flow"


# --- Private document vault --------------------------------------------------

def test_document_vault_upload_download_delete_and_isolation(client, auth):
    headers_a, _account, self_id = auth
    uploaded = client.post(
        "/api/documents",
        headers=headers_a,
        data={
            "profile_id": str(self_id),
            "document_type": "xray",
            "title": "Chest X-ray",
            "notes": "Previous report",
        },
        files={"file": ("chest.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    document = uploaded.json()
    assert document["profile_id"] == self_id
    assert document["document_type"] == "xray"
    assert document["extraction_status"] == "ai_unavailable"

    listed = client.get(
        f"/api/documents?profile_id={self_id}", headers=headers_a
    ).json()
    assert [item["id"] for item in listed] == [document["id"]]

    downloaded = client.get(document["view_url"], headers=headers_a)
    assert downloaded.status_code == 200
    assert downloaded.content == _png_bytes()

    other = client.post(
        "/api/auth/register",
        json={"full_name": "Other Vault", "phone": "03125554444", "password": "pass1234"},
    ).json()
    headers_b = {"Authorization": f"Bearer {other['token']}"}
    assert client.get(document["view_url"], headers=headers_b).status_code == 404
    assert client.delete(f"/api/documents/{document['id']}", headers=headers_b).status_code == 404

    assert client.delete(f"/api/documents/{document['id']}", headers=headers_a).status_code == 204
    assert client.get(document["view_url"], headers=headers_a).status_code == 404


def test_document_extraction_is_bounded_and_available_to_doctor_summary(
    client, auth, monkeypatch
):
    import documents

    headers, _account, self_id = auth
    monkeypatch.setenv("MOCK_MODE", "false")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setattr(
        documents,
        "analyze_image",
        lambda *_args, **_kwargs: (
            {
                "extracted_summary": "Radiology report text states no acute chest finding.",
                "extracted_facts": ["Report date: 2026-08-20", "No acute chest finding stated"],
                "attention_items": [],
                "context_for_ai": "Prior chest X-ray report dated 2026-08-20 states no acute finding.",
                "limitations": ["Pixels were not interpreted."],
            },
            "",
        ),
    )
    uploaded = client.post(
        "/api/documents",
        headers=headers,
        data={"profile_id": str(self_id), "document_type": "xray"},
        files={"file": ("report.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    document = uploaded.json()
    assert document["extraction_status"] == "extracted"
    assert document["extracted_facts"][0] == "Report date: 2026-08-20"

    doctor_summary = client.get(f"/api/summary/{self_id}", headers=headers).json()
    recent = doctor_summary["recent_documents"][0]
    assert "no acute chest finding" in recent["extracted_summary"].lower()

    issued = client.post(
        f"/api/summary/{self_id}/handoff",
        headers={**headers, "Origin": "https://app.nabz.example"},
    )
    assert issued.status_code == 200, issued.text
    grant = issued.json()
    assert grant["url"].startswith("https://app.nabz.example/handoff/")

    # The QR target is public but bounded, and carries the extracted report
    # context the doctor needs rather than presenting an empty snapshot.
    snapshot = client.get(f"/api/handoff/{grant['token']}")
    assert snapshot.status_code == 200, snapshot.text
    shared_document = snapshot.json()["recent_documents"][0]
    assert shared_document["title"] == "X-ray"
    assert shared_document["extracted_facts"][0] == "Report date: 2026-08-20"


def test_generic_lab_upload_requires_structured_lab_flow(client, auth):
    headers, _account, self_id = auth
    response = client.post(
        "/api/documents",
        headers=headers,
        data={"profile_id": str(self_id), "document_type": "lab"},
        files={"file": ("lab.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "use_lab_extraction_flow"


def test_dashboard_is_patient_specific(client, auth):
    headers, _account, self_id = auth
    self_profile = client.get(f"/api/profiles/{self_id}", headers=headers).json()
    family = client.post(
        "/api/profiles",
        headers=headers,
        json={
            "display_name": "Hassan",
            "relation": "Brother",
            "age": 31,
            "chronic_conditions": ["Asthma"],
            "allergies": ["Penicillin"],
            "notes": "Uses an inhaler during winter.",
        },
    ).json()
    upload = client.post(
        "/api/documents",
        headers=headers,
        data={"profile_id": str(family["id"]), "document_type": "mri"},
        files={"file": ("scan.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert upload.status_code == 201

    dashboard = client.get(f"/api/dashboard/{family['id']}", headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()
    assert body["patient_name"] == "Hassan"
    assert body["document_counts"] == {"mri": 1}
    assert body["chronic_conditions"] == ["Asthma"]
    assert body["allergies"] == ["Penicillin"]
    assert body["profile_notes"] == "Uses an inhaler during winter."
    assert "Hassan" in body["summary_english"]

    doctor_summary = client.get(f"/api/summary/{family['id']}", headers=headers).json()
    assert doctor_summary["recent_documents"]
    assert doctor_summary["medicine_evidence"] == []

    self_dashboard = client.get(f"/api/dashboard/{self_id}", headers=headers).json()
    assert self_dashboard["patient_name"] == self_profile["display_name"]
    assert self_dashboard["document_total"] == 0

    other = client.post(
        "/api/auth/register",
        json={"full_name": "No Access", "phone": "03126665555", "password": "pass1234"},
    ).json()
    other_headers = {"Authorization": f"Bearer {other['token']}"}
    assert client.get(f"/api/dashboard/{family['id']}", headers=other_headers).status_code == 404


def test_hassan_demo_seed_populates_private_vault_and_informs_triage(client, auth):
    headers, _account, _self_id = auth
    hassan = client.post(
        "/api/profiles",
        headers=headers,
        json={"display_name": "Hassan", "relation": "Self"},
    ).json()

    seeded = client.post(f"/api/demo/seed/{hassan['id']}", headers=headers)
    assert seeded.status_code == 200, seeded.text
    assert seeded.json()["seeded"] is True
    assert client.post(f"/api/demo/seed/{hassan['id']}", headers=headers).json()["seeded"] is False

    dashboard = client.get(f"/api/dashboard/{hassan['id']}", headers=headers).json()
    assert dashboard["document_total"] == 4
    assert dashboard["document_counts"] == {
        "skin": 1,
        "lab": 1,
        "prescription": 1,
        "xray": 1,
    }
    assert dashboard["current_medicines"][0]["source"] == "prescription"
    assert dashboard["medicine_evidence"][0]["medicine_name"] == "Cetirizine"
    assert "WHO 2025" in dashboard["medicine_evidence"][0]["source_status"]
    assert dashboard["medicine_evidence"][0]["who_source_url"].startswith("https://")
    assert "Ibuprofen — reported rash" in dashboard["allergies"]

    turn = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": hassan["id"], "text": "mere right arm pe surkh nishan hai"},
    ).json()
    for answer in ["teen din se", "kharish hai", "thora phail raha hai"]:
        if turn["type"] == "result":
            break
        turn = client.post(
            "/api/triage/answer",
            headers=headers,
            json={"session_id": turn["session_id"], "text": answer},
        ).json()
    assert turn["type"] == "result"
    assert turn["suggestions_english"]
    assert turn["doctor_handoff_english"]
    assert any("Ibuprofen" in item for item in turn["vault_context_used"])
    assert not any("Ibuprofen" in item for item in turn["suggestions_english"])


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


def test_followup_chat_uses_owned_transcript_and_current_vault(
    client, auth, monkeypatch
):
    import sessions
    from schemas import TriageChatResponse

    headers, _account, self_id = auth
    result = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "seenay mein dard hai"},
    ).json()
    assert result["type"] == "result"
    captured = {}

    def followup(profile, session_id, saved_result, turns, question):
        captured.update({
            "profile": profile,
            "session_id": session_id,
            "saved_result": saved_result,
            "turns": turns,
            "question": question,
        })
        return TriageChatResponse(
            session_id=session_id,
            answer_urdu="محفوظ گفتگو کے مطابق فوری معائنہ ضروری ہے۔",
            answer_english="The saved conversation indicates that urgent assessment is needed.",
            vault_context_used=["Allergies reviewed"],
            safety_note="Do not delay emergency care.",
        )

    monkeypatch.setattr(sessions, "qwen_followup_chat", followup)
    response = client.post(
        "/api/triage/chat",
        headers=headers,
        json={"session_id": result["session_id"], "text": "Why is this urgent?"},
    )
    assert response.status_code == 200, response.text
    assert "urgent assessment" in response.json()["answer_english"]
    assert captured["profile"]["id"] == self_id
    assert captured["saved_result"]["level"] == "EMERGENCY"
    assert captured["turns"][0]["text"] == "seenay mein dard hai"

    history = client.get(
        f"/api/triage/history/{result['session_id']}", headers=headers
    ).json()
    assert history["turns"][-2]["kind"] == "followup_user"
    assert history["turns"][-1]["kind"] == "followup_assistant"

    other = client.post(
        "/api/auth/register",
        json={"full_name": "Other Chat", "phone": "03127774444", "password": "pass1234"},
    ).json()
    other_headers = {"Authorization": f"Bearer {other['token']}"}
    denied = client.post(
        "/api/triage/chat",
        headers=other_headers,
        json={"session_id": result["session_id"], "text": "Show transcript"},
    )
    assert denied.status_code == 404


# --- Validation --------------------------------------------------------------

def test_empty_triage_text_rejected(client, auth):
    headers, _account, self_id = auth
    resp = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": self_id, "text": "   "},
    )
    assert resp.status_code == 422
