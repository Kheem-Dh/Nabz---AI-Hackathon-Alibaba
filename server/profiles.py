"""Profile (family vault) CRUD."""
from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Medicine, Profile, TimelineEntry
from schemas import MedicineOut, ProfileIn, ProfileOut, TimelineEntryOut
from security import get_current_account
from privacy import ensure_consents, record_audit
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
        date_of_birth=profile.date_of_birth,
        weight_kg=profile.weight_kg,
        bp_systolic=profile.bp_systolic,
        bp_diastolic=profile.bp_diastolic,
        bp_recorded_at=profile.bp_recorded_at,
        vitals_history=list(profile.vitals_history or []),
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


def _age_on(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _vitals_history(payload: ProfileIn, existing: list[dict] | None = None) -> list[dict]:
    history = list(existing or [])
    if payload.bp_systolic is None or payload.bp_diastolic is None:
        return history
    recorded = payload.bp_recorded_at or date.today()
    reading = {
        "systolic": payload.bp_systolic,
        "diastolic": payload.bp_diastolic,
        "recorded_at": recorded.isoformat(),
    }
    if reading not in history:
        history.append(reading)
    return history[-50:]


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
    ensure_consents(db, account, "health_data_storage")
    profile = Profile(
        account_id=account.id,
        display_name=payload.display_name.strip(),
        relation=payload.relation,
        age=payload.age,
        gender=payload.gender,
        blood_group=payload.blood_group,
        date_of_birth=payload.date_of_birth,
        weight_kg=payload.weight_kg,
        bp_systolic=payload.bp_systolic,
        bp_diastolic=payload.bp_diastolic,
        bp_recorded_at=(payload.bp_recorded_at or date.today()) if payload.bp_systolic else None,
        vitals_history=_vitals_history(payload),
        chronic_conditions=list(payload.chronic_conditions or []),
        allergies=list(payload.allergies or []),
        notes=payload.notes,
        is_self=False,
    )
    if payload.date_of_birth:
        profile.age = _age_on(payload.date_of_birth)
    db.add(profile)
    db.flush()
    record_audit(
        db,
        account_id=account.id,
        profile_id=profile.id,
        event_type="profile.created",
        resource_type="profile",
        resource_id=profile.id,
    )
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
    ensure_consents(db, account, "health_data_storage")
    profile.display_name = payload.display_name.strip()
    profile.relation = payload.relation
    profile.age = payload.age
    profile.gender = payload.gender
    profile.blood_group = payload.blood_group
    profile.date_of_birth = payload.date_of_birth
    profile.age = _age_on(payload.date_of_birth) if payload.date_of_birth else payload.age
    profile.weight_kg = payload.weight_kg
    profile.bp_systolic = payload.bp_systolic
    profile.bp_diastolic = payload.bp_diastolic
    profile.bp_recorded_at = (
        payload.bp_recorded_at or date.today()
    ) if payload.bp_systolic is not None else None
    profile.vitals_history = _vitals_history(payload, profile.vitals_history)
    profile.chronic_conditions = list(payload.chronic_conditions or [])
    profile.allergies = list(payload.allergies or [])
    profile.notes = payload.notes
    record_audit(
        db,
        account_id=account.id,
        profile_id=profile.id,
        event_type="profile.updated",
        resource_type="profile",
        resource_id=profile.id,
    )
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
    ensure_consents(db, account, "health_data_storage")
    stored_refs = []
    for entry in profile.timeline:
        payload = entry.payload or {}
        stored_ref = payload.get("stored_ref") or payload.get("image_ref")
        if stored_ref:
            stored_refs.append(str(stored_ref))
    record_audit(
        db,
        account_id=account.id,
        profile_id=profile.id,
        event_type="profile.deleted",
        resource_type="profile",
        resource_id=profile.id,
    )
    db.delete(profile)
    db.commit()
    for stored_ref in stored_refs:
        delete_upload_ref(stored_ref)
    return Response(status_code=204)
