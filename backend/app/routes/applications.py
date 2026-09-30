import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database.mongodb import get_database
from app.core.security import get_current_user, require_applicant, require_officer_or_admin
from app.schemas.application import (
    ApplicationCreate,
    ApplicationDraftSave,
    ApplicationUpdate,
    ApplicationResponse,
    ApplicantTrackingResponse,
    ApplicationStatus,
    ALLOWED_STATUS_TRANSITIONS
)
from app.services.application_service import (
    generate_application_id,
    generate_application_id_async,
    get_or_create_applicant_id
)

class ApplicationStatusUpdatePayload(BaseModel):
    status: ApplicationStatus
    remarks: Optional[str] = None
    officer_name: Optional[str] = None
    category: Optional[str] = None
    required_correction: Optional[str] = None


router = APIRouter(prefix="/applications", tags=["Applications"])

@router.post("/draft", response_model=ApplicationResponse)
async def save_application_draft(
    draft_in: ApplicationDraftSave,
    current_user: dict = Depends(require_applicant),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Save or update a partial scholarship application draft.
    Does not enforce mandatory field presence for incomplete stages.
    Enforces user isolation: drafts belong strictly to the authenticated applicant.
    Maintains permanent applicant_id and prevents duplicate drafts if application already submitted.
    """
    user_id = current_user["_id"]
    now = datetime.now(timezone.utc)

    # Check if user already submitted an active application for this scheme
    existing_active = await db["applications"].find_one({
        "user_id": user_id,
        "scheme_id": draft_in.scheme_id,
        "status": {"$nin": [ApplicationStatus.REJECTED.value, ApplicationStatus.DRAFT.value]}
    })
    if existing_active:
        existing_app_id = existing_active.get("application_id") or existing_active.get("_id")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "DUPLICATE_APPLICATION",
                "message": "You already have an application for this scheme.",
                "application_id": existing_app_id,
                "status": existing_active.get("status"),
                "scheme_id": draft_in.scheme_id
            }
        )

    # Resolve permanent applicant_id
    applicant_id = await get_or_create_applicant_id(db, user_id, preferred_id=draft_in.applicant_id)

    # 1. Check if application_id is provided or if an active DRAFT exists for this scheme
    existing_draft = None
    if draft_in.application_id:
        existing_draft = await db["applications"].find_one({
            "_id": draft_in.application_id,
            "user_id": user_id
        })
    else:
        existing_draft = await db["applications"].find_one({
            "user_id": user_id,
            "scheme_id": draft_in.scheme_id,
            "status": ApplicationStatus.DRAFT.value
        })

    personal_dict = draft_in.personal_details.model_dump() if draft_in.personal_details else {}
    academic_dict = draft_in.academic_details.model_dump() if draft_in.academic_details else {}
    financial_dict = draft_in.financial_details.model_dump() if draft_in.financial_details else {}
    docs_list = [d.model_dump() for d in (draft_in.documents or [])]

    if existing_draft:
        app_id = existing_draft["_id"]
        # Merge existing fields with new draft fields, updating any provided values
        merged_personal = {**existing_draft.get("personal_details", {}), **{k: v for k, v in personal_dict.items() if v is not None and v != ""}}
        merged_academic = {**existing_draft.get("academic_details", {}), **{k: v for k, v in academic_dict.items() if v is not None and v != ""}}
        merged_financial = {**existing_draft.get("financial_details", {}), **{k: v for k, v in financial_dict.items() if v is not None and v != ""}}

        update_fields = {
            "applicant_id": applicant_id,
            "current_step": draft_in.current_step,
            "personal_details": merged_personal,
            "academic_details": merged_academic,
            "financial_details": merged_financial,
            "updated_at": now
        }
        if docs_list:
            update_fields["documents"] = docs_list

        await db["applications"].update_one({"_id": app_id}, {"$set": update_fields})
        updated = await db["applications"].find_one({"_id": app_id})
        return ApplicationResponse(**updated)
    else:
        # Lookup scheme code for authentic ID generation
        scheme = await db["schemes"].find_one({"$or": [{"id": draft_in.scheme_id}, {"code": draft_in.scheme_id}]})
        scheme_code = scheme.get("code", "MOTA-ST-01") if scheme else "MOTA-ST-01"
        scheme_name = scheme.get("name", "MoTA Scholarship") if scheme else "MoTA Scholarship"

        app_id = await generate_application_id_async(db, scheme_code)
        app_doc = {
            "_id": app_id,
            "application_id": app_id,
            "applicant_id": applicant_id,
            "user_id": user_id,
            "scheme_id": draft_in.scheme_id,
            "scheme_name": scheme_name,
            "status": ApplicationStatus.DRAFT.value,
            "current_step": draft_in.current_step,
            "personal_details": personal_dict,
            "academic_details": academic_dict,
            "financial_details": financial_dict,
            "documents": docs_list,
            "has_deficiency": False,
            "deficiency_notes": None,
            "officer_remarks": None,
            "created_at": now,
            "updated_at": now
        }
        await db["applications"].insert_one(app_doc)

        audit_entry = {
            "_id": f"AUD-{int(now.timestamp() * 1000)}",
            "id": f"AUD-{int(now.timestamp() * 1000)}",
            "timestamp": now,
            "actor": current_user.get("name") or current_user.get("email") or "Citizen Applicant",
            "role": current_user.get("role", "APPLICANT"),
            "action": "Application Draft Saved",
            "applicationId": app_id,
            "schemeCode": draft_in.scheme_id,
            "previousStatus": "DRAFT",
            "newStatus": "DRAFT",
            "reason": f"Draft saved at Step {draft_in.current_step} for {scheme_name}",
            "remarks": f"Draft saved at step {draft_in.current_step}",
            "ipAddress": "10.14.88.22 (MoTA Portal Gateway)"
        }
        await db["audit_logs"].insert_one(audit_entry)

        return ApplicationResponse(**app_doc)

@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_application(
    app_in: ApplicationCreate,
    current_user: dict = Depends(require_applicant),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Submit a new scholarship/fellowship application.
    Enforces server-side ownership: user_id is taken strictly from current_user['_id'].
    Guarantees:
    - ONE permanent Applicant ID per citizen across all applications
    - Unique Application ID per submission (e.g. APP-2026-000001)
    - Historical application snapshot preservation
    - Accidental duplicate application prevention for the SAME scheme
    - Multi-scheme applications permitted
    """
    user_id = current_user["_id"]
    now = datetime.now(timezone.utc)

    # 1. DUPLICATE APPLICATION CHECK:
    # Check if applicant already has an active (submitted/under review/approved/deficient) application for this scheme
    scheme_variants = [app_in.scheme_id]
    if app_in.scheme_id.upper() == "NFST":
        scheme_variants.extend(["national-fellowship-st", "MOTA-NF-04", "NFST"])
    elif app_in.scheme_id in ["national-fellowship-st", "MOTA-NF-04"]:
        scheme_variants.extend(["NFST", "nfst"])
    elif app_in.scheme_id.upper() == "NOS":
        scheme_variants.extend(["national-overseas-scholarship-st", "MOTA-NOS-05", "NOS"])
    elif app_in.scheme_id in ["national-overseas-scholarship-st", "MOTA-NOS-05"]:
        scheme_variants.extend(["NOS", "nos"])

    existing_active = await db["applications"].find_one({
        "user_id": user_id,
        "scheme_id": {"$in": scheme_variants},
        "status": {"$nin": [ApplicationStatus.REJECTED.value, ApplicationStatus.DRAFT.value]}
    })
    if existing_active:
        existing_app_id = existing_active.get("application_id") or existing_active.get("_id")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "DUPLICATE_APPLICATION",
                "message": "You already have an application for this scheme.",
                "application_id": existing_app_id,
                "status": existing_active.get("status"),
                "scheme_id": app_in.scheme_id
            }
        )

    # 2. Get or create permanent Applicant ID (never regenerated)
    applicant_id = await get_or_create_applicant_id(db, user_id, preferred_id=app_in.applicant_id)

    # 3. Build snapshot of applicant details at submission time to protect historical records
    profile = await db["applicant_profiles"].find_one({"user_id": user_id}) or {}
    personal_dict = app_in.personal_details.model_dump()
    address_val = (
        personal_dict.get("address")
        or profile.get("address_line")
        or (f"{personal_dict.get('district', '')}, {personal_dict.get('state', '')}" if personal_dict.get("district") else "Address not provided")
    )
    applicant_snapshot = {
        "applicant_id": applicant_id,
        "user_id": user_id,
        "name": personal_dict.get("full_name") or profile.get("full_name", ""),
        "phone": personal_dict.get("mobile") or profile.get("phone", ""),
        "email": personal_dict.get("email") or profile.get("email", current_user.get("email", "")),
        "dob": personal_dict.get("dob") or profile.get("dob", ""),
        "gender": personal_dict.get("gender") or profile.get("gender", "FEMALE"),
        "father_or_husband_name": personal_dict.get("father_or_husband_name") or profile.get("father_or_husband_name", ""),
        "category": personal_dict.get("category") or profile.get("category", "ST"),
        "tribe_community": personal_dict.get("tribe_community") or profile.get("tribe_community", ""),
        "aadhaar_masked": personal_dict.get("aadhaar_masked") or profile.get("aadhaar_masked", "XXXX-XXXX-XXXX"),
        "address": address_val,
        "address_line": personal_dict.get("address_line") or profile.get("address_line", address_val),
        "district": personal_dict.get("district") or profile.get("district", ""),
        "state": personal_dict.get("state") or profile.get("state", ""),
        "pincode": personal_dict.get("pincode") or profile.get("pincode", ""),
        "submitted_at": now.isoformat()
    }

    # Check if an existing draft exists for this applicant and scheme
    existing_draft = await db["applications"].find_one({
        "user_id": user_id,
        "scheme_id": {"$in": scheme_variants},
        "status": ApplicationStatus.DRAFT.value
    })

    if existing_draft:
        app_id = existing_draft["_id"]
        update_fields = {
            "applicant_id": applicant_id,
            "applicant_snapshot": applicant_snapshot,
            "status": app_in.status.value,
            "personal_details": personal_dict,
            "academic_details": app_in.academic_details.model_dump(),
            "financial_details": app_in.financial_details.model_dump(),
            "has_deficiency": False,
            "deficiency_notes": None,
            "officer_remarks": None,
            "updated_at": now
        }
        if app_in.documents:
            update_fields["documents"] = [d.model_dump() for d in app_in.documents]

        await db["applications"].update_one({"_id": app_id}, {"$set": update_fields})
        app_doc = await db["applications"].find_one({"_id": app_id})
    else:
        # Lookup scheme code for authentic ID generation
        scheme = await db["schemes"].find_one({"$or": [{"id": app_in.scheme_id}, {"code": app_in.scheme_id}]})
        SCHEME_ALIASES = {
            "NFST": "National Fellowship for ST Students (NFST)",
            "NOS": "National Overseas Scholarship (NOS)",
            "PMS": "Pre-Matric Scholarship for ST Students",
            "POST": "Post-Matric Scholarship for ST Students"
        }
        scheme_code = scheme.get("code", app_in.scheme_id) if scheme else app_in.scheme_id
        scheme_name = scheme.get("name") if scheme else SCHEME_ALIASES.get(app_in.scheme_id.upper(), app_in.scheme_id)

        app_id = await generate_application_id_async(db, scheme_code)

        app_doc = {
            "_id": app_id,
            "application_id": app_id,
            "applicant_id": applicant_id,
            "user_id": user_id,
            "applicant_snapshot": applicant_snapshot,
            "scheme_id": app_in.scheme_id,
            "scheme_name": scheme_name,
            "status": app_in.status.value,
            "personal_details": personal_dict,
            "academic_details": app_in.academic_details.model_dump(),
            "financial_details": app_in.financial_details.model_dump(),
            "documents": [d.model_dump() for d in (app_in.documents or [])],
            "has_deficiency": False,
            "deficiency_notes": None,
            "officer_remarks": None,
            "created_at": now,
            "updated_at": now
        }
        await db["applications"].insert_one(app_doc)

    scheme_name = app_doc.get("scheme_name") or "MoTA Scholarship"

    # Record application submission in audit_logs
    audit_entry = {
        "_id": f"AUD-{int(now.timestamp() * 1000)}",
        "id": f"AUD-{int(now.timestamp() * 1000)}",
        "timestamp": now,
        "actor": current_user.get("name") or current_user.get("email") or "Citizen Applicant",
        "role": current_user.get("role", "APPLICANT"),
        "actor_id": user_id,
        "actorId": user_id,
        "action": f"Application Submitted",
        "applicationId": app_id,
        "application_id": app_id,
        "applicantId": applicant_id,
        "applicant_id": applicant_id,
        "schemeCode": app_in.scheme_id,
        "scheme_id": app_in.scheme_id,
        "previousStatus": "DRAFT",
        "previous_status": "DRAFT",
        "newStatus": app_in.status.value,
        "new_status": app_in.status.value,
        "reason": f"New scholarship application lodged for {scheme_name} (Applicant ID: {applicant_id})",
        "remarks": f"Applied for {scheme_name}",
        "ipAddress": "10.14.88.22 (MoTA Portal Gateway)"
    }
    await db["audit_logs"].insert_one(audit_entry)

    # Insert application-specific citizen notification
    notification_doc = {
        "_id": f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
        "user_id": user_id,
        "applicant_id": applicant_id,
        "application_id": app_id,
        "scheme_id": app_in.scheme_id,
        "scheme_name": scheme_name,
        "status": app_in.status.value,
        "title": f"Application {app_id} Submitted",
        "message": f"Your application {app_id} for {scheme_name} has been submitted successfully.",
        "is_read": False,
        "created_at": now
    }
    await db["notifications"].insert_one(notification_doc)

    return ApplicationResponse(**app_doc)

