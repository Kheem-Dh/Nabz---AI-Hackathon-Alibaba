"""Versioned consent, enforcement helpers, and privacy-safe audit history."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, AuditEvent, ConsentRecord
from security import get_current_account

router = APIRouter(prefix="/api/privacy", tags=["privacy"])

CONSENT_VERSIONS = {
    "health_data_storage": "2026-08-25",
    "ai_processing": "2026-08-25",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


class ConsentChoicesIn(BaseModel):
    choices: dict[str, bool]
    source: str = Field(default="privacy_page", min_length=2, max_length=40)

    @field_validator("choices")
    @classmethod
    def _known_choices(cls, value: dict[str, bool]) -> dict[str, bool]:
        if not value:
            raise ValueError("at_least_one_consent_choice_required")
        unknown = set(value).difference(CONSENT_VERSIONS)
        if unknown:
            raise ValueError(f"unknown_consent_type:{','.join(sorted(unknown))}")
        return value

    @field_validator("source")
    @classmethod
    def _safe_source(cls, value: str) -> str:
        cleaned = value.strip().lower().replace(" ", "_")
        allowed = {"privacy_page", "registration", "existing_user_gate"}
        return cleaned if cleaned in allowed else "privacy_page"


def latest_consents(db: Session, account_id: int) -> dict[str, ConsentRecord]:
    rows = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.account_id == account_id)
        .order_by(ConsentRecord.changed_at.desc(), ConsentRecord.id.desc())
        .all()
    )
    latest: dict[str, ConsentRecord] = {}
    for row in rows:
        latest.setdefault(row.consent_type, row)
    return latest


def consent_is_active(record: ConsentRecord | None, consent_type: str) -> bool:
    return bool(
        record
        and record.granted
        and record.policy_version == CONSENT_VERSIONS[consent_type]
    )


def ensure_consents(db: Session, account: Account, *consent_types: str) -> None:
    current = latest_consents(db, account.id)
    missing = [kind for kind in consent_types if not consent_is_active(current.get(kind), kind)]
    if missing:
        raise HTTPException(status_code=403, detail=f"consent_required:{','.join(missing)}")


def record_audit(
    db: Session,
    *,
    account_id: int,
    event_type: str,
    resource_type: str,
    profile_id: int | None = None,
    resource_id: int | str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    """Stage a safe event in the caller's transaction.

    Callers may include small categorical/count metadata only. Names, health
    values, chat text, extracted document text, filenames and tokens are
    intentionally forbidden by convention and never accepted from clients.
    """
    event = AuditEvent(
        account_id=account_id,
        profile_id=profile_id,
        event_type=event_type[:64],
        resource_type=resource_type[:40],
        resource_id=str(resource_id)[:80] if resource_id is not None else None,
        event_metadata=dict(metadata or {}),
    )
    db.add(event)
    return event


def _status_payload(db: Session, account_id: int) -> dict[str, Any]:
    current = latest_consents(db, account_id)
    consents = {}
    for kind, required_version in CONSENT_VERSIONS.items():
        record = current.get(kind)
        consents[kind] = {
            "type": kind,
            "required_version": required_version,
            "version": record.policy_version if record else None,
            "granted": consent_is_active(record, kind),
            "last_choice": bool(record.granted) if record else None,
            "changed_at": _iso(record.changed_at) if record else None,
        }
    return {
        "complete": all(item["granted"] for item in consents.values()),
        "consents": consents,
    }


@router.get("/consents")
def get_consents(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _status_payload(db, account.id)


@router.put("/consents")
def update_consents(
    payload: ConsentChoicesIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    current = latest_consents(db, account.id)
    now = _utcnow()
    for kind, granted in payload.choices.items():
        prior = current.get(kind)
        version = CONSENT_VERSIONS[kind]
        if prior and prior.granted == granted and prior.policy_version == version:
            continue
        db.add(ConsentRecord(
            account_id=account.id,
            consent_type=kind,
            policy_version=version,
            granted=granted,
            source=payload.source,
            changed_at=now,
        ))
        record_audit(
            db,
            account_id=account.id,
            event_type="consent.granted" if granted else "consent.revoked",
            resource_type="consent",
            resource_id=kind,
            metadata={"policy_version": version},
        )
    db.commit()
    return _status_payload(db, account.id)


@router.get("/activity")
def privacy_activity(
    limit: int = Query(default=30, ge=1, le=100),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.account_id == account.id)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(limit)
        .all()
    )
    return {
        "events": [
            {
                "id": event.id,
                "type": event.event_type,
                "resource_type": event.resource_type,
                "resource_id": event.resource_id,
                "profile_id": event.profile_id,
                "metadata": dict(event.event_metadata or {}),
                "created_at": _iso(event.created_at),
            }
            for event in events
        ]
    }
