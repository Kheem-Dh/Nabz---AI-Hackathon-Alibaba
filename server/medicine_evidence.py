"""Curated medication-evidence catalog + Nabz safety-validated resolver.

Two responsibilities, kept in one module because they share the catalog:

1) `evidence_for_medicine(medicine)` — annotate a CLINICIAN-CONFIRMED Vault
   medicine with WHO population-level context. Used by the patient dashboard.

2) `resolve_medication_candidates(candidates, ...)` — accept short-list
   candidate medication names/purposes proposed by the live Qwen interview and return only those that pass
   every safety and evidence check as `MedicationOption` objects. The model
   NEVER writes evidence URLs, doses, or safety text; every field comes from
   the curated catalog below.

Model-generated URLs, doses, and safety text are ALWAYS stripped. The catalog
is intentionally small and high-quality: better empty than fabricated.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from dailymed import lookup_dailymed_label
from models_db import Account, Medicine, Profile
from schemas import MedicationOption, MedicineEvidenceOut
from security import get_current_account

router = APIRouter(prefix="/api/medicine-evidence", tags=["medicine-evidence"])

WHO_2025_EML_TITLE = "WHO Model List of Essential Medicines — 24th list (2025)"
WHO_2025_EML_URL = "https://www.who.int/publications/i/item/B09474"

# Allowlisted evidence domains (winning plan §6.1 CORE CHANGE 4).
# Anything else is DROPPED — the resolver never trusts a model-generated URL.
_ALLOWED_EVIDENCE_DOMAINS = {
    "www.who.int",
    "list.essentialmeds.org",
    "www.nice.org.uk",
    "cks.nice.org.uk",
    "www.cdc.gov",
    "dailymed.nlm.nih.gov",
    "www.dra.gov.pk",
    "medlineplus.gov",
    "www.accessdata.fda.gov",
    "www.fda.gov",
}

# Never a self-treatment recommendation. Antibiotics, systemic steroids,
# opioids, sedatives, controlled/regulated substances.
_ALWAYS_PRESCRIPTION_ONLY = {
    "amoxicillin", "azithromycin", "ciprofloxacin", "cephalexin",
    "clarithromycin", "clindamycin", "co-amoxiclav", "doxycycline",
    "erythromycin", "flucloxacillin", "levofloxacin", "metronidazole",
    "prednisolone", "prednisone", "dexamethasone", "hydrocortisone",
    "morphine", "codeine", "tramadol", "diazepam", "alprazolam",
    "clonazepam", "insulin",
}


# --- Curated evidence catalog -----------------------------------------------
#
# Keyed by (condition_key, generic_name). condition_key is a coarse label
# such as "skin_mild_itch", "allergic_rhinitis", "mild_fever_adult", etc.
# Every entry is human-reviewed; add new rows only after verifying:
#   - the drug is safe for the stated indication in adults, and
#   - the evidence URL is on _ALLOWED_EVIDENCE_DOMAINS.
#
# `dose_guidance` is the ONLY place a dose may appear; the resolver strips
# any dose text a model produces. Leave it None to force "confirm dose with
# pharmacist/clinician".

_CATALOG: dict[tuple[str, str], dict] = {
    ("mild_headache_adult", "paracetamol"): {
        "minimum_age": 16,
        "purpose": "Short-term relief of a mild-to-moderate tension-type or migraine headache in an adult with no red flags.",
        "recommendation_type": "OTC_INFORMATION",
        "why_it_may_help": (
            "Paracetamol is a first-line simple analgesic for mild-to-moderate headache "
            "in adults with no contraindications and no warning features."
        ),
        "eligibility_requirements": [
            "Adult (≥16 years).",
            "No 'thunderclap' or worst-ever sudden onset headache.",
            "No fever + stiff neck, no new focal neurology, no head injury.",
            "No known paracetamol allergy.",
            "No advanced liver disease or heavy alcohol use.",
        ],
        "avoid_if": [
            "Sudden 'thunderclap' or worst-ever headache — this needs emergency assessment first.",
            "Fever with stiff neck, one-sided weakness, slurred speech, confusion, or vision loss.",
            "Headache after significant head injury.",
            "Already taking another paracetamol-containing product (avoid double dosing).",
            "Severe liver disease.",
        ],
        "interactions_checked": [
            "Do not combine with other paracetamol-containing cold/flu products.",
            "Chronic overuse of any analgesic can itself cause a medication-overuse headache.",
        ],
        "prescription_required": False,
        "dose_guidance": (
            "Adult labelled dose is typically 500–1000 mg every 4–6 hours as needed, "
            "maximum 4 g in 24 hours. Confirm suitability with a pharmacist for pregnancy, "
            "liver disease, or if the headache is frequent."
        ),
        "evidence_source_title": "MedlinePlus — Acetaminophen (Paracetamol) drug information",
        "evidence_source_url": "https://medlineplus.gov/druginfo/meds/a681004.html",
        "evidence_summary": (
            "Authoritative patient labelling from the U.S. National Library of Medicine "
            "covering indications, warnings, and safe adult dosing for acetaminophen / paracetamol."
        ),
        "evidence_last_reviewed": "2025",
        "safety_note": (
            "Nabz does not prescribe. If the headache is severe, sudden, worst-ever, "
            "or accompanied by fever, weakness, or confusion, go for urgent care instead "
            "of taking anything by mouth."
        ),
    },
    ("mild_pain_adult", "paracetamol"): {
        "minimum_age": 16,
        "purpose": "Short-term relief of mild-to-moderate pain in an adult with no contraindications.",
        "recommendation_type": "OTC_INFORMATION",
        "why_it_may_help": (
            "Paracetamol is a widely used simple analgesic for mild-to-moderate pain in "
            "adults when used as labelled."
        ),
        "eligibility_requirements": [
            "Adult (≥16 years).",
            "No known paracetamol allergy.",
            "No advanced liver disease or heavy alcohol use.",
            "Pain is mild-to-moderate with no red flags (numbness, weakness, fever, trauma).",
        ],
        "avoid_if": [
            "Severe or rapidly worsening pain, or pain after significant trauma.",
            "New numbness, weakness, or loss of bladder/bowel control.",
            "Fever or unexplained weight loss with the pain.",
            "Known paracetamol allergy.",
            "Severe liver disease.",
        ],
        "interactions_checked": [
            "Do not combine with other paracetamol-containing cold/flu products.",
        ],
        "prescription_required": False,
        "dose_guidance": (
            "Adult labelled dose is typically 500–1000 mg every 4–6 hours as needed, "
            "maximum 4 g in 24 hours. Confirm with a pharmacist for pregnancy or liver disease."
        ),
        "evidence_source_title": "MedlinePlus — Acetaminophen (Paracetamol) drug information",
        "evidence_source_url": "https://medlineplus.gov/druginfo/meds/a681004.html",
        "evidence_summary": (
            "Authoritative patient labelling from the U.S. National Library of Medicine "
            "covering indications, warnings, and safe adult dosing for acetaminophen / paracetamol."
        ),
        "evidence_last_reviewed": "2025",
        "safety_note": (
            "Nabz does not prescribe. See a clinician if the pain is severe, follows an "
            "injury, or is accompanied by numbness, weakness, or fever."
        ),
    },
    ("mild_fever_adult", "paracetamol"): {
        "minimum_age": 16,
        "purpose": "Short-term relief of mild fever or mild pain in an adult with no contraindications.",
        "recommendation_type": "OTC_INFORMATION",
        "why_it_may_help": "Paracetamol lowers fever and eases mild pain in adults when used as labelled.",
        "eligibility_requirements": [
            "Adult (≥16 years) — pediatric use should be dosed by weight with a clinician or pharmacist.",
            "No known allergy to paracetamol.",
            "No advanced liver disease or heavy alcohol use.",
        ],
        "avoid_if": [
            "Known paracetamol allergy.",
            "Severe liver disease.",
            "Already taking another paracetamol-containing product (avoid double dosing).",
        ],
        "interactions_checked": [
            "Do not combine with other paracetamol-containing cold/flu products.",
        ],
        "prescription_required": False,
        "dose_guidance": (
            "Adult labelled dose is typically 500–1000 mg every 4–6 hours as needed, "
            "maximum 4 g in 24 hours. Confirm with a pharmacist for children, pregnancy, "
            "or if liver disease is present."
        ),
        "evidence_source_title": "MedlinePlus — Acetaminophen (Paracetamol) drug information",
        "evidence_source_url": "https://medlineplus.gov/druginfo/meds/a681004.html",
        "evidence_summary": (
            "Authoritative patient labelling for paracetamol/acetaminophen from the U.S. "
            "National Library of Medicine, describing indications, warnings, and safe adult dosing."
        ),
        "evidence_last_reviewed": "2025",
        "safety_note": (
            "Nabz does not prescribe. This card is information about a common over-the-counter "
            "option; confirm suitability with a pharmacist or clinician if in doubt."
        ),
    },
    ("mild_dehydration_adult", "ors"): {
        "minimum_age": 16,
        "purpose": "Oral rehydration for mild dehydration from vomiting, diarrhoea, or fever.",
        "recommendation_type": "OTC_INFORMATION",
        "why_it_may_help": "WHO-formula oral rehydration salts replace water and electrolytes lost through gastrointestinal illness.",
        "eligibility_requirements": [
            "Able to drink fluids and keep small sips down.",
            "No red flags (blood in vomit or stool, severe pain, fainting, very little urine).",
        ],
        "avoid_if": [
            "Persistent vomiting that cannot keep any fluids down — go for urgent care.",
            "Suspected bowel obstruction or severe kidney disease without clinician review.",
        ],
        "interactions_checked": [
            "No significant interactions with common medicines when used as directed.",
        ],
        "prescription_required": False,
        "dose_guidance": (
            "Prepare each sachet with the exact volume of clean drinking water shown on the pack. "
            "Take small frequent sips after each loose stool or vomit until fluids are tolerated."
        ),
        "evidence_source_title": "WHO — Oral Rehydration Salts",
        "evidence_source_url": "https://www.who.int/publications/i/item/9789241593175",
        "evidence_summary": (
            "WHO reference on the composition and clinical use of oral rehydration salts for the "
            "management of dehydration due to acute diarrhoeal disease."
        ),
        "evidence_last_reviewed": "2025",
        "safety_note": (
            "Nabz does not prescribe. Seek urgent care if dehydration signs worsen, urine output "
            "is very low, or fluids cannot be kept down."
        ),
    },
    ("allergic_rhinitis_adult", "cetirizine"): {
        "minimum_age": 12,
        "purpose": "Relief of allergic-type itch or hay-fever symptoms in adults.",
        "recommendation_type": "OTC_INFORMATION",
        "why_it_may_help": (
            "Cetirizine is a second-generation antihistamine widely used for allergic rhinitis "
            "and mild allergic itch."
        ),
        "eligibility_requirements": [
            "Adult (≥12 years) with typical allergic symptoms — itch, sneezing, watery eyes, mild hives.",
            "No known cetirizine allergy.",
        ],
        "avoid_if": [
            "Known cetirizine or hydroxyzine allergy.",
            "Severe kidney impairment without clinician review.",
        ],
        "interactions_checked": [
            "Additive drowsiness with sedatives or alcohol.",
        ],
        "prescription_required": False,
        "dose_guidance": (
            "Adults commonly take 10 mg once daily. Confirm dose with a pharmacist if kidney "
            "impairment is present or the patient is pregnant/breastfeeding."
        ),
        "evidence_source_title": "MedlinePlus — Cetirizine drug information",
        "evidence_source_url": "https://medlineplus.gov/druginfo/meds/a698026.html",
        "evidence_summary": (
            "Patient-facing labelling for cetirizine from the U.S. National Library of Medicine, "
            "covering indications, precautions, and adult dosing."
        ),
        "evidence_last_reviewed": "2025",
        "safety_note": (
            "Nabz does not prescribe. A new mark that is spreading, warm, painful, or accompanied "
            "by fever needs clinician review — do not treat with an antihistamine alone."
        ),
    },
    ("mild_skin_care_adult", "petroleum_jelly"): {
        "minimum_age": 16,
        "purpose": "Barrier moisturisation and simple protection of intact, non-infected skin.",
        "recommendation_type": "OTC_INFORMATION",
        "why_it_may_help": (
            "Plain white petroleum jelly is a widely used, inert skin barrier for dryness and minor "
            "irritation on intact skin."
        ),
        "eligibility_requirements": [
            "Skin is intact — no broken skin, open wound, pus, or spreading redness.",
            "No signs of infection (warmth, swelling, fever).",
        ],
        "avoid_if": [
            "Broken skin, open wound, or suspected infection — see a clinician instead.",
            "Deep burns or bites — see a clinician.",
        ],
        "interactions_checked": [
            "No systemic drug interactions.",
        ],
        "prescription_required": False,
        "dose_guidance": None,  # simple topical, no dose to publish
        "evidence_source_title": "MedlinePlus — Skin care basics",
        "evidence_source_url": "https://medlineplus.gov/skinconditions.html",
        "evidence_summary": (
            "MedlinePlus overview page linking to general skin-care guidance for intact skin, "
            "used here only as background context — not treatment of an active skin infection."
        ),
        "evidence_last_reviewed": "2025",
        "safety_note": (
            "Do not apply anything new to a spreading, warm, painful, or fevered skin change — "
            "arrange clinician review instead."
        ),
    },
}

# Quick lookup by generic name → list of catalog rows.
_BY_GENERIC: dict[str, list[tuple[tuple[str, str], dict]]] = {}
for _key, _row in _CATALOG.items():
    _BY_GENERIC.setdefault(_key[1], []).append((_key, _row))

# Approval provenance is deliberately separate from drug-label evidence.
# FDA notes that an SPL/openFDA label can contain manufacturer-submitted
# changes and is not, by itself, proof of approval. Every suggestion therefore
# needs a reviewed Drugs@FDA application record in this map. The application
# verifies that an FDA-approved product exists for this active ingredient; it
# does not imply that every formulation sold worldwide is FDA-approved.
_FDA_APPROVALS: dict[str, dict[str, str]] = {
    "paracetamol": {
        "status": "FDA-approved product verified",
        "application_number": "NDA 019872",
        "source_title": "FDA Drugs@FDA — acetaminophen (Tylenol) approval record",
        "source_url": "https://www.accessdata.fda.gov/drugsatfda_docs/nda/2000/75077_Acetaminophen.pdf",
        "availability_note": (
            "FDA approval is a U.S. regulatory status. In Pakistan, use only a "
            "locally registered product and confirm the exact formulation with a pharmacist."
        ),
    },
    "cetirizine": {
        "status": "FDA-approved product verified",
        "application_number": "NDA 019835",
        "source_title": "FDA Drugs@FDA — cetirizine (Zyrtec) approval record",
        "source_url": "https://www.accessdata.fda.gov/drugsatfda_docs/nda/98/19835-S005_Zyrtec.pdf",
        "availability_note": (
            "FDA approval is a U.S. regulatory status. In Pakistan, use only a "
            "locally registered product and confirm the exact formulation with a pharmacist."
        ),
    },
}


# --- Helpers ----------------------------------------------------------------

def _normalized(name: str) -> str:
    return re.sub(r"[^a-z]", "", (name or "").lower())


def _has_allergy_conflict(generic: str, allergies: Iterable[str]) -> Optional[str]:
    """Return the offending allergy string if the candidate must be suppressed."""
    gnorm = _normalized(generic)
    aliases = {
        "ibuprofen": {"ibuprofen", "nsaid", "brufen"},
        "aspirin": {"aspirin", "acetylsalicylic", "asa", "nsaid"},
        "paracetamol": {"paracetamol", "acetaminophen", "panadol", "tylenol"},
        "cetirizine": {"cetirizine", "zyrtec"},
        "amoxicillin": {"amoxicillin", "penicillin", "penicillins"},
        "azithromycin": {"azithromycin", "macrolide"},
    }
    key_names = aliases.get(gnorm, {gnorm})
    for allergy in allergies or []:
        a_norm = _normalized(allergy)
        if any(k and k in a_norm for k in key_names):
            return allergy
    return None


def _url_is_allowlisted(url: str) -> bool:
    try:
        parsed = urlparse(url or "")
    except Exception:  # noqa: BLE001
        return False
    return parsed.scheme == "https" and parsed.netloc in _ALLOWED_EVIDENCE_DOMAINS


def _current_medicine_names(current_medicines: Iterable) -> list[str]:
    names: list[str] = []
    for medicine in current_medicines or []:
        if isinstance(medicine, dict):
            names.append(str(medicine.get("name", "")))
        else:
            names.append(str(medicine))
    return [n for n in names if n]


# --- Public resolver --------------------------------------------------------

def resolve_medication_candidates(
    candidates: Iterable[dict],
    *,
    profile: dict,
    urgency: Optional[str] = None,
    condition_hints: Optional[Iterable[str]] = None,
) -> list[MedicationOption]:
    """Turn short-list candidate names into safety-validated MedicationOption cards.

    A candidate may look like ``{"generic_name": "paracetamol", "purpose": "…",
    "why_it_may_help": "…", "condition_key": "mild_fever_adult"}``. Fields
    Only ``generic_name``, ``condition_key``, and a bounded patient-specific
    relevance sentence are considered. Evidence, dose, eligibility, and
    safety text always come from the catalog.

    Never returns a card when:
      * urgency is EMERGENCY,
      * the generic is on the prescription-only blocklist,
      * the generic conflicts with a recorded allergy,
      * no allowlisted catalog entry can be matched, or
      * the catalog entry's URL is not on the allowlist.
    """

    if urgency == "EMERGENCY":
        return []

    hints = {h.lower() for h in (condition_hints or [])}
    allergies = profile.get("allergies") or []
    current = _current_medicine_names(profile.get("current_medicines") or [])
    seen_generics: set[str] = set()
    out: list[MedicationOption] = []

    for raw in candidates or []:
        if not isinstance(raw, dict):
            continue
        generic = _normalized(raw.get("generic_name", ""))
        if not generic or generic in seen_generics:
            continue

        if generic in _ALWAYS_PRESCRIPTION_ONLY:
            # A model may only surface these in the DOCTOR-facing differential,
            # never as a self-treatment card.
            continue

        # Allergy suppression — the most important gate.
        if _has_allergy_conflict(generic, allergies):
            continue

        rows = _BY_GENERIC.get(generic) or []
        if not rows:
            continue

        approval = _FDA_APPROVALS.get(generic)
        if not approval or not _url_is_allowlisted(approval.get("source_url", "")):
            # The requested product policy is FDA-verified suggestions only.
            # Helpful non-drug care such as ORS can still be returned in the
            # ordinary care-plan text, but not represented as an approved drug.
            continue

        dailymed_label = lookup_dailymed_label(generic)
        if not dailymed_label:
            # DailyMed metadata is required for every new medication plan.
            continue

        # Prefer a row whose condition_key is in the hint set.
        chosen: Optional[tuple[tuple[str, str], dict]] = None
        wanted = str(raw.get("condition_key", "")).lower()
        if wanted:
            for (key, row) in rows:
                if key[0] == wanted:
                    chosen = (key, row)
                    break
        if chosen is None:
            for (key, row) in rows:
                if key[0] in hints:
                    chosen = (key, row)
                    break
        if chosen is None:
            # Only fall through when there is no hint set at all AND the model
            # explicitly named a purpose — otherwise refuse (better empty).
            if not hints and not wanted:
                chosen = rows[0]

        if chosen is None:
            continue

        (_key, row) = chosen
        if not _url_is_allowlisted(row["evidence_source_url"]):
            # Catalog author error — never emit an unverifiable link.
            continue

        # Catalog entries in this hackathon build are adult-labelled. Unknown
        # age is not silently treated as adult, and pediatric profiles cannot
        # receive an adult dose card even if the model nominates one.
        minimum_age = row.get("minimum_age")
        age = profile.get("age")
        if age is None and profile.get("assumed_adult"):
            age = 18
        if minimum_age is not None and (age is None or age < minimum_age):
            continue

        # Never present a new option that duplicates a medicine already in the
        # patient's confirmed Vault list. The existing medicine remains visible
        # in its separate clinician-confirmed section.
        if any(_normalized(name) == generic for name in current):
            continue

        seen_generics.add(generic)

        conflicts_checked: list[str] = []
        for name in current:
            if name and _normalized(name) != generic:
                conflicts_checked.append(
                    f"No same-name duplication with current '{name}'; a pharmacist must still review interactions."
                )
        if not conflicts_checked:
            conflicts_checked.append(
                "No current medicines are recorded in the Vault; a pharmacist must still confirm interactions."
            )
        weight = profile.get("weight_kg")
        if weight is not None:
            conflicts_checked.append(
                f"Recorded weight is {weight} kg; use only the locally registered product label or clinician/pharmacist dosing."
            )
        else:
            conflicts_checked.append(
                "No current weight is recorded; weight-dependent dosing cannot be checked."
            )
        blood_pressure = profile.get("blood_pressure")
        if isinstance(blood_pressure, dict) and blood_pressure.get("systolic"):
            conflicts_checked.append(
                "Latest recorded blood pressure: "
                f"{blood_pressure.get('systolic')}/{blood_pressure.get('diastolic')} mmHg "
                f"on {blood_pressure.get('recorded_at') or 'an unknown date'}; this is context, not a fresh measurement."
            )

        option = MedicationOption(
            generic_name=generic.title() if generic.islower() else generic,
            purpose=row["purpose"],
            recommendation_type=row["recommendation_type"],
            why_it_may_help=row["why_it_may_help"],
            why_it_is_relevant_to_this_patient=(
                raw.get("why_it_is_relevant_to_this_patient")
                or row.get("why_it_is_relevant_default")
                or row["why_it_may_help"]
            ),
            eligibility_requirements=list(row.get("eligibility_requirements", [])),
            avoid_if=list(row.get("avoid_if", [])),
            interactions_checked=list(row.get("interactions_checked", [])),
            vault_conflicts_checked=conflicts_checked,
            # dose_guidance is NEVER read from the model — only the catalog.
            dose_guidance=row.get("dose_guidance"),
            prescription_required=bool(row.get("prescription_required", False)),
            evidence_source_title=row["evidence_source_title"],
            evidence_source_url=row["evidence_source_url"],
            evidence_summary=row["evidence_summary"],
            evidence_last_reviewed=row["evidence_last_reviewed"],
            fda_approval_status=approval["status"],
            fda_application_number=approval["application_number"],
            fda_approval_source_title=approval["source_title"],
            fda_approval_source_url=approval["source_url"],
            availability_note=approval["availability_note"],
            dailymed_setid=dailymed_label["setid"],
            dailymed_label_title=dailymed_label["title"],
            dailymed_published_date=dailymed_label["published_date"],
            dailymed_source_url=dailymed_label["source_url"],
            dailymed_source_status=dailymed_label["source_status"],
            safety_note=row["safety_note"],
        )
        out.append(option)

    return out


# --- Vault-medicine evidence card (existing behaviour, extended) ------------

_WHO_REFERENCES = {
    "cetirizine": {
        "status": "WHO 2025 EML therapeutic alternative",
        "summary": (
            "The WHO 2025 Model List includes cetirizine as a therapeutic "
            "alternative to loratadine in the antiallergics section. This is "
            "population-level essential-medicine context, not a recommendation "
            "for the current symptom."
        ),
        "url": "https://list.essentialmeds.org/medicines/633",
    },
    "paracetamol": {
        "status": "WHO 2025 EML core medicine",
        "summary": (
            "Paracetamol appears on the WHO 2025 Model List of Essential Medicines "
            "as a core analgesic and antipyretic. This is population-level essential-medicine "
            "context, not a Nabz recommendation for a specific symptom."
        ),
        "url": "https://list.essentialmeds.org/medicines/145",
    },
}


def evidence_for_medicine(medicine: Medicine) -> MedicineEvidenceOut:
    key = _normalized(medicine.name)
    reference = next(
        (value for name, value in _WHO_REFERENCES.items() if key.startswith(name)), None
    )
    details = " ".join(
        value for value in [medicine.strength, medicine.frequency, medicine.duration] if value
    )
    if reference:
        return MedicineEvidenceOut(
            medicine_id=medicine.id,
            medicine_name=medicine.name,
            recorded_details=details,
            source_status=reference["status"],
            evidence_summary=reference["summary"],
            who_source_title=WHO_2025_EML_TITLE,
            who_source_url=reference["url"],
            safety_note=(
                "Continue, stop, or change this medicine only according to the "
                "prescribing clinician or pharmacist; Nabz has not selected it."
            ),
        )
    return MedicineEvidenceOut(
        medicine_id=medicine.id,
        medicine_name=medicine.name,
        recorded_details=details,
        source_status="No curated WHO match shown",
        evidence_summary=(
            "Nabz has not verified a medicine-specific WHO entry for this "
            "recorded name. This does not mean the medicine is ineffective or unsafe."
        ),
        who_source_title=WHO_2025_EML_TITLE,
        who_source_url=WHO_2025_EML_URL,
        safety_note=(
            "This is a record of a clinician prescription, not a Nabz recommendation. "
            "Ask the prescriber or pharmacist before making any change."
        ),
    )


@router.get("/{profile_id}", response_model=list[MedicineEvidenceOut])
def get_medicine_evidence(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[MedicineEvidenceOut]:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return [
        evidence_for_medicine(medicine)
        for medicine in profile.medicines
        if medicine.source == "prescription"
    ]
