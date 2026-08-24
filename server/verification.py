"""Phone (SMS) + email one-time-code verification.

Design goals, matching the rest of Nabz:
- **Demoable with zero credentials.** In MOCK_MODE (or when no SMS/SMTP provider
  is configured) the code is logged and returned in the API response as
  `dev_code`, so the whole verify flow works on a laptop with no accounts.
- **Soft gate.** Verifying is encouraged, not enforced — an account can use the
  app while unverified; the UI shows a "verify" banner.
- **Safe.** Codes are short-lived, attempt-limited, single-use, and stored only
  as an HMAC hash — never in plaintext.

Real delivery is best-effort and fully optional:
- SMS via Twilio when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are set.
- Email via SMTP when SMTP_HOST (+ optional SMTP_USER/SMTP_PASSWORD/SMTP_FROM) is set.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models_db import Account, VerificationCode

logger = logging.getLogger("nabz.verification")

CODE_TTL_SECONDS = 10 * 60      # a code is valid for 10 minutes
RESEND_COOLDOWN_SECONDS = 30    # min gap between sends on one channel
MAX_ATTEMPTS = 5                # wrong-guess ceiling before a code is burned
VALID_CHANNELS = {"phone", "email"}
RESET_CHANNEL = "reset"


def _secret() -> str:
    return os.getenv("JWT_SECRET", "change-me-nabz-dev-secret")


def _now() -> datetime:
    """Naive UTC — SQLite stores naive datetimes; keep comparisons consistent."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_code(account_id: int, channel: str, code: str) -> str:
    msg = f"{account_id}:{channel}:{code}".encode()
    return hmac.new(_secret().encode(), msg, hashlib.sha256).hexdigest()


def _destination(account: Account, channel: str) -> str:
    if channel == "phone":
        return account.phone
    if channel == "email":
        if not account.email:
            raise HTTPException(status_code=400, detail="no_email_on_account")
        return account.email
    raise HTTPException(status_code=400, detail="invalid_channel")


# --- Delivery (best-effort; never blocks the flow) ---------------------------

def _deliver_sms(destination: str, code: str) -> bool:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    sender = os.getenv("TWILIO_FROM", "").strip()
    if not (sid and token and sender):
        return False
    try:
        resp = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data={"To": destination, "From": sender, "Body": f"Your Nabz code is {code}"},
            auth=(sid, token),
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Twilio SMS send failed: %s", exc)
        return False


def _deliver_email(destination: str, code: str) -> bool:
    host = os.getenv("SMTP_HOST", "").strip()
    if not host:
        return False
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    sender = os.getenv("SMTP_FROM", user or "no-reply@nabz.app").strip()
    try:
        message = EmailMessage()
        message["Subject"] = "Your Nabz verification code"
        message["From"] = sender
        message["To"] = destination
        message.set_content(f"Your Nabz verification code is {code}. It expires in 10 minutes.")
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.send_message(message)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("SMTP email send failed: %s", exc)
        return False


def _deliver(channel: str, destination: str, code: str) -> bool:
    return _deliver_sms(destination, code) if channel == "phone" else _deliver_email(destination, code)


# --- Public API --------------------------------------------------------------

def is_verified(account: Account, channel: str) -> bool:
    return bool(account.phone_verified if channel == "phone" else account.email_verified)


def request_code(db: Session, account: Account, channel: str) -> dict:
    """Create + send a one-time code. Returns a response dict (dev_code in mock)."""
    if channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="invalid_channel")
    destination = _destination(account, channel)

    if is_verified(account, channel):
        return {
            "channel": channel,
            "sent": False,
            "already_verified": True,
            "expires_in_seconds": 0,
            "message": f"{channel} already verified",
            "dev_code": None,
        }

    # Cooldown: reject a resend that arrives too soon after the last one.
    latest = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.account_id == account.id,
            VerificationCode.channel == channel,
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if latest is not None:
        age = (_now() - _as_naive(latest.created_at)).total_seconds()
        if not latest.consumed and age < RESEND_COOLDOWN_SECONDS:
            raise HTTPException(
                status_code=429,
                detail=f"resend_cooldown:{int(RESEND_COOLDOWN_SECONDS - age)}",
            )

    # Invalidate any prior live codes on this channel — only the newest works.
    db.query(VerificationCode).filter(
        VerificationCode.account_id == account.id,
        VerificationCode.channel == channel,
        VerificationCode.consumed == False,  # noqa: E712
    ).update({"consumed": True})

    code = _generate_code()
    record = VerificationCode(
        account_id=account.id,
        channel=channel,
        destination=destination,
        code_hash=_hash_code(account.id, channel, code),
        expires_at=_now() + timedelta(seconds=CODE_TTL_SECONDS),
        attempts=0,
        consumed=False,
    )
    db.add(record)
    db.commit()

    # Delivery is independent of the AI's MOCK_MODE: if a provider is configured
    # for this channel we really send, even when the DashScope key is absent.
    # `_deliver` returns False when no provider is configured or the send fails.
    delivered = _deliver(channel, destination, code)

    if not delivered:
        # No provider (or send failed) — surface the code so the flow is still
        # usable, and log it. dev_code is ONLY returned when we couldn't deliver.
        logger.info("[DEV OTP] %s → %s : %s", channel, destination, code)

    masked = _mask(destination, channel)
    return {
        "channel": channel,
        "sent": delivered,
        "already_verified": False,
        "expires_in_seconds": CODE_TTL_SECONDS,
        "message": (
            f"Code sent to {masked}"
            if delivered
            else f"Demo mode — code shown here (would be sent to {masked})"
        ),
        # Present only when we could not really deliver (mock or no provider).
        "dev_code": None if delivered else code,
    }


