"""Pydantic v2 request/response schemas for Nabz."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TriageLevel(str, Enum):
    EMERGENCY = "EMERGENCY"
    DOCTOR_24H = "DOCTOR_24H"
    HOME_CARE = "HOME_CARE"


# --- Auth ---------------------------------------------------------------------

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=6, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)

    @field_validator("full_name", "phone")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class LoginRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=32)
    password: str = Field(..., min_length=1, max_length=128)


class AccountOut(BaseModel):
    id: int
    full_name: str
    phone: str


class AuthResponse(BaseModel):
    token: str
    account: AccountOut


# --- Profiles -----------------------------------------------------------------

class ProfileIn(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=80)
    relation: Optional[str] = Field(default=None, max_length=40)
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = Field(default=None, max_length=16)
    blood_group: Optional[str] = Field(default=None, max_length=8)
    chronic_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


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
    created_at: datetime
    view_url: str
    deletable: bool = True


class DashboardOut(BaseModel):
    profile_id: int
    patient_name: str
    relation: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    profile_notes: Optional[str] = None
    chronic_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    current_medicines: list[MedicineOut] = Field(default_factory=list)
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


class QuickReply(BaseModel):
    urdu: str
    english: str


class CollectedFact(BaseModel):
    label_urdu: str
    label_english: str
    value_urdu: str
    value_english: str


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

    # question fields
    question_urdu: Optional[str] = None
    question_english: Optional[str] = None
    quick_replies: list[QuickReply] = Field(default_factory=list)

    # result fields
    level: Optional[TriageLevel] = None
    advice_urdu: Optional[str] = None
    advice_english: Optional[str] = None
    reason_english: Optional[str] = None

    # Hints the frontend for facility filtering:
    #   emergency_hospital | clinic_or_bhu | optional
    facility_intent: Optional[str] = None


# --- Labs / prescriptions ----------------------------------------------------

class LabValue(BaseModel):
    name: str
    value: str
    unit: Optional[str] = None
    normal_range: Optional[str] = None
    flag: Optional[str] = None  # "low" | "high" | "normal"


class LabReportOut(BaseModel):
    profile_id: int
    report_title: str
    lab_name: Optional[str] = None
    report_date: Optional[str] = None
    values: list[LabValue] = Field(default_factory=list)
    flagged: list[LabValue] = Field(default_factory=list)
    explanation_urdu: str
    explanation_english: str
    mock: bool = False


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
    footer: str
