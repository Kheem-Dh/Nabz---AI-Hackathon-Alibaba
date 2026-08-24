"""Chat image attachments.

The triage conversation lets the user attach a photo (e.g. a rash, a wound,
a page from a report). We run it through Qwen-VL to produce a SHORT, FACTUAL
English + Urdu description with no diagnosis or medication advice, then hand
the description back so the frontend can send it into the transcript via the
existing /api/triage/answer endpoint.

In mock mode we return a canned skin description so the whole feature is
demoable with zero credentials.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Profile
from security import get_current_account
from triage import is_mock_mode
from vision import describe_image, validate_upload

router = APIRouter(prefix="/api/chat", tags=["chat-attach"])


def _owned_profile(db: Session, account: Account, profile_id: int) -> Profile:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return profile


def _mock_description(profile_name: str) -> str:
    return (
        "مریض کی جلد پر واضح سرخ نشان دکھائی دیتا ہے۔ "
        "A visible red skin mark is present in the photo. No blood or open wound."
    )


@router.post("/attach")
async def attach_image(
    profile_id: int = Form(...),
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict:
    profile = _owned_profile(db, account, profile_id)

    payload = await file.read()
    mime, err = validate_upload(payload, file.filename or "photo", file.content_type)
    if err:
        raise HTTPException(status_code=400, detail=err)

    if is_mock_mode():
        description = _mock_description(profile.display_name)
        return {"description": description, "mock": True}

    description = describe_image(payload, file.filename or "photo", mime, profile.display_name)
    if not description:
        raise HTTPException(status_code=422, detail="could_not_describe_image")
    return {"description": description, "mock": False}
