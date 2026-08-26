"""Per-account/guest AI budgets and provider usage accounting.

The provider APIs return token counts, while Nabz controls the applicable USD
rates through environment variables. Integer micro-USD values provide an
auditable, concurrency-safe application cap without storing clinical content.
"""
from __future__ import annotations

import math
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from sqlalchemy import case, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models_db import AIUsageBudget, AIUsageEvent


MICRO_USD_PER_USD = 1_000_000


class AIBudgetExceeded(RuntimeError):
    """Raised before a provider call when its maximum cost cannot fit."""


@dataclass(frozen=True)
class AIUsageContext:
    db: Session
    scope_type: str
    scope_key: str
    operation: str
    account_id: int | None = None
    guest_session_id: int | None = None
    profile_id: int | None = None
    triage_session_id: int | None = None


@dataclass(frozen=True)
class UsageReservation:
    request_id: str
    context: AIUsageContext
    provider: str
    model: str
    reserved_microusd: int
    started_at: float


def account_usage_context(
    db: Session, *, account_id: int, profile_id: int, triage_session_id: int,
    operation: str,
) -> AIUsageContext:
    return AIUsageContext(
        db=db, scope_type="account", scope_key=str(account_id), operation=operation,
        account_id=account_id, profile_id=profile_id,
        triage_session_id=triage_session_id,
    )


def guest_usage_context(
    db: Session, *, guest_session_id: int, operation: str,
) -> AIUsageContext:
    return AIUsageContext(
        db=db, scope_type="guest", scope_key=str(guest_session_id), operation=operation,
        guest_session_id=guest_session_id, triage_session_id=guest_session_id,
    )


def _env_decimal(name: str, default: str, *, minimum: str = "0") -> Decimal:
    try:
        value = Decimal(os.getenv(name, default).strip())
    except (InvalidOperation, AttributeError):
        value = Decimal(default)
    return max(value, Decimal(minimum))


