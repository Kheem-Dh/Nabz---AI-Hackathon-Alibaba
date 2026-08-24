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


def test_regions_include_federal_capital_and_province_cities(client):
    regions = client.get("/api/location/regions").json()
    by_name = {region["name"]: region["cities"] for region in regions}
    assert "Federal Capital" in by_name
    assert any(city["name"] == "Islamabad" for city in by_name["Federal Capital"])
    assert len(by_name["Punjab"]) >= 30
    assert len(by_name["Sindh"]) >= 20


def test_manual_location_rejects_province_city_mismatch(client, auth):
    headers, _account, _profile_id = auth
    resp = client.post(
        "/api/location/confirm",
        headers=headers,
        json={
            "label": "Islamabad, Punjab",
            "city": "Islamabad",
            "province": "Punjab",
            "manual": True,
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "province_city_mismatch"


def test_manual_city_coordinates_and_pharmacy_filter(client, auth):
    headers, _account, _profile_id = auth
    saved = client.post(
        "/api/location/confirm",
        headers=headers,
        json={
            "label": "Islamabad, Federal Capital, Pakistan",
            "city": "Islamabad",
            "province": "Federal Capital",
            "manual": True,
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["latitude"] is not None
    resp = client.get(
        "/api/facilities/nearby", headers=headers, params={"type": "pharmacy", "limit": 6}
    )
    assert resp.status_code == 200, resp.text
    facilities = resp.json()["facilities"]
    assert facilities
    assert all(item["type"] == "pharmacy" for item in facilities)
    assert facilities[0]["city"] == "Islamabad"
