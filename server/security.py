"""Password hashing + JWT session tokens + FastAPI auth dependency."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 7  # one week


def _secret() -> str:
    return os.getenv("JWT_SECRET", "change-me-nabz-dev-secret")


def canonical_phone(raw: str) -> str:
    """Return one storage/login form for accepted Pakistan mobile numbers."""
    value = "".join(ch for ch in (raw or "").strip() if ch.isdigit() or ch == "+")
    digits = value.lstrip("+")
    if digits.startswith("0092"):
        digits = digits[2:]
    if digits.startswith("92") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"+92{digits[1:]}"
    if digits.startswith("3") and len(digits) == 10:
        return f"+92{digits}"
    return value


def hash_password(raw: str) -> str:
    return _pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return _pwd.verify(raw, hashed)
    except Exception:
        return False


def issue_token(account_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(account_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def decode_token(token: str) -> int:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid_token:{type(exc).__name__}",
        ) from exc


def get_current_account(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Account:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_bearer_token")
    token = authorization.split(" ", 1)[1].strip()
    account_id = decode_token(token)
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=401, detail="account_not_found")
    return account


def _admin_identifiers() -> set[str]:
    """Configured owner emails/phones; empty means nobody has admin access."""
    return {
        item.strip().lower()
        for item in os.getenv("NABZ_ADMIN_IDENTIFIERS", "").split(",")
        if item.strip()
    }


def is_admin_account(account: Account) -> bool:
    allowed = _admin_identifiers()
    candidates = {account.phone.strip().lower()}
    if account.email:
        candidates.add(account.email.strip().lower())
    return bool(allowed.intersection(candidates))


def require_admin(account: Account = Depends(get_current_account)) -> Account:
    """Enforce owner access at the API boundary, independent of the web UI."""
    if not is_admin_account(account):
        raise HTTPException(status_code=403, detail="admin_access_required")
    return account
