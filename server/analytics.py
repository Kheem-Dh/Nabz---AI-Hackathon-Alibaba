"""Authenticated usage tracking and owner-only product analytics."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, AuditEvent, ConsentRecord, Profile, RequestLog, TriageSession, UsageSession
from privacy import CONSENT_VERSIONS, consent_is_active
from security import get_current_account, require_admin

router = APIRouter(tags=["analytics"])


def _utcnow() -> datetime:
    # Models use timezone-aware UTC. SQLite may return a naive value, so all
    # Python-side comparisons pass through _as_utc() below.
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return _as_utc(value).isoformat() if value else None


class HeartbeatIn(BaseModel):
    session_key: str = Field(..., min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    path: str = Field(default="/", min_length=1, max_length=180)
    active_seconds: int = Field(default=0, ge=0, le=60)
    page_view: bool = False

    @field_validator("path")
    @classmethod
    def _safe_path(cls, value: str) -> str:
        # Product analytics needs only the route, never query parameters.
        clean = value.split("?", 1)[0].split("#", 1)[0].strip()
        return clean[:180] if clean.startswith("/") else "/"


@router.post("/api/analytics/heartbeat")
def usage_heartbeat(
    payload: HeartbeatIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    now = _utcnow()
    usage = (
        db.query(UsageSession)
        .filter(
            UsageSession.account_id == account.id,
            UsageSession.session_key == payload.session_key,
        )
        .first()
    )
    created = usage is None
    if created:
        usage = UsageSession(
            account_id=account.id,
            session_key=payload.session_key,
            started_at=now,
            last_seen_at=now,
            last_path=payload.path,
            page_views=1 if payload.page_view else 0,
        )
        db.add(usage)
    else:
        elapsed = max(0, int((now - _as_utc(usage.last_seen_at)).total_seconds()))
        # A client cannot inflate usage by claiming more time than elapsed
        # between heartbeats (with a small allowance for timer jitter).
        credited = min(payload.active_seconds, elapsed + 5, 60)
        usage.active_seconds = int(usage.active_seconds or 0) + credited
        if payload.page_view and payload.path != usage.last_path:
            usage.page_views = int(usage.page_views or 0) + 1
        usage.last_seen_at = now
        usage.last_path = payload.path
    try:
        db.commit()
    except IntegrityError:
        # React development mode and two open tabs can send the first
        # heartbeat together. Resolve that harmless insert race idempotently.
        db.rollback()
        usage = (
            db.query(UsageSession)
            .filter(
                UsageSession.account_id == account.id,
                UsageSession.session_key == payload.session_key,
            )
            .first()
        )
        if usage is None:
            raise
        usage.last_seen_at = now
        usage.last_path = payload.path
        if payload.page_view and not usage.page_views:
            usage.page_views = 1
        db.commit()
    return {"accepted": True, "server_time": now.isoformat()}


def _day_key(value: datetime) -> str:
    return _as_utc(value).date().isoformat()


@router.get("/api/admin/overview")
def admin_overview(
    days: int = Query(default=14, ge=7, le=90),
    _admin: Account = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    now = _utcnow()
    today = now.date()
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)
    chart_start = today - timedelta(days=days - 1)

    accounts = db.query(Account).order_by(Account.created_at.desc()).all()
    profiles = db.query(Profile).all()
    chats = db.query(TriageSession).all()
    usage = db.query(UsageSession).all()
    consent_rows = (
        db.query(ConsentRecord)
        .order_by(ConsentRecord.changed_at.desc(), ConsentRecord.id.desc())
        .all()
    )
    current_consents: dict[int, dict[str, ConsentRecord]] = defaultdict(dict)
    for record in consent_rows:
        current_consents[record.account_id].setdefault(record.consent_type, record)
    consented_accounts = {
        account.id
        for account in accounts
        if all(
            consent_is_active(current_consents[account.id].get(kind), kind)
            for kind in CONSENT_VERSIONS
        )
    }

    profile_owner = {profile.id: profile.account_id for profile in profiles}
    chats_by_user: Counter[int] = Counter()
    messages_by_user: Counter[int] = Counter()
    for chat in chats:
        owner = profile_owner.get(chat.profile_id)
        if owner is not None:
            chats_by_user[owner] += 1
            messages_by_user[owner] += len(chat.turns or [])

    seconds_by_user: Counter[int] = Counter()
    sessions_by_user: Counter[int] = Counter()
    active_now: set[int] = set()
    active_24h: set[int] = set()
    active_7d: set[int] = set()
    for item in usage:
        seconds_by_user[item.account_id] += int(item.active_seconds or 0)
        sessions_by_user[item.account_id] += 1
        seen = _as_utc(item.last_seen_at)
        if seen >= now - timedelta(minutes=5):
            active_now.add(item.account_id)
        if seen >= since_24h:
            active_24h.add(item.account_id)
        if seen >= since_7d:
            active_7d.add(item.account_id)

    engaged_users = set(chats_by_user)
    returning_users = {
        account.id
        for account in accounts
        if sessions_by_user[account.id] >= 2 or chats_by_user[account.id] >= 2
    }
    total_seconds = sum(seconds_by_user.values())
    completed_chats = sum(1 for chat in chats if chat.status == "closed")
    chats_24h = sum(1 for chat in chats if _as_utc(chat.created_at) >= since_24h)
    chats_7d = sum(1 for chat in chats if _as_utc(chat.created_at) >= since_7d)

    signups_by_day: Counter[str] = Counter(
        _day_key(account.created_at) for account in accounts if _as_utc(account.created_at).date() >= chart_start
    )
    chats_by_day: Counter[str] = Counter(
        _day_key(chat.created_at) for chat in chats if _as_utc(chat.created_at).date() >= chart_start
    )
    active_seconds_by_day: Counter[str] = Counter()
    active_users_by_day: dict[str, set[int]] = defaultdict(set)
    for item in usage:
        key = _day_key(item.last_seen_at)
        if _as_utc(item.last_seen_at).date() >= chart_start:
            active_seconds_by_day[key] += int(item.active_seconds or 0)
            active_users_by_day[key].add(item.account_id)

    series = []
    for offset in range(days):
        key = (chart_start + timedelta(days=offset)).isoformat()
        series.append(
            {
                "date": key,
                "signups": signups_by_day[key],
                "chats": chats_by_day[key],
                "active_seconds": active_seconds_by_day[key],
                "active_users": len(active_users_by_day[key]),
            }
        )

    profile_counts = Counter(profile.account_id for profile in profiles)
    recent_users = [
        {
            "id": account.id,
            "name": account.full_name,
            "email": account.email,
            "phone": account.phone,
            "verified": bool(account.email_verified or account.phone_verified),
            "joined_at": _iso(account.created_at),
            "profiles": profile_counts[account.id],
            "chats": chats_by_user[account.id],
            "messages": messages_by_user[account.id],
            "active_seconds": seconds_by_user[account.id],
            "sessions": sessions_by_user[account.id],
        }
        for account in accounts[:25]
    ]

    log_since = now - timedelta(days=7)
    excluded_paths = ("/api/analytics/heartbeat", "/api/health/live", "/api/health/ready")
    endpoint_rows = (
        db.query(
            RequestLog.method,
            RequestLog.path,
            func.count(RequestLog.id).label("requests"),
            func.sum(case((RequestLog.status_code >= 400, 1), else_=0)).label("errors"),
            func.avg(RequestLog.latency_ms).label("average_latency"),
        )
        .filter(RequestLog.created_at >= log_since, ~RequestLog.path.in_(excluded_paths))
        .group_by(RequestLog.method, RequestLog.path)
        .order_by(func.count(RequestLog.id).desc())
        .limit(12)
        .all()
    )
    endpoint_stats = [
        {
            "method": row.method,
            "path": row.path,
            "requests": int(row.requests or 0),
            "errors": int(row.errors or 0),
            "avg_latency_ms": round(float(row.average_latency or 0), 1),
        }
        for row in endpoint_rows
    ]

    audit_rows = (
        db.query(AuditEvent.event_type, func.count(AuditEvent.id).label("events"))
        .filter(AuditEvent.created_at >= log_since)
        .group_by(AuditEvent.event_type)
        .order_by(func.count(AuditEvent.id).desc())
        .all()
    )
    audit_event_counts = [
        {"type": row.event_type, "events": int(row.events or 0)}
        for row in audit_rows
    ]
    audit_events_7d = sum(row["events"] for row in audit_event_counts)

    return {
        "generated_at": now.isoformat(),
        "overview": {
            "total_users": len(accounts),
            "active_now": len(active_now),
            "active_24h": len(active_24h),
            "active_7d": len(active_7d),
            "total_active_seconds": total_seconds,
            "average_active_seconds_per_user": round(total_seconds / len(accounts)) if accounts else 0,
            "total_chats": len(chats),
            "chats_24h": chats_24h,
            "chats_7d": chats_7d,
            "total_messages": sum(messages_by_user.values()),
        },
        "engagement": {
            "engaged_users": len(engaged_users),
            "engagement_rate": round(len(engaged_users) * 100 / len(accounts), 1) if accounts else 0,
            "returning_users": len(returning_users),
            "return_rate": round(len(returning_users) * 100 / len(accounts), 1) if accounts else 0,
            "completed_chats": completed_chats,
            "completion_rate": round(completed_chats * 100 / len(chats), 1) if chats else 0,
            "chats_per_engaged_user": round(len(chats) / len(engaged_users), 1) if engaged_users else 0,
        },
        "series": series,
        "recent_users": recent_users,
        "endpoint_stats": endpoint_stats,
        "privacy": {
            "accounts_with_current_consent": len(consented_accounts),
            "consent_coverage_rate": round(len(consented_accounts) * 100 / len(accounts), 1) if accounts else 0,
            "audit_events_7d": audit_events_7d,
            "event_counts_7d": audit_event_counts,
        },
    }


@router.get("/api/admin/logs")
def admin_logs(
    limit: int = Query(default=80, ge=10, le=250),
    errors_only: bool = Query(default=False),
    _admin: Account = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = db.query(RequestLog)
    if errors_only:
        query = query.filter(RequestLog.status_code >= 400)
    logs = query.order_by(RequestLog.created_at.desc()).limit(limit).all()
    return {
        "logs": [
            {
                "id": log.id,
                "request_id": log.request_id,
                "account_id": log.account_id,
                "method": log.method,
                "path": log.path,
                "status": log.status_code,
                "latency_ms": log.latency_ms,
                "created_at": _iso(log.created_at),
            }
            for log in logs
        ]
    }
