export type ValidationStatus = 'ERROR' | 'WARNING' | 'VALID';

export type ValidationCategory =
  | 'DOCUMENT_TYPE_MISMATCH'
  | 'DOCUMENT_EXPIRED'
  | 'UNABLE_TO_VERIFY_VALIDITY'
  | 'NAME_MISMATCH'
  | 'DOB_MISMATCH'
  | 'ID_MISMATCH'
  | 'DOCUMENT_QUALITY'
  | 'FILE_SIZE'
  | 'FILE_FORMAT'
  | 'CORRUPTED_FILE'
  | 'MISSING_DOCUMENT'
  | 'FIELD_REQUIRED'
  | 'PHONE_REQUIRED'
  | 'PHONE_FORMAT'
  | 'PHONE_INVALID_FORMAT'
  | 'PHONE_INVALID_LENGTH'
  | 'PHONE_DUPLICATE'
  | 'EMAIL_FORMAT'
  | 'EMAIL_DUPLICATE'
  | string;

export interface ExplainableIssue {
  status: ValidationStatus;
  category: ValidationCategory;
  code?: string;
  field_id?: string;
  step?: number;
  what_is_wrong: string;
  why_is_wrong: string;
  reason?: string;
  expected: string;
  provided: string;
  required?: string;
  detected?: string;
  action: string;
  details?: Record<string, any>;
  confidence?: number;
  detected_type?: string | null;
  required_type?: string;
  summary?: string;
  character_count?: number;
  matched_keywords?: string[];
}

export interface ValidationSummaryResult {
  is_valid: boolean;
  total_issues: number;
  error_count: number;
  warning_count: number;
  summary_message: string;
  issues: ExplainableIssue[];
}