@router.get("/my", response_model=List[ApplicationResponse])
async def get_my_applications(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve all applications submitted strictly by the currently authenticated citizen.
    Query is scoped to current_user['_id'].
    Each application includes its own independent status, scheme, and audit trail.
    """
    user_id = current_user["_id"]
    cursor = db["applications"].find({"user_id": user_id}).sort("created_at", -1)
    results = await cursor.to_list(length=100)

    # Ensure all applications reference the applicant's permanent applicant_id
    cached_applicant_id = None
    if any(not r.get("applicant_id") for r in results):
        cached_applicant_id = await get_or_create_applicant_id(db, user_id)

    from app.services.storage_service import storage_service
    for r in results:
        if not r.get("applicant_id") and cached_applicant_id:
            r["applicant_id"] = cached_applicant_id
        safe_app_id = (r.get("application_id") or r.get("_id", "")).replace("/", "_").replace("\\", "_")
        for d in r.get("documents", []):
            s_key = d.get("storage_key") or f"{safe_app_id}/{d.get('id')}_{d.get('file_name', 'document.pdf')}"
            d["file_exists"] = storage_service.file_exists(s_key)

        app_ident = r.get("application_id") or r.get("_id")
        audit_cursor = db["audit_logs"].find({"$or": [{"applicationId": app_ident}, {"application_id": app_ident}]}).sort("timestamp", 1)
        raw_logs = await audit_cursor.to_list(length=50)
        r["audit_trail"] = [
            {
                "id": log.get("id") or str(log.get("_id")),
                "timestamp": log.get("timestamp").isoformat() if isinstance(log.get("timestamp"), datetime) else str(log.get("timestamp", "")),
                "actor": log.get("actor", "Authorized Authority"),
                "role": log.get("role", "OFFICER"),
                "action": log.get("action", "Status Updated"),
                "applicationId": log.get("applicationId") or log.get("application_id", app_ident),
                "schemeCode": log.get("schemeCode") or log.get("scheme_id"),
                "previousStatus": log.get("previousStatus") or log.get("previous_status"),
                "newStatus": log.get("newStatus") or log.get("new_status"),
                "reason": log.get("reason", ""),
                "remarks": log.get("remarks", "")
            }
            for log in raw_logs
        ]

    return [ApplicationResponse(**r) for r in results]

@router.get("/tracking", response_model=ApplicantTrackingResponse)
async def get_applicant_tracking(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Dedicated applicant tracking API returning all applications belonging to the authenticated citizen.
    Guarantees that each application object carries its own completely independent workflow status,
    scheme name, and audit timeline.
    """
    user_id = current_user["_id"]
    cursor = db["applications"].find({"user_id": user_id}).sort("created_at", -1)
    results = await cursor.to_list(length=100)

    applicant_id = await get_or_create_applicant_id(db, user_id)

    from app.services.storage_service import storage_service
    formatted_apps = []
    for r in results:
        r["applicant_id"] = r.get("applicant_id") or applicant_id
        safe_app_id = (r.get("application_id") or r.get("_id", "")).replace("/", "_").replace("\\", "_")
        for d in r.get("documents", []):
            s_key = d.get("storage_key") or f"{safe_app_id}/{d.get('id')}_{d.get('file_name', 'document.pdf')}"
            d["file_exists"] = storage_service.file_exists(s_key)

        app_ident = r.get("application_id") or r.get("_id")
        audit_cursor = db["audit_logs"].find({"$or": [{"applicationId": app_ident}, {"application_id": app_ident}]}).sort("timestamp", 1)
        raw_logs = await audit_cursor.to_list(length=50)
        r["audit_trail"] = [
            {
                "id": log.get("id") or str(log.get("_id")),
                "timestamp": log.get("timestamp").isoformat() if isinstance(log.get("timestamp"), datetime) else str(log.get("timestamp", "")),
                "actor": log.get("actor", "Authorized Authority"),
                "role": log.get("role", "OFFICER"),
                "action": log.get("action", "Status Updated"),
                "applicationId": log.get("applicationId") or log.get("application_id", app_ident),
                "schemeCode": log.get("schemeCode") or log.get("scheme_id"),
                "previousStatus": log.get("previousStatus") or log.get("previous_status"),
                "newStatus": log.get("newStatus") or log.get("new_status"),
                "reason": log.get("reason", ""),
                "remarks": log.get("remarks", "")
            }
            for log in raw_logs
        ]
        formatted_apps.append(ApplicationResponse(**r))

    return ApplicantTrackingResponse(
        applicant_id=applicant_id,
        applications=formatted_apps
    )

@router.get("/notifications")
async def get_applicant_notifications(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve application-specific notifications for the authenticated citizen.
    Includes application_id, scheme_name, and independent status message.
    """
    user_id = current_user["_id"]
    cursor = db["notifications"].find({"user_id": user_id}).sort("created_at", -1)
    results = await cursor.to_list(length=50)
    for r in results:
        r["id"] = r.get("_id")
    return results

@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Mark an application-specific notification as read.
    """
    user_id = current_user["_id"]
    await db["notifications"].update_one(
        {"_id": notification_id, "user_id": user_id},
        {"$set": {"is_read": True, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"status": "success", "id": notification_id}

@router.patch("/{application_id:path}/status", response_model=ApplicationResponse)
@router.put("/{application_id:path}/status", response_model=ApplicationResponse)
async def update_application_status_direct(
    application_id: str,
    payload: ApplicationStatusUpdatePayload,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Update status of an exact application targeted strictly by application_id.
    Never updates any other application belonging to the same applicant.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    existing = await db["applications"].find_one({"$or": [{"_id": application_id}, {"application_id": application_id}]})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' does not exist."
        )

    # Verification of ownership and role
    if user_role == "APPLICANT":
        if existing.get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: You cannot modify an application submitted by another citizen."
            )
        if payload.status not in [ApplicationStatus.RESUBMITTED, ApplicationStatus.SUBMITTED]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Applicants cannot transition status directly to '{payload.status.value}'."
            )

    now = datetime.now(timezone.utc)
    prev_status_str = existing.get("status")
    try:
        prev_status = ApplicationStatus(prev_status_str)
    except ValueError:
        prev_status = None

    if prev_status and payload.status != prev_status:
        allowed_targets = ALLOWED_STATUS_TRANSITIONS.get(prev_status, [])
        if payload.status not in allowed_targets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition from '{prev_status_str}' to '{payload.status.value}'. Allowed transitions: {[s.value for s in allowed_targets]}"
            )

    has_deficiency = payload.status == ApplicationStatus.DEFICIENT
    is_rejected = payload.status == ApplicationStatus.REJECTED
    actor_name = payload.officer_name or current_user.get("name") or current_user.get("email") or "Authorized User"

    update_fields = {
        "status": payload.status.value,
        "has_deficiency": has_deficiency,
        "updated_at": now
    }
    if is_rejected:
        update_fields["rejection_reason"] = payload.remarks or "Application does not satisfy statutory scheme criteria."
    if payload.remarks:
        update_fields["officer_remarks"] = payload.remarks
        if has_deficiency:
            update_fields["deficiency_notes"] = payload.remarks
            update_fields["deficiency_reason"] = payload.remarks
    elif not has_deficiency:
        update_fields["deficiency_notes"] = None
        update_fields["deficiency_reason"] = None

    if has_deficiency:
        if payload.category:
            update_fields["deficiency_category"] = payload.category
        if payload.required_correction:
            update_fields["deficiency_required_correction"] = payload.required_correction

    # UPDATE ONLY THIS EXACT APPLICATION IN tsfms.applications
    await db["applications"].update_one({"_id": existing["_id"]}, {"$set": update_fields})

    target_app_id = existing.get("application_id") or existing.get("_id")
    target_applicant_id = existing.get("applicant_id")
    scheme_label = existing.get("scheme_name") or existing.get("scheme_id")

    # Record in audit_logs
    audit_entry = {
        "_id": f"AUD-{int(now.timestamp() * 1000)}",
        "id": f"AUD-{int(now.timestamp() * 1000)}",
        "timestamp": now,
        "actor": actor_name,
        "role": user_role or "OFFICER",
        "actor_id": user_id,
        "actorId": user_id,
        "action": f"APPLICATION_STATUS_CHANGED to {payload.status.value}",
        "applicationId": target_app_id,
        "application_id": target_app_id,
        "applicantId": target_applicant_id,
        "applicant_id": target_applicant_id,
        "schemeCode": existing.get("scheme_id"),
        "scheme_id": existing.get("scheme_id"),
        "previousStatus": prev_status_str,
        "previous_status": prev_status_str,
        "newStatus": payload.status.value,
        "new_status": payload.status.value,
        "reason": payload.remarks or f"Status changed to {payload.status.value}",
        "remarks": payload.remarks or "",
        "ipAddress": "10.14.88.22 (MoTA NIC Gateway)"
    }
    await db["audit_logs"].insert_one(audit_entry)

    # Insert application-specific citizen notification
    status_label = payload.status.value.lower().replace("_", " ")
    notif_msg = f"Your application {target_app_id} for {scheme_label} has been {status_label}."
    notification_doc = {
        "_id": f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
        "user_id": existing.get("user_id"),
        "applicant_id": target_applicant_id,
        "application_id": target_app_id,
        "scheme_id": existing.get("scheme_id"),
        "scheme_name": scheme_label,
        "status": payload.status.value,
        "title": f"Application {target_app_id} Status: {payload.status.value}",
        "message": notif_msg,
        "is_read": False,
        "created_at": now
    }
    await db["notifications"].insert_one(notification_doc)

    updated_doc = await db["applications"].find_one({"_id": existing["_id"]})
    return ApplicationResponse(**updated_doc)

@router.get("/{application_id:path}", response_model=ApplicationResponse)
async def get_application_by_id(
    application_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve specific application dossier by application ID.
    Enforces authorization check: Applicants can ONLY access their own application.
    Officers and Admins may access applications for review.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    app_doc = await db["applications"].find_one({"$or": [{"_id": application_id}, {"application_id": application_id}]})
    if not app_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' does not exist."
        )

    # Citizen can only view their own applications; Officers and Admins can view for review
    if user_role == "APPLICANT" and app_doc.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You do not have permission to view this application dossier."
        )

    from app.services.storage_service import storage_service
    safe_app_id = (app_doc.get("application_id") or app_doc.get("_id", "")).replace("/", "_").replace("\\", "_")
    for d in app_doc.get("documents", []):
        s_key = d.get("storage_key") or f"{safe_app_id}/{d.get('id')}_{d.get('file_name', 'document.pdf')}"
        d["file_exists"] = storage_service.file_exists(s_key)

    app_ident = app_doc.get("application_id") or app_doc.get("_id")
    audit_cursor = db["audit_logs"].find({"$or": [{"applicationId": app_ident}, {"application_id": app_ident}]}).sort("timestamp", 1)
    raw_logs = await audit_cursor.to_list(length=50)
    app_doc["audit_trail"] = [
        {
            "id": log.get("id") or str(log.get("_id")),
            "timestamp": log.get("timestamp").isoformat() if isinstance(log.get("timestamp"), datetime) else str(log.get("timestamp", "")),
            "actor": log.get("actor", "Authorized Authority"),
            "role": log.get("role", "OFFICER"),
            "action": log.get("action", "Status Updated"),
            "applicationId": log.get("applicationId") or log.get("application_id", app_ident),
            "schemeCode": log.get("schemeCode") or log.get("scheme_id"),
            "previousStatus": log.get("previousStatus") or log.get("previous_status"),
            "newStatus": log.get("newStatus") or log.get("new_status"),
            "reason": log.get("reason", ""),
            "remarks": log.get("remarks", "")
        }
        for log in raw_logs
    ]

    return ApplicationResponse(**app_doc)

