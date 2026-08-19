"""Tests for the Sehat Saathi backend. All run in MOCK_MODE (no credentials)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Ensure mock mode BEFORE importing the app / triage engine.
os.environ["MOCK_MODE"] = "true"
os.environ.pop("DASHSCOPE_API_KEY", None)

# Make the server package importable when pytest runs from repo root.
SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

VALID_LEVELS = {"EMERGENCY", "DOCTOR_24H", "HOME_CARE"}


def test_health_endpoint():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["mock_mode"] is True


REQUIRED_KEYS = {
    "level", "advice_urdu", "advice_english", "reason_english", "mock",
    "home_remedies_urdu", "home_remedies_english",
    "medicine_guidance_urdu", "medicine_guidance_english",
    "warning_signs_urdu", "warning_signs_english",
    "follow_up_questions_urdu", "follow_up_questions_english",
}


def test_triage_returns_valid_schema():
    resp = client.post("/api/triage", json={"text": "teen din se bukhar hai"})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == REQUIRED_KEYS
    assert body["level"] in VALID_LEVELS
    assert body["mock"] is True
    assert body["advice_urdu"].strip()
    assert body["advice_english"].strip()
    # Guidance lists must be parallel (same length) in each language.
    assert len(body["home_remedies_urdu"]) == len(body["home_remedies_english"])
    assert len(body["medicine_guidance_urdu"]) == len(body["medicine_guidance_english"])


def test_fever_includes_medicine_and_followups():
    resp = client.post("/api/triage", json={"text": "mujhe shadid bukhar hai"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["level"] == "DOCTOR_24H"
    # The user asked for medicine guidance + follow-up questions.
    assert len(body["medicine_guidance_urdu"]) >= 1
    assert len(body["home_remedies_urdu"]) >= 1
    assert len(body["follow_up_questions_urdu"]) >= 1


def test_emergency_has_no_otc_medicine_guidance():
    # For emergencies the action is "go now" — do not hand out OTC medicine.
    resp = client.post("/api/triage", json={"text": "seenay mein dard hai"})
    assert resp.status_code == 200
    assert resp.json()["medicine_guidance_urdu"] == []


def test_clinics_city_query_returns_city_results():
    resp = client.get("/api/clinics", params={"city": "Lahore", "province": "Punjab"})
    assert resp.status_code == 200
    clinics = resp.json()
    assert len(clinics) >= 1
    assert any("Lahore" in c["maps_query"] for c in clinics)


@pytest.mark.parametrize(
    "text",
    [
        "seenay mein dard hai aur saans nahi aa rahi",
        "chest pain and difficulty breathing",
        "سینے میں درد ہے",
        "I am having a seizure",
        "there was a bad accident",
    ],
)
def test_emergency_keywords_map_to_emergency(text):
    resp = client.post("/api/triage", json={"text": text})
    assert resp.status_code == 200
    assert resp.json()["level"] == "EMERGENCY"


def test_suicidal_input_is_emergency_and_compassionate():
    resp = client.post("/api/triage", json={"text": "I am having suicidal thoughts"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["level"] == "EMERGENCY"
    # Should not name methods; should be supportive.
    assert body["advice_english"].strip()


@pytest.mark.parametrize(
    "text",
    [
        "teen din se bukhar hai",
        "I have a fever and cough for three days",
        "بخار اور کھانسی ہے",
    ],
)
def test_fever_maps_to_doctor_24h(text):
    resp = client.post("/api/triage", json={"text": text})
    assert resp.status_code == 200
    assert resp.json()["level"] == "DOCTOR_24H"


@pytest.mark.parametrize(
    "text",
    [
        "halka sa zukam hai",
        "just a mild cold and runny nose",
        "ہلکا زکام ہے",
    ],
)
def test_mild_maps_to_home_care(text):
    resp = client.post("/api/triage", json={"text": text})
    assert resp.status_code == 200
    assert resp.json()["level"] == "HOME_CARE"


def test_non_health_input_is_home_care():
    resp = client.post("/api/triage", json={"text": "hello how are you today"})
    assert resp.status_code == 200
    assert resp.json()["level"] == "HOME_CARE"


def test_empty_input_rejected_422():
    resp = client.post("/api/triage", json={"text": ""})
    assert resp.status_code == 422


def test_whitespace_input_rejected_422():
    resp = client.post("/api/triage", json={"text": "    "})
    assert resp.status_code == 422


def test_too_long_input_rejected_422():
    resp = client.post("/api/triage", json={"text": "a" * 2001})
    assert resp.status_code == 422


def test_clinics_endpoint_returns_eight():
    resp = client.get("/api/clinics")
    assert resp.status_code == 200
    clinics = resp.json()
    assert len(clinics) == 8
    for c in clinics:
        assert set(c.keys()) == {"name", "area", "city", "phone", "maps_query"}
        assert c["name"] and c["phone"] and c["maps_query"]
