from enum import Enum
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class ApplicationStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    DOCUMENT_VERIFICATION = "DOCUMENT_VERIFICATION"
    ELIGIBILITY_VERIFICATION = "ELIGIBILITY_VERIFICATION"
    SCRUTINY = "SCRUTINY"
    SELECTION = "SELECTION"
    APPROVED = "APPROVED"
    DEFICIENT = "DEFICIENT"
    RESUBMITTED = "RESUBMITTED"
    REJECTED = "REJECTED"

# Canonical lifecycle transition rules
ALLOWED_STATUS_TRANSITIONS: Dict[ApplicationStatus, List[ApplicationStatus]] = {
    ApplicationStatus.DRAFT: [ApplicationStatus.SUBMITTED],
    ApplicationStatus.SUBMITTED: [
        ApplicationStatus.DOCUMENT_VERIFICATION,
        ApplicationStatus.DEFICIENT,
        ApplicationStatus.REJECTED,
    ],
    ApplicationStatus.DOCUMENT_VERIFICATION: [
        ApplicationStatus.ELIGIBILITY_VERIFICATION,
        ApplicationStatus.DEFICIENT,
        ApplicationStatus.REJECTED,
    ],
    ApplicationStatus.ELIGIBILITY_VERIFICATION: [
        ApplicationStatus.SCRUTINY,
        ApplicationStatus.DEFICIENT,
        ApplicationStatus.REJECTED,
    ],
    ApplicationStatus.SCRUTINY: [
        ApplicationStatus.SELECTION,
        ApplicationStatus.DEFICIENT,
        ApplicationStatus.REJECTED,
    ],
    ApplicationStatus.DEFICIENT: [
        ApplicationStatus.RESUBMITTED,
        ApplicationStatus.DOCUMENT_VERIFICATION,
        ApplicationStatus.REJECTED,
    ],
    ApplicationStatus.RESUBMITTED: [
        ApplicationStatus.DOCUMENT_VERIFICATION,
        ApplicationStatus.DEFICIENT,
        ApplicationStatus.REJECTED,
    ],
    ApplicationStatus.SELECTION: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED],
    ApplicationStatus.APPROVED: [
        ApplicationStatus.SELECTION,
        ApplicationStatus.SCRUTINY,
    ],
    ApplicationStatus.REJECTED: [
        ApplicationStatus.RESUBMITTED,
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.DOCUMENT_VERIFICATION,
        ApplicationStatus.SCRUTINY,
    ],
}

class PersonalDetails(BaseModel):
    full_name: str
    father_or_husband_name: Optional[str] = None
    gender: str = "FEMALE"
    dob: str
    aadhaar_masked: str
    category: str = "ST"
    tribe_community: str
    mobile: str
    email: str
    state: str
    district: str
    pincode: str

class PersonalDetailsDraft(BaseModel):
    full_name: Optional[str] = ""
    father_or_husband_name: Optional[str] = None
    gender: Optional[str] = "FEMALE"
    dob: Optional[str] = ""
    aadhaar_masked: Optional[str] = ""
    category: Optional[str] = "ST"
    tribe_community: Optional[str] = ""
    mobile: Optional[str] = ""
    email: Optional[str] = ""
    state: Optional[str] = ""
    district: Optional[str] = ""
    pincode: Optional[str] = ""

class AcademicDetails(BaseModel):
    current_course: str
    institution_name: str
    institution_state: Optional[str] = None
    aishe_code: Optional[str] = None
    roll_number: Optional[str] = None
    year_of_study: Optional[str] = None
    previous_exam_name: str
    previous_exam_percentage: float
    passing_year: str
    board_or_university: str

class AcademicDetailsDraft(BaseModel):
    current_course: Optional[str] = ""
    institution_name: Optional[str] = ""
    institution_state: Optional[str] = None
    aishe_code: Optional[str] = None
    roll_number: Optional[str] = None
    year_of_study: Optional[str] = None
    previous_exam_name: Optional[str] = ""
    previous_exam_percentage: Optional[float] = 0.0
    passing_year: Optional[str] = ""
    board_or_university: Optional[str] = ""

class FinancialDetails(BaseModel):
    annual_family_income: int
    bank_name: str
    account_holder_name: str
    account_number_masked: str
    ifsc_code: str
    branch_name: Optional[str] = None
    is_aadhaar_seeded: bool = True

class FinancialDetailsDraft(BaseModel):
    annual_family_income: Optional[int] = 0
    bank_name: Optional[str] = ""
    account_holder_name: Optional[str] = ""
    account_number_masked: Optional[str] = ""
    ifsc_code: Optional[str] = ""
    branch_name: Optional[str] = None
    is_aadhaar_seeded: Optional[bool] = True

class ApplicationDocumentItem(BaseModel):
    id: str
    document_code: Optional[str] = "DOCUMENT"
    document_name: Optional[str] = "Uploaded Document"
    file_name: Optional[str] = "document.pdf"
    file_url: Optional[str] = None
    file_size_kb: Optional[int] = None
    status: str = "PENDING"
    verification_status: Optional[str] = None
    file_exists: Optional[bool] = True
    rejection_reason: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

class ApplicationCreate(BaseModel):
    scheme_id: str
    applicant_id: Optional[str] = None
    personal_details: PersonalDetails
    academic_details: AcademicDetails
    financial_details: FinancialDetails
    documents: Optional[List[ApplicationDocumentItem]] = []
    status: ApplicationStatus = ApplicationStatus.SUBMITTED
    current_step: Optional[int] = 1

class ApplicationDraftSave(BaseModel):
    application_id: Optional[str] = None
    applicant_id: Optional[str] = None
    scheme_id: str
    current_step: int = 1
    personal_details: Optional[PersonalDetailsDraft] = None
    academic_details: Optional[AcademicDetailsDraft] = None
    financial_details: Optional[FinancialDetailsDraft] = None
    documents: Optional[List[ApplicationDocumentItem]] = []

class ApplicationUpdate(BaseModel):
    current_step: Optional[int] = None
    personal_details: Optional[PersonalDetailsDraft] = None
    academic_details: Optional[AcademicDetailsDraft] = None
    financial_details: Optional[FinancialDetailsDraft] = None
    documents: Optional[List[ApplicationDocumentItem]] = None
    status: Optional[ApplicationStatus] = None

class ApplicationResponse(BaseModel):
    application_id: str
    user_id: str
    applicant_id: Optional[str] = None
    applicant_snapshot: Optional[Dict[str, Any]] = None
    scheme_id: str
    scheme_name: Optional[str] = None
    status: ApplicationStatus
    current_step: Optional[int] = 1
    personal_details: Optional[PersonalDetailsDraft] = Field(default_factory=PersonalDetailsDraft)
    academic_details: Optional[AcademicDetailsDraft] = Field(default_factory=AcademicDetailsDraft)
    financial_details: Optional[FinancialDetailsDraft] = Field(default_factory=FinancialDetailsDraft)
    documents: List[ApplicationDocumentItem] = []
    has_deficiency: bool = False
    deficiency_category: Optional[str] = None
    deficiency_reason: Optional[str] = None
    deficiency_required_correction: Optional[str] = None
    deficiency_notes: Optional[str] = None
    officer_remarks: Optional[str] = None
    rejection_reason: Optional[str] = None
    audit_trail: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ApplicantTrackingResponse(BaseModel):
    applicant_id: Optional[str] = None
    applications: List[ApplicationResponse]