def budget_limit_microusd(scope_type: str) -> int:
    name = (
        "NABZ_REGISTERED_AI_BUDGET_USD"
        if scope_type == "account"
        else "NABZ_GUEST_AI_BUDGET_USD"
    )
    default = "0.50" if scope_type == "account" else "0.30"
    return int(
        (_env_decimal(name, default) * MICRO_USD_PER_USD).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def _rates(provider: str) -> tuple[Decimal, Decimal, Decimal]:
    prefix = "NABZ_OPENAI" if provider == "openai" else "NABZ_QWEN"
    defaults = (
        ("0.15", "0.075", "0.60")
        if provider == "openai"
        else ("0.40", "0.08", "1.60")
    )
    return (
        _env_decimal(f"{prefix}_INPUT_USD_PER_M", defaults[0]),
        _env_decimal(f"{prefix}_CACHED_INPUT_USD_PER_M", defaults[1]),
        _env_decimal(f"{prefix}_OUTPUT_USD_PER_M", defaults[2]),
    )


def cost_microusd(
    provider: str, *, input_tokens: int, cached_input_tokens: int, output_tokens: int,
) -> int:
    input_rate, cached_rate, output_rate = _rates(provider)
    cached = min(max(int(cached_input_tokens or 0), 0), max(int(input_tokens or 0), 0))
    uncached = max(int(input_tokens or 0) - cached, 0)
    # tokens × USD-per-million equals micro-USD directly.
    amount = uncached * input_rate + cached * cached_rate + max(int(output_tokens or 0), 0) * output_rate
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def max_call_cost_microusd(
    provider: str, messages: list[dict[str, str]], max_output_tokens: int,
) -> int:
    # UTF-8 bytes are a deliberately conservative upper bound for BPE tokens,
    # including Urdu. The small overhead covers chat role/framing tokens.
    input_upper = 256 + sum(
        len(str(message.get("content") or "").encode("utf-8")) + 16
        for message in messages
    )
    estimated = cost_microusd(
        provider,
        input_tokens=input_upper,
        cached_input_tokens=0,
        output_tokens=max_output_tokens,
    )
    return max(1, math.ceil(estimated * 1.05))


def _ensure_budget(context: AIUsageContext) -> int:
    db = context.db
    limit = budget_limit_microusd(context.scope_type)
    budget = (
        db.query(AIUsageBudget)
        .filter(
            AIUsageBudget.scope_type == context.scope_type,
            AIUsageBudget.scope_key == context.scope_key,
        )
        .first()
    )
    if budget is None:
        budget = AIUsageBudget(
            scope_type=context.scope_type,
            scope_key=context.scope_key,
            account_id=context.account_id,
            guest_session_id=context.guest_session_id,
            limit_microusd=limit,
        )
        db.add(budget)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    else:
        budget.limit_microusd = limit
        db.commit()
    return limit


def reserve_usage(
    context: AIUsageContext, *, provider: str, model: str,
    messages: list[dict[str, str]], max_output_tokens: int,
    fallback_from: str | None = None, fallback_reason: str | None = None,
    started_at: float,
) -> UsageReservation:
    db = context.db
    limit = _ensure_budget(context)
    amount = max_call_cost_microusd(provider, messages, max_output_tokens)
    if amount > limit:
        raise AIBudgetExceeded("single_call_exceeds_ai_budget")

    stmt = (
        update(AIUsageBudget)
        .where(
            AIUsageBudget.scope_type == context.scope_type,
            AIUsageBudget.scope_key == context.scope_key,
            AIUsageBudget.used_microusd + AIUsageBudget.reserved_microusd + amount <= AIUsageBudget.limit_microusd,
        )
        .values(
            reserved_microusd=AIUsageBudget.reserved_microusd + amount,
            updated_at=datetime.now(timezone.utc),
        )
    )
    result = db.execute(stmt)
    if result.rowcount != 1:
        db.rollback()
        raise AIBudgetExceeded("ai_budget_exhausted")

    request_id = secrets.token_hex(16)
    db.add(AIUsageEvent(
        request_id=request_id,
        scope_type=context.scope_type,
        scope_key=context.scope_key,
        account_id=context.account_id,
        guest_session_id=context.guest_session_id,
        profile_id=context.profile_id,
        triage_session_id=context.triage_session_id,
        provider=provider,
        model=model,
        operation=context.operation,
        status="pending",
        fallback_from=fallback_from,
        fallback_reason=(fallback_reason or "")[:80] or None,
        reserved_microusd=amount,
    ))
    db.commit()
    return UsageReservation(
        request_id=request_id, context=context, provider=provider, model=model,
        reserved_microusd=amount, started_at=started_at,
    )


def complete_usage(
    reservation: UsageReservation, *, input_tokens: int,
    cached_input_tokens: int, output_tokens: int, latency_ms: float,
    usage_estimated: bool = False,
) -> int:
    db = reservation.context.db
    actual = cost_microusd(
        reservation.provider,
        input_tokens=input_tokens,
        cached_input_tokens=cached_input_tokens,
        output_tokens=output_tokens,
    )
    # The reservation uses a conservative input bound and provider output cap.
    # Clamp defensively so a malformed provider usage object cannot break the
    # hard application allowance.
    charged = min(actual, reservation.reserved_microusd)
    db.execute(
        update(AIUsageBudget)
        .where(
            AIUsageBudget.scope_type == reservation.context.scope_type,
            AIUsageBudget.scope_key == reservation.context.scope_key,
        )
        .values(
            used_microusd=AIUsageBudget.used_microusd + charged,
            reserved_microusd=case(
                (AIUsageBudget.reserved_microusd >= reservation.reserved_microusd,
                 AIUsageBudget.reserved_microusd - reservation.reserved_microusd),
                else_=0,
            ),
            updated_at=datetime.now(timezone.utc),
        )
    )
    event = db.query(AIUsageEvent).filter(AIUsageEvent.request_id == reservation.request_id).one()
    event.status = "success"
    event.input_tokens = max(int(input_tokens or 0), 0)
    event.cached_input_tokens = max(int(cached_input_tokens or 0), 0)
    event.output_tokens = max(int(output_tokens or 0), 0)
    event.cost_microusd = charged
    event.usage_estimated = usage_estimated
    event.latency_ms = latency_ms
    db.commit()
    return charged


def fail_usage(reservation: UsageReservation, *, error: Exception, latency_ms: float) -> None:
    db = reservation.context.db
    db.execute(
        update(AIUsageBudget)
        .where(
            AIUsageBudget.scope_type == reservation.context.scope_type,
            AIUsageBudget.scope_key == reservation.context.scope_key,
        )
        .values(
            reserved_microusd=case(
                (AIUsageBudget.reserved_microusd >= reservation.reserved_microusd,
                 AIUsageBudget.reserved_microusd - reservation.reserved_microusd),
                else_=0,
            ),
            updated_at=datetime.now(timezone.utc),
        )
    )
    event = db.query(AIUsageEvent).filter(AIUsageEvent.request_id == reservation.request_id).one()
    event.status = "failed"
    event.error_code = type(error).__name__[:80]
    event.latency_ms = latency_ms
    db.commit()


def budget_snapshot(db: Session, scope_type: str, scope_key: str) -> dict[str, Any]:
    row = (
        db.query(AIUsageBudget)
        .filter(AIUsageBudget.scope_type == scope_type, AIUsageBudget.scope_key == scope_key)
        .first()
    )
    limit = row.limit_microusd if row else budget_limit_microusd(scope_type)
    used = row.used_microusd if row else 0
    return {
        "limit_microusd": int(limit),
        "used_microusd": int(used),
        "remaining_microusd": max(int(limit) - int(used), 0),
    }
