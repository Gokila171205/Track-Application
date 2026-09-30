from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

class ApplicantProfileCreate(BaseModel):
    applicant_id: Optional[str] = Field(default=None, description="Permanent unique Applicant ID e.g. ST-2026-000123")
    full_name: str = Field(..., min_length=2, max_length=120)
    father_or_husband_name: Optional[str] = Field(default=None, max_length=120)
    gender: str = Field(default="FEMALE")
    dob: str = Field(..., description="YYYY-MM-DD")
    aadhaar: str = Field(..., description="12-digit Aadhaar number for Verhoeff validation")
    phone: str = Field(..., description="10-digit mobile number")
    category: str = Field(default="ST")
    tribe_community: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    district: str = Field(..., min_length=2, max_length=100)
    pincode: str = Field(..., min_length=6, max_length=6)
    address_line: Optional[str] = Field(default=None, max_length=250)

class ApplicantProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    father_or_husband_name: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    tribe_community: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    pincode: Optional[str] = None
    address_line: Optional[str] = None

class ApplicantProfileResponse(BaseModel):
    user_id: str
    applicant_id: str = Field(..., description="Permanent unique Applicant ID e.g. ST-2026-000123")
    full_name: str
    father_or_husband_name: Optional[str] = None
    gender: str
    dob: str
    aadhaar_masked: str
    phone: str
    email: str
    category: str
    tribe_community: str
    state: str
    district: str
    pincode: str
    address_line: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ReusableDocumentItem(BaseModel):
    document_id: str
    document_type: str
    file_name: str
    file_size_kb: int
    content_type: str
    uploaded_at: str
    application_id: str
    status: str
    download_url: str
    version: Optional[int] = 1
    verification_status: Optional[str] = "VERIFIED"
    is_reusable: bool = True
    ineligibility_reason: Optional[str] = None
    required_financial_year: Optional[str] = None
    document_financial_year: Optional[str] = None
