import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { UserRole, UserSession } from '../types/user';
import { SchemeConfig } from '../types/scheme';
import { ApplicationRecord, ApplicationStatus } from '../types/application';
import { MOTA_SCHEMES } from '../data/schemes';
import { INITIAL_AUDIT_LOGS, SystemAuditLog } from '../data/mockAuditLogs';
import { INITIAL_GRIEVANCES, GrievanceRecord } from '../data/mockGrievances';
import { useAuth } from './AuthContext';
import { api } from '../services/api';
import { en, phrases, TranslationKey } from '../data/translations/en';
import { hi, hiPhrases } from '../data/translations/hi';

export interface AdminNotification {
  id: string;
  title: string;
  description: string;
  schemeCode: string;
  applicationId: string;
  timestamp: string;
  isRead: boolean;
  actionType: string;
}

interface AppContextType {
  // Authentication & Role
  currentUser: UserSession;
  switchRole: (role: UserRole) => void;

  // Language
  language: 'EN' | 'HI';
  setLanguage: (lang: 'EN' | 'HI') => void;
  t: (key: TranslationKey) => string;

  // Accessibility
  fontSizeMultiplier: number;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;


  // Schemes (Dynamic Configuration)
  schemes: SchemeConfig[];
  isLoadingSchemes: boolean;
  fetchSchemes: () => Promise<void>;
  updateScheme: (updated: SchemeConfig) => Promise<void>;
  addScheme: (newScheme: SchemeConfig) => Promise<void>;

  // Applications
  applications: ApplicationRecord[];
  currentApplicantApplication: ApplicationRecord | undefined;
  draftApplications: ApplicationRecord[];
  activeDraft: ApplicationRecord | undefined;
  isLoadingApplications: boolean;
  applicationError: string | null;
  fetchApplications: () => Promise<void>;
  addApplication: (app: ApplicationRecord) => Promise<ApplicationRecord>;
  saveDraft: (draftData: any) => Promise<ApplicationRecord>;
  updateApplicationStatus: (appId: string, newStatus: ApplicationRecord['status'], remarks?: string, officerName?: string, category?: string, requiredCorrection?: string) => Promise<void>;
  verifyDocumentStatus: (documentId: string, status: 'VERIFIED' | 'REJECTED', reason?: string) => Promise<void>;
  resolveApplicationDeficiency: (appId: string, updatedDocName: string, file?: File) => Promise<void>;

  // Audit Logs
  auditLogs: SystemAuditLog[];
  addAuditLog: (log: Omit<SystemAuditLog, 'id' | 'timestamp'>) => void;

  // Notifications
  adminNotifications: AdminNotification[];
  markNotificationAsRead: (id: string) => void;

  // Grievances
  grievances: GrievanceRecord[];
  addGrievance: (g: Omit<GrievanceRecord, 'id' | 'submittedDate'>) => Promise<void>;
  updateGrievanceStatus: (id: string, status: GrievanceRecord['status'], remarks?: string) => Promise<void>;
}

