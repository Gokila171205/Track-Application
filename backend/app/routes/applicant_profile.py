import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database.mongodb import get_database
from app.core.security import get_current_user
from app.schemas.profile import (
    ApplicantProfileCreate,
    ApplicantProfileUpdate,
    ApplicantProfileResponse,
    ReusableDocumentItem
)
from app.services.identity_validator import (
    validate_aadhaar,
    validate_phone,
    mask_aadhaar
)
from app.services.application_service import get_or_create_applicant_id

router = APIRouter(prefix="/applicant", tags=["Applicant Profile"])

async def ensure_profile_indexes(db: AsyncIOMotorDatabase):
    """
    Ensure unique indexes on applicant_profiles collection without breaking legacy data.
    """
    try:
        await db["applicant_profiles"].create_index("user_id", unique=True)
        await db["applicant_profiles"].create_index("applicant_id", unique=True, sparse=True)
        await db["applicant_profiles"].create_index("aadhaar_hash", unique=True, sparse=True)
        await db["applicant_profiles"].create_index("phone", unique=True, sparse=True)
    except Exception as e:
        pass

@router.get("/profile", response_model=ApplicantProfileResponse)
async def get_applicant_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve saved applicant profile for the currently authenticated citizen.
    Returns 404 if this is a first-time applicant who has not yet created a profile.
    Maintains permanent applicant_id across all operations.
    """
    user_id = current_user["_id"]
    profile = await db["applicant_profiles"].find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No applicant profile registered for this citizen. Please complete first-time profile creation."
        )

    # Ensure permanent applicant_id is present
    applicant_id = profile.get("applicant_id")
    if not applicant_id:
        applicant_id = await get_or_create_applicant_id(db, user_id)
        profile["applicant_id"] = applicant_id

    return ApplicantProfileResponse(
        user_id=profile["user_id"],
        applicant_id=applicant_id,
        full_name=profile["full_name"],
        father_or_husband_name=profile.get("father_or_husband_name"),
        gender=profile.get("gender", "FEMALE"),
        dob=profile["dob"],
        aadhaar_masked=profile.get("aadhaar_masked", "XXXX-XXXX-XXXX"),
        phone=profile["phone"],
        email=profile.get("email") or current_user.get("email", ""),
        category=profile.get("category", "ST"),
        tribe_community=profile["tribe_community"],
        state=profile["state"],
        district=profile["district"],
        pincode=profile["pincode"],
        address_line=profile.get("address_line"),
        created_at=profile.get("created_at", datetime.now(timezone.utc)),
        updated_at=profile.get("updated_at", datetime.now(timezone.utc))
    )

@router.post("/profile", response_model=ApplicantProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_applicant_profile(
    profile_in: ApplicantProfileCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Create a new permanent applicant profile with strict statutory validation:
    1. Validates 12-digit Aadhaar using Verhoeff checksum algorithm.
    2. Enforces cross-citizen Aadhaar uniqueness (via SHA-256 hash).
    3. Enforces phone number format (10-digit Indian mobile) and uniqueness.
    4. Automatically stores masked Aadhaar (never leaks full 12 digits in logs or responses).
    """
    await ensure_profile_indexes(db)
    user_id = current_user["_id"]
    now = datetime.now(timezone.utc)

    # 1. Check if profile already exists for this citizen
    existing_profile = await db["applicant_profiles"].find_one({"user_id": user_id})
    if existing_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An applicant profile already exists for this citizen account. Use PUT to update."
        )

    # 2. Validate Aadhaar format and Verhoeff checksum
    raw_aadhaar, masked_aadhaar, aadhaar_hash = validate_aadhaar(profile_in.aadhaar)

    # 3. Validate Phone
    valid_phone = validate_phone(profile_in.phone)

    # 4. Check Aadhaar uniqueness across all applicant accounts
    dup_aadhaar = await db["applicant_profiles"].find_one({"aadhaar_hash": aadhaar_hash})
    if dup_aadhaar:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This Aadhaar number is already registered with an applicant account."
        )

    # 5. Check Phone uniqueness across all applicant accounts
    dup_phone = await db["applicant_profiles"].find_one({"phone": valid_phone})
    if dup_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This phone number is already associated with another applicant account."
        )

    # 6. Generate or resolve permanent Applicant ID
    applicant_id = await get_or_create_applicant_id(db, user_id, preferred_id=profile_in.applicant_id)

    # 7. Construct and persist profile record
    profile_doc = {
        "_id": user_id,
        "user_id": user_id,
        "applicant_id": applicant_id,
        "full_name": profile_in.full_name,
        "father_or_husband_name": profile_in.father_or_husband_name,
        "gender": profile_in.gender,
        "dob": profile_in.dob,
        "aadhaar_masked": masked_aadhaar,
        "aadhaar_hash": aadhaar_hash,
        "phone": valid_phone,
        "email": current_user.get("email", ""),
        "category": profile_in.category,
        "tribe_community": profile_in.tribe_community,
        "state": profile_in.state,
        "district": profile_in.district,
        "pincode": profile_in.pincode,
        "address_line": profile_in.address_line,
        "created_at": now,
        "updated_at": now
    }

    await db["applicant_profiles"].insert_one(profile_doc)

    # 8. Record statutory audit trail (Notice: Never logs raw Aadhaar)
    audit_entry = {
        "id": "AUD-" + uuid.uuid4().hex[:8].upper(),
        "timestamp": now,
        "actor": profile_in.full_name,
        "role": current_user.get("role", "APPLICANT"),
        "action": "APPLICANT_PROFILE_CREATED",
        "application_id": "PROFILE",
        "remarks": f"Citizen profile created with Applicant ID {applicant_id}, verified Aadhaar {masked_aadhaar} and mobile {valid_phone}.",
        "ip_address": "127.0.0.1"
    }
    await db["audit_logs"].insert_one(audit_entry)

    return ApplicantProfileResponse(
        user_id=profile_doc["user_id"],
        applicant_id=applicant_id,
        full_name=profile_doc["full_name"],
        father_or_husband_name=profile_doc.get("father_or_husband_name"),
        gender=profile_doc.get("gender", "FEMALE"),
        dob=profile_doc["dob"],
        aadhaar_masked=profile_doc["aadhaar_masked"],
        phone=profile_doc["phone"],
        email=profile_doc["email"],
        category=profile_doc["category"],
        tribe_community=profile_doc["tribe_community"],
        state=profile_doc["state"],
        district=profile_doc["district"],
        pincode=profile_doc["pincode"],
        address_line=profile_doc.get("address_line"),
        created_at=profile_doc["created_at"],
        updated_at=profile_doc["updated_at"]
    )