def verify_code(db: Session, account: Account, channel: str, code: str) -> None:
    """Check a code; on success mark the channel verified. Raises on failure."""
    if channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="invalid_channel")
    if is_verified(account, channel):
        return

    code = (code or "").strip()
    record = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.account_id == account.id,
            VerificationCode.channel == channel,
            VerificationCode.consumed == False,  # noqa: E712
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if record is None:
        raise HTTPException(status_code=400, detail="no_active_code")

    if _now() > _as_naive(record.expires_at):
        record.consumed = True
        db.commit()
        raise HTTPException(status_code=400, detail="code_expired")

    if record.attempts >= MAX_ATTEMPTS:
        record.consumed = True
        db.commit()
        raise HTTPException(status_code=429, detail="too_many_attempts")

    expected = _hash_code(account.id, channel, code)
    if not hmac.compare_digest(expected, record.code_hash):
        record.attempts += 1
        db.commit()
        remaining = max(0, MAX_ATTEMPTS - record.attempts)
        raise HTTPException(status_code=400, detail=f"invalid_code:{remaining}")

    # Success.
    record.consumed = True
    now = _now()
    if channel == "phone":
        account.phone_verified = True
        account.phone_verified_at = now
    else:
        account.email_verified = True
        account.email_verified_at = now
    db.commit()


def _account_for_identifier(db: Session, identifier: str) -> Account | None:
    from sqlalchemy import func, or_

    identifier = identifier.strip().lower()
    return (
        db.query(Account)
        .filter(or_(Account.phone == identifier, func.lower(Account.email) == identifier))
        .first()
    )


def request_password_reset(db: Session, identifier: str) -> dict:
    """Issue a reset OTP with an enumeration-safe response."""
    account = _account_for_identifier(db, identifier)
    generic = {
        "channel": "email" if "@" in identifier else "phone",
        "sent": True,
        "already_verified": False,
        "expires_in_seconds": CODE_TTL_SECONDS,
        "message": "If an account matches, a six-digit reset code has been sent.",
        "dev_code": None,
    }
    if account is None:
        return generic

    destination = account.email if "@" in identifier else account.phone
    delivery_channel = "email" if "@" in identifier else "phone"
    if not destination:
        return generic

    latest = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.account_id == account.id,
            VerificationCode.channel == RESET_CHANNEL,
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if latest is not None:
        age = (_now() - _as_naive(latest.created_at)).total_seconds()
        if not latest.consumed and age < RESEND_COOLDOWN_SECONDS:
            return generic

    db.query(VerificationCode).filter(
        VerificationCode.account_id == account.id,
        VerificationCode.channel == RESET_CHANNEL,
        VerificationCode.consumed == False,  # noqa: E712
    ).update({"consumed": True})

    code = _generate_code()
    db.add(VerificationCode(
        account_id=account.id,
        channel=RESET_CHANNEL,
        destination=destination,
        code_hash=_hash_code(account.id, RESET_CHANNEL, code),
        expires_at=_now() + timedelta(seconds=CODE_TTL_SECONDS),
        attempts=0,
        consumed=False,
    ))
    db.commit()
    delivered = _deliver(delivery_channel, destination, code)
    is_production = os.getenv("APP_ENV", "development").strip().lower() == "production"
    if not delivered:
        logger.info("[DEV PASSWORD RESET] %s → %s : %s", delivery_channel, destination, code)
    return {
        **generic,
        # "sent" means the enumeration-safe reset request was accepted. Do
        # not expose account/provider state through this public endpoint.
        "sent": True,
        "message": generic["message"],
        "dev_code": code if not delivered and not is_production else None,
    }


def reset_password(db: Session, identifier: str, code: str, new_password: str) -> None:
    """Consume a reset OTP and replace the password hash."""
    from security import hash_password

    account = _account_for_identifier(db, identifier)
    if account is None:
        raise HTTPException(status_code=400, detail="invalid_or_expired_reset_code")
    record = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.account_id == account.id,
            VerificationCode.channel == RESET_CHANNEL,
            VerificationCode.consumed == False,  # noqa: E712
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if record is None or _now() > _as_naive(record.expires_at):
        if record is not None:
            record.consumed = True
            db.commit()
        raise HTTPException(status_code=400, detail="invalid_or_expired_reset_code")
    if record.attempts >= MAX_ATTEMPTS:
        record.consumed = True
        db.commit()
        raise HTTPException(status_code=429, detail="too_many_attempts")
    if not hmac.compare_digest(
        _hash_code(account.id, RESET_CHANNEL, code.strip()), record.code_hash
    ):
        record.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="invalid_or_expired_reset_code")
    record.consumed = True
    account.password_hash = hash_password(new_password)
    db.commit()


def _mask(destination: str, channel: str) -> str:
    if channel == "email" and "@" in destination:
        name, _, domain = destination.partition("@")
        head = name[:2]
        return f"{head}{'*' * max(1, len(name) - 2)}@{domain}"
    # phone: show last 3 digits
    tail = destination[-3:]
    return f"{'*' * max(0, len(destination) - 3)}{tail}"
