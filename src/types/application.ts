export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DOCUMENT_VERIFICATION'
  | 'ELIGIBILITY_VERIFICATION'
  | 'SCRUTINY'
  | 'SELECTION'
  | 'APPROVED'
  | 'DEFICIENT'
  | 'DEFICIENCY_NOTIFIED'
  | 'RESUBMITTED'
  | 'REJECTED';

export interface ApplicantProfile {
  id: string;
  applicantId?: string;
  fullName: string;
  fatherOrHusbandName: string;
  gender: 'MALE' | 'FEMALE' | 'TRANSGENDER';
  dob: string;
  aadhaarNumberMasked: string;
  category: 'ST' | 'PVTG';
  tribeCommunity: string;
  mobile: string;
  email: string;
  state: string;
  district: string;
  pincode: string;
  address?: string;
  addressLine?: string;
  disabilityStatus: 'NONE' | 'YES';
  disabilityPercentage?: number;
}

export interface AcademicDetails {
  currentCourse: string;
  institutionName: string;
  institutionState: string;
  aisheCode: string;
  rollNumber: string;
  yearOfStudy: string;
  previousExamName: string;
  previousExamPercentage: number;
  passingYear: string;
  boardOrUniversity: string;
}

export interface BankDetails {
  accountHolderName: string;
  bankName: string;
  accountNumberMasked: string;
  ifscCode: string;
  branchName: string;
  isAadhaarSeeded: boolean; // Vital for PFMS DBT
  dbtVerifiedDate?: string;
}

export interface ApplicationDocument {
  id: string;
  documentCode: string;
  documentName: string;
  fileUrl: string;
  fileName: string;
  fileSizeKB: number;
  uploadedAt: string;
  ocrExtracted: boolean;
  status: 'PENDING' | 'VALID' | 'VERIFIED' | 'REJECTED' | 'DEFICIENT' | string;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REQUIRES_REUPLOAD' | 'MANUAL_REVIEW' | string;
  fileExists?: boolean;
  rejectionReason?: string;
  deficiencyReason?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: 'APPLICANT' | 'OFFICER' | 'ADMIN' | 'SYSTEM_AI';
  action: string;
  previousStatus?: ApplicationStatus;
  newStatus?: ApplicationStatus;
  remarks: string;
}

export interface ApplicationRecord {
  id: string; // e.g. "APP-2026-000001"
  applicantId?: string; // Permanent e.g. "ST-2026-000123"
  applicantSnapshot?: any; // Preserved historical snapshot
  schemeId: string;
  schemeCode: string;
  schemeName: string;
  submissionDate: string;
  lastUpdated: string;
  currentStageIndex: number;
  currentStep?: number;
  status: ApplicationStatus;
  applicant: ApplicantProfile;
  academic: AcademicDetails;
  bank: BankDetails;
  annualFamilyIncome: number;
  documents: ApplicationDocument[];
  hasDeficiency: boolean;
  deficiencyCategory?: string;
  deficiencyReason?: string;
  deficiencyRequiredCorrection?: string;
  deficiencyNotes?: string;
  rejectionReason?: string;
  aiEligibilityResult?: {
    overallStatus: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'FLAGGED_DEFICIENCY' | 'MORE_INFO_REQUIRED';
    confidenceScore: number;
    ruleMatches: {
      ruleId: string;
      label: string;
      expected: string;
      actual: string;
      status: 'PASS' | 'FAIL' | 'WARNING';
      evidenceSnippet: string;
    }[];
  };
  meritScore?: number;
  officerRemarks?: string;
  overrideNotes?: string;
  auditTrail: AuditRecord[];
}
