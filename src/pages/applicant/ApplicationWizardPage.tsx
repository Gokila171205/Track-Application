// MoTA Unified Portal: Dynamic Application Filing Wizard
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SchemeConfig } from '../../types/scheme';
import { getSchemeWindowStatus } from '../../utils/schemeWindow';
import { ApplicationRecord } from '../../types/application';
import { DocumentOcrViewer } from '../../components/document-ai/DocumentOcrViewer';
import { ExplainableEvidenceCard } from '../../components/document-ai/ExplainableEvidenceCard';
import { simulateDocumentOcr } from '../../services/documentAiMock';
import { evaluateApplicantEligibility } from '../../services/eligibilityEngine';
import { DigiLockerService, PfmsDbtService, ESignService } from '../../services/integrations';
import { ExplainableErrorCard } from '../../components/common/ExplainableErrorCard';
import { ValidationSummaryBanner } from '../../components/common/ValidationSummaryBanner';
import { ExplainableIssue } from '../../types/explainableValidation';
import {
  validatePhoneExplainable,
  validateEmailExplainable,
  validateFieldExplainable,
  validateFileClientExplainable,
  inspectDocumentClientFallback,
  getSchemeRequiredDocuments,
  getDocumentDisplayName
} from '../../utils/explainableValidators';
import {
  User,
  ShieldCheck,
  GraduationCap,
  Landmark,
  FileText,
  Sparkles,
  Eye,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Save,
  AlertTriangle,
  Upload,
  ExternalLink,
  XCircle
} from 'lucide-react';
import { api } from '../../services/api';

