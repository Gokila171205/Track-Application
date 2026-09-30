import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database.mongodb import get_database
from app.core.security import get_current_user, require_officer_or_admin
from app.schemas.document import (
    DocumentType,
    DocumentMetadata,
    DocumentUploadResponse,
    DocumentTypeVerificationResponse,
    VerificationStatus,
    ExplainableIssue,
    DocumentVerifyPayload
)
from app.services.file_validator import validate_uploaded_file, sanitize_filename
from app.services.storage_service import storage_service
from app.services.ocr_service import verify_document_content
from app.services.explainable_validator import validate_document_explainable

router = APIRouter(prefix="/documents", tags=["Documents"])

def serialize_document_metadata(doc: dict) -> DocumentMetadata:
    """
    Format document document dict safely for DocumentMetadata Pydantic model.
    Checks whether underlying physical file exists in storage.
    """
    storage_key = doc.get("storage_key")
    file_exists = storage_service.file_exists(storage_key) if storage_key else False

    return DocumentMetadata(
        document_id=doc.get("document_id") or str(doc.get("_id")),
        application_id=doc.get("application_id", ""),
        user_id=doc.get("user_id", ""),
        document_type=doc.get("document_type", DocumentType.ST_CERTIFICATE),
        file_name=doc.get("file_name", "document.pdf"),
        file_size_bytes=doc.get("file_size_bytes", 0),
        content_type=doc.get("content_type", "application/pdf"),
        storage_provider=doc.get("storage_provider", "LOCAL_STORAGE"),
        storage_path=doc.get("storage_path", ""),
        storage_key=storage_key,
        status=doc.get("status", "UPLOADED"),
        is_active=doc.get("is_active", True),
        superseded_by=doc.get("superseded_by"),
        version=doc.get("version", 1),
        download_url=f"/api/documents/{doc.get('document_id') or doc.get('_id')}/file",
        ocr_processed=doc.get("ocr_processed", False),
        detected_document_type=doc.get("detected_document_type"),
        classification_confidence=doc.get("classification_confidence"),
        verification_status=doc.get("verification_status"),
        verification_message=doc.get("verification_message"),
        file_exists=file_exists,
        rejection_reason=doc.get("rejection_reason"),
        verified_by=doc.get("verified_by"),
        verified_at=doc.get("verified_at"),
        created_at=doc.get("created_at") or datetime.now(timezone.utc)
    )

