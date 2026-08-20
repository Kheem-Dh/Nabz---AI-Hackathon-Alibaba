"""Authenticated, patient-scoped medical document vault."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from db import get_db
from models_db import Account, Profile, TimelineEntry
from schemas import VaultDocumentOut
from security import get_current_account
from storage import (
    content_type_for_filename,
    delete_upload_ref,
    resolve_upload_ref,
    store_upload,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])

DOCUMENT_TYPES = {"xray", "mri", "skin", "lab", "prescription", "other"}
TYPE_LABELS = {
    "xray": "X-ray",
    "mri": "MRI / scan",
    "skin": "Skin photo",
    "lab": "Lab report",
    "prescription": "Prescription paper",
    "other": "Medical document",
}


def _owned_profile(db: Session, account: Account, profile_id: int) -> Profile:
    profile = db.get(Profile, profile_id)
    if not profile or profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return profile


def _entry_document(entry: TimelineEntry) -> VaultDocumentOut | None:
    payload = entry.payload or {}
    if entry.kind == "document":
        document_type = str(payload.get("document_type", "other"))
        stored_ref = payload.get("stored_ref")
        deletable = True
    elif entry.kind in {"lab", "prescription"} and payload.get("image_ref"):
        document_type = entry.kind
        stored_ref = payload.get("image_ref")
        deletable = False
    else:
        return None
    if not stored_ref:
        return None
    return VaultDocumentOut(
        id=entry.id,
        profile_id=entry.profile_id,
        document_type=document_type,
        title=entry.title,
        original_filename=str(payload.get("original_filename") or Path(stored_ref).name),
        content_type=str(payload.get("content_type") or "application/octet-stream"),
        size_bytes=int(payload.get("size_bytes") or 0),
        notes=payload.get("notes"),
        created_at=entry.created_at,
        view_url=f"/api/documents/{entry.id}/file",
        deletable=deletable,
    )


def list_profile_documents(profile: Profile) -> list[VaultDocumentOut]:
    documents = [_entry_document(entry) for entry in profile.timeline]
    return sorted(
        [document for document in documents if document is not None],
        key=lambda document: document.created_at,
        reverse=True,
    )


@router.post("", response_model=VaultDocumentOut, status_code=201)
async def upload_document(
    profile_id: int = Form(...),
    document_type: str = Form(...),
    title: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> VaultDocumentOut:
    profile = _owned_profile(db, account, profile_id)
    normalized_type = document_type.strip().lower()
    if normalized_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=422, detail="invalid_document_type")
    if normalized_type == "prescription":
        raise HTTPException(status_code=409, detail="use_prescription_confirmation_flow")

    payload = await file.read()
    try:
        stored_ref = store_upload(
            profile.id, payload, file.filename or "document", prefix=normalized_type
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    clean_title = (title or "").strip()[:200] or TYPE_LABELS[normalized_type]
    entry = TimelineEntry(
        profile_id=profile.id,
        kind="document",
        title=clean_title,
        subtitle=TYPE_LABELS[normalized_type],
        payload={
            "document_type": normalized_type,
            "stored_ref": stored_ref,
            "original_filename": (file.filename or "document")[:255],
            "content_type": content_type_for_filename(file.filename or "document"),
            "size_bytes": len(payload),
            "notes": (notes or "").strip()[:2000] or None,
        },
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_document(entry)  # type: ignore[return-value]


@router.post("/prescription-source", response_model=VaultDocumentOut)
async def attach_confirmed_prescription_source(
    profile_id: int = Form(...),
    confirmation_entry_id: int = Form(...),
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> VaultDocumentOut:
    """Attach the original paper only after its transcription was confirmed."""
    profile = _owned_profile(db, account, profile_id)
    entry = db.get(TimelineEntry, confirmation_entry_id)
    if (
        not entry
        or entry.profile_id != profile.id
        or entry.kind != "prescription"
        or not (entry.payload or {}).get("medicines")
    ):
        raise HTTPException(status_code=404, detail="confirmation_not_found")
    if (entry.payload or {}).get("image_ref"):
        return _entry_document(entry)  # type: ignore[return-value]

    payload = await file.read()
    try:
        image_ref = store_upload(profile.id, payload, file.filename or "rx.jpg", prefix="rx")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    entry.payload = {
        **(entry.payload or {}),
        "image_ref": image_ref,
        "original_filename": file.filename or "rx.jpg",
        "content_type": content_type_for_filename(file.filename or "rx.jpg"),
        "size_bytes": len(payload),
    }
    db.commit()
    db.refresh(entry)
    return _entry_document(entry)  # type: ignore[return-value]


@router.get("", response_model=list[VaultDocumentOut])
def list_documents(
    profile_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[VaultDocumentOut]:
    return list_profile_documents(_owned_profile(db, account, profile_id))


def _owned_document(
    db: Session, account: Account, entry_id: int
) -> tuple[TimelineEntry, VaultDocumentOut]:
    entry = db.get(TimelineEntry, entry_id)
    if not entry or entry.profile.account_id != account.id:
        raise HTTPException(status_code=404, detail="document_not_found")
    document = _entry_document(entry)
    if not document:
        raise HTTPException(status_code=404, detail="document_not_found")
    return entry, document


@router.get("/{entry_id}/file")
def get_document_file(
    entry_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> FileResponse:
    entry, document = _owned_document(db, account, entry_id)
    payload = entry.payload or {}
    stored_ref = payload.get("stored_ref") or payload.get("image_ref")
    path = resolve_upload_ref(str(stored_ref or ""))
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="document_file_not_found")
    return FileResponse(
        path,
        media_type=document.content_type,
        filename=document.original_filename,
        content_disposition_type="inline",
    )


@router.delete("/{entry_id}", status_code=204, response_class=Response)
def delete_document(
    entry_id: int,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> Response:
    entry, document = _owned_document(db, account, entry_id)
    if not document.deletable:
        raise HTTPException(status_code=409, detail="delete_from_source_record")
    stored_ref = str((entry.payload or {}).get("stored_ref") or "")
    db.delete(entry)
    db.commit()
    delete_upload_ref(stored_ref)
    return Response(status_code=204)
