import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.database.mongodb import get_database
from app.core.security import require_officer_or_admin
from app.schemas.application import ApplicationResponse, ApplicationStatus, ALLOWED_STATUS_TRANSITIONS
from app.schemas.grievance import GrievanceResponse, GrievanceStatus
from app.services.storage_service import storage_service

router = APIRouter(prefix="/admin", tags=["Admin & Analytics"])

class AdminDashboardStats(BaseModel):
    totalApplications: int = 0
    submitted: int = 0
    pendingDocumentVerification: int = 0
    pendingEligibilityVerification: int = 0
    underScrutiny: int = 0
    deficient: int = 0
    resubmitted: int = 0
    approved: int = 0
    rejected: int = 0
    # Backward compatibility fields
    underVerification: int = 0
    eligible: int = 0
    selected: int = 0

class SchemeStatItem(BaseModel):
    name: str
    code: str
    applications: int = 0
    sanctioned: int = 0

class StatusUpdatePayload(BaseModel):
    status: ApplicationStatus
    remarks: Optional[str] = None
    officer_name: Optional[str] = None
    category: Optional[str] = None
    required_correction: Optional[str] = None

class SystemAuditLogItem(BaseModel):
    id: str
    timestamp: datetime
    actor: str
    role: str
    action: str
    applicationId: Optional[str] = None
    schemeCode: Optional[str] = None
    previousStatus: Optional[str] = None
    newStatus: Optional[str] = None
    reason: Optional[str] = None
    remarks: Optional[str] = None
    ipAddress: Optional[str] = None

@router.get("/dashboard/stats", response_model=AdminDashboardStats)
async def get_admin_dashboard_stats(
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Calculate real-time operational statistics directly from MongoDB.
    Restricted to authorized Officer and Admin roles.
    """
    total = await db["applications"].count_documents({})
    submitted = await db["applications"].count_documents({"status": "SUBMITTED"})
    pending_doc = await db["applications"].count_documents({"status": "DOCUMENT_VERIFICATION"})
    pending_elig = await db["applications"].count_documents({"status": "ELIGIBILITY_VERIFICATION"})
    under_scrutiny = await db["applications"].count_documents({"status": "SCRUTINY"})
    deficient = await db["applications"].count_documents({
        "$or": [{"has_deficiency": True}, {"status": "DEFICIENT"}, {"status": "DEFICIENCY_NOTIFIED"}]
    })
    resubmitted = await db["applications"].count_documents({"status": "RESUBMITTED"})
    selected = await db["applications"].count_documents({"status": "SELECTION"})
    approved = await db["applications"].count_documents({"status": {"$in": ["APPROVED", "SANCTIONED", "DISBURSED_DBT"]}})
    rejected = await db["applications"].count_documents({"status": "REJECTED"})

    return AdminDashboardStats(
        totalApplications=total,
        submitted=submitted,
        pendingDocumentVerification=pending_doc,
        pendingEligibilityVerification=pending_elig,
        underScrutiny=under_scrutiny,
        deficient=deficient,
        resubmitted=resubmitted,
        approved=approved,
        rejected=rejected,
        underVerification=pending_doc + pending_elig + under_scrutiny,
        eligible=under_scrutiny + selected,
        selected=selected
    )

@router.get("/dashboard/scheme-statistics", response_model=List[SchemeStatItem])
async def get_scheme_statistics(
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Calculate distribution of applications and sanctions by scheme from MongoDB.
    Restricted to authorized Officer and Admin roles.
    """
    schemes_cursor = db["schemes"].find({})
    schemes = await schemes_cursor.to_list(length=100)

    stats: List[SchemeStatItem] = []
    for s in schemes:
        code = s.get("code")
        name = s.get("short_name") or s.get("name")
        count = await db["applications"].count_documents({
            "$or": [{"scheme_id": s.get("id")}, {"scheme_id": code}]
        })
        sanctioned = await db["applications"].count_documents({
            "$and": [
                {"$or": [{"scheme_id": s.get("id")}, {"scheme_id": code}]},
                {"status": {"$in": ["APPROVED", "SANCTIONED", "DISBURSED_DBT"]}}
            ]
        })
        stats.append(SchemeStatItem(
            name=name,
            code=code,
            applications=count,
            sanctioned=sanctioned
        ))

    return stats

@router.get("/applications", response_model=List[ApplicationResponse])
async def get_all_applications(
    status_filter: Optional[str] = None,
    scheme_filter: Optional[str] = None,
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    List all applications for administrative scrutiny, review boards, and selection queues.
    Protected strictly for Officer and Admin roles.
    """
    query: Dict[str, Any] = {}
    if status_filter:
        query["status"] = status_filter
    if scheme_filter:
        query["scheme_id"] = scheme_filter

    cursor = db["applications"].find(query).sort("created_at", -1)
    results = await cursor.to_list(length=500)
    for r in results:
        app_id = r.get("_id", "")
        safe_app_id = app_id.replace("/", "_").replace("\\", "_")
        for d in r.get("documents", []):
            s_key = d.get("storage_key") or f"{safe_app_id}/{d.get('id')}_{d.get('file_name', 'document.pdf')}"
            d["file_exists"] = storage_service.file_exists(s_key)
    return [ApplicationResponse(**r) for r in results]

@router.put("/applications/{application_id:path}/status", response_model=ApplicationResponse)
@router.patch("/applications/{application_id:path}/status", response_model=ApplicationResponse)
async def update_application_status_officer(
    application_id: str,
    payload: StatusUpdatePayload,
    user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Officer/Admin status transition for an application. Records audit log entry in MongoDB.
    Enforces that only Officer and Admin roles can transition application statuses.
    Updates tsfms.applications for ONLY this specific application_id.
    """
    existing = await db["applications"].find_one({"$or": [{"_id": application_id}, {"application_id": application_id}]})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' does not exist."
        )

    now = datetime.now(timezone.utc)
    prev_status_str = existing.get("status")
    try:
        prev_status = ApplicationStatus(prev_status_str)
    except ValueError:
        prev_status = None

    # Validate transition against canonical state workflow
    if prev_status and payload.status != prev_status:
        allowed_targets = ALLOWED_STATUS_TRANSITIONS.get(prev_status, [])
        if payload.status not in allowed_targets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition from '{prev_status_str}' to '{payload.status.value}'. Allowed transitions: {[s.value for s in allowed_targets]}"
            )

    has_deficiency = payload.status == ApplicationStatus.DEFICIENT
    is_rejected = payload.status == ApplicationStatus.REJECTED
    officer = payload.officer_name or user.get("name") or user.get("email") or "Authorized MoTA Officer"

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

    # Target ONLY the exact document matching existing['_id']
    await db["applications"].update_one({"_id": existing["_id"]}, {"$set": update_fields})

    # Determine canonical audit action matching lifecycle requirements
    if payload.status == ApplicationStatus.APPROVED:
        action_name = "APPLICATION_APPROVED"
    elif payload.status == ApplicationStatus.REJECTED:
        action_name = "APPLICATION_REJECTED"
    elif payload.status == ApplicationStatus.DEFICIENT:
        action_name = "DEFICIENCY_ISSUED"
    elif payload.status == ApplicationStatus.RESUBMITTED:
        action_name = "APPLICATION_RESUBMISSION_REVIEWED"
    elif payload.status == ApplicationStatus.DOCUMENT_VERIFICATION:
        action_name = "DOCUMENT_VERIFICATION_STARTED"
    elif payload.status == ApplicationStatus.ELIGIBILITY_VERIFICATION:
        action_name = "DOCUMENT_VERIFICATION_COMPLETED"
    elif payload.status == ApplicationStatus.SCRUTINY:
        action_name = "ELIGIBILITY_VERIFIED"
    elif payload.status == ApplicationStatus.SELECTION:
        action_name = "SCRUTINY_COMPLETED"
    else:
        action_name = f"APPLICATION_STATUS_CHANGED to {payload.status.value}"

    target_app_id = existing.get("application_id") or existing.get("_id")
    target_applicant_id = existing.get("applicant_id")
    scheme_label = existing.get("scheme_name") or existing.get("scheme_id")

    # Record in audit_logs collection
    audit_entry = {
        "_id": f"AUD-{int(now.timestamp() * 1000)}",
        "id": f"AUD-{int(now.timestamp() * 1000)}",
        "timestamp": now,
        "actor": officer,
        "role": user.get("role", "OFFICER"),
        "actor_id": user.get("_id"),
        "actorId": user.get("_id"),
        "action": action_name,
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
        "reason": payload.remarks or action_name,
        "remarks": payload.remarks or "",
        "ipAddress": "10.14.88.22 (MoTA NIC Gateway)"
    }
    await db["audit_logs"].insert_one(audit_entry)

    # Record application-specific citizen notification
    status_display = payload.status.value.lower().replace("_", " ")
    notification_doc = {
        "_id": f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
        "user_id": existing.get("user_id"),
        "applicant_id": target_applicant_id,
        "application_id": target_app_id,
        "scheme_id": existing.get("scheme_id"),
        "scheme_name": scheme_label,
        "status": payload.status.value,
        "title": f"Application {target_app_id} Status: {payload.status.value}",
        "message": f"Your application {target_app_id} for {scheme_label} has been {status_display}.",
        "is_read": False,
        "created_at": now
    }
    await db["notifications"].insert_one(notification_doc)

    updated_doc = await db["applications"].find_one({"_id": existing["_id"]})
    return ApplicationResponse(**updated_doc)

