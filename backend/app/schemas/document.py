from enum import Enum
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field

class DocumentType(str, Enum):
    ST_CERTIFICATE = "ST_CERTIFICATE"
    INCOME_CERTIFICATE = "INCOME_CERTIFICATE"
    MARKSHEET = "MARKSHEET"
    ADMISSION_PROOF = "ADMISSION_PROOF"
    BANK_DOCUMENT = "BANK_DOCUMENT"
    IDENTITY_DOCUMENT = "IDENTITY_DOCUMENT"

class VerificationStatus(str, Enum):
    TYPE_MATCH = "TYPE_MATCH"
    TYPE_MISMATCH = "TYPE_MISMATCH"
    MANUAL_REVIEW = "MANUAL_REVIEW"
    LOW_QUALITY = "LOW_QUALITY"

class DocumentMetadata(BaseModel):
    document_id: str
    application_id: str
    user_id: str
    document_type: DocumentType
    file_name: str
    file_size_bytes: int
    content_type: str
    storage_provider: str = "LOCAL_STORAGE" # LOCAL_STORAGE or S3_MINIO_READY
    storage_path: str
    storage_key: Optional[str] = None
    status: str = "UPLOADED" # UPLOADED, PENDING_AI_VERIFICATION, OCR_VERIFIED, DEFICIENT, SUPERSEDED
    is_active: bool = True
    superseded_by: Optional[str] = None
    version: int = 1
    download_url: Optional[str] = None
    ocr_processed: bool = False
    detected_document_type: Optional[str] = None
    verification_status: Optional[str] = None
    verification_message: Optional[str] = None
    file_exists: bool = True
    rejection_reason: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True

class DocumentVerifyPayload(BaseModel):
    status: Optional[str] = Field("VERIFIED", description="Target status: VERIFIED or REJECTED")
    reason: Optional[str] = Field(None, description="Mandatory if status is REJECTED")

class DocumentUploadResponse(BaseModel):
    document_id: str
    application_id: str
    document_type: DocumentType
    file_name: str
    file_size_bytes: int
    storage_path: str
    storage_key: Optional[str] = None
    download_url: Optional[str] = None
    ocr_processed: bool = True
    detected_document_type: Optional[str] = None
    classification_confidence: Optional[float] = None
    verification_status: Optional[str] = None
    message: str = "Document uploaded, verified with OCR, and binary securely stored."
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

class ExplainableIssue(BaseModel):
    status: str = "ERROR" # ERROR | WARNING | VALID
    category: str # DOCUMENT_TYPE_MISMATCH, DOCUMENT_EXPIRED, UNABLE_TO_VERIFY_VALIDITY, NAME_MISMATCH, DOB_MISMATCH, ID_MISMATCH, DOCUMENT_QUALITY, FILE_SIZE, FILE_FORMAT, CORRUPTED_FILE, MISSING_DOCUMENT, FIELD_REQUIRED, PHONE_FORMAT, PHONE_DUPLICATE, EMAIL_FORMAT, EMAIL_DUPLICATE
    field_id: Optional[str] = None
    what_is_wrong: str
    why_is_wrong: str
    expected: str
    provided: str
    action: str
    summary: Optional[str] = None
    details: Dict[str, Any] = {}

class DocumentTypeVerificationResponse(BaseModel):
    success: bool
    required_document_type: str
    detected_document_type: Optional[str] = None
    match_status: str
    confidence: float
    message: str
    is_acceptable: bool
    character_count: int
    detected_keywords: List[str] = []
    extracted_fields: Dict[str, Any] = {}
    explainable_issue: Optional[ExplainableIssue] = None