function transformBackendScheme(backendScheme: any): SchemeConfig {
  const fallback = MOTA_SCHEMES.find(
    (s) => s.id === backendScheme.id || s.code === backendScheme.code
  );
  const backendDeadline = backendScheme.application_deadline || backendScheme.applicationDeadline;
  const fallbackDeadline = fallback?.applicationDeadline;
  const hasExpiredLegacyDeadline = Boolean(
    backendDeadline &&
    fallbackDeadline &&
    new Date(backendDeadline) < new Date() &&
    new Date(fallbackDeadline) >= new Date()
  );

  return {
    id: backendScheme.id || backendScheme._id || (fallback?.id ?? 'scheme-custom'),
    code: backendScheme.code || (fallback?.code ?? 'MOTA-SCH'),
    name: backendScheme.name || (fallback?.name ?? 'MoTA Scholarship Scheme'),
    shortName: backendScheme.short_name || backendScheme.shortName || (fallback?.shortName ?? backendScheme.name ?? 'Scheme'),
    category: backendScheme.category || (fallback?.category ?? 'POST_MATRIC'),
    tagline: backendScheme.tagline || (fallback?.tagline ?? ''),
    description: backendScheme.description || (fallback?.description ?? ''),
    portalCategory: backendScheme.portal_category || backendScheme.portalCategory || (fallback?.portalCategory ?? 'Centrally Sponsored'),
    isOpen: backendScheme.is_open !== undefined ? Boolean(backendScheme.is_open) : (backendScheme.isOpen !== undefined ? Boolean(backendScheme.isOpen) : (fallback?.isOpen ?? true)),
    isDatasetOriginal: backendScheme.is_dataset_original !== undefined ? Boolean(backendScheme.is_dataset_original) : (backendScheme.isDatasetOriginal !== undefined ? Boolean(backendScheme.isDatasetOriginal) : (fallback?.isDatasetOriginal ?? false)),
    academicYear: backendScheme.academic_year || backendScheme.academicYear || (fallback?.academicYear ?? '2025-2026'),
    applicationDeadline: hasExpiredLegacyDeadline
      ? fallbackDeadline
      : (backendDeadline || fallbackDeadline || '2026-11-30'),
    targetCommunity: backendScheme.target_community || backendScheme.targetCommunity || (fallback?.targetCommunity ?? 'Scheduled Tribes (ST)'),
    annualIncomeCap: Number(backendScheme.annual_income_cap !== undefined ? backendScheme.annual_income_cap : (backendScheme.annualIncomeCap ?? fallback?.annualIncomeCap ?? 0)),
    minAge: backendScheme.min_age ?? backendScheme.minAge ?? fallback?.minAge,
    maxAge: backendScheme.max_age ?? backendScheme.maxAge ?? fallback?.maxAge,
    minAcademicPercentage: backendScheme.min_academic_percentage !== undefined ? Number(backendScheme.min_academic_percentage) : (backendScheme.minAcademicPercentage ?? fallback?.minAcademicPercentage ?? 40),
    educationLevels: backendScheme.education_levels || backendScheme.educationLevels || (fallback?.educationLevels ?? ['UNDERGRADUATE', 'POSTGRADUATE']),
    eligibilitySummary: backendScheme.eligibility_summary || backendScheme.eligibilitySummary || (fallback?.eligibilitySummary ?? []),
    eligibilityRules: backendScheme.eligibility_rules || backendScheme.eligibilityRules || (fallback?.eligibilityRules ?? []),
    requiredDocuments: backendScheme.required_documents || backendScheme.requiredDocuments || (fallback?.requiredDocuments ?? []),
    benefits: backendScheme.benefits || backendScheme.benefits || (fallback?.benefits ?? []),
    selectionCriteria: backendScheme.selection_criteria || backendScheme.selectionCriteria || (fallback?.selectionCriteria ?? {
      method: 'MERIT_ONLY',
      meritCalculation: 'Merit list based on qualifying examination percentage',
      totalSlotsPerYear: 1000
    }),
    workflowStages: backendScheme.workflow_stages || backendScheme.workflowStages || (fallback?.workflowStages ?? []),
    guidelinePdfUrl: backendScheme.guideline_pdf_url || backendScheme.guidelinePdfUrl || (fallback?.guidelinePdfUrl ?? '#'),
    faqItems: backendScheme.faq_items || backendScheme.faqItems || (fallback?.faqItems ?? []),
    nodalContact: backendScheme.nodal_contact || backendScheme.nodalContact || (fallback?.nodalContact ?? {
      officer: 'Nodal Officer (Scholarships)',
      designation: 'Under Secretary',
      email: 'scholarship-tribal@nic.in',
      phone: '011-23388482',
      address: 'Ministry of Tribal Affairs, Shastri Bhawan, New Delhi'
    })
  };
}

function toBackendSchemePayload(scheme: SchemeConfig): any {
  return {
    name: scheme.name,
    short_name: scheme.shortName,
    category: scheme.category,
    tagline: scheme.tagline,
    description: scheme.description,
    portal_category: scheme.portalCategory,
    is_open: scheme.isOpen,
    is_dataset_original: scheme.isDatasetOriginal,
    academic_year: scheme.academicYear,
    application_deadline: scheme.applicationDeadline,
    target_community: scheme.targetCommunity,
    annual_income_cap: Number(scheme.annualIncomeCap),
    min_academic_percentage: scheme.minAcademicPercentage !== undefined ? Number(scheme.minAcademicPercentage) : null,
    eligibility_summary: scheme.eligibilitySummary,
    eligibility_rules: scheme.eligibilityRules,
    required_documents: scheme.requiredDocuments,
    benefits: scheme.benefits
  };
}

