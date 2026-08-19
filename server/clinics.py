"""Sample KP (Khyber Pakhtunkhwa) health facilities served by /api/clinics.

These are 8 real, well-known clinical destinations across KP — used for the
Nabz demo. The list is fixed on purpose (not tied to a live registry) so the
app always shows meaningful results, even offline.
"""
from __future__ import annotations

from schemas import Clinic

_CLINICS: list[Clinic] = [
    Clinic(
        name="Lady Reading Hospital",
        area="Soekarno Chowk",
        city="Peshawar",
        phone="+92-91-9211430",
        maps_query="Lady Reading Hospital Peshawar",
        hours="24 hrs",
    ),
    Clinic(
        name="Khyber Teaching Hospital",
        area="University Road",
        city="Peshawar",
        phone="+92-91-9217140",
        maps_query="Khyber Teaching Hospital Peshawar",
        hours="24 hrs",
    ),
    Clinic(
        name="Hayatabad Medical Complex",
        area="Phase-IV, Hayatabad",
        city="Peshawar",
        phone="+92-91-9217140",
        maps_query="Hayatabad Medical Complex Peshawar",
        hours="24 hrs",
    ),
    Clinic(
        name="Ayub Teaching Hospital",
        area="Mansehra Road",
        city="Abbottabad",
        phone="+92-992-381907",
        maps_query="Ayub Teaching Hospital Abbottabad",
        hours="24 hrs",
    ),
    Clinic(
        name="DHQ Teaching Hospital Abbottabad",
        area="Supply Bazaar",
        city="Abbottabad",
        phone="+92-992-380540",
        maps_query="DHQ Teaching Hospital Abbottabad",
        hours="24 hrs",
    ),
    Clinic(
        name="Mardan Medical Complex",
        area="Sheikh Maltoon Town",
        city="Mardan",
        phone="+92-937-9230404",
        maps_query="Mardan Medical Complex",
        hours="24 hrs",
    ),
    Clinic(
        name="BHU Havelian",
        area="Havelian",
        city="Abbottabad",
        phone="+92-992-805112",
        maps_query="Basic Health Unit Havelian Abbottabad",
        hours="08:00 – 20:00",
    ),
    Clinic(
        name="RHC Takht Bhai",
        area="Takht Bhai",
        city="Mardan",
        phone="+92-937-540093",
        maps_query="Rural Health Centre Takht Bhai Mardan",
        hours="08:00 – 20:00",
    ),
]


def get_clinics(city: str | None = None, province: str | None = None) -> list[Clinic]:
    """Return the KP sample list.

    A city filter (case-insensitive substring) reorders matches to the top so
    users in that city see the most relevant ones first.
    """
    if not city:
        return list(_CLINICS)
    city_l = city.strip().lower()
    matches = [c for c in _CLINICS if city_l in c.city.lower()]
    rest = [c for c in _CLINICS if c not in matches]
    return matches + rest
