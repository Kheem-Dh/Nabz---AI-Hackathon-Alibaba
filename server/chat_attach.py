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
from privacy import ensure_consents, record_audit
from triage import is_mock_mode
from vision import describe_image_structured, validate_upload

router = APIRouter(prefix="/api/chat", tags=["chat-attach"])


def _owned_profile(db: Session, account: Account, profile_id: int) -> Profile:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return profile


def _mock_payload(profile_name: str) -> dict:
    """Realistic structured mock so the whole flow demos with zero credentials."""
    return {
        "description": (
            "مریض کی جلد پر واضح سرخ نشان دکھائی دیتا ہے۔ "
            "A visible red skin mark is present in the photo. No blood or open wound."
        ),
        "description_english": "A visible red skin mark is present. No blood or open wound.",
        "description_urdu": "جلد پر ایک واضح سرخ نشان ہے، خون یا کھلا زخم نہیں ہے۔",
        "visible_features": ["coin-sized red mark", "no pus", "no obvious swelling"],
        "concern_flags": [],
        "urgency_hint": "clinician_soon",
        "not_a_clinical_image": False,
        "mock": True,
    }


@router.post("/attach")
async def attach_image(
    profile_id: int = Form(...),
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict:
    profile = _owned_profile(db, account, profile_id)
    ensure_consents(db, account, "health_data_storage", "ai_processing")

    payload = await file.read()
    mime, err = validate_upload(payload, file.filename or "photo", file.content_type)
    if err:
        raise HTTPException(status_code=400, detail=err)

    if is_mock_mode():
        out = _mock_payload(profile.display_name)
        record_audit(
            db,
            account_id=account.id,
            profile_id=profile.id,
            event_type="document.processed",
            resource_type="clinical_image",
            metadata={"mock": True},
        )
        db.commit()
        return out

    structured = describe_image_structured(
        payload, file.filename or "photo", mime, profile.display_name,
    )
    if not structured or not (structured.get("description_english") or structured.get("description_urdu")):
        raise HTTPException(status_code=422, detail="could_not_describe_image")

    # Compose the natural-language turn the frontend injects into the transcript.
    ur = structured.get("description_urdu") or ""
    en = structured.get("description_english") or ""
    description = " · ".join(p for p in [ur, en] if p) or "Photo attached."

    record_audit(
        db,
        account_id=account.id,
        profile_id=profile.id,
        event_type="document.processed",
        resource_type="clinical_image",
        metadata={
            "mock": False,
            "concern_flags": structured.get("concern_flags", []),
            "urgency_hint": structured.get("urgency_hint"),
        },
    )
    db.commit()
    return {
        "description": description,
        "description_english": structured.get("description_english"),
        "description_urdu": structured.get("description_urdu"),
        "visible_features": structured.get("visible_features", []),
        "concern_flags": structured.get("concern_flags", []),
        "urgency_hint": structured.get("urgency_hint"),
        "not_a_clinical_image": structured.get("not_a_clinical_image", False),
        "mock": False,
    }
