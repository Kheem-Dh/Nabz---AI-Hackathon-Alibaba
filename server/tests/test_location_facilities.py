"""Tests for the location + facilities endpoints (winning-plan pivot)."""
from __future__ import annotations


def test_location_flow(client, auth):
    headers, _account, _profile_id = auth

    # Before setting anything, /me should 404.
    resp = client.get("/api/location/me", headers=headers)
    assert resp.status_code == 404

    # Resolve a Karachi-ish coord. Nominatim is optional; the offline
    # fallback in the router guarantees SOME sensible label.
    resp = client.post(
        "/api/location/resolve",
        headers=headers,
        json={"latitude": 24.8607, "longitude": 67.0011, "accuracy_m": 30},
    )
    assert resp.status_code == 200, resp.text
    label = resp.json()
    assert label["latitude"] == 24.8607
    assert label["source"] in {"reverse-geocode", "curated"}
    assert label["label"]

    # Confirm as manual so we don't depend on the reverse-geocode result.
    resp = client.post(
        "/api/location/confirm",
        headers=headers,
        json={
            "label": "Karachi, Sindh",
            "city": "Karachi",
            "province": "Sindh",
            "latitude": 24.8607,
            "longitude": 67.0011,
            "manual": True,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["city"] == "Karachi"
    assert body["permission_state"] == "manual"
    assert body["fresh"] is True

    # /me should now return the same preference.
    resp = client.get("/api/location/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["city"] == "Karachi"


def test_facilities_nearby_ranks_by_severity_and_distance(client, auth):
    headers, _acc, _pid = auth

    # Confirm a Peshawar location so the ranker has an origin.
    client.post(
        "/api/location/confirm",
        headers=headers,
        json={
            "label": "Peshawar, Khyber Pakhtunkhwa",
            "city": "Peshawar",
            "province": "Khyber Pakhtunkhwa",
            "latitude": 34.0151,
            "longitude": 71.5249,
            "manual": True,
        },
    )

    # Emergency urgency should surface emergency-capable hospitals at the top.
    resp = client.get(
        "/api/facilities/nearby",
        headers=headers,
        params={"urgency": "EMERGENCY", "limit": 4},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["urgency"] == "EMERGENCY"
    assert data["facilities"], "expected at least one facility"
    assert data["facilities"][0]["emergency_capable"] is True
    # All returned facilities carry a distance and a directions URL.
    for f in data["facilities"]:
        assert "distance_km" in f
        assert f["directions_url"].startswith("https://www.google.com/maps/")


def test_facilities_requires_auth(client):
    resp = client.get("/api/facilities/nearby", params={"urgency": "DOCTOR_24H"})
    assert resp.status_code == 401


def test_triage_result_carries_facility_intent(client, auth):
    headers, _acc, pid = auth
    resp = client.post(
        "/api/triage/start",
        headers=headers,
        json={"profile_id": pid, "text": "seenay mein dard hai aur saans nahi aa rahi"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["type"] == "result"
    assert body["level"] == "EMERGENCY"
    assert body["facility_intent"] == "emergency_hospital"
