"""Pydantic v2 request/response schemas for Nabz."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


class TriageLevel(str, Enum):
    EMERGENCY = "EMERGENCY"
    DOCTOR_24H = "DOCTOR_24H"
    HOME_CARE = "HOME_CARE"


# --- Auth ---------------------------------------------------------------------

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=6, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    email: Optional[str] = Field(default=None, max_length=160)

    @field_validator("full_name", "phone")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("email")
    @classmethod
    def _clean_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if not v:
            return None
        import re

        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[a-z]{2,24}", v):
            raise ValueError("invalid email address")
        # Catch common pasted/typed suffix mistakes such as gmail.combnn.
        if re.search(r"\.(?:com|net|org|edu|gov|pk)[a-z]{2,}$", v):
            raise ValueError("invalid email address")
        return v


class LoginRequest(BaseModel):
    identifier: str = Field(
        ...,
        min_length=5,
        max_length=160,
        validation_alias=AliasChoices("identifier", "phone", "email"),
    )
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("identifier")
    @classmethod
    def _clean_identifier(cls, value: str) -> str:
        return value.strip().lower()


class PasswordResetRequest(BaseModel):
    identifier: str = Field(..., min_length=5, max_length=160)

    @field_validator("identifier")
    @classmethod
    def _clean_identifier(cls, value: str) -> str:
        return value.strip().lower()


class PasswordResetConfirmRequest(BaseModel):
    identifier: str = Field(..., min_length=5, max_length=160)
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("identifier")
    @classmethod
    def _clean_reset_identifier(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("code")
    @classmethod
    def _reset_code_digits(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit():
            raise ValueError("code must be digits")
        return value

    @field_validator("new_password")
    @classmethod
    def _strong_reset_password(cls, value: str) -> str:
        if not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value):
            raise ValueError("password must include a letter and a number")
        return value


class AccountOut(BaseModel):
    id: int
    full_name: str
    phone: str
    email: Optional[str] = None
    phone_verified: bool = False
    email_verified: bool = False
    is_admin: bool = False


class AuthResponse(BaseModel):
    token: str
    account: AccountOut


# --- Verification (phone SMS OTP + email code) -------------------------------

class OtpChannel(str, Enum):
    phone = "phone"
    email = "email"


class OtpRequest(BaseModel):
    channel: OtpChannel


class OtpVerifyRequest(BaseModel):
    channel: OtpChannel
    code: str = Field(..., min_length=4, max_length=8)

    @field_validator("code")
    @classmethod
    def _digits(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit():
            raise ValueError("code must be digits")
        return v


class OtpSendResponse(BaseModel):
    channel: str
    sent: bool
    already_verified: bool = False
    expires_in_seconds: int = 0
    message: str = ""
    # Present ONLY when the code could not really be delivered (mock / no
    # provider) so the demo stays usable. Never populated in real delivery.
    dev_code: Optional[str] = None


# --- Profiles -----------------------------------------------------------------

class ProfileIn(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=80)
    relation: Optional[str] = Field(default=None, max_length=40)
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = Field(default=None, max_length=16)
    blood_group: Optional[str] = Field(default=None, max_length=8)
    date_of_birth: Optional[date] = None
    weight_kg: Optional[float] = Field(default=None, ge=1, le=500)
    bp_systolic: Optional[int] = Field(default=None, ge=50, le=300)
    bp_diastolic: Optional[int] = Field(default=None, ge=30, le=200)
    bp_recorded_at: Optional[date] = None
    chronic_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    notes: Optional[str] = None

    @field_validator("blood_group")
    @classmethod
    def _valid_blood_group(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        normalized = value.strip().upper()
        if normalized not in {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}:
            raise ValueError("invalid blood group")
        return normalized

    @field_validator("date_of_birth")
    @classmethod
    def _valid_dob(cls, value: Optional[date]) -> Optional[date]:
        if value and (value > date.today() or value.year < 1895):
            raise ValueError("invalid date of birth")
        return value

    @model_validator(mode="after")
    def _complete_bp(self) -> "ProfileIn":
        if (self.bp_systolic is None) != (self.bp_diastolic is None):
            raise ValueError("both systolic and diastolic blood pressure are required")
        if self.bp_systolic is not None and self.bp_systolic <= self.bp_diastolic:
            raise ValueError("systolic blood pressure must exceed diastolic")
        return self


class MedicineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    strength: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    with_food: Optional[str] = None
    notes: Optional[str] = None
    source: str = "manual"
    prescription_date: Optional[str] = None


class TimelineEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    title: str
    subtitle: Optional[str] = None
    level: Optional[str] = None
    created_at: datetime


class VaultDocumentOut(BaseModel):
    id: int
    profile_id: int
    document_type: str
    title: str
    original_filename: str
    content_type: str
    size_bytes: int
    notes: Optional[str] = None
    extraction_status: str = "not_requested"
    extracted_summary: Optional[str] = None
    extracted_facts: list[str] = Field(default_factory=list)
    attention_items: list[str] = Field(default_factory=list)
    context_for_ai: Optional[str] = None
    created_at: datetime
    view_url: str
    deletable: bool = True


class MedicineEvidenceOut(BaseModel):
    medicine_id: int
    medicine_name: str
    recorded_details: str
    source_status: str
    evidence_summary: str
    who_source_title: str
    who_source_url: str
    safety_note: str


class DashboardOut(BaseModel):
    profile_id: int
    patient_name: str
    relation: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    date_of_birth: Optional[date] = None
    weight_kg: Optional[float] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    bp_recorded_at: Optional[date] = None
    profile_notes: Optional[str] = None
    chronic_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    current_medicines: list[MedicineOut] = Field(default_factory=list)
    medicine_evidence: list[MedicineEvidenceOut] = Field(default_factory=list)
    document_counts: dict[str, int] = Field(default_factory=dict)
    document_total: int = 0
    latest_triage: Optional[dict[str, Any]] = None
    latest_lab: Optional[dict[str, Any]] = None
    recent_documents: list[VaultDocumentOut] = Field(default_factory=list)
    recent_activity: list[TimelineEntryOut] = Field(default_factory=list)
    summary_urdu: str
    summary_english: str


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str
    relation: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    date_of_birth: Optional[date] = None
    weight_kg: Optional[float] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    bp_recorded_at: Optional[date] = None
    vitals_history: list[dict[str, Any]] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    notes: Optional[str] = None
    is_self: bool = False
    medicines: list[MedicineOut] = Field(default_factory=list)
    timeline: list[TimelineEntryOut] = Field(default_factory=list)


# --- Conversational triage ---------------------------------------------------

class TriageStartRequest(BaseModel):
    profile_id: int
    text: str = Field(..., min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v


class TriageAnswerRequest(BaseModel):
    session_id: int
    text: str = Field(..., min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v


class TriageChatRequest(BaseModel):
    session_id: int
    text: str = Field(..., min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def _chat_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v


class TriageChatResponse(BaseModel):
    session_id: int
    answer_urdu: str
    answer_english: str
    transcript_context_used: bool = True
    vault_context_used: list[str] = Field(default_factory=list)
    response_source: str = "live_ai"
    safety_note: str


class QuickReply(BaseModel):
    urdu: str
    english: str


class TriageImageRequest(BaseModel):
    """An optional, model-requested clinical photo step."""

    prompt_urdu: str
    prompt_english: str
    why_this_may_help: str
    optional: bool = True


class PossibleCause(BaseModel):
    """One plain-language item in a non-diagnostic differential.

    Likelihood is deliberately qualitative. A chat or photo cannot support a
    calibrated disease percentage, and displaying one would create false
    precision for the patient.
    """

    name_urdu: str = ""
    name_english: str
    likelihood: str = "POSSIBLE"  # MORE_LIKELY | POSSIBLE | LESS_LIKELY
    what_it_is_urdu: str = ""
    what_it_is_english: str = ""
    common_reasons_urdu: str = ""
    common_reasons_english: str = ""
    why_it_may_fit: str = ""
    what_would_help_confirm: str = ""

    @model_validator(mode="before")
    @classmethod
    def _support_legacy_causes(cls, value: Any) -> Any:
        if isinstance(value, str):
            return {"name_english": value, "likelihood": "POSSIBLE"}
        if isinstance(value, dict):
            return {
                **value,
                "name_urdu": value.get("name_urdu") or value.get("label_urdu") or "",
                "name_english": (
                    value.get("name_english") or value.get("label_english") or value.get("name") or "Possible cause"
                ),
                "likelihood": value.get("likelihood") or value.get("probability_estimate") or "POSSIBLE",
            }
        return value

    @field_validator("likelihood", mode="before")
    @classmethod
    def _qualitative_likelihood(cls, value: Any) -> str:
        text = str(value or "POSSIBLE").strip().upper().replace(" ", "_")
        aliases = {
            "HIGH": "MORE_LIKELY", "LIKELY": "MORE_LIKELY", "MOST_LIKELY": "MORE_LIKELY",
            "MODERATE": "POSSIBLE", "MEDIUM": "POSSIBLE",
            "LOW": "LESS_LIKELY", "UNLIKELY": "LESS_LIKELY",
        }
        text = aliases.get(text, text)
        return text if text in {"MORE_LIKELY", "POSSIBLE", "LESS_LIKELY"} else "POSSIBLE"


class CollectedFact(BaseModel):
    label_urdu: str
    label_english: str
    value_urdu: str
    value_english: str


class ClinicalState(BaseModel):
    """Structured, adaptive representation of what Nabz knows so far.

    Kept as a flat, JSON-serialisable snapshot so it can be persisted on the
    session, fed back into the next Qwen turn, and shown to the doctor.
    """

    chief_complaint: Optional[str] = None
    body_location: Optional[str] = None
    laterality: Optional[str] = None  # left | right | bilateral | midline
    onset: Optional[str] = None
    duration: Optional[str] = None
    course: Optional[str] = None  # improving | stable | spreading | worsening
    severity: Optional[str] = None
    functional_impact: Optional[str] = None
    appearance: Optional[str] = None
    associated_symptoms: list[str] = Field(default_factory=list)
    pertinent_negatives: list[str] = Field(default_factory=list)
    exposures: list[str] = Field(default_factory=list)
    red_flags_present: list[str] = Field(default_factory=list)
    red_flags_denied: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)


class MedicationOption(BaseModel):
    """A Nabz-validated medication information card.

    NEVER populated directly from a model response. The evidence resolver
    (server/medicine_evidence.py) is the only writer — it drops model-invented
    fields, strips model dose text, and enforces every safety check before
    building an option.
    """

    generic_name: str
    purpose: str
    recommendation_type: str  # OTC_INFORMATION | DISCUSS_WITH_PHARMACIST | DISCUSS_WITH_DOCTOR | CURRENT_PRESCRIPTION_CONTEXT
    why_it_may_help: str
    why_it_is_relevant_to_this_patient: str
    eligibility_requirements: list[str] = Field(default_factory=list)
    avoid_if: list[str] = Field(default_factory=list)
    interactions_checked: list[str] = Field(default_factory=list)
    vault_conflicts_checked: list[str] = Field(default_factory=list)
    dose_guidance: Optional[str] = None  # ONLY from curated catalog — never from a model
    prescription_required: bool = False
    evidence_source_title: str
    evidence_source_url: str
    evidence_summary: str
    evidence_last_reviewed: str
    # Optional defaults preserve display of legacy encounter history. New
    # resolver output always populates all five FDA provenance fields.
    fda_approval_status: Optional[str] = None
    fda_application_number: Optional[str] = None
    fda_approval_source_title: Optional[str] = None
    fda_approval_source_url: Optional[str] = None
    availability_note: Optional[str] = None
    dailymed_setid: Optional[str] = None
    dailymed_label_title: Optional[str] = None
    dailymed_published_date: Optional[str] = None
    dailymed_source_url: Optional[str] = None
    dailymed_source_status: Optional[str] = None
    safety_note: str


class MedicationPlan(BaseModel):
    """A discussion plan, never an issued prescription or confirmed diagnosis."""

    status: str  # DISCUSSION_ONLY | NO_DRUG_OPTION | EMERGENCY_NO_MEDICATION
    basis_english: str
    basis_urdu: str = ""
    medication_steps: list[MedicationOption] = Field(default_factory=list)
    non_drug_steps_english: list[str] = Field(default_factory=list)
    non_drug_steps_urdu: list[str] = Field(default_factory=list)
    monitoring_and_escalation: list[str] = Field(default_factory=list)
    follow_up: str
    disclaimer: str


class TriageAnalysis(BaseModel):
    collected: list[CollectedFact] = Field(default_factory=list)
    still_checking_urdu: str = ""
    still_checking_english: str = ""
    # `confidence` is retained as a numeric progress value in [0,1]. The UI
    # labels it "Assessment completeness" — never diagnostic probability.
    # Alias `completeness` mirrors the same number for future callers.
    confidence: float = 0.0
    completeness: float = 0.0
    questions_asked: int = 0

    @model_validator(mode="after")
    def _mirror_progress(self) -> "TriageAnalysis":
        # Callers may set either field; keep them in sync so both are useful.
        if self.completeness == 0.0 and self.confidence:
            self.completeness = self.confidence
        elif self.confidence == 0.0 and self.completeness:
            self.confidence = self.completeness
        return self


class TriageTurn(BaseModel):
    """Unified turn — every triage endpoint returns this shape."""

    type: str  # "question" | "result"
    session_id: int
    patient_name: str
    analysis: TriageAnalysis
    mock: bool = False
    # Explicit provenance prevents a safe outage response or test double from
    # masquerading as a live model-generated clinical assessment.
    response_source: str = "live_ai"  # live_ai | ai_unavailable | test_model
    # Short model-written label used in the desktop encounter history. It is
    # descriptive only (for example, "Right-arm redness") and is never used
    # to make a clinical decision.
    encounter_title: Optional[str] = None

    # question fields
    question_urdu: Optional[str] = None
    question_english: Optional[str] = None
    quick_replies: list[QuickReply] = Field(default_factory=list)
    image_request: Optional[TriageImageRequest] = None

    # question-turn hints (no chain-of-thought)
    question_goal: Optional[str] = None
    why_this_matters: Optional[str] = None

    # result fields
    level: Optional[TriageLevel] = None
    advice_urdu: Optional[str] = None
    advice_english: Optional[str] = None
    reason_english: Optional[str] = None
    suggestions_urdu: list[str] = Field(default_factory=list)
    suggestions_english: list[str] = Field(default_factory=list)
    exercise_suggestions_urdu: list[str] = Field(default_factory=list)
    exercise_suggestions_english: list[str] = Field(default_factory=list)
    doctor_handoff_english: Optional[str] = None
    vault_context_used: list[str] = Field(default_factory=list)

    # Clinical synthesis (winning-plan CORE CHANGE 3). Never presented as a
    # confirmed diagnosis in the patient-facing UI.
    patient_facing_impression_urdu: Optional[str] = None
    patient_facing_impression_english: Optional[str] = None
    possible_causes: list[PossibleCause] = Field(default_factory=list)
    doctor_differential: list[str] = Field(default_factory=list)
    supporting_findings: list[str] = Field(default_factory=list)
    findings_against: list[str] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    red_flags_present: list[str] = Field(default_factory=list)
    red_flags_denied: list[str] = Field(default_factory=list)
    escalation_signs: list[str] = Field(default_factory=list)

    # Structured clinical state carried across turns.
    clinical_state: Optional[ClinicalState] = None

    # Nabz-validated medication information cards. Empty when nothing safe
    # can be suggested. Populated only by the server-side evidence resolver.
    medication_options: list[MedicationOption] = Field(default_factory=list)
    medication_plan: Optional[MedicationPlan] = None

    # Hints the frontend for facility filtering:
    #   emergency_hospital | clinic_or_bhu | optional
    facility_intent: Optional[str] = None


class TriageSessionListItem(BaseModel):
    id: int
    profile_id: int
    title: str
    preview: str
    status: str
    result_level: Optional[str] = None
    turn_count: int = 0
    created_at: datetime
    updated_at: datetime


class TriageSessionDetail(TriageSessionListItem):
    turns: list[dict[str, Any]] = Field(default_factory=list)
    result: Optional[TriageTurn] = None


# --- Labs / prescriptions ----------------------------------------------------

class LabValue(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    value: str = Field(..., max_length=120)
    unit: Optional[str] = Field(default=None, max_length=80)
    normal_range: Optional[str] = Field(default=None, max_length=120)
    flag: Optional[str] = None  # "low" | "high" | "normal"


class LabReportOut(BaseModel):
    profile_id: int
    report_title: str = Field(default="Lab Report", min_length=1, max_length=200)
    lab_name: Optional[str] = None
    report_date: Optional[str] = None
    values: list[LabValue] = Field(default_factory=list)
    flagged: list[LabValue] = Field(default_factory=list)
    explanation_urdu: str
    explanation_english: str
    mock: bool = False
    saved: bool = False


class ExtractedMedicine(BaseModel):
    name: str
    strength: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    notes: Optional[str] = None
    confidence: float = 1.0


class PrescriptionOut(BaseModel):
    profile_id: int
    date: Optional[str] = None
    doctor_name: Optional[str] = None
    clinic: Optional[str] = None
    medicines: list[ExtractedMedicine] = Field(default_factory=list)
    unreadable: bool = False
    raw_text: str = ""
    mock: bool = False


class PrescriptionConfirmRequest(BaseModel):
    profile_id: int
    date: Optional[str] = None
    doctor_name: Optional[str] = None
    clinic: Optional[str] = None
    medicines: list[ExtractedMedicine]


# --- Misc --------------------------------------------------------------------

class Clinic(BaseModel):
    name: str
    area: str
    city: str
    phone: Optional[str] = None
    maps_query: str
    hours: Optional[str] = None


# --- Location & facilities ---------------------------------------------------

class LocationResolveRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_m: Optional[float] = Field(default=None, ge=0)


class LocationLabel(BaseModel):
    label: str
    city: Optional[str] = None
    district: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = None
    source: str = "reverse-geocode"  # or "manual", "curated"


class LocationConfirmRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=200)
    city: Optional[str] = Field(default=None, max_length=80)
    district: Optional[str] = Field(default=None, max_length=80)
    province: Optional[str] = Field(default=None, max_length=80)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    manual: bool = False


class LocationPreferenceOut(BaseModel):
    label: str
    city: Optional[str] = None
    district: Optional[str] = None
    province: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    permission_state: str = "granted"
    last_confirmed_at: datetime
    fresh: bool = True


class Facility(BaseModel):
    id: str
    name: str
    type: str  # hospital | emergency | clinic | bhu | pharmacy
    area: str
    city: str
    province: Optional[str] = None
    phone: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_km: Optional[float] = None
    directions_url: str
    reason: str = ""
    source: str = "curated"  # live | curated | demo
    emergency_capable: bool = False
    hours: Optional[str] = None


class NearbyFacilitiesResponse(BaseModel):
    location: LocationLabel
    urgency: TriageLevel
    facilities: list[Facility]
    fresh: bool = True


class HealthResponse(BaseModel):
    status: str = "ok"
    mock_mode: bool


class SummaryResponse(BaseModel):
    profile_id: int
    generated_at: datetime
    reference: str
    patient: dict[str, Any]
    chief_complaint: str
    history: str
    current_medications: list[str]
    allergies: list[str]
    recent_triage: Optional[dict[str, Any]] = None
    recent_labs: list[dict[str, Any]] = Field(default_factory=list)
    recent_documents: list[dict[str, Any]] = Field(default_factory=list)
    medicine_evidence: list[MedicineEvidenceOut] = Field(default_factory=list)
    footer: str