@router.post("/verify-type", response_model=DocumentTypeVerificationResponse)
async def verify_document_type_endpoint(
    required_document_type: str = Form(..., description="Required document type code e.g. ST_CERTIFICATE"),
    file: UploadFile = File(..., description="Document file to inspect"),
    application_id: Optional[str] = Form(None),
    applicant_name: Optional[str] = Form(None),
    applicant_dob: Optional[str] = Form(None),
    applicant_aadhaar: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Inspect an uploaded document binary and run complete explainable validation:
    Checks size, format, integrity, OCR quality, document-type match, validity/expiry,
    and applicant name/DOB matching.
    """
    file_bytes = await file.read()
    raw_filename = file.filename or f"{required_document_type}.pdf"
    content_type = file.content_type or "application/octet-stream"

    # Run complete explainable validation pipeline
    res = validate_document_explainable(
        file_bytes=file_bytes,
        filename=raw_filename,
        content_type=content_type,
        required_document_type=required_document_type,
        applicant_name=applicant_name or current_user.get("name"),
        applicant_dob=applicant_dob,
        applicant_aadhaar=applicant_aadhaar
    )

    issue = None
    if res["status"] in ("ERROR", "WARNING"):
        issue = ExplainableIssue(
            status=res["status"],
            category=res["category"],
            field_id=res.get("required_type") or required_document_type,
            what_is_wrong=res["what_is_wrong"],
            why_is_wrong=res["why_is_wrong"],
            expected=res["expected"],
            provided=res["provided"],
            action=res["action"],
            summary=res.get("summary") or res["what_is_wrong"],
            details=res.get("extracted_fields", {})
        )

    legacy_status = "TYPE_MATCH" if res["category"] == "DOCUMENT_VALIDATED" else (
        "TYPE_MISMATCH" if res["category"] == "DOCUMENT_TYPE_MISMATCH" else (
            "LOW_QUALITY" if res["category"] == "DOCUMENT_QUALITY" else res["category"]
        )
    )

    return DocumentTypeVerificationResponse(
        success=res["status"] != "ERROR",
        required_document_type=res["required_type"],
        detected_document_type=res.get("detected_type"),
        match_status=legacy_status,
        confidence=res.get("confidence", 0.0),
        message=res["why_is_wrong"] if res["status"] == "ERROR" else (
            res["action"] if res["status"] == "VALID" else res["what_is_wrong"]
        ),
        is_acceptable=res.get("is_acceptable", False),
        character_count=res.get("character_count", 0),
        detected_keywords=res.get("matched_keywords", []),
        extracted_fields=res.get("extracted_fields", {}),
        explainable_issue=issue
    )

@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    application_id: str = Form(..., description="Target Application ID"),
    document_type: DocumentType = Form(..., description="Supported certificate category"),
    file: UploadFile = File(..., description="Genuine PDF or image scan of document"),
    applicant_name: Optional[str] = Form(None),
    applicant_dob: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Register and securely store uploaded document binary and metadata.
    Enforces server-side validation, OCR classification, and explainable error reporting.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    # 1. Verify target application exists
    application = await db["applications"].find_one({"_id": application_id})
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target application '{application_id}' does not exist."
        )

    # 2. If applicant, verify ownership
    if user_role == "APPLICANT" and application.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You cannot upload documents to another applicant's application dossier."
        )

    # 3. Read binary content
    file_bytes = await file.read()
    raw_filename = file.filename or f"{document_type.value}.pdf"
    content_type = file.content_type or "application/octet-stream"

    # 4. Run explainable validation engine
    validation = validate_document_explainable(
        file_bytes=file_bytes,
        filename=raw_filename,
        content_type=content_type,
        required_document_type=document_type.value,
        applicant_name=applicant_name or current_user.get("name"),
        applicant_dob=applicant_dob
    )

    # If critical error (size, format, corrupted, or clear type mismatch) -> reject with explainable detail
    if validation["status"] == "ERROR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": validation["category"],
                "message": validation["why_is_wrong"] or validation["action"],
                "what_is_wrong": validation["what_is_wrong"],
                "why_is_wrong": validation["why_is_wrong"],
                "expected": validation["expected"],
                "provided": validation["provided"],
                "action": validation["action"],
                "required_type": validation["required_type"],
                "detected_type": validation.get("detected_type")
            }
        )

    safe_filename = sanitize_filename(raw_filename)
    file_size = len(file_bytes)
    validated_mime = "application/pdf" if safe_filename.endswith(".pdf") else "image/jpeg"

    match_status = "TYPE_MATCH" if validation["status"] == "VALID" else validation["category"]
    message = validation["action"] if validation["status"] == "VALID" else (validation["why_is_wrong"] or validation["action"])
    verification = {
        "is_acceptable": validation.get("is_acceptable", True),
        "detected_document_type": validation.get("detected_type"),
        "confidence": validation.get("confidence", 0.0),
        "match_status": match_status,
        "message": message,
        "extracted_fields": validation.get("extracted_fields", {})
    }

    # 5. Generate unique ID and save binary to secure local storage
    doc_id = "DOC-" + uuid.uuid4().hex[:10].upper()
    now = datetime.now(timezone.utc)

    storage_key = await storage_service.save_file(
        application_id=application_id,
        doc_id=doc_id,
        filename=safe_filename,
        content=file_bytes
    )
    storage_path = f"local://storage/documents/{storage_key}"

    # 6. Insert document metadata into MongoDB Atlas 'documents' collection
    doc_record = {
        "_id": doc_id,
        "document_id": doc_id,
        "application_id": application_id,
        "user_id": user_id,
        "document_type": document_type.value,
        "file_name": safe_filename,
        "file_size_bytes": file_size,
        "content_type": validated_mime,
        "storage_provider": "LOCAL_STORAGE",
        "storage_path": storage_path,
        "storage_key": storage_key,
        "status": "OCR_VERIFIED" if verification["is_acceptable"] else "MANUAL_REVIEW",
        "ocr_processed": True,
        "detected_document_type": verification["detected_document_type"],
        "classification_confidence": verification["confidence"],
        "verification_status": verification["match_status"],
        "verification_message": verification["message"],
        "extracted_fields": verification.get("extracted_fields", {}),
        "is_active": True,
        "version": 1,
        "superseded_by": None,
        "created_at": now
    }
    await db["documents"].insert_one(doc_record)

    # 7. Update application's embedded document registry
    app_doc_entry = {
        "id": doc_id,
        "document_code": document_type.value,
        "document_name": safe_filename,
        "file_name": safe_filename,
        "file_url": f"/api/documents/{doc_id}/file",
        "file_size_kb": max(1, file_size // 1024),
        "status": "VALID" if verification["match_status"] == VerificationStatus.TYPE_MATCH.value else "PENDING",
        "ocr_extracted": True,
        "verification_status": verification["match_status"],
        "uploaded_at": now
    }
    
    # Filter out any prior active document of same type in application record
    existing_docs = application.get("documents", [])
    updated_docs = [d for d in existing_docs if d.get("document_code") != document_type.value]
    updated_docs.append(app_doc_entry)

    await db["applications"].update_one(
        {"_id": application_id},
        {"$set": {"documents": updated_docs, "updated_at": now}}
    )

    # 8. Record statutory audit trail in 'audit_logs'
    audit_entry = {
        "id": "AUD-" + uuid.uuid4().hex[:8].upper(),
        "timestamp": now,
        "actor": current_user.get("name", "Applicant"),
        "role": user_role or "APPLICANT",
        "action": "DOCUMENT_UPLOADED",
        "application_id": application_id,
        "document_id": doc_id,
        "document_type": document_type.value,
        "remarks": f"Document '{safe_filename}' ({max(1, file_size // 1024)} KB) uploaded. OCR status: {verification['match_status']}.",
        "ip_address": "127.0.0.1"
    }
    await db["audit_logs"].insert_one(audit_entry)

    return DocumentUploadResponse(
        document_id=doc_id,
        application_id=application_id,
        document_type=document_type,
        file_name=safe_filename,
        file_size_bytes=file_size,
        storage_path=storage_path,
        storage_key=storage_key,
        download_url=f"/api/documents/{doc_id}/file",
        ocr_processed=True,
        detected_document_type=verification["detected_document_type"],
        classification_confidence=verification["confidence"],
        verification_status=verification["match_status"],
        message=verification["message"],
        uploaded_at=now
    )

@router.get("/application/{application_id:path}", response_model=List[DocumentMetadata])
async def get_documents_by_application(
    application_id: str,
    active_only: bool = True,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve all document records for a given application ID.
    Enforces authorization: Applicants can ONLY access documents for their own applications.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    application = await db["applications"].find_one({"_id": application_id})
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' does not exist."
        )

    if user_role == "APPLICANT" and application.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You do not have permission to view documents belonging to another applicant."
        )

    query = {"application_id": application_id}
    if active_only:
        query["is_active"] = {"$ne": False}

    cursor = db["documents"].find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=100)

    return [serialize_document_metadata(d) for d in docs]

@router.get("/{document_id:path}/download")
@router.get("/{document_id:path}/file")
async def get_document_file(
    document_id: str,
    request: Request,
    as_download: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Securely stream the binary file content of a document.
    Enforces authorization check:
    - APPLICANT can only access their own documents.
    - OFFICER and ADMIN have authority to view/download for official scrutiny.
    - Returns 404 with clear message if physical file is missing from storage.
    - Sets inline disposition for viewing, attachment for download.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    # Locate document record
    doc = await db["documents"].find_one({"$or": [{"_id": document_id}, {"document_id": document_id}]})
    app_doc = None
    if not doc:
        # Check embedded in application
        app_doc = await db["applications"].find_one({"documents.id": document_id})
        if app_doc:
            embedded_doc = next((d for d in app_doc.get("documents", []) if d.get("id") == document_id), None)
            if embedded_doc:
                doc = {
                    "_id": document_id,
                    "document_id": document_id,
                    "application_id": app_doc.get("_id"),
                    "user_id": app_doc.get("user_id"),
                    "file_name": embedded_doc.get("file_name") or embedded_doc.get("document_name") or "document.pdf",
                    "content_type": "application/pdf",
                    "storage_key": embedded_doc.get("storage_key") or f"{app_doc.get('_id').replace('/', '_')}/{document_id}_{embedded_doc.get('file_name', 'document.pdf')}"
                }

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' does not exist."
        )

    # Authorization enforcement
    if user_role == "APPLICANT":
        doc_owner = doc.get("user_id")
        if doc_owner != user_id:
            if not app_doc:
                app_doc = await db["applications"].find_one({"_id": doc.get("application_id")})
            if not app_doc or app_doc.get("user_id") != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unauthorized: You do not have permission to access this document."
                )

    storage_key = doc.get("storage_key")
    if not storage_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file is no longer available."
        )

    # Resolve safe physical path
    file_path = storage_service.get_file_path(storage_key)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file is no longer available."
        )

    # Audit file access event
    now = datetime.now(timezone.utc)
    audit_entry = {
        "id": "AUD-" + uuid.uuid4().hex[:8].upper(),
        "timestamp": now,
        "actor": current_user.get("name", "User"),
        "role": user_role or "OFFICER",
        "action": "DOCUMENT_ACCESSED",
        "application_id": doc.get("application_id"),
        "document_id": document_id,
        "remarks": f"Document binary '{doc.get('file_name')}' accessed/downloaded.",
        "ip_address": "127.0.0.1"
    }
    await db["audit_logs"].insert_one(audit_entry)

    # Determine disposition: attachment for explicit download, inline for viewing
    raw_content_type = doc.get("content_type", "application/pdf")
    filename = doc.get("file_name", "document.pdf")
    
    # Infer content type if generic
    if raw_content_type == "application/octet-stream" or not raw_content_type:
        lower_name = filename.lower()
        if lower_name.endswith(".pdf"):
            raw_content_type = "application/pdf"
        elif lower_name.endswith(".png"):
            raw_content_type = "image/png"
        elif lower_name.endswith(".jpg") or lower_name.endswith(".jpeg"):
            raw_content_type = "image/jpeg"

    # Default to inline unless requested as download or path ends with /download
    is_download = as_download if as_download is not None else request.url.path.rstrip("/").endswith("/download")
    disposition = "attachment" if is_download else "inline"

    return FileResponse(
        path=str(file_path),
        media_type=raw_content_type,
        filename=filename,
        content_disposition_type=disposition
    )

@router.post("/{document_id:path}/replace", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def replace_document(
    document_id: str,
    file: UploadFile = File(..., description="Replacement document scan"),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Replace a deficient or rejected document with a fresh submission.
    Preserves audit history: marks old document as SUPERSEDED (is_active=False),
    validates new document via OCR, stores new binary, and updates status to RESUBMITTED.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    # 1. Fetch old document
    old_doc = await db["documents"].find_one({"_id": document_id})
    if not old_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Original document '{document_id}' not found."
        )

    application_id = old_doc.get("application_id")
    application = await db["applications"].find_one({"_id": application_id})
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target application '{application_id}' does not exist."
        )

    # 2. Authorization
    if user_role == "APPLICANT" and application.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You cannot rectify documents for another applicant."
        )

    # 3. Validate new binary
    file_bytes = await file.read()
    safe_filename, validated_mime = validate_uploaded_file(
        file_bytes=file_bytes,
        filename=file.filename or old_doc.get("file_name", "replacement.pdf"),
        content_type=file.content_type or "application/octet-stream"
    )
    file_size = len(file_bytes)

    # 4. OCR verification of replacement document
    expected_type = old_doc.get("document_type")
    verification = verify_document_content(
        file_bytes=file_bytes,
        filename=safe_filename,
        content_type=validated_mime,
        required_document_type=expected_type
    )

    if verification["match_status"] == VerificationStatus.TYPE_MISMATCH.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "DOCUMENT_TYPE_MISMATCH",
                "message": verification["message"],
                "required_type": verification["required_document_type"],
                "detected_type": verification["detected_document_type"],
                "confidence": verification["confidence"]
            }
        )

    # 5. Save new binary
    new_doc_id = "DOC-" + uuid.uuid4().hex[:10].upper()
    now = datetime.now(timezone.utc)
    new_version = old_doc.get("version", 1) + 1

    storage_key = await storage_service.save_file(
        application_id=application_id,
        doc_id=new_doc_id,
        filename=safe_filename,
        content=file_bytes
    )
    storage_path = f"local://storage/documents/{storage_key}"

    # 6. Mark old document as SUPERSEDED
    await db["documents"].update_one(
        {"_id": document_id},
        {"$set": {
            "is_active": False,
            "status": "SUPERSEDED",
            "superseded_by": new_doc_id,
            "updated_at": now
        }}
    )

    # 7. Insert new document
    new_doc_record = {
        "_id": new_doc_id,
        "document_id": new_doc_id,
        "application_id": application_id,
        "user_id": user_id,
        "document_type": expected_type,
        "file_name": safe_filename,
        "file_size_bytes": file_size,
        "content_type": validated_mime,
        "storage_provider": "LOCAL_STORAGE",
        "storage_path": storage_path,
        "storage_key": storage_key,
        "status": "OCR_VERIFIED" if verification["is_acceptable"] else "MANUAL_REVIEW",
        "ocr_processed": True,
        "detected_document_type": verification["detected_document_type"],
        "classification_confidence": verification["confidence"],
        "verification_status": verification["match_status"],
        "verification_message": verification["message"],
        "extracted_fields": verification.get("extracted_fields", {}),
        "is_active": True,
        "version": new_version,
        "superseded_by": None,
        "created_at": now
    }
    await db["documents"].insert_one(new_doc_record)

    # 8. Update application state: mark as RESUBMITTED, clear deficiency flag
    app_doc_entry = {
        "id": new_doc_id,
        "document_code": expected_type,
        "document_name": safe_filename,
        "file_name": safe_filename,
        "file_url": f"/api/documents/{new_doc_id}/file",
        "file_size_kb": max(1, file_size // 1024),
        "status": "VALID" if verification["match_status"] == VerificationStatus.TYPE_MATCH.value else "PENDING",
        "ocr_extracted": True,
        "verification_status": verification["match_status"],
        "uploaded_at": now
    }

    existing_docs = application.get("documents", [])
    updated_docs = [d for d in existing_docs if d.get("document_code") != expected_type]
    updated_docs.append(app_doc_entry)

    await db["applications"].update_one(
        {"_id": application_id},
        {"$set": {
            "documents": updated_docs,
            "status": "RESUBMITTED",
            "has_deficiency": False,
            "deficiency_notes": None,
            "updated_at": now
        }}
    )

    # 9. Record audit trail
    audit_entry = {
        "id": "AUD-" + uuid.uuid4().hex[:8].upper(),
        "timestamp": now,
        "actor": current_user.get("name", "Applicant"),
        "role": user_role or "APPLICANT",
        "action": "DOCUMENT_RESUBMITTED",
        "application_id": application_id,
        "document_id": new_doc_id,
        "remarks": f"Replacement document '{safe_filename}' uploaded for deficiency rectification (v{new_version}). OCR: {verification['match_status']}.",
        "ip_address": "127.0.0.1"
    }
    await db["audit_logs"].insert_one(audit_entry)

    return DocumentUploadResponse(
        document_id=new_doc_id,
        application_id=application_id,
        document_type=DocumentType(expected_type),
        file_name=safe_filename,
        file_size_bytes=file_size,
        storage_path=storage_path,
        storage_key=storage_key,
        download_url=f"/api/documents/{new_doc_id}/file",
        ocr_processed=True,
        detected_document_type=verification["detected_document_type"],
        classification_confidence=verification["confidence"],
        verification_status=verification["match_status"],
        message=verification["message"],
        uploaded_at=now
    )

@router.get("/{document_id:path}", response_model=DocumentMetadata)
async def get_document_by_id(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve single document metadata by document ID.
    Verifies document and associated application ownership.
    """
    user_id = current_user["_id"]
    user_role = current_user.get("role")

    doc = await db["documents"].find_one({"_id": document_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' does not exist."
        )

    if user_role == "APPLICANT":
        if doc.get("user_id") != user_id:
            app = await db["applications"].find_one({"_id": doc.get("application_id")})
            if not app or app.get("user_id") != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unauthorized: You do not have permission to access this document."
                )

    return serialize_document_metadata(doc)

@router.put("/{document_id:path}/verify-status", response_model=DocumentMetadata)
async def update_document_verification_status(
    document_id: str,
    payload: DocumentVerifyPayload,
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Statutory officer document verification or rejection.
    Enforces that Rejection strictly requires a stated reason.
    Updates tsfms.documents and embedded application document registry, and records audit trail.
    """
    now = datetime.now(timezone.utc)
    officer_name = current_user.get("name") or current_user.get("email") or "Authorized MoTA Officer"
    target_status = payload.status.upper()
    if target_status not in ("VERIFIED", "REJECTED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status. Must be 'VERIFIED' or 'REJECTED'."
        )

    if target_status == "REJECTED" and (not payload.reason or not payload.reason.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required. Please provide a clear explanation for rejection."
        )

    # 1. Locate document
    doc = await db["documents"].find_one({"$or": [{"_id": document_id}, {"document_id": document_id}]})
    app_id = doc.get("application_id") if doc else None

    # Also search embedded in application if doc not in documents collection
    if not doc:
        app_doc = await db["applications"].find_one({"documents.id": document_id})
        if not app_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document '{document_id}' does not exist."
            )
        app_id = app_doc.get("_id")
        embedded_doc = next((d for d in app_doc.get("documents", []) if d.get("id") == document_id), None)
        # Create doc in documents collection to make it canonical
        doc = {
            "_id": document_id,
            "document_id": document_id,
            "application_id": app_id,
            "user_id": app_doc.get("user_id"),
            "document_type": embedded_doc.get("document_code", DocumentType.ST_CERTIFICATE.value),
            "file_name": embedded_doc.get("file_name", "document.pdf"),
            "file_size_bytes": (embedded_doc.get("file_size_kb") or 100) * 1024,
            "content_type": "application/pdf",
            "storage_provider": "LOCAL_STORAGE",
            "storage_path": f"local://storage/documents/{embedded_doc.get('file_name', 'document.pdf')}",
            "storage_key": embedded_doc.get("storage_key") or f"{app_id.replace('/', '_')}/{document_id}_{embedded_doc.get('file_name', 'document.pdf')}",
            "status": "UPLOADED",
            "is_active": True,
            "version": 1,
            "created_at": now
        }
        await db["documents"].insert_one(doc)

    prev_status = doc.get("verification_status") or doc.get("status") or "PENDING"
    rejection_reason = payload.reason.strip() if target_status == "REJECTED" else None

    # 2. Update tsfms.documents
    update_doc_fields: dict = {
        "status": target_status,
        "verification_status": target_status,
        "updated_at": now
    }
    if target_status == "VERIFIED":
        update_doc_fields["verified_by"] = officer_name
        update_doc_fields["verified_at"] = now
        update_doc_fields["rejection_reason"] = None
    else:
        update_doc_fields["rejected_by"] = officer_name
        update_doc_fields["rejected_at"] = now
        update_doc_fields["rejection_reason"] = rejection_reason

    await db["documents"].update_one(
        {"$or": [{"_id": document_id}, {"document_id": document_id}]},
        {"$set": update_doc_fields}
    )

    # 3. Update embedded document inside tsfms.applications
    if app_id:
        doc_embedded_update: dict = {
            "documents.$.status": target_status,
            "documents.$.verification_status": target_status,
            "updated_at": now
        }
        if target_status == "VERIFIED":
            doc_embedded_update["documents.$.verified_by"] = officer_name
            doc_embedded_update["documents.$.verified_at"] = now
            doc_embedded_update["documents.$.rejection_reason"] = None
        else:
            doc_embedded_update["documents.$.rejected_by"] = officer_name
            doc_embedded_update["documents.$.rejected_at"] = now
            doc_embedded_update["documents.$.rejection_reason"] = rejection_reason

        await db["applications"].update_one(
            {"$or": [{"_id": app_id}, {"application_id": app_id}], "documents.id": document_id},
            {"$set": doc_embedded_update}
        )

        # Requirement 8: Check if all enclosed documents are now VERIFIED
        if target_status == "VERIFIED":
            app_doc = await db["applications"].find_one({"$or": [{"_id": app_id}, {"application_id": app_id}]})
            if app_doc and app_doc.get("status") in ("DOCUMENT_VERIFICATION", "SUBMITTED"):
                docs_in_app = app_doc.get("documents", [])
                if docs_in_app and all(
                    (d.get("verification_status") == "VERIFIED" or d.get("status") == "VERIFIED")
                    for d in docs_in_app
                ):
                    # Transition application status from DOCUMENT_VERIFICATION to ELIGIBILITY_VERIFICATION
                    prev_app_status = app_doc.get("status")
                    await db["applications"].update_one(
                        {"_id": app_doc["_id"]},
                        {"$set": {
                            "status": "ELIGIBILITY_VERIFICATION",
                            "updated_at": now
                        }}
                    )
                    # Record DOCUMENT_VERIFICATION_COMPLETED audit log
                    audit_doc_complete = {
                        "_id": f"AUD-{int(now.timestamp() * 1000) + 1}",
                        "id": f"AUD-{int(now.timestamp() * 1000) + 1}",
                        "timestamp": now,
                        "actor": officer_name,
                        "role": current_user.get("role", "OFFICER"),
                        "action": "DOCUMENT_VERIFICATION_COMPLETED",
                        "applicationId": app_doc.get("application_id") or app_doc.get("_id"),
                        "schemeCode": app_doc.get("scheme_id"),
                        "previousStatus": prev_app_status,
                        "newStatus": "ELIGIBILITY_VERIFICATION",
                        "reason": "All mandatory documents verified as valid and genuine by officer.",
                        "remarks": "Document verification completed. Application transitioned to Eligibility Verification.",
                        "ipAddress": "10.14.88.22 (MoTA NIC Gateway)"
                    }
                    await db["audit_logs"].insert_one(audit_doc_complete)

    # 4. Record audit log
    audit_entry = {
        "_id": f"AUD-{int(now.timestamp() * 1000)}",
        "id": f"AUD-{int(now.timestamp() * 1000)}",
        "timestamp": now,
        "actor": officer_name,
        "role": current_user.get("role", "OFFICER"),
        "action": f"DOCUMENT_{target_status}",
        "applicationId": app_id,
        "documentId": document_id,
        "previousStatus": prev_status,
        "newStatus": target_status,
        "reason": rejection_reason or "Document verified by authorized scrutiny officer",
        "remarks": rejection_reason or f"Document verified as valid for scheme scrutiny.",
        "ipAddress": "10.14.88.22 (MoTA NIC Gateway)"
    }
    await db["audit_logs"].insert_one(audit_entry)

    updated_doc = await db["documents"].find_one({"$or": [{"_id": document_id}, {"document_id": document_id}]})
    return serialize_document_metadata(updated_doc)

@router.post("/{document_id:path}/verify", response_model=DocumentMetadata)
async def verify_document_endpoint(
    document_id: str,
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Convenience endpoint to mark document as VERIFIED."""
    return await update_document_verification_status(
        document_id=document_id,
        payload=DocumentVerifyPayload(status="VERIFIED"),
        current_user=current_user,
        db=db
    )

@router.post("/{document_id:path}/reject", response_model=DocumentMetadata)
async def reject_document_endpoint(
    document_id: str,
    payload: DocumentVerifyPayload,
    current_user: dict = Depends(require_officer_or_admin),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Convenience endpoint to mark document as REJECTED with mandatory reason."""
    payload.status = "REJECTED"
    return await update_document_verification_status(
        document_id=document_id,
        payload=payload,
        current_user=current_user,
        db=db
    )
