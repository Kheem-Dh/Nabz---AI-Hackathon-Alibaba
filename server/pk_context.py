"""Pakistan-context prevalence ranker for differential diagnosis lists.

Turns a flat, model-generated `doctor_differential` (list of one-liner
possibilities) into a ranked list weighted by:

  * Baseline PK prevalence — dengue, typhoid, malaria, TB, hepatitis A/E,
    gastroenteritis, common cold, seasonal influenza, gastritis, etc. are
    weighted higher than rarities.
  * Season — dengue July→Nov, malaria June→Oct (southern belt), waterborne
    (typhoid, hep A/E, gastroenteritis) intensified during monsoon (July–Sept),
    respiratory viruses Nov→Feb.
  * City / province context — malaria south-of-Punjab/Sindh; smog respiratory
    Lahore/Islamabad Oct→Feb; higher gastroenteritis burden in rural areas.

Never invents a condition. Never elevates a rare possibility. Any entry from
the model that does not string-match a known label passes through with a
neutral weight and a "no PK prevalence data" note — so nothing is silently
dropped and the clinician still sees the model's original wording.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any


# --- Prevalence table -------------------------------------------------------
#
# Each entry maps a canonical label to:
#   base:   0–100 baseline prevalence weight in Pakistan (very rough).
#   patterns: substrings to look for in a differential item (case-insensitive).
#   seasonal: (start_month, end_month, boost) → adds boost during those months.
#              Wrap-around ranges (e.g. Nov→Feb) supported via end_month < start_month.
#   regions:  {province: bonus} — added if the patient's province matches.

_PREVALENCE: list[dict] = [
    {
        "canonical": "Viral upper respiratory infection",
        "patterns": ["viral upper", "viral uri", "common cold", "viral flu", "upper respiratory"],
        "base": 80,
        "seasonal": [(11, 2, 15)],
        "regions": {"punjab": 5, "islamabad": 5, "khyber pakhtunkhwa": 5},
    },
    {
        "canonical": "Acute gastroenteritis",
        "patterns": ["gastroenteritis", "food poisoning", "acute diarrh", "viral diarr"],
        "base": 70,
        "seasonal": [(7, 9, 20)],  # monsoon
    },
    {
        "canonical": "Dengue fever",
        "patterns": ["dengue"],
        "base": 45,
        "seasonal": [(7, 11, 35)],
        "regions": {"punjab": 8, "sindh": 8, "islamabad": 5},
    },
    {
        "canonical": "Typhoid fever",
        "patterns": ["typhoid", "enteric fever"],
        "base": 45,
        "seasonal": [(6, 9, 20)],
    },
    {
        "canonical": "Malaria",
        "patterns": ["malaria"],
        "base": 35,
        "seasonal": [(6, 10, 20)],
        "regions": {"sindh": 12, "balochistan": 15, "punjab": 5},
    },
    {
        "canonical": "Tuberculosis (pulmonary)",
        "patterns": ["tuberculosis", "tb ", "pulmonary tb"],
        "base": 30,
    },
    {
        "canonical": "Hepatitis A / E",
        "patterns": ["hepatitis a", "hepatitis e", "hep a", "hep e", "viral hepatitis"],
        "base": 30,
        "seasonal": [(7, 9, 15)],
    },
    {
        "canonical": "Tension-type headache",
        "patterns": ["tension-type", "tension headache", "tension type"],
        "base": 60,
    },
    {
        "canonical": "Migraine",
        "patterns": ["migraine"],
        "base": 45,
    },
    {
        "canonical": "Sinusitis",
        "patterns": ["sinusitis", "sinus headache", "rhinosinusitis"],
        "base": 40,
        "seasonal": [(10, 3, 15)],
    },
    {
        "canonical": "Gastritis / dyspepsia",
        "patterns": ["gastritis", "dyspepsia", "acidity", "gerd", "peptic"],
        "base": 55,
    },
    {
        "canonical": "Urinary tract infection",
        "patterns": ["urinary tract", "uti", "cystitis"],
        "base": 45,
        "seasonal": [(4, 8, 10)],
    },
    {
        "canonical": "Musculoskeletal strain",
        "patterns": ["musculoskeletal", "muscle strain", "myofascial", "back strain"],
        "base": 55,
    },
    {
        "canonical": "Contact dermatitis / allergic skin reaction",
        "patterns": ["contact dermatitis", "allergic skin", "urticaria", "hives", "insect bite reaction"],
        "base": 50,
    },
    {
        "canonical": "Cellulitis",
        "patterns": ["cellulitis"],
        "base": 30,
    },
    {
        "canonical": "Asthma exacerbation",
        "patterns": ["asthma"],
        "base": 40,
        "seasonal": [(10, 2, 15)],
    },
    # High-consequence but rare — kept in the table so the model's mention isn't
    # dropped, but base weight low so it doesn't outrank common causes without
    # explicit red-flag evidence.
    {
        "canonical": "Subarachnoid haemorrhage",
        "patterns": ["subarachnoid", "sah", "thunderclap"],
        "base": 8,
    },
    {
        "canonical": "Meningitis",
        "patterns": ["meningitis"],
        "base": 12,
    },
    {
        "canonical": "Stroke / focal neurology",
        "patterns": ["stroke", "cva ", "focal neurology", "cerebrovascular"],
        "base": 15,
    },
    {
        "canonical": "Analgesic-overuse headache",
        "patterns": ["analgesic-overuse", "analgesic overuse", "medication overuse"],
        "base": 15,
    },
]

_ALL_MONTHS = set(range(1, 13))


def _months_in_range(start: int, end: int) -> set[int]:
    if start <= end:
        return set(range(start, end + 1))
    # wrap-around, e.g. Nov(11) → Feb(2)
    return set(range(start, 13)) | set(range(1, end + 1))


def _match_entry(item_text: str) -> dict | None:
    low = item_text.lower()
    for entry in _PREVALENCE:
        for pat in entry["patterns"]:
            if pat in low:
                return entry
    return None


def rank_differential(
    differential: list[str] | None,
    *,
    month: int | None = None,
    province: str | None = None,
    max_items: int = 8,
) -> list[dict]:
    """Return the differential annotated with prevalence weight + season note.

    Never re-orders below the model's original ordering when weights tie —
    the model saw the transcript and its ranking is still meaningful. We just
    surface a PK weight so the clinician can compare.
    """
    if not differential:
        return []
    if month is None:
        month = date.today().month
    prov = (province or "").strip().lower()

    ranked: list[dict] = []
    for order_idx, raw in enumerate(differential[:12]):
        item = str(raw or "").strip()
        if not item:
            continue
        entry = _match_entry(item)
        if entry is None:
            ranked.append({
                "condition": item[:240],
                "canonical": None,
                "prevalence_weight": None,
                "season_note": None,
                "note": "No PK prevalence data — kept as model wrote it.",
                "_order": order_idx,
            })
            continue
        weight = int(entry["base"])
        notes = []
        for start, end, boost in entry.get("seasonal", []) or []:
            if month in _months_in_range(start, end):
                weight += int(boost)
                notes.append(f"Higher weight this month (seasonal +{boost}).")
        for region, bonus in (entry.get("regions") or {}).items():
            if prov and region in prov:
                weight += int(bonus)
                notes.append(f"Higher in {region.title()} (+{bonus}).")
        ranked.append({
            "condition": item[:240],
            "canonical": entry["canonical"],
            "prevalence_weight": weight,
            "season_note": " ".join(notes) if notes else "PK baseline prevalence.",
            "_order": order_idx,
        })

    # Stable sort by weight desc, then model's original order.
    ranked.sort(
        key=lambda r: (
            -(r["prevalence_weight"] if r["prevalence_weight"] is not None else -1),
            r["_order"],
        ),
    )
    for r in ranked:
        r.pop("_order", None)
    return ranked[:max_items]
