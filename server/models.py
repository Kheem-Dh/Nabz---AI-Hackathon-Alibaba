"""Pydantic v2 request/response models for Sehat Saathi."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class TriageLevel(str, Enum):
    """The three (and only three) triage urgency levels."""

    EMERGENCY = "EMERGENCY"
    DOCTOR_24H = "DOCTOR_24H"
    HOME_CARE = "HOME_CARE"


class TriageRequest(BaseModel):
    """Incoming symptom description from the user."""

    text: str = Field(..., min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be empty or whitespace")
        return v


class TriageResponse(BaseModel):
    """Triage result returned to the client.

    Beyond the urgency level, we now return practical guidance the user asked
    for: home remedies, general (over-the-counter) medicine guidance, warning
    signs, and follow-up questions so the assistant can understand the user
    better. All guidance is general information and NOT a substitute for a
    doctor.
    """

    level: TriageLevel
    advice_urdu: str
    advice_english: str
    reason_english: str

    # Practical guidance (bilingual, parallel lists). May be empty for
    # emergencies where the only correct action is to go to hospital now.
    home_remedies_urdu: list[str] = Field(default_factory=list)
    home_remedies_english: list[str] = Field(default_factory=list)
    medicine_guidance_urdu: list[str] = Field(default_factory=list)
    medicine_guidance_english: list[str] = Field(default_factory=list)
    warning_signs_urdu: list[str] = Field(default_factory=list)
    warning_signs_english: list[str] = Field(default_factory=list)

    # 2-3 short questions the assistant asks to understand the user better.
    follow_up_questions_urdu: list[str] = Field(default_factory=list)
    follow_up_questions_english: list[str] = Field(default_factory=list)

    mock: bool = False


class Clinic(BaseModel):
    """A health facility (or a location search) the user can be directed to."""

    name: str
    area: str
    city: str
    phone: Optional[str] = None
    maps_query: str


class HealthResponse(BaseModel):
    status: str = "ok"
    mock_mode: bool
