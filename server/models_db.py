"""ORM models for Nabz — accounts, profiles, timeline, meds, sessions, uploads."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(160), index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Soft-gate verification state (phone via SMS OTP, email via emailed code).
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    profiles: Mapped[list["Profile"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    verification_codes: Mapped[list["VerificationCode"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    location: Mapped["LocationPreference | None"] = relationship(
        back_populates="account",
        uselist=False,
        cascade="all, delete-orphan",
    )
    consent_records: Mapped[list["ConsentRecord"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    audit_events: Mapped[list["AuditEvent"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class LocationPreference(Base):
    """Where this account currently expects to receive care.

    Precise coordinates are treated as short-lived operational data — kept
    only long enough to rank nearby facilities. City/district persist so we
    can still show meaningful results after the user closes the tab.
    """

    __tablename__ = "location_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str | None] = mapped_column(String(80))
    district: Mapped[str | None] = mapped_column(String(80))
    province: Mapped[str | None] = mapped_column(String(80))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    permission_state: Mapped[str] = mapped_column(String(24), default="granted", nullable=False)
    last_confirmed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    manual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    account: Mapped[Account] = relationship(back_populates="location")


class Profile(Base):
    """A patient in an account's vault. The account holder is also a profile."""

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    relation: Mapped[str | None] = mapped_column(String(40))
    age: Mapped[int | None] = mapped_column(Integer)
    gender: Mapped[str | None] = mapped_column(String(16))
    blood_group: Mapped[str | None] = mapped_column(String(8))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    bp_systolic: Mapped[int | None] = mapped_column(Integer)
    bp_diastolic: Mapped[int | None] = mapped_column(Integer)
    bp_recorded_at: Mapped[date | None] = mapped_column(Date)
    vitals_history: Mapped[list[dict]] = mapped_column(JSON, default=list)
    chronic_conditions: Mapped[list[str]] = mapped_column(JSON, default=list)
    allergies: Mapped[list[str]] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    is_self: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    account: Mapped[Account] = relationship(back_populates="profiles")
    medicines: Mapped[list["Medicine"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    timeline: Mapped[list["TimelineEntry"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    triage_sessions: Mapped[list["TriageSession"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    strength: Mapped[str | None] = mapped_column(String(60))
    frequency: Mapped[str | None] = mapped_column(String(80))
    duration: Mapped[str | None] = mapped_column(String(60))
    with_food: Mapped[str | None] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(24), default="manual", nullable=False)
    prescription_date: Mapped[str | None] = mapped_column(String(24))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    profile: Mapped[Profile] = relationship(back_populates="medicines")


class TimelineEntry(Base):
    """Any event on a patient's health record — triage, lab, prescription."""

    __tablename__ = "timeline_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)  # triage|lab|prescription
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(200))
    level: Mapped[str | None] = mapped_column(String(24))  # triage level, if any
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    profile: Mapped[Profile] = relationship(back_populates="timeline")


class TriageSession(Base):
    """Persisted conversational triage session; survives reloads."""

    __tablename__ = "triage_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    turns: Mapped[list[dict]] = mapped_column(JSON, default=list)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    result_level: Mapped[str | None] = mapped_column(String(24))
    result_payload: Mapped[dict | None] = mapped_column(JSON)
    initial_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    profile: Mapped[Profile] = relationship(back_populates="triage_sessions")


class GuestTriageSession(Base):
    """Short-lived, anonymous assessment state.

    Guest conversations intentionally have no account/profile foreign key. The
    browser receives a random opaque token while only its SHA-256 digest is
    stored here, so a database read cannot be used to recover active grants.
    """

    __tablename__ = "guest_triage_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    turns: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    result_payload: Mapped[dict | None] = mapped_column(JSON)
    consented_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class UsageSession(Base):
    """Privacy-safe, authenticated product usage for the owner dashboard."""

    __tablename__ = "usage_sessions"
    __table_args__ = (UniqueConstraint("account_id", "session_key", name="uq_usage_account_session"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_key: Mapped[str] = mapped_column(String(64), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True, nullable=False)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_path: Mapped[str | None] = mapped_column(String(180))


class RequestLog(Base):
    """Operational request metadata. Bodies, query strings and tokens are never stored."""

    __tablename__ = "request_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    account_id: Mapped[int | None] = mapped_column(Integer, index=True)
    method: Mapped[str] = mapped_column(String(12), nullable=False)
    path: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True, nullable=False)


class ConsentRecord(Base):
    """Append-only proof of an account's current consent decision."""

    __tablename__ = "consent_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    consent_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    policy_version: Mapped[str] = mapped_column(String(24), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source: Mapped[str] = mapped_column(String(40), default="privacy_page", nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True, nullable=False)

    account: Mapped[Account] = relationship(back_populates="consent_records")


class AuditEvent(Base):
    """Privacy-safe security trail; clinical text and uploaded contents never belong here."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Deliberately not a foreign key: deleting a family profile must not erase
    # proof that the deletion occurred.
    profile_id: Mapped[int | None] = mapped_column(Integer, index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(80))
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True, nullable=False)

    account: Mapped[Account] = relationship(back_populates="audit_events")


class VerificationCode(Base):
    """A short-lived, single-use, attempt-limited OTP for phone/email verify."""

    __tablename__ = "verification_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    channel: Mapped[str] = mapped_column(String(10), nullable=False)  # phone | email
    destination: Mapped[str] = mapped_column(String(160), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    account: Mapped[Account] = relationship(back_populates="verification_codes")