export const ApplicationWizardPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { schemes, addApplication, saveDraft, draftApplications, currentUser, applications } = useApp();

  const initialSchemeId = searchParams.get('scheme') || (schemes[3] ? schemes[3].id : schemes[0]?.id || 'MOTA-NFST-01');
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>(initialSchemeId);

  const selectedScheme = schemes.find((s) => s.id === selectedSchemeId || s.code === selectedSchemeId) || schemes[0];

  // Wizard current step: 1 to 8
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [draftAppId, setDraftAppId] = useState<string | null>(searchParams.get('draftId') || null);
  const [isSavedDraft, setIsSavedDraft] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [draftSaveMsg, setDraftSaveMsg] = useState<string>('');
  const [restoredFromDraft, setRestoredFromDraft] = useState<boolean>(false);
  const [isPullingDigiLocker, setIsPullingDigiLocker] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState<boolean>(false);
  const [newGeneratedAppId, setNewGeneratedAppId] = useState<string>('');

  // Applicant Profile State
  const [hasSavedProfile, setHasSavedProfile] = useState<boolean>(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [rawAadhaarInput, setRawAadhaarInput] = useState<string>('');
  const [reusableDocs, setReusableDocs] = useState<any[]>([]);
  const [reusedDocMap, setReusedDocMap] = useState<Record<string, any>>({});

  // STEP 1: Profile - Clean Empty Initialization (No seed or hardcoded values)
  const [fullName, setFullName] = useState<string>('');
  const [fatherName, setFatherName] = useState<string>('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'TRANSGENDER' | ''>('');
  const [dob, setDob] = useState<string>('');
  const [maskedAadhaar, setMaskedAadhaar] = useState<string>('');
  const [category, setCategory] = useState<'ST' | 'PVTG' | ''>('ST');
  const [tribeCommunity, setTribeCommunity] = useState<string>('');
  const [mobile, setMobile] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [district, setDistrict] = useState<string>('');
  const [pincode, setPincode] = useState<string>('');

  // STEP 2: Eligibility Criteria Input
  const [annualFamilyIncome, setAnnualFamilyIncome] = useState<number | ''>('');
  const [applicantAge, setApplicantAge] = useState<number | ''>('');

  // STEP 3: Academic Details
  const [currentCourse, setCurrentCourse] = useState<string>('');
  const [institutionName, setInstitutionName] = useState<string>('');
  const [institutionState, setInstitutionState] = useState<string>('');
  const [aisheCode, setAisheCode] = useState<string>('');
  const [rollNumber, setRollNumber] = useState<string>('');
  const [yearOfStudy, setYearOfStudy] = useState<string>('');
  const [previousExamName, setPreviousExamName] = useState<string>('');
  const [previousExamPercentage, setPreviousExamPercentage] = useState<number | ''>('');
  const [passingYear, setPassingYear] = useState<string>('');
  const [boardOrUniversity, setBoardOrUniversity] = useState<string>('');

  // STEP 4: Bank Details (PFMS DBT)
  const [accountHolderName, setAccountHolderName] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('');
  const [isAadhaarSeeded, setIsAadhaarSeeded] = useState<boolean>(true);

  // STEP 5: Documents & Real OCR Verification State
  const [stCertFile, setStCertFile] = useState<string>('');
  const [stCertFileObj, setStCertFileObj] = useState<File | null>(null);
  const [incCertFile, setIncCertFile] = useState<string>('');
  const [incCertFileObj, setIncCertFileObj] = useState<File | null>(null);
  const [marksheetFile, setMarksheetFile] = useState<string>('');
  const [marksheetFileObj, setMarksheetFileObj] = useState<File | null>(null);
  const [admissionFile, setAdmissionFile] = useState<string>('');
  const [admissionFileObj, setAdmissionFileObj] = useState<File | null>(null);
  const [isDigiLockerLinked, setIsDigiLockerLinked] = useState<boolean>(false);

  // Dynamic Scheme Document Requirements (Part 22)
  const schemeRequiredDocs = React.useMemo(() => {
    return getSchemeRequiredDocuments(selectedScheme);
  }, [selectedScheme]);

  // Explainable Form Field Issues (Parts 11, 12, 13, 14)
  const [formFieldIssues, setFormFieldIssues] = useState<Record<string, ExplainableIssue | null>>({});

  // Document Slot State per document code (Parts 1-10, 15, 17, 18, 19, 20)
  interface DocSlotState {
    file: File | null;
    fileName: string;
    status: 'IDLE' | 'READING' | 'CHECKING' | 'TYPE_MATCH' | 'TYPE_MISMATCH' | 'LOW_QUALITY' | 'MANUAL_REVIEW' | 'ERROR';
    detectedType?: string | null;
    requiredType?: string;
    extractedSnippet?: string;
    extractedFields?: Record<string, any>;
    message?: string;
    explainableIssue?: ExplainableIssue | null;
  }

  const [docSlots, setDocSlots] = useState<Record<string, DocSlotState>>({});

  // Real-time Field Level Validation Handlers (Parts 11, 12, 13)
  const handlePhoneChange = async (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setMobile(cleaned);

    if (cleaned.length === 0) {
      setFormFieldIssues(prev => ({
        ...prev,
        mobile: validateFieldExplainable('mobile', 'Mobile Number', '', 1, 'Please enter a valid 10-digit phone number.')
      }));
      return;
    }

    const fmtIssue = validatePhoneExplainable(cleaned);
    if (fmtIssue) {
      setFormFieldIssues(prev => ({ ...prev, mobile: fmtIssue }));
      return;
    }

    // Check duplicate phone only after format passes strictly
    try {
      const avail = await api.checkAvailability(undefined, cleaned);
      if (!avail.available && avail.issue) {
        setFormFieldIssues(prev => ({
          ...prev,
          mobile: avail.issue || validatePhoneExplainable(cleaned, true)
        }));
        return;
      }
    } catch (_) {}

    setFormFieldIssues(prev => ({ ...prev, mobile: null }));
  };

  const handleEmailBlur = async () => {
    if (!email.trim()) {
      setFormFieldIssues(prev => ({
        ...prev,
        email: validateFieldExplainable('email', 'Email Address', '', 1, 'Please enter a valid email address such as: example@gmail.com')
      }));
      return;
    }

    const fmtIssue = validateEmailExplainable(email);
    if (fmtIssue) {
      setFormFieldIssues(prev => ({ ...prev, email: fmtIssue }));
      return;
    }

    // Check duplicate email
    try {
      const avail = await api.checkAvailability(email.trim().toLowerCase(), undefined);
      if (!avail.available && avail.issue) {
        setFormFieldIssues(prev => ({
          ...prev,
          email: avail.issue || validateEmailExplainable(email, true)
        }));
        return;
      }
    } catch (_) {}

    setFormFieldIssues(prev => ({ ...prev, email: null }));
  };

  const handleFieldBlur = (fieldId: string, label: string, value: any, step: number = 1, hint?: string) => {
    const issue = validateFieldExplainable(fieldId, label, value, step, hint);
    setFormFieldIssues(prev => ({ ...prev, [fieldId]: issue }));
  };

  // Real-time Document Selection & Verification (Parts 1-10, 15, 17)
  const handleSelectDocument = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docCode: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-selecting same file fires event
    e.target.value = '';

    // Synchronize legacy variables for backward compatibility
    if (docCode === 'ST_CERTIFICATE') { setStCertFile(file.name); setStCertFileObj(file); }
    else if (docCode === 'INCOME_CERTIFICATE') { setIncCertFile(file.name); setIncCertFileObj(file); }
    else if (docCode === 'MARKSHEET') { setMarksheetFile(file.name); setMarksheetFileObj(file); }
    else if (docCode === 'ADMISSION_PROOF') { setAdmissionFile(file.name); setAdmissionFileObj(file); }

    // Part 17 Priority Check 1 & 2: Client validation (Size > 5MB, format, 0 bytes)
    // "Do not run expensive OCR if basic file validation already fails."
    const clientIssue = validateFileClientExplainable(file, docCode);
    if (clientIssue) {
      setDocSlots(prev => ({
        ...prev,
        [docCode]: {
          file,
          fileName: file.name,
          status: 'ERROR',
          requiredType: docCode,
          message: clientIssue.what_is_wrong,
          explainableIssue: clientIssue
        }
      }));
      return;
    }

    // Run OCR + Document Classification
    setDocSlots(prev => ({
      ...prev,
      [docCode]: {
        file,
        fileName: file.name,
        status: 'READING',
        requiredType: docCode,
        message: 'Extracting text streams and running OCR...',
        explainableIssue: null
      }
    }));

    try {
      setTimeout(() => {
        setDocSlots(prev => {
          if (prev[docCode]?.status === 'READING') {
            return {
              ...prev,
              [docCode]: {
                ...prev[docCode],
                status: 'CHECKING',
                message: 'Verifying document type against scheme requirements...'
              }
            };
          }
          return prev;
        });
      }, 300);

      const res = await api.verifyDocumentType(file, docCode, {
        applicationId: draftAppId || undefined,
        applicantName: fullName,
        applicantDob: dob,
        applicantAadhaar: rawAadhaarInput || maskedAadhaar
      });

      if (res.explainable_issue) {
        setDocSlots(prev => ({
          ...prev,
          [docCode]: {
            file,
            fileName: file.name,
            status: (res.match_status as any) || 'TYPE_MISMATCH',
            detectedType: res.detected_document_type,
            requiredType: res.required_document_type,
            extractedFields: res.extracted_fields,
            message: res.message,
            explainableIssue: res.explainable_issue
          }
        }));
      } else {
        setDocSlots(prev => ({
          ...prev,
          [docCode]: {
            file,
            fileName: file.name,
            status: 'TYPE_MATCH',
            detectedType: res.detected_document_type,
            requiredType: res.required_document_type,
            extractedFields: res.extracted_fields,
            message: res.message || 'Verified Document Type',
            explainableIssue: null
          }
        }));
      }
    } catch (err: any) {
      console.error(`Verification error for ${docCode}:`, err);
      const errorDetail = err?.response?.data?.detail;
      const expIssue = errorDetail?.explainable_issue || (errorDetail?.verification_result?.explainable_issue);
      if (expIssue) {
        setDocSlots(prev => ({
          ...prev,
          [docCode]: {
            file,
            fileName: file.name,
            status: 'TYPE_MISMATCH',
            detectedType: errorDetail?.verification_result?.detected_document_type,
            requiredType: docCode,
            message: errorDetail?.message || expIssue.what_is_wrong,
            explainableIssue: expIssue
          }
        }));
      } else {
        // Run client-side fallback inspector (handles offline / client-only mode)
        const clientRes = await inspectDocumentClientFallback(file, docCode, {
          fullName,
          dob,
          aadhaar: rawAadhaarInput || maskedAadhaar
        });
        if (clientRes.explainable_issue) {
          setDocSlots(prev => ({
            ...prev,
            [docCode]: {
              file,
              fileName: file.name,
              status: (clientRes.match_status as any) || 'TYPE_MISMATCH',
              detectedType: clientRes.detected_document_type,
              requiredType: docCode,
              message: clientRes.explainable_issue!.what_is_wrong,
              explainableIssue: clientRes.explainable_issue,
              extractedFields: clientRes.extracted_fields
            }
          }));
        } else {
          setDocSlots(prev => ({
            ...prev,
            [docCode]: {
              file,
              fileName: file.name,
              status: 'TYPE_MATCH',
              detectedType: clientRes.detected_document_type,
              requiredType: docCode,
              message: 'Verified Document Type',
              explainableIssue: null,
              extractedFields: clientRes.extracted_fields
            }
          }));
        }
      }
    }
  };

  const handleRemoveDocument = (docCode: string) => {
    setDocSlots(prev => {
      const updated = { ...prev };
      delete updated[docCode];
      return updated;
    });
    if (docCode === 'ST_CERTIFICATE') { setStCertFile(''); setStCertFileObj(null); }
    else if (docCode === 'INCOME_CERTIFICATE') { setIncCertFile(''); setIncCertFileObj(null); }
    else if (docCode === 'MARKSHEET') { setMarksheetFile(''); setMarksheetFileObj(null); }
    else if (docCode === 'ADMISSION_PROOF') { setAdmissionFile(''); setAdmissionFileObj(null); }
  };

  // Aggregated issues across the whole application (Part 16)
  const allIssues = React.useMemo<ExplainableIssue[]>(() => {
    const issues: ExplainableIssue[] = [];

    // 1. Form field issues
    Object.values(formFieldIssues).forEach((iss) => {
      if (iss) issues.push(iss);
    });

    // 2. Document slot issues
    Object.entries(docSlots).forEach(([code, slot]) => {
      if (slot?.explainableIssue) {
        issues.push(slot.explainableIssue);
      }
    });

    // 3. Scheme-specific missing documents (if on Step 5 or beyond)
    if (currentStep >= 5) {
      schemeRequiredDocs.forEach((req: any) => {
        const hasFile = Boolean(
          docSlots[req.code]?.fileName ||
          (req.code === 'ST_CERTIFICATE' && stCertFile) ||
          (req.code === 'INCOME_CERTIFICATE' && incCertFile) ||
          (req.code === 'MARKSHEET' && marksheetFile) ||
          (req.code === 'ADMISSION_PROOF' && admissionFile) ||
          reusedDocMap[req.code]
        );
        const hasSlotIssue = Boolean(docSlots[req.code]?.explainableIssue);
        if (req.required && !hasFile && !hasSlotIssue) {
          issues.push({
            status: 'ERROR',
            category: 'MISSING_DOCUMENT',
            field_id: req.code,
            step: 5,
            what_is_wrong: 'Required Document Missing',
            why_is_wrong: `This application requires a ${req.name}.`,
            expected: req.name,
            provided: 'Not uploaded',
            action: `Please upload: ${req.name}`,
            summary: `This application requires ${req.name}.`
          });
        }
      });
    }

    return issues;
  }, [formFieldIssues, docSlots, schemeRequiredDocs, currentStep, stCertFile, incCertFile, marksheetFile, admissionFile, reusedDocMap]);

  // Deep-link jump to exact field or document slot (Part 16)
  const handleJumpToIssue = (issue: ExplainableIssue) => {
    if (issue.step) {
      setCurrentStep(issue.step);
    }
    setTimeout(() => {
      const el =
        (issue.field_id && document.getElementById(`field-${issue.field_id}`)) ||
        (issue.field_id && document.getElementById(`doc-slot-${issue.field_id}`));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el.querySelector('input, select, textarea');
        if (input instanceof HTMLElement) {
          input.focus();
        } else if (el instanceof HTMLElement) {
          el.focus();
        }
      }
    }, 120);
  };

  // Step-level navigation validation
  const validateStepNavigation = (fromStep: number): boolean => {
    if (fromStep === 1) {
      const issues: Record<string, ExplainableIssue | null> = {};
      if (!fullName.trim()) {
        issues['fullName'] = validateFieldExplainable('fullName', 'Full Name', '', 1, 'Please enter your full name as per Aadhaar.');
      }
      if (!dob) {
        issues['dob'] = validateFieldExplainable('dob', 'Date of Birth', '', 1, 'Please enter your date of birth before continuing.');
      }
      if (!mobile.trim() || mobile.replace(/\D/g, '').length !== 10) {
        issues['mobile'] = validatePhoneExplainable(mobile) || validateFieldExplainable('mobile', 'Mobile Number', '', 1, 'Please enter a valid 10-digit mobile number.');
      }
      if (!tribeCommunity.trim()) {
        issues['tribeCommunity'] = validateFieldExplainable('tribeCommunity', 'Tribe / Community', '', 1, 'Please specify your Tribe or Community.');
      }
      if (!state.trim()) {
        issues['state'] = validateFieldExplainable('state', 'Domicile State', '', 1, 'Please enter your domicile state.');
      }
      if (!district.trim()) {
        issues['district'] = validateFieldExplainable('district', 'District', '', 1, 'Please enter your district.');
      }
      if (!pincode.trim()) {
        issues['pincode'] = validateFieldExplainable('pincode', 'Pincode', '', 1, 'Please enter a valid 6-digit pincode.');
      }
      if (!hasSavedProfile && (!rawAadhaarInput || rawAadhaarInput.length !== 12)) {
        issues['aadhaar'] = {
          status: 'ERROR',
          category: 'FIELD_REQUIRED',
          field_id: 'aadhaar',
          step: 1,
          what_is_wrong: '12-Digit Aadhaar Required',
          why_is_wrong: 'A complete 12-digit Aadhaar number is required for statutory identity verification.',
          expected: '12-digit Aadhaar number',
          provided: rawAadhaarInput ? `${rawAadhaarInput.length} digits` : 'Empty',
          action: 'Please enter your 12-digit Aadhaar number.',
          summary: 'Aadhaar number must contain 12 digits.'
        };
      }

      setFormFieldIssues(prev => ({ ...prev, ...issues }));
      const errorList = Object.values(issues).filter(i => i !== null && i.status === 'ERROR') as ExplainableIssue[];
      if (errorList.length > 0) {
        handleJumpToIssue(errorList[0]);
        return false;
      }
    }

    if (fromStep === 4) {
      const issues: Record<string, ExplainableIssue | null> = {};
      if (!accountNumber.trim()) {
        issues['accountNumber'] = validateFieldExplainable('accountNumber', 'Bank Account Number', '', 4, 'Please enter your bank account number.');
      }
      if (!ifscCode.trim()) {
        issues['ifscCode'] = validateFieldExplainable('ifscCode', 'IFSC Code', '', 4, 'Please enter a valid 11-character IFSC code.');
      }
      setFormFieldIssues(prev => ({ ...prev, ...issues }));
      const errorList = Object.values(issues).filter(i => i !== null && i.status === 'ERROR') as ExplainableIssue[];
      if (errorList.length > 0) {
        handleJumpToIssue(errorList[0]);
        return false;
      }
    }

    if (fromStep === 5) {
      const step5Issues = allIssues.filter(i => i.step === 5 && i.status === 'ERROR');
      if (step5Issues.length > 0) {
        handleJumpToIssue(step5Issues[0]);
        return false;
      }
    }

    return true;
  };

  // ===============================
  // REAL-TIME VERIFICATION GATES
  // ===============================
  
  const applicantDataPayload = {
    category,
    annualFamilyIncome: Number(annualFamilyIncome) || 0,
    previousExamPercentage: Number(previousExamPercentage) || 0,
    applicantAge: Number(applicantAge) || 0,
    isAadhaarSeeded
  };

  const eligibilityResult = React.useMemo(() => {
    return evaluateApplicantEligibility(selectedScheme, applicantDataPayload as any);
  }, [selectedScheme, applicantDataPayload.category, applicantDataPayload.annualFamilyIncome, applicantDataPayload.previousExamPercentage, applicantDataPayload.applicantAge, applicantDataPayload.isAadhaarSeeded]);

  const ocrResults = React.useMemo(() => {
    const results = [];
    if (stCertFile) results.push(simulateDocumentOcr('ST_CERTIFICATE', fullName || 'Not provided', Number(annualFamilyIncome) || 0, false));
    if (incCertFile) results.push(simulateDocumentOcr('INCOME_CERTIFICATE', fullName || 'Not provided', Number(annualFamilyIncome) || 0, false));
    if (marksheetFile) results.push(simulateDocumentOcr('MARKSHEET', fullName || 'Not provided', Number(annualFamilyIncome) || 0, false));
    return results;
  }, [stCertFile, incCertFile, marksheetFile, fullName, annualFamilyIncome]);

  const requiredDocumentsUploaded = schemeRequiredDocs
    .filter((r: any) => r.required)
    .every((req: any) =>
      Boolean(
        docSlots[req.code]?.fileName ||
        (req.code === 'ST_CERTIFICATE' && stCertFile) ||
        (req.code === 'INCOME_CERTIFICATE' && incCertFile) ||
        (req.code === 'MARKSHEET' && marksheetFile) ||
        (req.code === 'ADMISSION_PROOF' && admissionFile) ||
        reusedDocMap[req.code]
      )
    );
  const hasAnyBlockingIssue = allIssues.some((i) => i.status === 'ERROR');
  const allOcrPassed = !hasAnyBlockingIssue;
  const isEligible = eligibilityResult.overallStatus === 'ELIGIBLE';
  
  const canSubmit = requiredDocumentsUploaded && !hasAnyBlockingIssue && isEligible;

  // Load existing profile and reusable documents on mount
  useEffect(() => {
    let isMounted = true;

    const loadProfileAndDocs = async () => {
      setIsLoadingProfile(true);
      try {
        const profile = await api.getApplicantProfile();
        if (!isMounted) return;

        if (profile) {
          // CASE A: Authenticated user + profile exists -> Auto-fill ONLY own profile
          setHasSavedProfile(true);
          setFullName(profile.full_name || '');
          setFatherName(profile.father_or_husband_name || '');
          setGender((profile.gender as any) || 'FEMALE');
          setDob(profile.dob || '');
          setMaskedAadhaar(profile.aadhaar_masked || '');
          setMobile(profile.phone || '');
          setEmail(profile.email || currentUser?.email || '');
          setCategory((profile.category as any) || 'ST');
          setTribeCommunity(profile.tribe_community || '');
          setState(profile.state || '');
          setDistrict(profile.district || '');
          setPincode(profile.pincode || '');
          setAccountHolderName(profile.full_name || '');

          // Check for previous application belonging strictly to this authenticated user
          const userApps = applications.filter(
            (a) =>
              a.applicant.id === currentUser?.id ||
              (currentUser?.email && a.applicant.email?.toLowerCase() === currentUser.email.toLowerCase())
          );
          if (userApps.length > 0) {
            const latestApp = userApps[0];
            if (latestApp.bank) {
              setBankName((prev) => prev || latestApp.bank.bankName || '');
              setIfscCode((prev) => prev || latestApp.bank.ifscCode || '');
              setBranchName((prev) => prev || latestApp.bank.branchName || '');
            }
            if (latestApp.academic) {
              setCurrentCourse((prev) => prev || latestApp.academic.currentCourse || '');
              setInstitutionName((prev) => prev || latestApp.academic.institutionName || '');
              setInstitutionState((prev) => prev || latestApp.academic.institutionState || '');
              setAisheCode((prev) => prev || latestApp.academic.aisheCode || '');
              setRollNumber((prev) => prev || latestApp.academic.rollNumber || '');
              setYearOfStudy((prev) => prev || latestApp.academic.yearOfStudy || '');
              setPreviousExamName((prev) => prev || latestApp.academic.previousExamName || '');
              setPreviousExamPercentage((prev) => (prev !== '' ? prev : latestApp.academic.previousExamPercentage || ''));
              setPassingYear((prev) => prev || latestApp.academic.passingYear || '');
              setBoardOrUniversity((prev) => prev || latestApp.academic.boardOrUniversity || '');
            }
            if (latestApp.annualFamilyIncome) {
              setAnnualFamilyIncome((prev) => (prev !== '' ? prev : latestApp.annualFamilyIncome));
            }
          }

          // Fetch reusable certificates strictly belonging to this authenticated user
          try {
            const docs = await api.getReusableDocuments(selectedSchemeId);
            if (isMounted && docs && docs.length > 0) {
              setReusableDocs(docs);
              const rMap: Record<string, any> = {};
              const initialSlots: Record<string, DocSlotState> = {};
              docs.forEach((d: any) => {
                if (d.is_reusable !== false) {
                  rMap[d.document_type] = d;
                  initialSlots[d.document_type] = {
                    file: null,
                    fileName: d.file_name,
                    status: 'TYPE_MATCH',
                    detectedType: d.document_type,
                    requiredType: d.document_type,
                    message: 'Reused verified document from previous application',
                    explainableIssue: null
                  };
                  if (d.document_type === 'ST_CERTIFICATE') setStCertFile(d.file_name);
                  if (d.document_type === 'INCOME_CERTIFICATE') setIncCertFile(d.file_name);
                  if (d.document_type === 'MARKSHEET') setMarksheetFile(d.file_name);
                  if (d.document_type === 'ADMISSION_PROOF') setAdmissionFile(d.file_name);
                }
              });
              setReusedDocMap(rMap);
              setDocSlots(prev => ({ ...initialSlots, ...prev }));
            }
          } catch (docErr) {
            console.warn('Could not fetch reusable certificates:', docErr);
          }

          // Check for active DRAFT to restore (via URL query param ?draftId=... or scheme match)
          const draftIdParam = searchParams.get('draftId');
          let targetDraft: any = null;

          if (draftIdParam) {
            targetDraft = applications.find((a) => a.id === draftIdParam && a.status === 'DRAFT');
            if (!targetDraft) {
              try {
                const fetched = await api.getApplicationById(draftIdParam);
                if (fetched && fetched.status === 'DRAFT') {
                  targetDraft = {
                    id: fetched.application_id || fetched._id,
                    schemeId: fetched.scheme_id,
                    schemeCode: fetched.scheme_id,
                    currentStep: fetched.current_step || 1,
                    status: fetched.status,
                    applicant: {
                      id: fetched.user_id,
                      fullName: fetched.personal_details?.full_name || '',
                      fatherOrHusbandName: fetched.personal_details?.father_or_husband_name || '',
                      gender: fetched.personal_details?.gender || 'FEMALE',
                      dob: fetched.personal_details?.dob || '',
                      aadhaarNumberMasked: fetched.personal_details?.aadhaar_masked || '',
                      category: fetched.personal_details?.category || 'ST',
                      tribeCommunity: fetched.personal_details?.tribe_community || '',
                      mobile: fetched.personal_details?.mobile || '',
                      email: fetched.personal_details?.email || '',
                      state: fetched.personal_details?.state || '',
                      district: fetched.personal_details?.district || '',
                      pincode: fetched.personal_details?.pincode || '',
                      disabilityStatus: 'NONE'
                    },
                    academic: {
                      currentCourse: fetched.academic_details?.current_course || '',
                      institutionName: fetched.academic_details?.institution_name || '',
                      institutionState: fetched.academic_details?.institution_state || '',
                      aisheCode: fetched.academic_details?.aishe_code || '',
                      rollNumber: fetched.academic_details?.roll_number || '',
                      yearOfStudy: fetched.academic_details?.year_of_study || '',
                      previousExamName: fetched.academic_details?.previous_exam_name || '',
                      previousExamPercentage: fetched.academic_details?.previous_exam_percentage || 0,
                      passingYear: fetched.academic_details?.passing_year || '',
                      boardOrUniversity: fetched.academic_details?.board_or_university || '',
                    },
                    bank: {
                      accountHolderName: fetched.financial_details?.account_holder_name || '',
                      bankName: fetched.financial_details?.bank_name || '',
                      accountNumberMasked: fetched.financial_details?.account_number_masked || '',
                      ifscCode: fetched.financial_details?.ifsc_code || '',
                      branchName: fetched.financial_details?.branch_name || '',
                      isAadhaarSeeded: fetched.financial_details?.is_aadhaar_seeded ?? true,
                    },
                    annualFamilyIncome: fetched.financial_details?.annual_family_income || 0,
                    documents: fetched.documents || []
                  };
                }
              } catch (fetchErr) {
                console.warn('Could not fetch draft application by ID:', fetchErr);
              }
            }
          } else {
            // Auto-detect if user has an active draft for the current scheme
            targetDraft = draftApplications.find(
              (d) => d.schemeId === selectedSchemeId || d.schemeCode === selectedSchemeId
            );
          }

          if (isMounted && targetDraft) {
            setDraftAppId(targetDraft.id);
            if (targetDraft.applicant?.fullName) setFullName(targetDraft.applicant.fullName);
            if (targetDraft.applicant?.fatherOrHusbandName) setFatherName(targetDraft.applicant.fatherOrHusbandName);
            if (targetDraft.applicant?.gender) setGender(targetDraft.applicant.gender as any);
            if (targetDraft.applicant?.dob) setDob(targetDraft.applicant.dob);
            if (targetDraft.applicant?.aadhaarNumberMasked) setMaskedAadhaar(targetDraft.applicant.aadhaarNumberMasked);
            if (targetDraft.applicant?.category) setCategory(targetDraft.applicant.category as any);
            if (targetDraft.applicant?.tribeCommunity) setTribeCommunity(targetDraft.applicant.tribeCommunity);
            if (targetDraft.applicant?.mobile) setMobile(targetDraft.applicant.mobile);
            if (targetDraft.applicant?.email) setEmail(targetDraft.applicant.email);
            if (targetDraft.applicant?.state) setState(targetDraft.applicant.state);
            if (targetDraft.applicant?.district) setDistrict(targetDraft.applicant.district);
            if (targetDraft.applicant?.pincode) setPincode(targetDraft.applicant.pincode);

            if (targetDraft.annualFamilyIncome) setAnnualFamilyIncome(targetDraft.annualFamilyIncome);

            if (targetDraft.academic) {
              if (targetDraft.academic.currentCourse) setCurrentCourse(targetDraft.academic.currentCourse);
              if (targetDraft.academic.institutionName) setInstitutionName(targetDraft.academic.institutionName);
              if (targetDraft.academic.institutionState) setInstitutionState(targetDraft.academic.institutionState);
              if (targetDraft.academic.aisheCode) setAisheCode(targetDraft.academic.aisheCode);
              if (targetDraft.academic.rollNumber) setRollNumber(targetDraft.academic.rollNumber);
              if (targetDraft.academic.yearOfStudy) setYearOfStudy(targetDraft.academic.yearOfStudy);
              if (targetDraft.academic.previousExamName) setPreviousExamName(targetDraft.academic.previousExamName);
              if (targetDraft.academic.previousExamPercentage) setPreviousExamPercentage(targetDraft.academic.previousExamPercentage);
              if (targetDraft.academic.passingYear) setPassingYear(targetDraft.academic.passingYear);
              if (targetDraft.academic.boardOrUniversity) setBoardOrUniversity(targetDraft.academic.boardOrUniversity);
            }

            if (targetDraft.bank) {
              if (targetDraft.bank.accountHolderName) setAccountHolderName(targetDraft.bank.accountHolderName);
              if (targetDraft.bank.bankName) setBankName(targetDraft.bank.bankName);
              if (targetDraft.bank.accountNumberMasked) setAccountNumber(targetDraft.bank.accountNumberMasked.replace(/X/g, ''));
              if (targetDraft.bank.ifscCode) setIfscCode(targetDraft.bank.ifscCode);
              if (targetDraft.bank.branchName) setBranchName(targetDraft.bank.branchName);
              if (targetDraft.bank.isAadhaarSeeded !== undefined) setIsAadhaarSeeded(targetDraft.bank.isAadhaarSeeded);
            }

            if (targetDraft.documents && targetDraft.documents.length > 0) {
              targetDraft.documents.forEach((d: any) => {
                const code = d.documentCode || d.document_code;
                const name = d.fileName || d.file_name;
                if (code === 'ST_CERTIFICATE' && name) setStCertFile(name);
                if (code === 'INCOME_CERTIFICATE' && name) setIncCertFile(name);
                if (code === 'MARKSHEET' && name) setMarksheetFile(name);
                if (code === 'ADMISSION_PROOF' && name) setAdmissionFile(name);
              });
            }

            if (targetDraft.currentStep && targetDraft.currentStep >= 1 && targetDraft.currentStep <= 8) {
              setCurrentStep(targetDraft.currentStep);
            }
            setRestoredFromDraft(true);
          }
        } else {
          // CASE B: Authenticated user + profile does NOT exist -> Completely empty form
          setHasSavedProfile(false);
          setFullName('');
          setFatherName('');
          setGender('');
          setDob('');
          setMaskedAadhaar('');
          setRawAadhaarInput('');
          setCategory('ST');
          setTribeCommunity('');
          setMobile('');
          setEmail('');
          setState('');
          setDistrict('');
          setPincode('');
          setAnnualFamilyIncome('');
          setApplicantAge('');
          setCurrentCourse('');
          setInstitutionName('');
          setInstitutionState('');
          setAisheCode('');
          setRollNumber('');
          setYearOfStudy('');
          setPreviousExamName('');
          setPreviousExamPercentage('');
          setPassingYear('');
          setBoardOrUniversity('');
          setAccountHolderName('');
          setBankName('');
          setAccountNumber('');
          setIfscCode('');
          setBranchName('');
          setStCertFile('');
          setStCertFileObj(null);
          setIncCertFile('');
          setIncCertFileObj(null);
          setMarksheetFile('');
          setMarksheetFileObj(null);
          setAdmissionFile('');
          setAdmissionFileObj(null);
          setReusableDocs([]);
          setReusedDocMap({});
        }
      } catch (err: any) {
        if (!isMounted) return;
        // CASE C or D: Do NOT convert error into fallback/demo applicant
        setHasSavedProfile(false);
        console.warn('Profile fetch encountered error, maintaining clean empty state:', err);
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfileAndDocs();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  // STEP 8: e-Sign Declaration
  const [eSignConsent, setESignConsent] = useState<boolean>(false);

  const steps = [
    { num: 1, label: 'Profile' },
    { num: 2, label: 'Eligibility' },
    { num: 3, label: 'Academic Details' },
    { num: 4, label: 'Bank Details' },
    { num: 5, label: 'Documents' },
    { num: 6, label: 'AI Pre-Check' },
    { num: 7, label: 'Preview' },
    { num: 8, label: 'Submit' }
  ];

  const handlePullDigiLocker = async () => {
    setIsPullingDigiLocker(true);
    const resp = await DigiLockerService.fetchDocumentFromDigiLocker({
      aadhaarNumber: maskedAadhaar,
      docType: 'CASTE_CERTIFICATE',
      issuerState: state
    });
    setIsPullingDigiLocker(false);
    setIsDigiLockerLinked(true);
    setStCertFile(`DigiLocker_${resp.docName.replace(/\s+/g, '_')}_Verified.pdf`);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const existingAppForScheme = applications.find(
      (a) =>
        a.schemeId === selectedScheme.id &&
        (a.applicant.id === currentUser?.id ||
          (currentUser?.email && a.applicant.email?.toLowerCase() === currentUser.email.toLowerCase()))
    );

    // Submission guard: Enforce deadline ONLY if it's a NEW application
    if (!existingAppForScheme || existingAppForScheme.status === 'DRAFT') {
      const windowStatus = getSchemeWindowStatus(selectedScheme);
      if (!windowStatus.isOpen) {
        alert(`Application submission failed: ${windowStatus.message}`);
        return;
      }
    }

    if (existingAppForScheme && !['DRAFT', 'DEFICIENCY_NOTIFIED'].includes(existingAppForScheme.status)) {
      alert('Your application is already submitted and locked.');
      return;
    }

    if (!eSignConsent) {
      const chk = document.getElementById('field-esign-consent');
      if (chk) chk.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const blockingIssues = allIssues.filter((i) => i.status === 'ERROR');
    if (blockingIssues.length > 0) {
      handleJumpToIssue(blockingIssues[0]);
      return;
    }

    if (!canSubmit) {
      if (allIssues.length > 0) {
        handleJumpToIssue(allIssues[0]);
      }
      return;
    }

    setIsSubmitting(true);

    let activeMaskedAadhaar = maskedAadhaar;

    // 1. If first-time applicant, persist profile to MongoDB Atlas with Aadhaar Verhoeff check FIRST
    if (!hasSavedProfile) {
      if (!rawAadhaarInput || rawAadhaarInput.length !== 12) {
        setFormFieldIssues((prev) => ({
          ...prev,
          aadhaar: {
            status: 'ERROR',
            category: 'FIELD_REQUIRED',
            field_id: 'aadhaar',
            step: 1,
            what_is_wrong: '12-Digit Aadhaar Required',
            why_is_wrong: 'A complete 12-digit Aadhaar number is required for statutory identity verification.',
            expected: '12-digit Aadhaar number',
            provided: rawAadhaarInput ? `${rawAadhaarInput.length} digits` : 'Empty',
            action: 'Please enter your 12-digit Aadhaar number.',
            summary: 'Aadhaar number must contain 12 digits.'
          }
        }));
        handleJumpToIssue({
          status: 'ERROR',
          category: 'FIELD_REQUIRED',
          field_id: 'aadhaar',
          step: 1,
          what_is_wrong: '12-Digit Aadhaar Required',
          why_is_wrong: 'A complete 12-digit Aadhaar number is required for statutory identity verification.',
          expected: '12-digit Aadhaar number',
          provided: 'Incomplete',
          action: 'Please enter your 12-digit Aadhaar number.'
        });
        setIsSubmitting(false);
        return;
      }
      try {
        const createdProfile = await api.createApplicantProfile({
          full_name: fullName.trim(),
          father_or_husband_name: fatherName.trim() || undefined,
          gender: gender || 'FEMALE',
          dob,
          aadhaar: rawAadhaarInput,
          phone: mobile.trim(),
          category: category || 'ST',
          tribe_community: tribeCommunity.trim(),
          state: state.trim(),
          district: district.trim(),
          pincode: pincode.trim(),
        });
        setHasSavedProfile(true);
        activeMaskedAadhaar = createdProfile.aadhaar_masked;
        setMaskedAadhaar(createdProfile.aadhaar_masked);
      } catch (profileErr: any) {
        alert(`Applicant Profile Validation Failed: ${profileErr.message}`);
        setIsSubmitting(false);
        return;
      }
    }

    await ESignService.signApplicationDeclaration('NEW', fullName.trim());

    const targetAppId = draftAppId || (existingAppForScheme ? existingAppForScheme.id : `MOTA/${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}/${selectedScheme.code.split('-')[1]}/${Math.floor(10000 + Math.random() * 90000)}`);
    setNewGeneratedAppId(targetAppId);

    const newAppRecord: ApplicationRecord = {
      id: targetAppId,
      schemeId: selectedScheme.id,
      schemeCode: selectedScheme.code,
      schemeName: selectedScheme.name,
      submissionDate: new Date().toISOString().substring(0, 10),
      lastUpdated: new Date().toISOString().substring(0, 10),
      currentStageIndex: 1,
      currentStep: 8,
      status: existingAppForScheme && existingAppForScheme.status === 'DEFICIENCY_NOTIFIED' ? 'RESUBMITTED' : 'SUBMITTED',
      applicant: {
        id: currentUser?.id || 'APP-ST-' + Math.floor(1000 + Math.random() * 9000),
        fullName: fullName.trim(),
        fatherOrHusbandName: fatherName.trim(),
        gender: (gender || 'FEMALE') as any,
        dob,
        aadhaarNumberMasked: activeMaskedAadhaar || 'XXXX-XXXX-XXXX',
        category: (category || 'ST') as any,
        tribeCommunity: tribeCommunity.trim(),
        mobile: mobile.trim(),
        email: email.trim() || currentUser?.email || '',
        state: state.trim(),
        district: district.trim(),
        pincode: pincode.trim(),
        disabilityStatus: 'NONE'
      },
      academic: {
        currentCourse: currentCourse.trim() || 'Higher Education',
        institutionName: institutionName.trim() || 'Registered Institution',
        institutionState: institutionState.trim() || state.trim() || '',
        aisheCode: aisheCode.trim() || 'U-0000',
        rollNumber: rollNumber.trim() || 'ST/ENR/001',
        yearOfStudy: yearOfStudy.trim() || '1st Year',
        previousExamName: previousExamName.trim() || 'Qualifying Examination',
        previousExamPercentage: Number(previousExamPercentage) || 0,
        passingYear: passingYear.trim() || String(new Date().getFullYear()),
        boardOrUniversity: boardOrUniversity.trim() || 'Recognized Board'
      },
      bank: {
        accountHolderName: accountHolderName.trim() || fullName.trim(),
        bankName: bankName.trim() || 'Aadhaar Seeded Bank',
        accountNumberMasked: accountNumber ? 'XXXXXXXX' + accountNumber.slice(-4) : 'XXXXXXXX0000',
        ifscCode: ifscCode.trim() || 'SBIN0000001',
        branchName: branchName.trim() || 'Main Branch',
        isAadhaarSeeded: true,
        dbtVerifiedDate: new Date().toISOString().substring(0, 10)
      },
      annualFamilyIncome: Number(annualFamilyIncome) || 0,
      documents: [
        ...(stCertFile ? [{
          id: reusedDocMap['ST_CERTIFICATE']?.document_id || 'DOC-' + Math.random().toString(36).substring(2, 7),
          documentCode: 'ST_CERTIFICATE',
          documentName: 'ST Community Certificate',
          fileUrl: reusedDocMap['ST_CERTIFICATE']?.download_url || '#',
          fileName: stCertFile,
          fileSizeKB: reusedDocMap['ST_CERTIFICATE']?.file_size_kb || 340,
          uploadedAt: new Date().toISOString().substring(0, 10),
          ocrExtracted: true,
          status: 'VALID' as const
        }] : []),
        ...(incCertFile ? [{
          id: reusedDocMap['INCOME_CERTIFICATE']?.document_id || 'DOC-' + Math.random().toString(36).substring(2, 7),
          documentCode: 'INCOME_CERTIFICATE',
          documentName: 'Income Certificate',
          fileUrl: reusedDocMap['INCOME_CERTIFICATE']?.download_url || '#',
          fileName: incCertFile,
          fileSizeKB: reusedDocMap['INCOME_CERTIFICATE']?.file_size_kb || 290,
          uploadedAt: new Date().toISOString().substring(0, 10),
          ocrExtracted: true,
          status: 'VALID' as const
        }] : []),
        ...(marksheetFile ? [{
          id: reusedDocMap['MARKSHEET']?.document_id || 'DOC-' + Math.random().toString(36).substring(2, 7),
          documentCode: 'MARKSHEET',
          documentName: 'Previous Exam Marksheet',
          fileUrl: reusedDocMap['MARKSHEET']?.download_url || '#',
          fileName: marksheetFile,
          fileSizeKB: reusedDocMap['MARKSHEET']?.file_size_kb || 580,
          uploadedAt: new Date().toISOString().substring(0, 10),
          ocrExtracted: true,
          status: 'VALID' as const
        }] : []),
        ...(admissionFile ? [{
          id: reusedDocMap['ADMISSION_PROOF']?.document_id || 'DOC-' + Math.random().toString(36).substring(2, 7),
          documentCode: 'ADMISSION_PROOF',
          documentName: 'University Admission Letter / Research Joining Report',
          fileUrl: reusedDocMap['ADMISSION_PROOF']?.download_url || '#',
          fileName: admissionFile,
          fileSizeKB: reusedDocMap['ADMISSION_PROOF']?.file_size_kb || 420,
          uploadedAt: new Date().toISOString().substring(0, 10),
          ocrExtracted: true,
          status: 'VALID' as const
        }] : [])
      ],
      hasDeficiency: false,
      aiEligibilityResult: {
        overallStatus: eligibilityResult.overallStatus,
        confidenceScore: eligibilityResult.confidenceScore,
        ruleMatches: eligibilityResult.criteriaResults.map(cr => ({
          ruleId: cr.criterion.id,
          label: cr.criterion.label,
          expected: cr.criterion.value.toString(),
          actual: cr.userValue ? cr.userValue.toString() : 'Not provided',
          status: cr.passed ? 'PASS' : 'FAIL',
          evidenceSnippet: cr.reason
        }))
      },
      auditTrail: [
        {
          id: 'AUD-' + Math.random().toString(36).substring(2, 7),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          actor: fullName || 'Citizen Applicant',
          actorRole: 'APPLICANT',
          action: existingAppForScheme && existingAppForScheme.status === 'DEFICIENCY_NOTIFIED' ? 'Application Resubmitted after Deficiency Correction' : 'Online Application Submitted with e-Sign',
          previousStatus: existingAppForScheme ? existingAppForScheme.status : 'DRAFT',
          newStatus: existingAppForScheme && existingAppForScheme.status === 'DEFICIENCY_NOTIFIED' ? 'RESUBMITTED' : 'SUBMITTED',
          remarks: 'Form submitted successfully via Unified MoTA Portal.'
        }
      ]
    };

    let finalAppId = targetAppId;
    if (existingAppForScheme && existingAppForScheme.status === 'DEFICIENCY_NOTIFIED') {
      try {
        const updatePayload = {
          scheme_id: newAppRecord.schemeCode || newAppRecord.schemeId,
          personal_details: {
            full_name: newAppRecord.applicant.fullName,
            father_or_husband_name: newAppRecord.applicant.fatherOrHusbandName,
            gender: newAppRecord.applicant.gender,
            dob: newAppRecord.applicant.dob,
            aadhaar_masked: newAppRecord.applicant.aadhaarNumberMasked,
            category: newAppRecord.applicant.category,
            tribe_community: newAppRecord.applicant.tribeCommunity,
            mobile: newAppRecord.applicant.mobile,
            email: newAppRecord.applicant.email,
            state: newAppRecord.applicant.state,
            district: newAppRecord.applicant.district,
            pincode: newAppRecord.applicant.pincode,
          },
          academic_details: {
            current_course: newAppRecord.academic.currentCourse,
            institution_name: newAppRecord.academic.institutionName,
            institution_state: newAppRecord.academic.institutionState,
            aishe_code: newAppRecord.academic.aisheCode,
            roll_number: newAppRecord.academic.rollNumber,
            year_of_study: newAppRecord.academic.yearOfStudy,
            previous_exam_name: newAppRecord.academic.previousExamName,
            previous_exam_percentage: newAppRecord.academic.previousExamPercentage,
            passing_year: newAppRecord.academic.passingYear,
            board_or_university: newAppRecord.academic.boardOrUniversity,
          },
          financial_details: {
            annual_family_income: newAppRecord.annualFamilyIncome,
            bank_name: newAppRecord.bank.bankName,
            account_holder_name: newAppRecord.bank.accountHolderName,
            account_number_masked: newAppRecord.bank.accountNumberMasked,
            ifsc_code: newAppRecord.bank.ifscCode,
            branch_name: newAppRecord.bank.branchName,
            is_aadhaar_seeded: newAppRecord.bank.isAadhaarSeeded,
          },
          documents: (newAppRecord.documents || []).map((d) => ({
            id: d.id,
            document_code: d.documentCode,
            document_name: d.documentName,
            file_name: d.fileName,
            file_url: d.fileUrl,
            file_size_kb: d.fileSizeKB,
            status: d.status,
          })),
          status: 'RESUBMITTED',
        };
        await api.updateApplication(existingAppForScheme.id, updatePayload);
        finalAppId = existingAppForScheme.id;
      } catch (err: any) {
        console.warn('Failed to update application on server:', err);
      }
    } else {
      const persistedApp = await addApplication(newAppRecord);
      finalAppId = persistedApp?.id || targetAppId;
    }

    setNewGeneratedAppId(finalAppId);

    // Upload real files to MongoDB Atlas & Storage (or reuse existing)
    const filesToUpload: { type: string; file: File; name: string }[] = [];
    if (stCertFileObj) filesToUpload.push({ type: 'ST_CERTIFICATE', file: stCertFileObj, name: stCertFile });
    if (incCertFileObj) filesToUpload.push({ type: 'INCOME_CERTIFICATE', file: incCertFileObj, name: incCertFile });
    if (marksheetFileObj) filesToUpload.push({ type: 'MARKSHEET', file: marksheetFileObj, name: marksheetFile });
    if (admissionFileObj) filesToUpload.push({ type: 'ADMISSION_PROOF', file: admissionFileObj, name: admissionFile });

    for (const item of filesToUpload) {
      try {
        await api.uploadDocument(finalAppId, item.type, item.file);
      } catch (err: any) {
        console.warn(`Document upload error for ${item.name}:`, err.message);
      }
    }

    setIsSubmitting(false);
    setIsSubmittedSuccess(true);
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const payload: any = {
        application_id: draftAppId || undefined,
        scheme_id: selectedScheme.id,
        current_step: currentStep,
        personal_details: {
          full_name: fullName.trim() || undefined,
          father_or_husband_name: fatherName.trim() || undefined,
          gender: gender || 'FEMALE',
          dob: dob || undefined,
          aadhaar_masked: maskedAadhaar || undefined,
          category: category || 'ST',
          tribe_community: tribeCommunity.trim() || undefined,
          mobile: mobile.trim() || undefined,
          email: email.trim() || currentUser?.email || undefined,
          state: state.trim() || undefined,
          district: district.trim() || undefined,
          pincode: pincode.trim() || undefined,
        },
        academic_details: {
          current_course: currentCourse.trim() || undefined,
          institution_name: institutionName.trim() || undefined,
          institution_state: institutionState.trim() || undefined,
          aishe_code: aisheCode.trim() || undefined,
          roll_number: rollNumber.trim() || undefined,
          year_of_study: yearOfStudy.trim() || undefined,
          previous_exam_name: previousExamName.trim() || undefined,
          previous_exam_percentage: previousExamPercentage !== '' ? Number(previousExamPercentage) : undefined,
          passing_year: passingYear.trim() || undefined,
          board_or_university: boardOrUniversity.trim() || undefined,
        },
        financial_details: {
          annual_family_income: annualFamilyIncome !== '' ? Number(annualFamilyIncome) : 0,
          bank_name: bankName.trim() || undefined,
          account_holder_name: accountHolderName.trim() || fullName.trim() || undefined,
          account_number_masked: accountNumber ? 'XXXXXXXX' + accountNumber.slice(-4) : undefined,
          ifsc_code: ifscCode.trim() || undefined,
          branch_name: branchName.trim() || undefined,
          is_aadhaar_seeded: isAadhaarSeeded,
        },
        documents: [
          ...(stCertFile ? [{
            id: reusedDocMap['ST_CERTIFICATE']?.document_id || 'DOC-ST-01',
            document_code: 'ST_CERTIFICATE',
            document_name: 'ST Community Certificate',
            file_name: stCertFile,
            file_url: reusedDocMap['ST_CERTIFICATE']?.download_url || '#',
            file_size_kb: reusedDocMap['ST_CERTIFICATE']?.file_size_kb || 340,
            status: 'PENDING'
          }] : []),
          ...(incCertFile ? [{
            id: reusedDocMap['INCOME_CERTIFICATE']?.document_id || 'DOC-INC-01',
            document_code: 'INCOME_CERTIFICATE',
            document_name: 'Income Certificate',
            file_name: incCertFile,
            file_url: reusedDocMap['INCOME_CERTIFICATE']?.download_url || '#',
            file_size_kb: reusedDocMap['INCOME_CERTIFICATE']?.file_size_kb || 290,
            status: 'PENDING'
          }] : []),
          ...(marksheetFile ? [{
            id: reusedDocMap['MARKSHEET']?.document_id || 'DOC-MARK-01',
            document_code: 'MARKSHEET',
            document_name: 'Previous Exam Marksheet',
            file_name: marksheetFile,
            file_url: reusedDocMap['MARKSHEET']?.download_url || '#',
            file_size_kb: reusedDocMap['MARKSHEET']?.file_size_kb || 580,
            status: 'PENDING'
          }] : []),
          ...(admissionFile ? [{
            id: reusedDocMap['ADMISSION_PROOF']?.document_id || 'DOC-ADM-01',
            document_code: 'ADMISSION_PROOF',
            document_name: 'University Admission Letter',
            file_name: admissionFile,
            file_url: reusedDocMap['ADMISSION_PROOF']?.download_url || '#',
            file_size_kb: reusedDocMap['ADMISSION_PROOF']?.file_size_kb || 420,
            status: 'PENDING'
          }] : [])
        ]
      };

      const savedApp = await saveDraft(payload);
      setDraftAppId(savedApp.id);
      setIsSavedDraft(true);
      setDraftSaveMsg(`Draft saved to MongoDB Atlas (${savedApp.id}) at Step ${currentStep}`);
      setTimeout(() => setIsSavedDraft(false), 3500);
    } catch (err: any) {
      alert(`Could not save draft: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const existingAppForSchemeLockCheck = applications.find(
    (a) =>
      a.schemeId === selectedScheme.id &&
      (a.applicant.id === currentUser?.id ||
        (currentUser?.email && a.applicant.email?.toLowerCase() === currentUser.email.toLowerCase()))
  );

  const isLocked = existingAppForSchemeLockCheck && !['DRAFT', 'DEFICIENCY_NOTIFIED'].includes(existingAppForSchemeLockCheck.status);
  
  const windowStatus = getSchemeWindowStatus(selectedScheme);

  // Application creation guard: block UI completely if it's a new application and window is closed
  if (!existingAppForSchemeLockCheck && !windowStatus.isOpen && !isSubmittedSuccess) {
    return (
      <div className="bg-white p-8 rounded border border-slate-300 shadow-md text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <XCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-[#0b2853]">
          {windowStatus.state === 'NOT_STARTED' ? 'Applications Not Yet Open' : 'Applications Closed'}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
          {windowStatus.message}
        </p>
        <div className="pt-4">
          <button
            onClick={() => navigate('/schemes')}
            className="px-5 py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white font-bold text-xs rounded shadow flex items-center gap-1.5 mx-auto"
          >
            <span>Browse Schemes</span>
          </button>
        </div>
      </div>
    );
  }

  if (isLocked && !isSubmittedSuccess) {
    return (
      <div className="bg-white p-8 rounded border border-slate-300 shadow-md text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
          <Eye className="w-10 h-10" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-blue-800 block">
          Application Submitted
        </span>
        <h2 className="text-2xl font-black text-[#0b2853]">
          Application Locked
        </h2>
        <div className="bg-slate-50 border border-slate-200 p-4 rounded text-xs space-y-1">
          <div className="text-slate-500">Your Application Reference ID:</div>
          <div className="text-xl font-mono font-black text-blue-900 tracking-wider">
            {existingAppForSchemeLockCheck.id}
          </div>
          <div className="text-slate-600 font-medium">Scheme: {existingAppForSchemeLockCheck.schemeName}</div>
          <div className="text-slate-600 font-medium">Status: {existingAppForSchemeLockCheck.status.replace(/_/g, ' ')}</div>
          <div className="text-slate-600 font-medium">Submitted On: {existingAppForSchemeLockCheck.submissionDate}</div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Your application has been submitted successfully and is now under review. You cannot edit your application at this stage. If any deficiencies are found, the Admin will notify you and unlock the application for correction.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <button
            onClick={() => navigate('/applicant/dashboard')}
            className="px-5 py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white font-bold text-xs rounded shadow flex items-center gap-1.5"
          >
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  if (isSubmittedSuccess) {
    return (
      <div className="bg-white p-8 rounded border border-slate-300 shadow-md text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <span className="text-xs font-bold uppercase tracking-widest text-emerald-800 block">
          Government of India • Ministry of Tribal Affairs
        </span>

        <h2 className="text-2xl font-black text-[#0b2853]">
          Application Submitted Successfully!
        </h2>

        <div className="bg-slate-50 border border-slate-200 p-4 rounded text-xs space-y-1">
          <div className="text-slate-500">Your Permanent Application Reference ID:</div>
          <div className="text-xl font-mono font-black text-blue-900 tracking-wider">
            {newGeneratedAppId}
          </div>
          <div className="text-slate-600 font-medium">Scheme: {selectedScheme.name}</div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Your application has been registered with Aadhaar e-Sign authentication. The AI Document Verification service will cross-check your uploaded certificates within 24 hours.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <button
            onClick={() => navigate('/applicant/status')}
            className="px-5 py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white font-bold text-xs rounded shadow flex items-center gap-1.5"
          >
            <span>Track Application Status</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => navigate('/applicant/dashboard')}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded border border-slate-300"
          >
            Go to Applicant Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wizard Header */}
      <div className="bg-white p-5 rounded border border-slate-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
            Single Platform • Every Scheme
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0b2853] tracking-tight">
            Apply for Scholarship / Fellowship
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Target Scheme: <strong className="text-blue-900">{selectedScheme.name}</strong> ({selectedScheme.code})
          </p>
        </div>

        {/* Save Draft button */}
        <div className="flex items-center gap-2">
          {isSavedDraft && (
            <span className="text-xs text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded border border-emerald-300 animate-pulse flex items-center gap-1.5 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{draftSaveMsg || 'Draft Saved to MongoDB Atlas (tsfms)'}</span>
            </span>
          )}
          <button
            type="button"
            disabled={isSavingDraft}
            onClick={handleSaveDraft}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${isSavingDraft ? 'animate-spin text-blue-700' : 'text-slate-500'}`} />
            <span>{isSavingDraft ? 'Saving to Database...' : 'Save as Draft'}</span>
          </button>
        </div>
      </div>

      {/* Resumed Draft Notification Banner */}
      {restoredFromDraft && draftAppId && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-blue-900 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-blue-700 text-white font-mono px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">
              RESUMED DRAFT
            </span>
            <span>
              Resumed draft application <strong className="font-mono">{draftAppId}</strong> at <strong>Step {currentStep}: {steps[currentStep - 1]?.label}</strong>.
            </span>
          </div>
          <span className="text-blue-700 text-[11px] font-medium">
            Saved in MongoDB Atlas (<code className="font-bold">tsfms.applications</code>)
          </span>
        </div>
      )}

      {/* Step Progress Bar */}
      <div className="bg-white p-4 rounded border border-slate-300 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between min-w-[720px] relative">
          {/* Connector line */}
          <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0"></div>

          {steps.map((step) => {
            const isDone = currentStep > step.num;
            const isCurrent = currentStep === step.num;

            return (
              <div
                key={step.num}
                onClick={() => setCurrentStep(step.num)}
                className="flex flex-col items-center cursor-pointer group relative z-10"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    isCurrent
                      ? 'bg-[#0b2853] text-white ring-4 ring-blue-100 shadow'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500 border border-slate-300 group-hover:bg-slate-200'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : step.num}
                </div>
                <span
                  className={`text-[11px] mt-1.5 font-semibold text-center whitespace-nowrap ${
                    isCurrent ? 'text-blue-950 font-bold' : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Form Container */}
      <div className="bg-white p-6 rounded border border-slate-300 shadow-sm text-xs space-y-4">
        {/* Top Global Explainable Validation Summary Banner (Part 16) */}
        {allIssues.length > 0 && (
          <div className="mb-4">
            <ValidationSummaryBanner
              issues={allIssues}
              onSelectIssue={handleJumpToIssue}
            />
          </div>
        )}

        {/* STEP 1: PROFILE */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-[#0b2853]">
                Step 1: Applicant Profile & Identity Verification
              </h2>
              <p className="text-slate-500 text-[11px]">
                {hasSavedProfile
                  ? 'Your verified permanent applicant profile has been auto-filled.'
                  : 'Complete your first-time applicant profile. This information will be securely saved for all future scholarship applications.'}
              </p>
            </div>

            {hasSavedProfile ? (
              <div className="bg-emerald-50 border border-emerald-300 p-3 rounded flex items-center gap-2.5 text-emerald-950">
                <ShieldCheck className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                <div>
                  <span className="font-bold block text-xs">Saved & Verified Applicant Profile Auto-Filled</span>
                  <span className="text-[11px] text-emerald-800">
                    Common identity information is pre-filled from your official profile. You do not need to retype personal information.
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded flex items-center gap-2.5 text-blue-950">
                <FileText className="w-5 h-5 text-blue-700 flex-shrink-0" />
                <div>
                  <span className="font-bold block text-xs">First-Time Application: Create Applicant Profile</span>
                  <span className="text-[11px] text-blue-800">
                    Enter your 12-digit Aadhaar and demographic information. This will be verified and saved permanently for future applications.
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div id="field-fullName">
                <label className="block font-bold text-slate-700 mb-1">Full Name (as per Aadhaar):</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (formFieldIssues['fullName'] && e.target.value.trim()) {
                      setFormFieldIssues((prev) => ({ ...prev, fullName: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('fullName', 'Full Name', fullName, 1, 'Please enter your full name as per Aadhaar.')}
                  placeholder="Enter full name"
                  className={`w-full p-2 bg-white border rounded font-semibold text-slate-900 ${
                    formFieldIssues['fullName'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                  required
                />
                {formFieldIssues['fullName'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['fullName']}
                      onActionClick={() => document.getElementById('field-fullName')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div id="field-fatherName">
                <label className="block font-bold text-slate-700 mb-1">Father's / Husband's Name:</label>
                <input
                  type="text"
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="Enter parent/guardian name"
                  className="w-full p-2 bg-white border border-slate-300 rounded"
                />
              </div>

              <div id="field-gender">
                <label className="block font-bold text-slate-700 mb-1">Gender:</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full p-2 bg-white border border-slate-300 rounded font-medium"
                >
                  <option value="">-- Select Gender --</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="TRANSGENDER">Transgender</option>
                </select>
              </div>

              <div id="field-dob">
                <label className="block font-bold text-slate-700 mb-1">Date of Birth (YYYY-MM-DD):</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => {
                    setDob(e.target.value);
                    if (formFieldIssues['dob'] && e.target.value) {
                      setFormFieldIssues((prev) => ({ ...prev, dob: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('dob', 'Date of Birth', dob, 1, 'Please enter your date of birth before continuing.')}
                  className={`w-full p-2 bg-white border rounded font-medium ${
                    formFieldIssues['dob'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                  required
                />
                {formFieldIssues['dob'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['dob']}
                      onActionClick={() => document.getElementById('field-dob')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              {hasSavedProfile ? (
                <div id="field-aadhaar">
                  <label className="block font-bold text-slate-700 mb-1">Aadhaar Number (Verified & Masked):</label>
                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      value={maskedAadhaar}
                      className="w-full p-2 bg-slate-100 border border-emerald-300 rounded font-mono font-bold text-emerald-900"
                    />
                    <ShieldCheck className="w-4 h-4 text-emerald-600 absolute right-2.5 top-2.5" />
                  </div>
                </div>
              ) : (
                <div id="field-aadhaar">
                  <label className="block font-bold text-slate-700 mb-1">12-Digit Aadhaar Number:</label>
                  <input
                    type="text"
                    maxLength={12}
                    placeholder="Enter 12 digits (Verhoeff Check)"
                    value={rawAadhaarInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setRawAadhaarInput(val);
                      if (formFieldIssues['aadhaar'] && val.length === 12) {
                        setFormFieldIssues((prev) => ({ ...prev, aadhaar: null }));
                      }
                    }}
                    onBlur={() => {
                      if (!rawAadhaarInput || rawAadhaarInput.length !== 12) {
                        setFormFieldIssues((prev) => ({
                          ...prev,
                          aadhaar: {
                            status: 'ERROR',
                            category: 'FIELD_REQUIRED',
                            field_id: 'aadhaar',
                            step: 1,
                            what_is_wrong: '12-Digit Aadhaar Required',
                            why_is_wrong: 'A complete 12-digit Aadhaar number is required for statutory identity verification.',
                            expected: '12-digit Aadhaar number',
                            provided: rawAadhaarInput ? `${rawAadhaarInput.length} digits` : 'Empty',
                            action: 'Please enter your 12-digit Aadhaar number.',
                            summary: 'Aadhaar number must contain 12 digits.'
                          }
                        }));
                      } else {
                        setFormFieldIssues((prev) => ({ ...prev, aadhaar: null }));
                      }
                    }}
                    className={`w-full p-2 bg-white border rounded font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-700 ${
                      formFieldIssues['aadhaar'] ? 'border-red-400 bg-red-50/20' : 'border-blue-400'
                    }`}
                    required
                  />
                  {formFieldIssues['aadhaar'] && (
                    <div className="mt-1.5">
                      <ExplainableErrorCard
                        issue={formFieldIssues['aadhaar']}
                        onActionClick={() => document.getElementById('field-aadhaar')?.querySelector('input')?.focus()}
                      />
                    </div>
                  )}
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Validated via statutory Verhoeff checksum. Stored as encrypted hash.
                  </span>
                </div>
              )}

              <div id="field-category">
                <label className="block font-bold text-slate-700 mb-1">Category:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full p-2 bg-white border border-slate-300 rounded font-bold text-blue-900"
                >
                  <option value="ST">Scheduled Tribe (ST)</option>
                  <option value="PVTG">Particularly Vulnerable Tribal Group (PVTG)</option>
                </select>
              </div>

              <div id="field-tribeCommunity">
                <label className="block font-bold text-slate-700 mb-1">Tribe / Sub-Caste Community:</label>
                <input
                  type="text"
                  value={tribeCommunity}
                  onChange={(e) => {
                    setTribeCommunity(e.target.value);
                    if (formFieldIssues['tribeCommunity'] && e.target.value.trim()) {
                      setFormFieldIssues((prev) => ({ ...prev, tribeCommunity: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('tribeCommunity', 'Tribe / Community', tribeCommunity, 1, 'Please specify your Tribe or Community.')}
                  placeholder="e.g. Santhal, Gond, Bhil, Oraon"
                  className={`w-full p-2 bg-white border rounded font-medium ${
                    formFieldIssues['tribeCommunity'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                  required
                />
                {formFieldIssues['tribeCommunity'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['tribeCommunity']}
                      onActionClick={() => document.getElementById('field-tribeCommunity')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div id="field-mobile">
                <label className="block font-bold text-slate-700 mb-1">Mobile Number (10 digits):</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  onBlur={() => handlePhoneChange(mobile)}
                  placeholder="10-digit Indian mobile"
                  className={`w-full p-2 bg-white border rounded font-mono font-bold ${
                    formFieldIssues['mobile'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                  required
                />
                {formFieldIssues['mobile'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['mobile']}
                      onActionClick={() => document.getElementById('field-mobile')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div id="field-email">
                <label className="block font-bold text-slate-700 mb-1">Email ID:</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formFieldIssues['email']) {
                      setFormFieldIssues((prev) => ({ ...prev, email: null }));
                    }
                  }}
                  onBlur={handleEmailBlur}
                  placeholder="example@gmail.com"
                  className={`w-full p-2 bg-white border rounded ${
                    formFieldIssues['email'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                />
                {formFieldIssues['email'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['email']}
                      onActionClick={() => document.getElementById('field-email')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div id="field-state">
                <label className="block font-bold text-slate-700 mb-1">Domicile State:</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    if (formFieldIssues['state'] && e.target.value.trim()) {
                      setFormFieldIssues((prev) => ({ ...prev, state: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('state', 'Domicile State', state, 1, 'Please enter your domicile state.')}
                  className={`w-full p-2 bg-white border rounded ${
                    formFieldIssues['state'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                />
                {formFieldIssues['state'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['state']}
                      onActionClick={() => document.getElementById('field-state')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div id="field-district">
                <label className="block font-bold text-slate-700 mb-1">District:</label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    if (formFieldIssues['district'] && e.target.value.trim()) {
                      setFormFieldIssues((prev) => ({ ...prev, district: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('district', 'District', district, 1, 'Please enter your district.')}
                  className={`w-full p-2 bg-white border rounded ${
                    formFieldIssues['district'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                />
                {formFieldIssues['district'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['district']}
                      onActionClick={() => document.getElementById('field-district')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div id="field-pincode">
                <label className="block font-bold text-slate-700 mb-1">Pincode:</label>
                <input
                  type="text"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => {
                    setPincode(e.target.value);
                    if (formFieldIssues['pincode'] && e.target.value.trim()) {
                      setFormFieldIssues((prev) => ({ ...prev, pincode: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('pincode', 'Pincode', pincode, 1, 'Please enter a valid 6-digit pincode.')}
                  className={`w-full p-2 bg-white border rounded font-mono ${
                    formFieldIssues['pincode'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                />
                {formFieldIssues['pincode'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['pincode']}
                      onActionClick={() => document.getElementById('field-pincode')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: ELIGIBILITY & SCHEME SELECT */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-[#0b2853]">
                Step 2: Target Scheme & Eligibility Parameters
              </h2>
              <p className="text-slate-500 text-[11px]">
                Select the scheme you wish to apply for and declare statutory parameters.
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                Selected MoTA Scheme:
              </label>
              <select
                value={selectedSchemeId}
                onChange={(e) => setSelectedSchemeId(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded font-bold text-blue-900 text-xs sm:text-sm"
              >
                {schemes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* DUPLICATE APPLICATION CHECK & WARNING */}
            {(() => {
              const dupApp = applications.find(
                (a) =>
                  (a.schemeId === selectedSchemeId || a.schemeCode === selectedSchemeId) &&
                  a.status !== 'REJECTED' &&
                  a.status !== 'DRAFT'
              );
              if (!dupApp) return null;
              return (
                <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-xs font-black uppercase text-amber-950 tracking-wider">
                        You already have an application for this scheme.
                      </h4>
                      <p className="text-xs text-amber-900 mt-1">
                        Applicants cannot submit duplicate active applications for the same scheme. You can view your current application status or select a different scheme.
                      </p>
                      <div className="mt-2.5 font-mono text-xs text-slate-800 space-y-1 bg-white/90 p-2.5 rounded border border-amber-200">
                        <div>
                          <span className="text-slate-500 font-sans">Application ID:</span>{' '}
                          <strong className="font-bold text-slate-900">{dupApp.id}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 font-sans">Current Status:</span>{' '}
                          <strong className="font-bold text-amber-900">{dupApp.status}</strong>
                        </div>
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => navigate('/applicant/dashboard')}
                          className="px-3.5 py-1.5 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow-sm inline-flex items-center gap-1.5"
                        >
                          <span>View Application</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Annual Family Income (from all sources in INR):
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    value={annualFamilyIncome}
                    onChange={(e) => setAnnualFamilyIncome(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Enter annual income"
                    className="w-full pl-6 p-2 bg-white border border-slate-300 rounded font-bold"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Ceiling for this scheme: {selectedScheme.annualIncomeCap === 0 ? 'No Upper Limit' : `₹${selectedScheme.annualIncomeCap.toLocaleString('en-IN')} / year`}
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Applicant Age (as on 1st April 2025):
                </label>
                <input
                  type="number"
                  value={applicantAge}
                  onChange={(e) => setApplicantAge(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Enter age"
                  className="w-full p-2 bg-white border border-slate-300 rounded font-bold"
                />
              </div>
            </div>

            {/* Configured Criteria Preview */}
            <div className="bg-blue-50 border border-blue-200 p-3.5 rounded">
              <span className="font-bold text-blue-950 block mb-1">
                Scheme Rules Evaluated for {selectedScheme.shortName}:
              </span>
              <ul className="list-disc pl-4 space-y-1 text-blue-900 text-[11px]">
                {selectedScheme.eligibilityRules.map((rule) => (
                  <li key={rule.id}>
                    <strong>{rule.label}:</strong> {rule.explanation}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* STEP 3: ACADEMIC DETAILS */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-[#0b2853]">
                Step 3: Academic & Institutional Enrolment Details
              </h2>
              <p className="text-slate-500 text-[11px]">
                Enter your present course of study, university AISHE code, and previous qualifying exam credentials.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Current Course / Degree:</label>
                <input
                  type="text"
                  value={currentCourse}
                  onChange={(e) => setCurrentCourse(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Institution / University Name:</label>
                <input
                  type="text"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">AISHE Code / Institution Code:</label>
                <input
                  type="text"
                  value={aisheCode}
                  onChange={(e) => setAisheCode(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Roll / Enrolment Number:</label>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Current Year / Semester:</label>
                <input
                  type="text"
                  value={yearOfStudy}
                  onChange={(e) => setYearOfStudy(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Previous Exam / Degree Passed:</label>
                <input
                  type="text"
                  value={previousExamName}
                  onChange={(e) => setPreviousExamName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Previous Qualifying Marks (%):</label>
                <input
                  type="number"
                  step="0.1"
                  value={previousExamPercentage}
                  onChange={(e) => setPreviousExamPercentage(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Enter percentage"
                  className="w-full p-2 bg-white border border-slate-300 rounded font-bold text-blue-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Year of Passing:</label>
                <input
                  type="text"
                  value={passingYear}
                  onChange={(e) => setPassingYear(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Board / University:</label>
                <input
                  type="text"
                  value={boardOrUniversity}
                  onChange={(e) => setBoardOrUniversity(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: BANK DETAILS (PFMS DBT) */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-[#0b2853]">
                Step 4: Bank Account & PFMS DBT Seeding
              </h2>
              <p className="text-slate-500 text-[11px]">
                Scholarship allowance will be transferred directly to this account via the Aadhaar Payment Bridge (APB).
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-300 p-3.5 rounded flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <div>
                  <span className="font-bold text-emerald-950 block">
                    PFMS & NPCI Mapper Validation Active
                  </span>
                  <span className="text-[11px] text-emerald-800">
                    Aadhaar Number is verified as active on National Payment Corporation of India (NPCI) gateway.
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-bold text-[10px] uppercase">
                Aadhaar Seeded
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Holder Name (as per Bank):</label>
                <input
                  type="text"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bank Name:</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded"
                />
              </div>

              <div id="field-accountNumber">
                <label className="block font-bold text-slate-700 mb-1">Bank Account Number:</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => {
                    setAccountNumber(e.target.value);
                    if (formFieldIssues['accountNumber'] && e.target.value.trim()) {
                      setFormFieldIssues((prev) => ({ ...prev, accountNumber: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('accountNumber', 'Bank Account Number', accountNumber, 4, 'Please enter your bank account number.')}
                  placeholder="Enter bank account number"
                  className={`w-full p-2 bg-white border rounded font-mono font-bold ${
                    formFieldIssues['accountNumber'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                  required
                />
                {formFieldIssues['accountNumber'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['accountNumber']}
                      onActionClick={() => document.getElementById('field-accountNumber')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div id="field-ifscCode">
                <label className="block font-bold text-slate-700 mb-1">IFSC Code:</label>
                <input
                  type="text"
                  maxLength={11}
                  value={ifscCode}
                  onChange={(e) => {
                    setIfscCode(e.target.value.toUpperCase());
                    if (formFieldIssues['ifscCode'] && e.target.value.trim()) {
                      setFormFieldIssues((prev) => ({ ...prev, ifscCode: null }));
                    }
                  }}
                  onBlur={() => handleFieldBlur('ifscCode', 'IFSC Code', ifscCode, 4, 'Please enter a valid 11-character IFSC code.')}
                  placeholder="e.g. SBIN0001234"
                  className={`w-full p-2 bg-white border rounded font-mono font-bold uppercase ${
                    formFieldIssues['ifscCode'] ? 'border-red-400 bg-red-50/20 ring-1 ring-red-300' : 'border-slate-300'
                  }`}
                  required
                />
                {formFieldIssues['ifscCode'] && (
                  <div className="mt-1.5">
                    <ExplainableErrorCard
                      issue={formFieldIssues['ifscCode']}
                      onActionClick={() => document.getElementById('field-ifscCode')?.querySelector('input')?.focus()}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Branch Name:</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: DOCUMENTS & DIGILOCKER */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#0b2853]">
                  Step 5: Enclosure of Mandatory Certificates
                </h2>
                <p className="text-slate-500 text-[11px]">
                  Upload legible PDF/JPG scans or pull verified certificates instantly from DigiLocker.
                </p>
              </div>

              {/* DigiLocker Sync Button */}
              <button
                type="button"
                onClick={handlePullDigiLocker}
                disabled={isPullingDigiLocker}
                className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{isPullingDigiLocker ? 'Connecting DigiLocker...' : 'Fetch via DigiLocker'}</span>
              </button>
            </div>

            {isDigiLockerLinked && (
              <div className="bg-cyan-50 border border-cyan-300 p-3 rounded text-cyan-950 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-700" />
                <span>DigiLocker digital certificate pulled with cryptographic PKI verification.</span>
              </div>
            )}

            {/* Reusable Documents Alert Banner */}
            {reusableDocs.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-300 p-3 rounded flex items-center justify-between gap-3 text-emerald-950">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                  <div>
                    <span className="font-bold text-xs block">
                      {reusableDocs.length} Verified Certificates Available for Instant Reuse
                    </span>
                    <span className="text-[11px] text-emerald-800">
                      Stable certificates uploaded in your previous application can be reused without re-scanning.
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 font-bold text-[10px] rounded uppercase">
                  Vault Synced
                </span>
              </div>
            )}

            {/* Dynamic Scheme Document Slots (Parts 1-10, 15, 17, 22) */}
            <div className="space-y-4">
              {schemeRequiredDocs.map((reqDoc: any, idx: number) => {
                const slot = docSlots[reqDoc.code];
                const legacyName =
                  reqDoc.code === 'ST_CERTIFICATE' ? stCertFile :
                  reqDoc.code === 'INCOME_CERTIFICATE' ? incCertFile :
                  reqDoc.code === 'MARKSHEET' ? marksheetFile :
                  reqDoc.code === 'ADMISSION_PROOF' ? admissionFile : '';
                const activeFileName = slot?.fileName || legacyName || reusedDocMap[reqDoc.code]?.file_name || '';
                const hasReused = Boolean(reusedDocMap[reqDoc.code] && !slot?.file);

                return (
                  <div
                    key={reqDoc.code}
                    id={`doc-slot-${reqDoc.code}`}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span>{idx + 1}. {reqDoc.name}</span>
                          {reqDoc.required && (
                            <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                              Mandatory
                            </span>
                          )}
                        </div>
                        {reqDoc.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{reqDoc.description}</p>
                        )}
                        <div className="text-[11px] font-mono mt-1">
                          {activeFileName ? (
                            <span className="text-slate-800">
                              Current file: <strong>{activeFileName}</strong>
                            </span>
                          ) : (
                            <span className="text-amber-700 italic">No document selected yet</span>
                          )}
                        </div>
                        {hasReused && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Reusing verified certificate from previous application
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {slot?.explainableIssue ? (
                          <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded border border-red-300 animate-pulse">
                            {slot.explainableIssue.what_is_wrong}
                          </span>
                        ) : slot?.status === 'TYPE_MATCH' ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-300">
                            VERIFIED MATCH
                          </span>
                        ) : slot?.status === 'READING' || slot?.status === 'CHECKING' ? (
                          <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-300 animate-pulse">
                            VERIFYING...
                          </span>
                        ) : slot?.status === 'MANUAL_REVIEW' ? (
                          <span className="text-[10px] bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded border border-slate-300">
                            MANUAL REVIEW
                          </span>
                        ) : activeFileName ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                            UPLOADED
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">
                            PENDING UPLOAD
                          </span>
                        )}

                        <label className="cursor-pointer px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded font-semibold text-slate-700 flex items-center gap-1 text-xs shadow-xs">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{activeFileName ? 'Change File' : 'Upload File'}</span>
                          <input
                            id={`file-input-${reqDoc.code}`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.docx"
                            className="sr-only"
                            onChange={(e) => handleSelectDocument(e, reqDoc.code)}
                          />
                        </label>
                      </div>
                    </div>

                    {/* SECTION 7, 8, 9: DOCUMENT REUSE, REPLACEMENT & VALIDITY */}
                    {(() => {
                      const existingDoc = reusableDocs.find((d) => d.document_type === reqDoc.code);
                      if (!existingDoc) return null;

                      if (existingDoc.is_reusable !== false) {
                        return (
                          <div className="bg-emerald-50/70 border border-emerald-300 rounded p-3 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                  <span>Existing document found: {reqDoc.name}</span>
                                </div>
                                <p className="text-[11px] text-emerald-800 mt-0.5 font-mono">
                                  File: <strong>{existingDoc.file_name}</strong> • Uploaded: {existingDoc.uploaded_at} • Verification Status: <strong className="text-emerald-700">{existingDoc.verification_status || 'VERIFIED'}</strong>
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReusedDocMap((prev) => ({ ...prev, [reqDoc.code]: existingDoc }));
                                    setDocSlots((prev) => ({
                                      ...prev,
                                      [reqDoc.code]: {
                                        file: null,
                                        fileName: existingDoc.file_name,
                                        status: 'TYPE_MATCH',
                                        detectedType: reqDoc.name,
                                        requiredType: reqDoc.code,
                                        message: `Linked verified existing document (v${existingDoc.version || 1})`,
                                        explainableIssue: null,
                                      },
                                    }));
                                  }}
                                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all shadow-xs ${
                                    hasReused
                                      ? 'bg-emerald-700 text-white'
                                      : 'bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  }`}
                                >
                                  {hasReused ? '✓ Using Existing' : 'Use Existing'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    document.getElementById(`file-input-${reqDoc.code}`)?.click();
                                  }}
                                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-semibold shadow-xs"
                                >
                                  Replace
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="bg-rose-50 border border-rose-300 rounded p-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                              <div className="space-y-1 flex-1">
                                <div className="text-xs font-bold text-rose-950">
                                  Existing {reqDoc.name} cannot be reused.
                                </div>
                                <div className="text-[11px] text-rose-900 whitespace-pre-line bg-white/80 p-2 rounded border border-rose-200 font-mono">
                                  {existingDoc.ineligibility_reason || 'Certificate does not satisfy validity criteria for this scheme.'}
                                </div>
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`file-input-${reqDoc.code}`)?.click()}
                                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded text-xs font-bold shadow-xs inline-flex items-center gap-1.5"
                                  >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Upload New Document</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })()}

                    {/* Inline Explainable Error Card directly under this slot */}
                    {slot?.explainableIssue ? (
                      <ExplainableErrorCard
                        issue={slot.explainableIssue}
                        onReplace={() => document.getElementById(`file-input-${reqDoc.code}`)?.click()}
                        onRemove={() => handleRemoveDocument(reqDoc.code)}
                      />
                    ) : slot?.status === 'TYPE_MATCH' ? (
                      <div className="p-2.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-0.5 flex-1">
                          <div className="font-bold">
                            Verified Document Type: {slot.detectedType || reqDoc.name}
                          </div>
                          <p className="text-[11px] text-emerald-800">{slot.message}</p>
                          {slot.extractedFields && Object.keys(slot.extractedFields).length > 0 && (
                            <div className="text-[10px] font-mono text-emerald-900 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                              {slot.extractedFields.certificate_number && (
                                <span>Cert/Reg No: <strong>{slot.extractedFields.certificate_number}</strong></span>
                              )}
                              {slot.extractedFields.annual_income && (
                                <span>Income: <strong>₹{Number(slot.extractedFields.annual_income).toLocaleString('en-IN')}</strong></span>
                              )}
                              {slot.extractedFields.community && (
                                <span>Community: <strong>{slot.extractedFields.community}</strong></span>
                              )}
                              {slot.extractedFields.issuing_authority && (
                                <span>Authority: <strong>{slot.extractedFields.issuing_authority}</strong></span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : slot?.status === 'READING' || slot?.status === 'CHECKING' ? (
                      <div className="p-2.5 rounded bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2 animate-pulse">
                        <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <span className="font-semibold">{slot.message || 'Extracting text and verifying document...'}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 6: AI PRE-CHECK & OCR EXTRACTION INSPECTION */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-bold text-[#0b2853]">
                  Step 6: AI Document Extraction & Pre-Submission Cross-Check
                </h2>
              </div>
              <p className="text-slate-500 text-[11px]">
                The system has automatically analyzed your uploaded certificates with local OCR and rule-based document validation. Review the extracted fields to ensure there are no clerical discrepancies.
              </p>
            </div>

            {/* Real OCR Verification Viewers (Dynamic per Scheme) */}
            <div className="space-y-4">
              {schemeRequiredDocs.map((reqDoc: any) => {
                const slot = docSlots[reqDoc.code];
                const legacyName =
                  reqDoc.code === 'ST_CERTIFICATE' ? stCertFile :
                  reqDoc.code === 'INCOME_CERTIFICATE' ? incCertFile :
                  reqDoc.code === 'MARKSHEET' ? marksheetFile :
                  reqDoc.code === 'ADMISSION_PROOF' ? admissionFile : '';
                const fileName = slot?.fileName || legacyName || reusedDocMap[reqDoc.code]?.file_name;
                if (!fileName) return null;

                return (
                  <DocumentOcrViewer
                    key={reqDoc.code}
                    documentType={reqDoc.code as any}
                    applicantName={fullName}
                    declaredIncome={Number(annualFamilyIncome) || 0}
                    isDeficientScenario={false}
                    fileName={fileName}
                    isLiveUpload={!!slot?.file}
                    ocrVerification={
                      slot
                        ? {
                            status: slot.status,
                            message: slot.message,
                            detectedType: slot.detectedType || undefined,
                            extractedFields: slot.extractedFields
                          }
                        : undefined
                    }
                    isOfficerMode={false}
                  />
                );
              })}
            </div>

            {/* Explainable Decision Card */}
            <div className="bg-slate-50 border border-slate-200 rounded p-4 mt-6">
              <h3 className="font-bold text-slate-800 uppercase text-xs mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                Eligibility Engine Evaluation
              </h3>
              
              <div className="space-y-2 mb-4">
                {eligibilityResult.criteriaResults.map((cr, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2">
                      {cr.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                      <span className="font-medium text-slate-700">{cr.criterion.label}</span>
                    </div>
                    <div className="text-right">
                      <div className={cr.passed ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                        {cr.passed ? 'Passed' : 'Failed'}
                      </div>
                      <div className="text-[10px] text-slate-500">{cr.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className={`p-3 rounded text-xs font-bold border ${isEligible ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                Overall Eligibility: {isEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}
                <div className="text-[11px] font-normal mt-0.5">{eligibilityResult.explanationSummary}</div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: PREVIEW */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-[#0b2853]">
                Step 7: Application Summary Preview
              </h2>
              <p className="text-slate-500 text-[11px]">
                Verify all declared parameters before signing the electronic declaration.
              </p>
            </div>

            <div className="border border-slate-300 rounded p-4 space-y-4 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 uppercase text-xs border-b border-slate-200 pb-1 mb-2">
                  1. Scheme & Personal Information
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div><span className="text-slate-500">Scheme:</span> <strong>{selectedScheme.shortName}</strong></div>
                  <div><span className="text-slate-500">Applicant:</span> <strong>{fullName || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Father:</span> <strong>{fatherName || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Gender:</span> <strong>{gender || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Category:</span> <strong>ST {tribeCommunity ? `(${tribeCommunity})` : ''}</strong></div>
                  <div><span className="text-slate-500">Aadhaar:</span> <strong>{maskedAadhaar || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Annual Income:</span> <strong>{annualFamilyIncome ? `₹${Number(annualFamilyIncome).toLocaleString('en-IN')}` : 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">State / Dist:</span> <strong>{state || district ? `${state}, ${district}` : 'Not specified'}</strong></div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-800 uppercase text-xs border-b border-slate-200 pb-1 mb-2">
                  2. Academic & Bank Details
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div><span className="text-slate-500">Course:</span> <strong>{currentCourse || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Institution:</span> <strong>{institutionName || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">AISHE Code:</span> <strong>{aisheCode || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Previous Score:</span> <strong>{previousExamPercentage ? `${previousExamPercentage}%` : 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Bank Name:</span> <strong>{bankName || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">IFSC:</span> <strong>{ifscCode || 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Account No:</span> <strong>{accountNumber ? `XXXXXXXX${accountNumber.slice(-4)}` : 'Not specified'}</strong></div>
                  <div><span className="text-slate-500">Aadhaar Seeded:</span> <strong className="text-emerald-700">Yes (NPCI Verified)</strong></div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-800 uppercase text-xs border-b border-slate-200 pb-1 mb-2">
                  3. Enclosed Documents
                </h3>
                <div className="text-[11px] space-y-1">
                  <div>✓ ST Certificate: <code>{stCertFile || 'Not uploaded'}</code></div>
                  <div>✓ Income Certificate: <code>{incCertFile || 'Not uploaded'}</code></div>
                  <div>✓ Marksheet: <code>{marksheetFile || 'Not uploaded'}</code></div>
                  <div>✓ Admission Offer: <code>{admissionFile || 'Not uploaded'}</code></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 8: SUBMIT WITH E-SIGN */}
        {currentStep === 8 && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-[#0b2853]">
                Step 8: Statutory Declaration & e-Sign Submission
              </h2>
              <p className="text-slate-500 text-[11px]">
                Electronic signing and digital submission to Ministry of Tribal Affairs Central Gateway.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-300 p-4 rounded space-y-3">
              <h4 className="font-bold text-amber-950 uppercase text-xs">
                Statutory Citizen Declaration
              </h4>
              <p className="text-slate-700 text-[11px] leading-relaxed">
                I hereby solemnly declare that all particulars stated in this online application form are true, complete, and correct to the best of my knowledge and belief. I belong to the notified Scheduled Tribe community and my family annual income does not exceed the prescribed limit. If any document is found forged or fraudulent at any stage, my scholarship shall be summarily cancelled and recovered with statutory interest under applicable laws of the Government of India.
              </p>

              <label className="flex items-start gap-2 cursor-pointer pt-2 border-t border-amber-200">
                <input
                  type="checkbox"
                  checked={eSignConsent}
                  onChange={(e) => setESignConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-blue-900 border-slate-400 rounded focus:ring-blue-800"
                />
                <span className="font-bold text-slate-900 text-xs">
                  I agree to the declaration and authorize Ministry of Tribal Affairs to verify my credentials with UIDAI Aadhaar, DigiLocker, and PFMS DBT Gateway.
                </span>
              </label>
            </div>

            {/* Strict Verification Submission Gate UI */}
            <div className={`p-4 rounded border ${canSubmit ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'}`}>
              <h3 className={`font-bold text-sm mb-3 flex items-center gap-2 ${canSubmit ? 'text-emerald-900' : 'text-rose-900'}`}>
                {canSubmit ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                Submission Verification Gate
              </h3>
              
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  {requiredDocumentsUploaded ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                  <span className={requiredDocumentsUploaded ? 'text-emerald-800' : 'text-rose-800'}>
                    Required Documents Uploaded {requiredDocumentsUploaded ? '(Verified)' : '(Missing Documents)'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {allOcrPassed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                  <span className={allOcrPassed ? 'text-emerald-800' : 'text-rose-800'}>
                    AI Document OCR Check {allOcrPassed ? '(Passed)' : '(Failed/Pending)'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {isEligible ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                  <span className={isEligible ? 'text-emerald-800' : 'text-rose-800'}>
                    Scheme Eligibility Rules {isEligible ? '(Passed)' : '(Failed)'}
                  </span>
                </div>
              </div>
              
              {!canSubmit && (
                <div className="mt-3 pt-3 border-t border-rose-200 text-rose-900 font-bold text-xs">
                  🔒 Application cannot be submitted yet. Fix the failed checks above.
                </div>
              )}
              {canSubmit && (
                <div className="mt-3 pt-3 border-t border-emerald-200 text-emerald-900 font-bold text-xs">
                  ✓ All mandatory checks passed. You may now submit your application.
                </div>
              )}
            </div>

            <div className="bg-slate-100 p-3.5 rounded border border-slate-300 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-800" />
                <span>e-Sign Certification Mode: <strong>C-DAC / NIC Electronic Signature Service</strong></span>
              </div>
              <span className="text-slate-500 font-mono">Signer: {fullName}</span>
            </div>
          </div>
        )}

        {/* Wizard Footer Navigation Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-slate-200 mt-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentStep === 1}
              onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 1))}
              className="px-4 py-2 border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <button
              type="button"
              disabled={isSavingDraft}
              onClick={handleSaveDraft}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded font-semibold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className={`w-3.5 h-3.5 ${isSavingDraft ? 'animate-spin text-blue-700' : 'text-slate-500'}`} />
              <span>{isSavingDraft ? 'Saving Draft...' : 'Save Draft'}</span>
            </button>
          </div>

          <div className="text-slate-500 text-[11px] font-medium">
            Step {currentStep} of 8: <strong>{steps[currentStep - 1].label}</strong>
          </div>

          {currentStep < 8 ? (
            <button
              type="button"
              onClick={() => {
                if (!validateStepNavigation(currentStep)) {
                  return;
                }
                setCurrentStep((prev) => Math.min(prev + 1, 8));
              }}
              className="px-5 py-2 bg-[#0b2853] hover:bg-[#134685] text-white rounded font-bold shadow-sm flex items-center gap-1.5"
            >
              <span>Next: {steps[currentStep].label}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting || !eSignConsent || !canSubmit}
              onClick={handleFinalSubmit}
              className="px-6 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-extrabold shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Signing & Submitting...' : 'Complete & Submit Application'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