@router.get("/grievances", response_model=List[GrievanceResponse])
async def get_all_grievances(
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve all citizen grievances for the officer resolution queue.
    Restricted to Officer and Admin roles.
    """
    cursor = db["grievances"].find({}).sort("created_at", -1)
    results = await cursor.to_list(length=200)
    return [GrievanceResponse(**r) for r in results]

@router.put("/grievances/{grievance_id}", response_model=GrievanceResponse)
async def resolve_grievance_officer(
    grievance_id: str,
    status_update: Dict[str, Any],
    user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Update grievance status and resolution remarks.
    Restricted to Officer and Admin roles.
    """
    existing = await db["grievances"].find_one({"_id": grievance_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Grievance '{grievance_id}' does not exist."
        )

    now = datetime.now(timezone.utc)
    set_fields: Dict[str, Any] = {"updated_at": now}
    if "status" in status_update:
        set_fields["status"] = status_update["status"]
    if "resolution_remarks" in status_update:
        set_fields["resolution_remarks"] = status_update["resolution_remarks"]
    if "assigned_officer" in status_update:
        set_fields["assigned_officer"] = status_update["assigned_officer"]

    await db["grievances"].update_one({"_id": grievance_id}, {"$set": set_fields})
    updated = await db["grievances"].find_one({"_id": grievance_id})
    return GrievanceResponse(**updated)

@router.get("/audit-logs", response_model=List[SystemAuditLogItem])
async def get_system_audit_logs(
    limit: int = 50,
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve system audit trails recorded in MongoDB audit_logs collection.
    Restricted to Officer and Admin roles.
    """
    cursor = db["audit_logs"].find({}).sort("timestamp", -1)
    results = await cursor.to_list(length=limit)
    return [SystemAuditLogItem(**r) for r in results]