function transformBackendApplication(app: any): ApplicationRecord {
  const applicantId = app.applicant_id || app.applicant_snapshot?.applicant_id || '';
  const snapshot = app.applicant_snapshot || null;
  const addressLine = app.personal_details?.address_line || snapshot?.address_line || '';
  const address = app.personal_details?.address || snapshot?.address || addressLine;

  return {
    id: app.application_id || app._id,
    applicantId: applicantId,
    applicantSnapshot: snapshot,
    schemeId: app.scheme_id,
    schemeCode: app.scheme_id,
    schemeName: app.scheme_name || 'MoTA Scholarship Scheme',
    submissionDate: app.created_at ? new Date(app.created_at).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
    lastUpdated: app.updated_at ? new Date(app.updated_at).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
    currentStageIndex: 1,
    currentStep: app.current_step || 1,
    status: (app.status || 'SUBMITTED') as ApplicationStatus,
    applicant: {
      id: app.user_id,
      applicantId: applicantId,
      fullName: app.personal_details?.full_name || snapshot?.name || '',
      fatherOrHusbandName: app.personal_details?.father_or_husband_name || snapshot?.father_or_husband_name || '',
      gender: app.personal_details?.gender || snapshot?.gender || 'OTHER',
      dob: app.personal_details?.dob || snapshot?.dob || '',
      aadhaarNumberMasked: app.personal_details?.aadhaar_masked || snapshot?.aadhaar_masked || '',
      category: (app.personal_details?.category || snapshot?.category || 'ST') as any,
      tribeCommunity: app.personal_details?.tribe_community || snapshot?.tribe_community || '',
      mobile: app.personal_details?.mobile || snapshot?.phone || '',
      email: app.personal_details?.email || snapshot?.email || '',
      state: app.personal_details?.state || snapshot?.state || '',
      district: app.personal_details?.district || snapshot?.district || '',
      pincode: app.personal_details?.pincode || snapshot?.pincode || '',
      address: address,
      addressLine: addressLine,
      disabilityStatus: 'NONE',
    },
    academic: {
      currentCourse: app.academic_details?.current_course || '',
      institutionName: app.academic_details?.institution_name || '',
      institutionState: app.academic_details?.institution_state || '',
      aisheCode: app.academic_details?.aishe_code || '',
      rollNumber: app.academic_details?.roll_number || '',
      yearOfStudy: app.academic_details?.year_of_study || '',
      previousExamName: app.academic_details?.previous_exam_name || '',
      previousExamPercentage: app.academic_details?.previous_exam_percentage || 0,
      passingYear: app.academic_details?.passing_year || '',
      boardOrUniversity: app.academic_details?.board_or_university || '',
    },
    bank: {
      accountHolderName: app.financial_details?.account_holder_name || app.personal_details?.full_name || '',
      bankName: app.financial_details?.bank_name || '',
      accountNumberMasked: app.financial_details?.account_number_masked || '',
      ifscCode: app.financial_details?.ifsc_code || '',
      branchName: app.financial_details?.branch_name || '',
      isAadhaarSeeded: app.financial_details?.is_aadhaar_seeded ?? true,
      dbtVerifiedDate: '2026-01-10',
    },
    annualFamilyIncome: app.financial_details?.annual_family_income || 0,
    documents: (app.documents || []).map((d: any, idx: number) => ({
      id: d.id || `DOC-${idx}`,
      documentCode: d.document_code || 'DOC',
      documentName: d.document_name || d.file_name || 'Certificate',
      fileUrl: d.file_url || `/api/documents/${d.id || `DOC-${idx}`}/file`,
      fileName: d.file_name || 'Document.pdf',
      fileSizeKB: d.file_size_kb || 450,
      uploadedAt: d.uploaded_at ? new Date(d.uploaded_at).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
      ocrExtracted: true,
      status: (d.status || 'PENDING') as any,
      verificationStatus: d.verification_status || (d.status === 'VERIFIED' ? 'VERIFIED' : d.status === 'REJECTED' ? 'REJECTED' : 'PENDING'),
      fileExists: d.file_exists !== false,
      rejectionReason: d.rejection_reason || d.deficiency_notes,
      deficiencyReason: d.rejection_reason || d.deficiency_notes,
      verifiedBy: d.verified_by,
      verifiedAt: d.verified_at,
    })),
    hasDeficiency: app.has_deficiency || app.status === 'DEFICIENT',
    deficiencyCategory: app.deficiency_category,
    deficiencyReason: app.deficiency_reason || app.deficiency_notes,
    deficiencyRequiredCorrection: app.deficiency_required_correction,
    deficiencyNotes: app.deficiency_notes || app.deficiency_reason,
    officerRemarks: app.officer_remarks,
    rejectionReason: app.rejection_reason || (app.status === 'REJECTED' ? (app.officer_remarks || 'Application does not satisfy statutory scheme criteria.') : undefined),
    auditTrail: (app.audit_trail && app.audit_trail.length > 0)
      ? app.audit_trail.map((entry: any) => ({
          id: entry.id || entry._id || 'AUD-LOG',
          timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '',
          actor: entry.actor || 'Official Authority',
          actorRole: entry.role || 'OFFICER',
          action: entry.action || 'Application Lifecycle Update',
          newStatus: (entry.newStatus || entry.new_status || app.status || 'SUBMITTED') as ApplicationStatus,
          remarks: entry.remarks || entry.reason || 'Lifecycle event recorded.'
        }))
      : [
          {
            id: 'AUD-01',
            timestamp: app.created_at ? new Date(app.created_at).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19),
            actor: app.personal_details?.full_name || 'Citizen Applicant',
            actorRole: 'APPLICANT',
            action: 'Application Submitted on MoTA Portal',
            newStatus: (app.status || 'SUBMITTED') as ApplicationStatus,
            remarks: 'Digital application dossier successfully lodged with statutory Aadhaar seeding.'
          }
        ]
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: authUser, login, logout } = useAuth();

  const currentUser: UserSession = authUser
    ? {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
      designation:
        authUser.role === 'APPLICANT'
          ? 'ST Beneficiary (Aadhaar Verified)'
          : authUser.role === 'OFFICER'
            ? 'Deputy Secretary (Research & Scrutiny)'
            : 'Joint Secretary (Scholarships & DBT Mission)',
      department: authUser.role !== 'APPLICANT' ? 'Ministry of Tribal Affairs' : undefined,
    }
    : {
      id: '',
      name: 'Guest Citizen',
      email: '',
      role: 'APPLICANT',
      designation: 'Unauthenticated Visitor',
    };

  const [language, setLanguage] = useState<'EN' | 'HI'>('EN');
  const translationTextNodes = useRef(new Map<Text, string>());
  const translationAttributes = useRef(new Map<HTMLElement, Map<string, string>>());
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState<number>(1);
  const [schemes, setSchemes] = useState<SchemeConfig[]>(MOTA_SCHEMES);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState<boolean>(false);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState<boolean>(false);
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>(INITIAL_AUDIT_LOGS);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [grievances, setGrievances] = useState<GrievanceRecord[]>([]);

  const translations = language === 'HI' ? hi : en;
  const t = (key: TranslationKey) => translations[key];

  useEffect(() => {
    const pairs = [
      ...Object.keys(phrases).map((key) => [phrases[key as keyof typeof phrases], hiPhrases[key as keyof typeof hiPhrases]] as const),
      ...Object.keys(en).map((key) => [en[key as TranslationKey], hi[key as TranslationKey]] as const),
    ]
      .filter(([english, hindi]) => english !== hindi)
      .sort(([first], [second]) => second.length - first.length);

    const translateText = (value: string) => pairs.reduce(
      (result, [english, hindi]) => result.replaceAll(english, language === 'HI' ? hindi : english),
      value
    );
    const restoreEnglishText = (value: string) => [...pairs]
      .sort(([, firstHindi], [, secondHindi]) => secondHindi.length - firstHindi.length)
      .reduce((result, [english, hindi]) => result.replaceAll(hindi, english), value);

    const processTextNode = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) return;
      const trackedOriginal = translationTextNodes.current.get(node);
      if (language === 'HI') {
        if (trackedOriginal && node.nodeValue !== translateText(trackedOriginal) && node.nodeValue !== trackedOriginal) {
          translationTextNodes.current.set(node, restoreEnglishText(node.nodeValue || ''));
        } else if (!trackedOriginal) {
          translationTextNodes.current.set(node, restoreEnglishText(node.nodeValue || ''));
        }
        const translatedValue = translateText(translationTextNodes.current.get(node) || '');
        if (node.nodeValue !== translatedValue) node.nodeValue = translatedValue;
      } else if (trackedOriginal !== undefined) {
        if (node.nodeValue !== trackedOriginal) node.nodeValue = trackedOriginal;
      }
    };

    const processElement = (element: HTMLElement) => {
      const attributes = ['placeholder', 'title', 'aria-label', 'alt'];
      let originals = translationAttributes.current.get(element);
      if (!originals) {
        originals = new Map<string, string>();
        translationAttributes.current.set(element, originals);
      }
      attributes.forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (value === null) return;
        const original = originals?.get(attribute);
        if (language === 'HI') {
          if (original && value !== translateText(original) && value !== original) originals?.set(attribute, restoreEnglishText(value));
          if (!originals?.has(attribute)) originals?.set(attribute, restoreEnglishText(value));
          const translatedValue = translateText(originals?.get(attribute) || '');
          if (element.getAttribute(attribute) !== translatedValue) element.setAttribute(attribute, translatedValue);
        } else if (original !== undefined) {
          if (element.getAttribute(attribute) !== original) element.setAttribute(attribute, original);
        }
      });
    };

    const processTree = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        processTextNode(node);
        node = walker.nextNode() as Text | null;
      }
      if (root instanceof HTMLElement) processElement(root);
      if (root instanceof Element) root.querySelectorAll<HTMLElement>('*').forEach(processElement);
    };

    document.documentElement.lang = language === 'HI' ? 'hi' : 'en';
    processTree(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData' && mutation.target instanceof Text) processTextNode(mutation.target);
        mutation.addedNodes.forEach(processTree);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  // Fetch schemes from backend MongoDB Atlas
  const fetchSchemes = async () => {
    setIsLoadingSchemes(true);
    try {
      const backendSchemes = await api.getSchemes();
      if (backendSchemes && backendSchemes.length > 0) {
        setSchemes(backendSchemes.map(transformBackendScheme));
      }
    } catch (err) {
      console.warn('Backend schemes endpoint unavailable, maintaining fallback seed data:', err);
    } finally {
      setIsLoadingSchemes(false);
    }
  };

  useEffect(() => {
    fetchSchemes();
  }, []);

  // Apply font size scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeMultiplier * 100}%`;
  }, [fontSizeMultiplier]);

  // Fetch applications whenever authUser changes
  const fetchApplications = async () => {
    if (!authUser) {
      setApplications([]);
      setApplicationError(null);
      return;
    }

    setIsLoadingApplications(true);
    setApplicationError(null);

    try {
      if (authUser.role === 'APPLICANT') {
        const backendApps = await api.getMyApplications();
        setApplications(backendApps.map(transformBackendApplication));
      } else {
        const backendApps = await api.getAllApplications();
        setApplications(backendApps.map(transformBackendApplication));
      }
    } catch (err: any) {
      console.error('Failed to load applications from API:', err);
      setApplicationError(err.message || 'Unable to load applications from server.');
      setApplications([]);
    } finally {
      setIsLoadingApplications(false);
    }
  };

  // Fetch grievances when user logs in
  const fetchGrievances = async () => {
    if (!authUser) {
      setGrievances([]);
      return;
    }
    try {
      if (authUser.role === 'APPLICANT') {
        const myGrv = await api.getMyGrievances();
        setGrievances(
          myGrv.map((g: any) => ({
            id: g.grievance_id || g._id,
            applicantName: authUser.name,
            applicationId: g.application_id,
            schemeName: g.scheme_name,
            category: g.category,
            subject: g.subject,
            description: g.description,
            submittedDate: g.created_at ? new Date(g.created_at).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
            status: g.status,
            priority: 'HIGH',
            assignedOfficer: g.assigned_officer,
            resolutionRemarks: g.resolution_remarks,
          }))
        );
      } else {
        const allGrv = await api.getAllGrievances();
        setGrievances(
          allGrv.map((g: any) => ({
            id: g.grievance_id || g._id,
            applicantName: 'Applicant Citizen',
            applicationId: g.application_id,
            schemeName: g.scheme_name,
            category: g.category,
            subject: g.subject,
            description: g.description,
            submittedDate: g.created_at ? new Date(g.created_at).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
            status: g.status,
            priority: 'HIGH',
            assignedOfficer: g.assigned_officer,
            resolutionRemarks: g.resolution_remarks,
          }))
        );
      }
    } catch (err) {
      console.warn('Failed to load grievances:', err);
    }
  };

  useEffect(() => {
    fetchApplications();
    fetchGrievances();
  }, [authUser?.id, authUser?.role]);

  const switchRole = async (role: UserRole) => {
    // For demo persona switching, login as pre-seeded officer/admin or logout
    if (role === 'OFFICER') {
      try {
        await login({ email: 'officer@mota.gov.in', password: 'Officer@2026' });
      } catch {
        console.warn('Could not auto-switch to officer account');
      }
    } else if (role === 'ADMIN') {
      try {
        await login({ email: 'admin@mota.gov.in', password: 'Admin@2026' });
      } catch {
        console.warn('Could not auto-switch to admin account');
      }
    } else {
      logout();
    }
  };

  const increaseFontSize = () => {
    setFontSizeMultiplier((prev) => Math.min(prev + 0.1, 1.3));
  };

  const decreaseFontSize = () => {
    setFontSizeMultiplier((prev) => Math.max(prev - 0.1, 0.85));
  };

  const resetFontSize = () => {
    setFontSizeMultiplier(1);
  };

  const updateScheme = async (updated: SchemeConfig) => {
    if (updated.isDatasetOriginal) {
      throw new Error('Cannot modify protected dataset scheme.');
    }

    // 1. Optimistic update
    setSchemes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

    // 2. Persist to MongoDB Atlas backend
    try {
      const payload = toBackendSchemePayload(updated);
      const res = await api.updateScheme(updated.id, payload);
      const transformed = transformBackendScheme(res);
      setSchemes((prev) => prev.map((s) => (s.id === transformed.id ? transformed : s)));
    } catch (err: any) {
      console.error('Failed to persist scheme update to server:', err);
      throw err;
    }

    addAuditLog({
      actor: currentUser.name,
      role: currentUser.role,
      action: 'Scheme Rule Config Updated',
      applicationId: updated.code,
      schemeCode: updated.code,
      previousStatus: 'ACTIVE_V1',
      newStatus: 'UPDATED_RULESET',
      reason: `Configuration criteria modified for ${updated.name}`,
      ipAddress: '10.14.88.10 (NIC Internal)'
    });
  };

  const addScheme = async (newScheme: SchemeConfig) => {
    setSchemes((prev) => [...prev, newScheme]);
    try {
      const payload = {
        id: newScheme.id,
        code: newScheme.code,
        ...toBackendSchemePayload(newScheme)
      };
      const res = await api.createScheme(payload);
      const transformed = transformBackendScheme(res);
      setSchemes((prev) => [...prev.filter((s) => s.id !== newScheme.id), transformed]);
    } catch (err: any) {
      console.error('Failed to persist new scheme to server:', err);
      throw err;
    }
  };

  const addApplication = async (app: ApplicationRecord) => {
    try {
      const payload = {
        scheme_id: app.schemeCode || app.schemeId,
        applicant_id: app.applicantId || app.applicant?.applicantId || undefined,
        personal_details: {
          full_name: app.applicant.fullName,
          father_or_husband_name: app.applicant.fatherOrHusbandName,
          gender: app.applicant.gender,
          dob: app.applicant.dob,
          aadhaar_masked: app.applicant.aadhaarNumberMasked,
          category: app.applicant.category,
          tribe_community: app.applicant.tribeCommunity,
          mobile: app.applicant.mobile,
          email: app.applicant.email,
          state: app.applicant.state,
          district: app.applicant.district,
          pincode: app.applicant.pincode,
          address: app.applicant.address || app.applicant.addressLine || `${app.applicant.district}, ${app.applicant.state}`,
          address_line: app.applicant.addressLine || app.applicant.address,
        },
        academic_details: {
          current_course: app.academic.currentCourse,
          institution_name: app.academic.institutionName,
          institution_state: app.academic.institutionState,
          aishe_code: app.academic.aisheCode,
          roll_number: app.academic.rollNumber,
          year_of_study: app.academic.yearOfStudy,
          previous_exam_name: app.academic.previousExamName,
          previous_exam_percentage: app.academic.previousExamPercentage,
          passing_year: app.academic.passingYear,
          board_or_university: app.academic.boardOrUniversity,
        },
        financial_details: {
          annual_family_income: app.annualFamilyIncome,
          bank_name: app.bank.bankName,
          account_holder_name: app.bank.accountHolderName,
          account_number_masked: app.bank.accountNumberMasked,
          ifsc_code: app.bank.ifscCode,
          branch_name: app.bank.branchName,
          is_aadhaar_seeded: app.bank.isAadhaarSeeded,
        },
        documents: (app.documents || []).map((d) => ({
          id: d.id,
          document_code: d.documentCode,
          document_name: d.documentName,
          file_name: d.fileName,
          file_url: d.fileUrl,
          file_size_kb: d.fileSizeKB,
          status: d.status,
        })),
        status: 'SUBMITTED',
      };

      const isExistingDraft = Boolean(app.id && applications.some((a) => a.id === app.id && a.status === 'DRAFT'));
      let transformed: ApplicationRecord;

      if (isExistingDraft) {
        const updatePayload = {
          current_step: 8,
          personal_details: payload.personal_details,
          academic_details: payload.academic_details,
          financial_details: payload.financial_details,
          documents: payload.documents,
          status: 'SUBMITTED',
        };
        const updated = await api.updateApplication(app.id, updatePayload);
        transformed = transformBackendApplication(updated);
        setApplications((prev) => prev.map((a) => (a.id === transformed.id ? transformed : a)));
      } else {
        const created = await api.createApplication(payload);
        transformed = transformBackendApplication(created);
        setApplications((prev) => [transformed, ...prev]);
      }
      addAuditLog({
        actor: app.applicant.fullName,
        role: 'APPLICANT',
        action: 'Application Started',
        applicationId: transformed.id,
        schemeCode: app.schemeCode,
        previousStatus: 'DRAFT',
        newStatus: 'DRAFT',
        remarks: `Initiated application for ${app.schemeName}`,
        reason: `Initiated application for ${app.schemeName}`,
        ipAddress: '164.100.24.112'
      });

      // Log application submitted
      addAuditLog({
        actor: app.applicant.fullName,
        role: 'APPLICANT',
        action: 'Application Submitted',
        applicationId: transformed.id,
        schemeCode: app.schemeCode,
        previousStatus: isExistingDraft ? 'DRAFT' : 'DRAFT',
        newStatus: transformed.status,
        remarks: `Applied for ${app.schemeName}`,
        reason: `Applied for ${app.schemeName}`,
        ipAddress: '164.100.24.112'
      });
      return transformed;
    } catch (err: any) {
      console.error('Failed to create/submit application on server:', err);
      // Still update locally if offline
      setApplications((prev) => [app, ...prev]);

      addAuditLog({
        actor: app.applicant.fullName,
        role: 'APPLICANT',
        action: 'Application Started',
        applicationId: app.id,
        schemeCode: app.schemeCode,
        previousStatus: 'DRAFT',
        newStatus: 'DRAFT',
        remarks: `Initiated application for ${app.schemeName}`,
        reason: `Initiated application for ${app.schemeName}`,
        ipAddress: '164.100.24.112'
      });

      addAuditLog({
        actor: app.applicant.fullName,
        role: 'APPLICANT',
        action: 'Application Submitted',
        applicationId: app.id,
        schemeCode: app.schemeCode,
        previousStatus: 'DRAFT',
        newStatus: app.status,
        remarks: `Applied for ${app.schemeName}`,
        reason: `Applied for ${app.schemeName}`,
        ipAddress: '164.100.24.112'
      });
      return app;
    }
  };

  const saveDraft = async (draftData: any): Promise<ApplicationRecord> => {
    try {
      const res = await api.saveApplicationDraft(draftData);
      const transformed = transformBackendApplication(res);
      setApplications((prev) => {
        const existingIdx = prev.findIndex((a) => a.id === transformed.id);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = transformed;
          return next;
        }
        return [transformed, ...prev];
      });

      addAuditLog({
        actor: transformed.applicant.fullName || currentUser.name || 'Citizen Applicant',
        role: 'APPLICANT',
        action: 'Application Draft Saved',
        applicationId: transformed.id,
        schemeCode: transformed.schemeCode,
        previousStatus: 'DRAFT',
        newStatus: 'DRAFT',
        remarks: `Draft saved at Step ${transformed.currentStep || 1}`,
        reason: `Draft saved at Step ${transformed.currentStep || 1}`,
        ipAddress: '10.14.88.22'
      });

      return transformed;
    } catch (err: any) {
      console.error('Failed to save application draft to MongoDB Atlas:', err);
      throw err;
    }
  };

  const updateApplicationStatus = async (
    appId: string,
    newStatus: ApplicationRecord['status'],
    remarks?: string,
    officerName?: string,
    category?: string,
    requiredCorrection?: string
  ) => {
    try {
      await api.updateApplicationStatusOfficer(appId, {
        status: newStatus,
        remarks,
        officer_name: officerName || currentUser.name,
        category,
        required_correction: requiredCorrection,
      });
    } catch (err) {
      console.warn('Backend updateApplicationStatus failed:', err);
    }

    setApplications((prev) =>
      prev.map((app) => {
        if (app.id === appId) {
          return {
            ...app,
            status: newStatus,
            hasDeficiency: newStatus === 'DEFICIENT',
            deficiencyCategory: newStatus === 'DEFICIENT' ? category : app.deficiencyCategory,
            deficiencyReason: newStatus === 'DEFICIENT' ? remarks : app.deficiencyReason,
            deficiencyRequiredCorrection: newStatus === 'DEFICIENT' ? requiredCorrection : app.deficiencyRequiredCorrection,
            deficiencyNotes: newStatus === 'DEFICIENT' ? remarks : app.deficiencyNotes,
            lastUpdated: new Date().toISOString().substring(0, 10),
            officerRemarks: remarks || app.officerRemarks,
          };
        }
        return app;
      })
    );
    fetchApplications().catch(() => {});
  };

  const verifyDocumentStatus = async (documentId: string, status: 'VERIFIED' | 'REJECTED', reason?: string) => {
    try {
      await api.verifyDocument(documentId, status, reason);
    } catch (err) {
      console.warn('Backend verifyDocument failed:', err);
      throw err;
    }

    setApplications((prev) =>
      prev.map((app) => {
        const hasDoc = app.documents.some((d) => d.id === documentId);
        if (!hasDoc) return app;
        return {
          ...app,
          documents: app.documents.map((d) => {
            if (d.id === documentId) {
              return {
                ...d,
                status: status,
                verificationStatus: status,
                rejectionReason: status === 'REJECTED' ? reason : undefined,
                verifiedBy: currentUser.name,
                verifiedAt: new Date().toISOString(),
              };
            }
            return d;
          }),
        };
      })
    );
    fetchApplications().catch(() => {});
  };

  const resolveApplicationDeficiency = async (appId: string, updatedDocName: string, file?: File) => {
    try {
      const targetApp = applications.find((a) => a.id === appId);
      const deficientDoc = targetApp?.documents.find((d) => d.status === 'DEFICIENT') || targetApp?.documents[0];

      if (file && deficientDoc && deficientDoc.id && !deficientDoc.id.startsWith('DOC-AI')) {
        // Attempt backend document replacement
        await api.replaceDocument(deficientDoc.id, file);
      }

      await api.updateApplication(appId, {
        status: 'RESUBMITTED',
      });
    } catch (err) {
      console.warn('Backend resolveApplicationDeficiency failed:', err);
    }

    setApplications((prev) =>
      prev.map((app) => {
        if (app.id === appId) {
          const updatedDocs = app.documents.map((d) =>
            d.status === 'DEFICIENT'
              ? {
                ...d,
                fileName: updatedDocName,
                status: 'VALID' as const,
                deficiencyReason: undefined,
                uploadedAt: new Date().toISOString().substring(0, 10)
              }
              : d
          );

          return {
            ...app,
            hasDeficiency: false,
            deficiencyNotes: undefined,
            status: 'RESUBMITTED' as const,
            lastUpdated: new Date().toISOString().substring(0, 10),
            documents: updatedDocs,
          };
        }
        return app;
      })
    );
    fetchApplications().catch(() => {});

    // Log resubmission
    const app = applications.find(a => a.id === appId);
    if (app) {
      addAuditLog({
        actor: currentUser.name,
        role: currentUser.role,
        action: 'Application Resubmitted',
        applicationId: appId,
        schemeCode: app.schemeCode,
        previousStatus: 'DEFICIENT',
        newStatus: 'RESUBMITTED',
        remarks: `Deficiency corrected and resubmitted by applicant.`,
        reason: `Deficiency corrected`,
        ipAddress: '164.100.24.112'
      });
    }
  };

  const addAuditLog = (log: Omit<SystemAuditLog, 'id' | 'timestamp'>) => {
    const newRecord: SystemAuditLog = {
      ...log,
      id: 'LOG-' + Math.floor(1000 + Math.random() * 9000),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    setAuditLogs((prev) => [newRecord, ...prev]);
  };

  const markNotificationAsRead = (id: string) => {
    setReadNotificationIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (id.startsWith('NOTIF-')) {
      api.markNotificationRead(id).catch(() => {});
    }
  };

  // STRICT APPLICANT DATA ISOLATION:
  // For APPLICANT role, applications is already strictly isolated by backend /api/applications/my
  const userApplications = authUser
    ? (authUser.role === 'APPLICANT'
        ? applications
        : applications.filter(
            (a) =>
              a.applicant.id === authUser.id ||
              (authUser.email && a.applicant.email.toLowerCase() === authUser.email.toLowerCase()) ||
              (authUser.name && a.applicant.fullName.toLowerCase() === authUser.name.toLowerCase())
          ))
    : [];

  const draftApplications = userApplications.filter((a) => a.status === 'DRAFT');
  const activeDraft = draftApplications[0];

  // Active submitted application (prioritizes submitted/under verification/scrutiny/selection/approved/deficient over draft)
  const currentApplicantApplication = userApplications.find((a) => a.status !== 'DRAFT') || userApplications[0];

  const adminNotifications: AdminNotification[] = React.useMemo(() => {
    if (currentUser.role === 'APPLICANT') {
      const notifs: AdminNotification[] = [];

      userApplications.forEach((app) => {
        const notifId = `NOTIF-${app.id}-${app.status}`;
        let msg = `Your application ${app.id} for ${app.schemeName} has been ${app.status.toLowerCase().replace(/_/g, ' ')}.`;
        if (app.status === 'APPROVED') {
          msg = `Your application ${app.id} for ${app.schemeName} has been approved.`;
        } else if (app.status === 'REJECTED') {
          msg = `Your application ${app.id} for ${app.schemeName} has been rejected.`;
        } else if (app.status === 'DEFICIENT') {
          msg = `Your application ${app.id} for ${app.schemeName} requires certificate rectification.`;
        } else if (app.status === 'RESUBMITTED') {
          msg = `Your application ${app.id} for ${app.schemeName} has been resubmitted and is under review.`;
        }

        notifs.push({
          id: notifId,
          title: `Application ${app.id}: ${app.status.replace(/_/g, ' ')}`,
          description: msg,
          schemeCode: app.schemeCode,
          applicationId: app.id,
          timestamp: app.lastUpdated || app.submissionDate,
          isRead: readNotificationIds.has(notifId),
          actionType: app.status
        });
      });

      return notifs;
    }

    return auditLogs
      .filter(log => ['Application Started', 'New Application Submitted', 'Application Submitted', 'Application Resubmitted', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'DEFICIENCY_ISSUED'].includes(log.action))
      .map(log => ({
        id: log.id,
        title: log.action === 'Application Started' ? 'New application started' :
          log.action === 'Application Resubmitted' ? 'Application resubmitted' :
            log.action === 'APPLICATION_APPROVED' ? 'Application approved' :
            log.action === 'APPLICATION_REJECTED' ? 'Application rejected' :
            log.action === 'DEFICIENCY_ISSUED' ? 'Deficiency issued' :
            'Application submitted for review',
        description: `By ${log.actor}`,
        schemeCode: log.schemeCode,
        applicationId: log.applicationId,
        timestamp: log.timestamp,
        isRead: readNotificationIds.has(log.id),
        actionType: log.action
      }));
  }, [currentUser.role, userApplications, auditLogs, readNotificationIds]);


  const addGrievance = async (g: Omit<GrievanceRecord, 'id' | 'submittedDate'>) => {
    try {
      await api.lodgeGrievance({
        applicationId: g.applicationId,
        category: g.category,
        subject: g.subject,
        description: g.description,
      });
      fetchGrievances();
    } catch (err) {
      console.warn('Failed to lodge grievance to backend:', err);
      const newGrv: GrievanceRecord = {
        ...g,
        id: `GRV/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`,
        submittedDate: new Date().toISOString().substring(0, 10)
      };
      setGrievances((prev) => [newGrv, ...prev]);
    }
  };

  const updateGrievanceStatus = async (id: string, status: GrievanceRecord['status'], remarks?: string) => {
    try {
      await api.resolveGrievanceOfficer(id, {
        status,
        resolution_remarks: remarks,
      });
    } catch (err) {
      console.warn('Backend updateGrievanceStatus failed:', err);
    }

    setGrievances((prev) =>
      prev.map((g) => (g.id === id ? { ...g, status, resolutionRemarks: remarks || g.resolutionRemarks } : g))
    );
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        switchRole,
        language,
        setLanguage,
        t,
        fontSizeMultiplier,
        increaseFontSize,
        decreaseFontSize,
        resetFontSize,
        schemes,
        isLoadingSchemes,
        fetchSchemes,
        updateScheme,
        addScheme,
        applications,
        currentApplicantApplication,
        draftApplications,
        activeDraft,
        isLoadingApplications,
        applicationError,
        fetchApplications,
        addApplication,
        saveDraft,
        updateApplicationStatus,
        verifyDocumentStatus,
        resolveApplicationDeficiency,
        auditLogs,
        addAuditLog,
        adminNotifications,
        markNotificationAsRead,
        grievances,
        addGrievance,
        updateGrievanceStatus
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