@router.put("/{application_id:path}", response_model=ApplicationResponse)
async def update_application(
    application_id: str,
    app_update: ApplicationUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Update application details, replace documents, or rectify deficiencies.
    Applicants can ONLY modify their own applications.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    existing_app = await db["applications"].find_one({"$or": [{"_id": application_id}, {"application_id": application_id}]})
    if not existing_app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' does not exist."
        )

    if user_role == "APPLICANT" and existing_app.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You cannot modify an application submitted by another user."
        )

    now = datetime.now(timezone.utc)
    update_fields = {"updated_at": now}

    if app_update.current_step is not None:
        update_fields["current_step"] = app_update.current_step

    if app_update.personal_details:
        update_fields["personal_details"] = app_update.personal_details.model_dump()
    if app_update.academic_details:
        update_fields["academic_details"] = app_update.academic_details.model_dump()
    if app_update.financial_details:
        update_fields["financial_details"] = app_update.financial_details.model_dump()
    if app_update.documents is not None:
        update_fields["documents"] = [d.model_dump() for d in app_update.documents]
    if app_update.status:
        prev_status_str = existing_app.get("status")
        try:
            prev_status = ApplicationStatus(prev_status_str)
        except ValueError:
            prev_status = None

        if prev_status and app_update.status != prev_status:
            allowed_targets = ALLOWED_STATUS_TRANSITIONS.get(prev_status, [])
            if app_update.status not in allowed_targets:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status transition from '{prev_status_str}' to '{app_update.status.value}'. Allowed transitions: {[s.value for s in allowed_targets]}"
                )

        update_fields["status"] = app_update.status.value
        if app_update.status in [ApplicationStatus.SUBMITTED, ApplicationStatus.RESUBMITTED]:
            update_fields["has_deficiency"] = False
            update_fields["deficiency_notes"] = None

        target_app_id = existing_app.get("application_id") or existing_app.get("_id")
        target_applicant_id = existing_app.get("applicant_id")
        scheme_label = existing_app.get("scheme_name") or existing_app.get("scheme_id")

        # Record in audit_logs
        actor_name = current_user.get("name") or current_user.get("email") or "Citizen Applicant"
        audit_entry = {
            "_id": f"AUD-{int(now.timestamp() * 1000)}",
            "id": f"AUD-{int(now.timestamp() * 1000)}",
            "timestamp": now,
            "actor": actor_name,
            "role": user_role or "APPLICANT",
            "actor_id": user_id,
            "actorId": user_id,
            "action": f"Application Status Changed to {app_update.status.value}",
            "applicationId": target_app_id,
            "application_id": target_app_id,
            "applicantId": target_applicant_id,
            "applicant_id": target_applicant_id,
            "schemeCode": existing_app.get("scheme_id"),
            "scheme_id": existing_app.get("scheme_id"),
            "previousStatus": prev_status_str,
            "previous_status": prev_status_str,
            "newStatus": app_update.status.value,
            "new_status": app_update.status.value,
            "reason": "Application update / resubmission by citizen",
            "remarks": "Status updated by applicant",
            "ipAddress": "10.14.88.22 (MoTA Portal Gateway)"
        }
        await db["audit_logs"].insert_one(audit_entry)

        # Record application-specific notification
        status_label = app_update.status.value.lower().replace("_", " ")
        notif_msg = f"Your application {target_app_id} for {scheme_label} has been {status_label}."
        notification_doc = {
            "_id": f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
            "user_id": existing_app.get("user_id"),
            "applicant_id": target_applicant_id,
            "application_id": target_app_id,
            "scheme_id": existing_app.get("scheme_id"),
            "scheme_name": scheme_label,
            "status": app_update.status.value,
            "title": f"Application {target_app_id} Status: {app_update.status.value}",
            "message": notif_msg,
            "is_read": False,
            "created_at": now
        }
        await db["notifications"].insert_one(notification_doc)

    await db["applications"].update_one({"_id": existing_app["_id"]}, {"$set": update_fields})
    updated_doc = await db["applications"].find_one({"_id": existing_app["_id"]})

    return ApplicationResponse(**updated_doc)

class ValidateApplicationDossierRequest(BaseModel):
    scheme_id: str
    personal_details: dict = {}
    academic_details: Optional[dict] = None
    financial_details: Optional[dict] = None
    bank_details: Optional[dict] = None
    documents: Optional[List[dict]] = None

@router.post("/validate")
async def validate_application_endpoint(
    req: ValidateApplicationDossierRequest,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Validate complete application dossier against scheme-specific requirements.
    Returns 5-point explainable validation results for all field and document mistakes.
    """
    from app.services.explainable_validator import validate_application_dossier
    from app.database.seed_data import INITIAL_SCHEMES_SEED

    scheme = await db["schemes"].find_one({
        "$or": [{"id": req.scheme_id}, {"code": req.scheme_id}]
    })
    if not scheme:
        for s in INITIAL_SCHEMES_SEED:
            if s["id"] == req.scheme_id or s["code"] == req.scheme_id:
                scheme = s
                break

    req_docs = scheme.get("required_documents", []) if scheme else []

    result = validate_application_dossier(
        scheme_required_documents=req_docs,
        personal_details=req.personal_details,
        academic_details=req.academic_details,
        financial_details=req.financial_details,
        bank_details=req.bank_details,
        uploaded_documents=req.documents
    )
    return result


