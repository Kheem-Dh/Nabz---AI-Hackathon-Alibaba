"""Profile (family vault) CRUD."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Medicine, Profile, TimelineEntry
from schemas import MedicineOut, ProfileIn, ProfileOut, TimelineEntryOut
from security import get_current_account
from storage import delete_upload_ref

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


def _to_out(profile: Profile) -> ProfileOut:
    return ProfileOut(
        id=profile.id,
        display_name=profile.display_name,
        relation=profile.relation,
        age=profile.age,
        gender=profile.gender,
        blood_group=profile.blood_group,
        chronic_conditions=list(profile.chronic_conditions or []),
        allergies=list(profile.allergies or []),
        notes=profile.notes,
        is_self=profile.is_self,
        medicines=[MedicineOut.model_validate(m) for m in profile.medicines],
        timeline=[
            TimelineEntryOut.model_validate(e)
            for e in sorted(profile.timeline, key=lambda x: x.created_at, reverse=True)
        ],
    )


def _load_owned(db: Session, account: Account, profile_id: int) -> Profile:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return profile


@router.get("", response_model=list[ProfileOut])
def list_profiles(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[ProfileOut]:
    profiles = (
        db.query(Profile)
        .filter(Profile.account_id == account.id)
        .order_by(Profile.is_self.desc(), Profile.created_at.asc())
        .all()
    )
    return [_to_out(p) for p in profiles]


@router.post("", response_model=ProfileOut, status_code=201)
def create_profile(
    payload: ProfileIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ProfileOut:
    profile = Profile(
        account_id=account.id,
        display_name=payload.display_name.strip(),
        relation=payload.relation,
        age=payload.age,
        gender=payload.gender,
        blood_group=payload.blood_group,
        chronic_conditions=list(payload.chronic_conditions or []),
        allergies=list(payload.allergies or []),
        notes=payload.notes,
        is_self=False,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _to_out(profile)


@router.get("/{profile_id}", response_model=ProfileOut)
def get_profile(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ProfileOut:
    return _to_out(_load_owned(db, account, profile_id))


@router.put("/{profile_id}", response_model=ProfileOut)
def update_profile(
    profile_id: int,
    payload: ProfileIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ProfileOut:
    profile = _load_owned(db, account, profile_id)
    profile.display_name = payload.display_name.strip()
    profile.relation = payload.relation
    profile.age = payload.age
    profile.gender = payload.gender
    profile.blood_group = payload.blood_group
    profile.chronic_conditions = list(payload.chronic_conditions or [])
    profile.allergies = list(payload.allergies or [])
    profile.notes = payload.notes
    db.commit()
    db.refresh(profile)
    return _to_out(profile)


@router.delete("/{profile_id}", status_code=204, response_class=Response)
def delete_profile(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> Response:
    profile = _load_owned(db, account, profile_id)
    if profile.is_self:
        raise HTTPException(status_code=400, detail="cannot_delete_self_profile")
    stored_refs = []
    for entry in profile.timeline:
        payload = entry.payload or {}
        stored_ref = payload.get("stored_ref") or payload.get("image_ref")
        if stored_ref:
            stored_refs.append(str(stored_ref))
    db.delete(profile)
    db.commit()
    for stored_ref in stored_refs:
        delete_upload_ref(stored_ref)
    return Response(status_code=204)
