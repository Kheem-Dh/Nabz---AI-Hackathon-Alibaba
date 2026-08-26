"""Authentication routes — register, login, /me, and phone/email verification."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Profile
from schemas import (
    AccountOut,
    AuthResponse,
    LoginRequest,
    OtpRequest,
    OtpSendResponse,
    OtpVerifyRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RegisterRequest,
)
from security import (
    canonical_phone,
    get_current_account,
    hash_password,
    is_admin_account,
    issue_token,
    verify_password,
)
from verification import request_code, request_password_reset, reset_password, verify_code

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _account_out(account: Account) -> AccountOut:
    return AccountOut(
        id=account.id,
        full_name=account.full_name,
        phone=account.phone,
        email=account.email,
        phone_verified=bool(account.phone_verified),
        email_verified=bool(account.email_verified),
        is_admin=is_admin_account(account),
    )


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    phone = canonical_phone(payload.phone)
    existing_phone = db.query(Account).filter(Account.phone == phone).first()
    if existing_phone:
        raise HTTPException(status_code=409, detail="phone_already_registered")
    if payload.email:
        existing_email = (
            db.query(Account)
            .filter(func.lower(Account.email) == payload.email.lower())
            .first()
        )
        if existing_email:
            raise HTTPException(status_code=409, detail="email_already_registered")

    account = Account(
        full_name=payload.full_name.strip(),
        phone=phone,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(account)
    db.flush()

    # Every account starts with the holder as the first (self) profile.
    self_profile = Profile(
        account_id=account.id,
        display_name=account.full_name.strip(),
        relation="Self",
        date_of_birth=payload.date_of_birth,
        age=(
            date.today().year - payload.date_of_birth.year
            - ((date.today().month, date.today().day) < (payload.date_of_birth.month, payload.date_of_birth.day))
            if payload.date_of_birth else None
        ),
        is_self=True,
    )
    db.add(self_profile)
    db.commit()
    db.refresh(account)

    return AuthResponse(token=issue_token(account.id), account=_account_out(account))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    identifier = payload.identifier.strip().lower()
    # Match a phone in canonical form OR an email (case-insensitive), so the
    # login format need not equal the signup format.
    phone_identifier = canonical_phone(identifier)
    account = (
        db.query(Account)
        .filter(
            or_(
                Account.phone == phone_identifier,
                func.lower(Account.email) == identifier,
            )
        )
        .first()
    )
    if not account or not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    return AuthResponse(token=issue_token(account.id), account=_account_out(account))


@router.post("/password-reset/request", response_model=OtpSendResponse)
def password_reset_request(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> OtpSendResponse:
    """Send a reset code without revealing whether an account exists."""
    return OtpSendResponse(**request_password_reset(db, payload.identifier))


@router.post("/password-reset/confirm")
def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    reset_password(db, payload.identifier, payload.code, payload.new_password)
    return {"reset": True}


@router.get("/me", response_model=AccountOut)
def me(account: Account = Depends(get_current_account)) -> AccountOut:
    return _account_out(account)


# --- Verification (soft gate) ------------------------------------------------

@router.post("/request-otp", response_model=OtpSendResponse)
def request_otp(
    payload: OtpRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> OtpSendResponse:
    """Send a one-time code to the account's phone or email.

    In mock mode / without an SMS or SMTP provider, the code is returned as
    `dev_code` so the flow is demoable with zero credentials.
    """
    result = request_code(db, account, payload.channel.value)
    return OtpSendResponse(**result)


@router.post("/verify-otp", response_model=AccountOut)
def verify_otp(
    payload: OtpVerifyRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> AccountOut:
    """Confirm a code and mark the channel verified. Returns the updated account."""
    verify_code(db, account, payload.channel.value, payload.code)
    db.refresh(account)
    return _account_out(account)
