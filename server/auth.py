"""Authentication routes — register, login, /me."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Profile
from schemas import AccountOut, AuthResponse, LoginRequest, RegisterRequest
from security import get_current_account, hash_password, issue_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _account_out(account: Account) -> AccountOut:
    return AccountOut(id=account.id, full_name=account.full_name, phone=account.phone)


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    existing = db.query(Account).filter(Account.phone == payload.phone).first()
    if existing:
        raise HTTPException(status_code=409, detail="phone_already_registered")

    account = Account(
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(account)
    db.flush()

    # Every account starts with the holder as the first (self) profile.
    self_profile = Profile(
        account_id=account.id,
        display_name=account.full_name.strip(),
        relation="Self",
        is_self=True,
    )
    db.add(self_profile)
    db.commit()
    db.refresh(account)

    return AuthResponse(token=issue_token(account.id), account=_account_out(account))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    account = db.query(Account).filter(Account.phone == payload.phone.strip()).first()
    if not account or not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    return AuthResponse(token=issue_token(account.id), account=_account_out(account))


@router.get("/me", response_model=AccountOut)
def me(account: Account = Depends(get_current_account)) -> AccountOut:
    return _account_out(account)