@router.put("/profile", response_model=ApplicantProfileResponse)
async def update_applicant_profile(
    profile_update: ApplicantProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Update saved applicant profile fields.
    Aadhaar number and Applicant ID are immutable once verified.
    Does NOT modify historical submitted application records.
    """
    user_id = current_user["_id"]
    now = datetime.now(timezone.utc)

    existing = await db["applicant_profiles"].find_one({"user_id": user_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found. Please create your applicant profile first."
        )

    # Ensure applicant_id is present
    applicant_id = existing.get("applicant_id") or await get_or_create_applicant_id(db, user_id)

    updates = {"updated_at": now}

    if profile_update.full_name is not None:
        updates["full_name"] = profile_update.full_name
    if profile_update.father_or_husband_name is not None:
        updates["father_or_husband_name"] = profile_update.father_or_husband_name
    if profile_update.gender is not None:
        updates["gender"] = profile_update.gender
    if profile_update.dob is not None:
        updates["dob"] = profile_update.dob
    if profile_update.category is not None:
        updates["category"] = profile_update.category
    if profile_update.tribe_community is not None:
        updates["tribe_community"] = profile_update.tribe_community
    if profile_update.state is not None:
        updates["state"] = profile_update.state
    if profile_update.district is not None:
        updates["district"] = profile_update.district
    if profile_update.pincode is not None:
        updates["pincode"] = profile_update.pincode
    if profile_update.address_line is not None:
        updates["address_line"] = profile_update.address_line

    if profile_update.phone is not None:
        valid_phone = validate_phone(profile_update.phone)
        # Check uniqueness if phone changed
        if valid_phone != existing.get("phone"):
            dup_phone = await db["applicant_profiles"].find_one({"phone": valid_phone, "user_id": {"$ne": user_id}})
            if dup_phone:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This phone number is already associated with another applicant account."
                )
            updates["phone"] = valid_phone

    await db["applicant_profiles"].update_one({"user_id": user_id}, {"$set": updates})
    updated = await db["applicant_profiles"].find_one({"user_id": user_id})

    # Record audit log
    audit_entry = {
        "id": "AUD-" + uuid.uuid4().hex[:8].upper(),
        "timestamp": now,
        "actor": updated.get("full_name", "Citizen"),
        "role": current_user.get("role", "APPLICANT"),
        "action": "APPLICANT_PROFILE_UPDATED",
        "application_id": "PROFILE",
        "remarks": f"Applicant profile updated for Applicant ID {applicant_id}.",
        "ip_address": "127.0.0.1"
    }
    await db["audit_logs"].insert_one(audit_entry)

    return ApplicantProfileResponse(
        user_id=updated["user_id"],
        applicant_id=applicant_id,
        full_name=updated["full_name"],
        father_or_husband_name=updated.get("father_or_husband_name"),
        gender=updated.get("gender", "FEMALE"),
        dob=updated["dob"],
        aadhaar_masked=updated.get("aadhaar_masked", "XXXX-XXXX-XXXX"),
        phone=updated["phone"],
        email=updated.get("email") or current_user.get("email", ""),
        category=updated.get("category", "ST"),
        tribe_community=updated["tribe_community"],
        state=updated["state"],
        district=updated["district"],
        pincode=updated["pincode"],
        address_line=updated.get("address_line"),
        created_at=updated.get("created_at", now),
        updated_at=updated.get("updated_at", now)
    )

@router.get("/reusable-documents", response_model=List[ReusableDocumentItem])
@router.get("/documents/reusable", response_model=List[ReusableDocumentItem])
async def get_reusable_documents(
    scheme_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve previously uploaded, active, and verified certificates belonging to this applicant.
    Evaluates:
    - Document type
    - Verification status
    - Required Financial Year validity (e.g. FY 2025-26 vs older FY 2024-25)
    - Permanent caste/ST validity vs annual certificates
    """
    user_id = current_user["_id"]

    cursor = db["documents"].find({
        "user_id": user_id,
        "is_active": {"$ne": False}
    }).sort("created_at", -1)

    docs = await cursor.to_list(length=100)

    # Also search embedded documents from submitted applications if not separately in documents collection
    if not docs:
        apps = await db["applications"].find({"user_id": user_id}).to_list(20)
        for a in apps:
            for emb in a.get("documents", []):
                docs.append({
                    "document_id": emb.get("id"),
                    "_id": emb.get("id"),
                    "document_type": emb.get("document_code"),
                    "file_name": emb.get("file_name") or emb.get("document_name") or "document.pdf",
                    "file_size_bytes": (emb.get("file_size_kb") or 500) * 1024,
                    "content_type": "application/pdf",
                    "status": emb.get("status") or emb.get("verification_status") or "VERIFIED",
                    "verification_status": emb.get("verification_status") or emb.get("status") or "VERIFIED",
                    "application_id": a.get("application_id") or a.get("_id"),
                    "created_at": emb.get("uploaded_at") or a.get("created_at"),
                    "version": emb.get("version", 1)
                })

    # MoTA current scholarship cycle required financial year
    REQUIRED_INCOME_FY = "FY 2025-26"

    # Group by document type to return the latest document and evaluate reusability
    seen_types = set()
    reusable = []
    for d in docs:
        doc_type = d.get("document_type")
        if doc_type and doc_type not in seen_types:
            seen_types.add(doc_type)
            doc_id = d.get("document_id") or str(d.get("_id"))
            created_at = d.get("created_at")
            uploaded_date_str = created_at.strftime("%Y-%m-%d") if hasattr(created_at, "strftime") else str(created_at)[:10]

            v_status = d.get("verification_status") or d.get("status") or "VERIFIED"
            if v_status in ["OCR_VERIFIED", "TYPE_MATCH"]:
                v_status = "VERIFIED"

            is_reusable = True
            ineligibility_reason = None
            req_fy = None
            doc_fy = None

            # 1. Verification status check
            if v_status in ["REJECTED", "DEFICIENT", "SUPERSEDED"]:
                is_reusable = False
                ineligibility_reason = f"Document status is {v_status}. A verified document is required."
            elif doc_type == "INCOME_CERTIFICATE":
                # 2. Check Financial Year requirement for Income Certificate
                file_name_str = (d.get("file_name") or "").lower()
                extracted_fy = d.get("extracted_fields", {}).get("financial_year") or d.get("financial_year")
                if not extracted_fy:
                    if "2024-25" in file_name_str or "24-25" in file_name_str or "2024" in file_name_str:
                        extracted_fy = "FY 2024-25"
                    elif "2025-26" in file_name_str or "25-26" in file_name_str:
                        extracted_fy = "FY 2025-26"
                    else:
                        extracted_fy = "FY 2024-25"

                doc_fy = extracted_fy
                req_fy = REQUIRED_INCOME_FY
                if extracted_fy != REQUIRED_INCOME_FY:
                    is_reusable = False
                    ineligibility_reason = f"New Income Certificate required for {REQUIRED_INCOME_FY}.\nRequired financial year: {REQUIRED_INCOME_FY}\nExisting document: {extracted_fy}"
            elif doc_type == "ST_CERTIFICATE":
                # ST/Caste certificate does not expire annually
                if v_status in ["VERIFIED", "OCR_VERIFIED", "TYPE_MATCH", "UPLOADED"]:
                    is_reusable = True
                    ineligibility_reason = None

            reusable.append(ReusableDocumentItem(
                document_id=doc_id,
                document_type=doc_type,
                file_name=d.get("file_name", "document.pdf"),
                file_size_kb=max(1, d.get("file_size_bytes", 1024) // 1024),
                content_type=d.get("content_type", "application/pdf"),
                uploaded_at=uploaded_date_str,
                application_id=d.get("application_id", ""),
                status=d.get("status", "UPLOADED"),
                download_url=f"/api/documents/{doc_id}/file",
                version=d.get("version", 1),
                verification_status=v_status,
                is_reusable=is_reusable,
                ineligibility_reason=ineligibility_reason,
                required_financial_year=req_fy,
                document_financial_year=doc_fy
            ))

    return reusable
