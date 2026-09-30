import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusTimeline } from '../../components/applicant/StatusTimeline';
import { ExplainableEvidenceCard } from '../../components/document-ai/ExplainableEvidenceCard';
import { ApplicationRecord } from '../../types/application';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Upload,
  ShieldCheck,
  Building,
  Calendar,
  ExternalLink,
  Download,
  HelpCircle,
  Award,
  XCircle,
  RefreshCw,
  FileCheck2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

const STEP_LABELS: Record<number, string> = {
  1: 'Personal Details',
  2: 'Eligibility Criteria',
  3: 'Academic Details',
  4: 'Bank Details (PFMS DBT)',
  5: 'Supporting Documents',
  6: 'AI Pre-Check',
  7: 'Preview',
  8: 'Statutory Declaration & e-Sign'
};

export const ApplicantDashboardPage: React.FC = () => {
  const {
    applications,
    currentApplicantApplication,
    draftApplications,
    activeDraft,
    resolveApplicationDeficiency,
    currentUser,
    isLoadingApplications,
    applicationError,
    fetchApplications
  } = useApp();

  // Selected application ID for viewing
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [applicantProfile, setApplicantProfile] = useState<any>(null);

  // Deficiency / Document replacement modal
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [targetDocToFix, setTargetDocToFix] = useState<{ id: string; name: string; reason?: string } | null>(null);
  const [newCertFileName, setNewCertFileName] = useState('Income_Certificate_Tehsildar_FY2024-25_Signed.pdf');
  const [newCertFileObj, setNewCertFileObj] = useState<File | null>(null);
  const [isSubmittingFix, setIsSubmittingFix] = useState(false);

  // Auto-sync with backend MongoDB Atlas on mount and periodic 8-second interval
  useEffect(() => {
    fetchApplications();
    api.getApplicantProfile().then(p => {
      if (p) setApplicantProfile(p);
    }).catch(() => {});

    const interval = setInterval(() => {
      fetchApplications();
    }, 8000);
    const handleFocus = () => {
      fetchApplications();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Determine active displayed application
  const app: ApplicationRecord | undefined = React.useMemo(() => {
    if (selectedAppId) {
      const match = applications.find(a => a.id === selectedAppId);
      if (match) return match;
    }
    return currentApplicantApplication || applications[0];
  }, [selectedAppId, currentApplicantApplication, applications]);

  if (isLoadingApplications && applications.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-white p-12 rounded-lg border border-slate-300 shadow-sm text-center space-y-3"
      >
        <div className="w-10 h-10 border-4 border-blue-900 border-t-amber-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm font-bold text-[#0b2853]">Loading your scholarship dossiers from MoTA database...</p>
        <p className="text-xs text-slate-500">Retrieving user-isolated records for {currentUser.email}</p>
      </div>
    );
  }

  if (applicationError && applications.length === 0) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="bg-rose-50 border-2 border-rose-400 p-8 rounded-lg shadow-sm text-center space-y-4"
      >
        <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-extrabold text-rose-950">Unable to load your applications.</h2>
        <p className="text-xs text-rose-800 max-w-md mx-auto">{applicationError}</p>
        <div>
          <button
            onClick={fetchApplications}
            className="px-5 py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!app) {
    if (!activeDraft) {
      return (
        <div className="bg-white p-8 rounded-lg border border-slate-300 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-blue-50 border border-blue-200 text-[#0b2853] rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0b2853]">No Active Applications Found</h2>
            <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
              You do not have any active scholarship or fellowship applications under your citizen account (<strong>{currentUser.email}</strong>).
            </p>
          </div>
          <div>
            <Link
              to="/applicant/apply"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow uppercase tracking-wider transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Apply for a Scholarship Scheme</span>
            </Link>
          </div>
        </div>
      );
    }

    // Has active draft but no submitted applications yet
    return (
      <div className="space-y-6">
        <div className="bg-white p-5 rounded border border-slate-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Citizen Application Portal
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Authenticated Citizen
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#0b2853] tracking-tight">
              Welcome, {currentUser.name}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Account: <strong>{currentUser.email}</strong> • Status: <strong>Draft Application in Progress</strong>
            </p>
          </div>

          <Link
            to="/applicant/apply"
            className="px-3.5 py-2 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow-sm flex items-center gap-1.5 self-start md:self-auto"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Apply for Another Scheme</span>
          </Link>
        </div>

        {/* Dedicated Draft in Progress Card */}
        <div className="bg-gradient-to-r from-amber-50 to-blue-50 border-2 border-amber-400 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-lg shadow-sm">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                    Draft in Progress
                  </span>
                  <span className="text-slate-400 text-xs">•</span>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    ID: {activeDraft.id}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-[#0b2853] mt-1">
                  {activeDraft.schemeName || 'MoTA Scholarship Scheme'}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>Current Progress: <strong>Step {activeDraft.currentStep || 1} of 8 ({STEP_LABELS[activeDraft.currentStep || 1] || 'In Progress'})</strong></span>
                  <span className="text-slate-300">•</span>
                  <span>Last Saved: <strong>{activeDraft.lastUpdated || 'Today'}</strong></span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Your partial application is safely stored in MongoDB Atlas (<code className="font-semibold text-slate-700">tsfms.applications</code>). You can continue whenever you are ready.
                </p>
              </div>
            </div>

            <Link
              to={`/applicant/apply?scheme=${activeDraft.schemeCode || activeDraft.schemeId}&draftId=${activeDraft.id}`}
              className="px-5 py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow-md flex items-center justify-center gap-2 self-start sm:self-center transition-colors flex-shrink-0"
            >
              <span>Continue Application</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleResolveDeficiencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingFix(true);
    try {
      await resolveApplicationDeficiency(app.id, newCertFileName, newCertFileObj || undefined);
      setIsResolveModalOpen(false);
      setTargetDocToFix(null);
      await fetchApplications();
    } catch (err: any) {
      alert(`Failed to resubmit: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingFix(false);
    }
  };

  const getStageFriendlyLabel = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return 'Submitted';
      case 'DOCUMENT_VERIFICATION':
        return 'Document Verification';
      case 'ELIGIBILITY_VERIFICATION':
        return 'Eligibility Verification';
      case 'SCRUTINY':
        return 'Scrutiny';
      case 'SELECTION':
        return 'Selection';
      case 'APPROVED':
        return 'Approved';
      case 'DEFICIENT':
        return 'Correction Required';
      case 'RESUBMITTED':
        return 'Resubmitted';
      case 'REJECTED':
        return 'Rejected';
      default:
        return status;
    }
  };

  const getStageFriendlyMessage = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return 'Your application has been received and lodged with MoTA. Verification officer assignment in progress.';
      case 'DOCUMENT_VERIFICATION':
        return 'Your application is currently under document verification.';
      case 'ELIGIBILITY_VERIFICATION':
        return 'Document verification completed. Under statutory eligibility verification.';
      case 'SCRUTINY':
        return 'Eligibility verified. Official scrutiny cell examination in progress.';
      case 'SELECTION':
        return 'Scrutiny completed. Forwarded to National Selection Board for quota slotting.';
      case 'APPROVED':
        return 'Congratulations! Your scholarship application has been officially APPROVED by Competent Authority.';
      case 'DEFICIENT':
        return 'Action required: A discrepancy or expired certificate was detected. Please review notes and upload replacement proof.';
      case 'RESUBMITTED':
        return 'Your updated document has been submitted and is currently being re-evaluated.';
      case 'REJECTED':
        return 'Application was not recommended for sanction. Please check stated reason below.';
      default:
        return 'Your application is under active processing.';
    }
  };

  const permanentApplicantId = applicantProfile?.applicant_id || app?.applicantId || app?.applicant?.applicantId || 'ST-2026-000123';

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white p-5 rounded border border-slate-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Citizen Application Portal
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Aadhaar Verified
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Applicant ID: {permanentApplicantId}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0b2853] tracking-tight">
            Welcome, {app.applicant.fullName || currentUser.name}
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Applicant ID: <strong className="font-mono text-blue-900">{permanentApplicantId}</strong> • Community: <strong>{app.applicant.tribeCommunity || 'Scheduled Tribe'}</strong> • Domicile: <strong>{app.applicant.district || 'District'}, {app.applicant.state || 'State'}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fetchApplications()}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors"
            title="Refresh latest status from MoTA MongoDB Atlas"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh Status</span>
          </button>
          <Link
            to="/applicant/apply"
            className="px-3.5 py-2 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow-sm flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Apply for Another Scholarship</span>
          </Link>
        </div>
      </div>

      {/* SECTION 12: MY APPLICATIONS */}
      <div className="bg-white p-5 rounded border border-slate-300 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
          <div>
            <h2 className="text-sm font-black uppercase text-[#0b2853] tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-800" />
              MY APPLICATIONS ({applications.length})
            </h2>
            <p className="text-xs text-slate-500">
              All applications registered under permanent Applicant ID: <strong className="font-mono text-blue-900">{permanentApplicantId}</strong>
            </p>
          </div>
          <Link
            to="/applicant/apply"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow-sm transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Apply for Another Scholarship</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {applications.map((item) => {
            const itemApplicantId = item.applicantId || item.applicant?.applicantId || permanentApplicantId;
            const isSelected = item.id === app.id;
            return (
              <div
                key={item.id}
                className={`p-4 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'border-blue-700 bg-blue-50/60 shadow-md ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-xs font-extrabold text-blue-950 uppercase tracking-wide">
                    {item.schemeName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    item.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                    item.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    item.status === 'DEFICIENT' ? 'bg-rose-100 text-rose-800' :
                    'bg-amber-100 text-amber-900'
                  }`}>
                    {getStageFriendlyLabel(item.status)}
                  </span>
                </div>

                <div className="space-y-1.5 my-3 bg-slate-50 p-3 rounded border border-slate-200/80 text-xs font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-sans">Application ID:</span>
                    <strong className="text-slate-900 font-bold">{item.id}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-sans">Applicant ID:</span>
                    <strong className="text-blue-950 font-bold">{itemApplicantId}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-sans">Status:</span>
                    <strong className="text-slate-800">{getStageFriendlyLabel(item.status)}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">Submitted: {item.submissionDate}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedAppId(item.id)}
                      className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${
                        isSelected
                          ? 'bg-blue-800 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {isSelected ? 'Viewing' : 'Select'}
                    </button>
                    <Link
                      to={`/applicant/status?applicationId=${item.id}`}
                      className="px-2.5 py-1.5 bg-[#0b2853] hover:bg-[#134685] text-white rounded text-xs font-bold transition-colors inline-flex items-center gap-1"
                      title="Track full workflow timeline for this application"
                    >
                      <span>Track Status</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 11: APPROVED BANNER */}
      {app.status === 'APPROVED' && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border-2 border-emerald-500 rounded-lg p-6 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-600 text-white rounded-full shadow-md">
                <Award className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded">
                  ✓ APPLICATION APPROVED
                </span>
                <h2 className="text-lg sm:text-xl font-black text-emerald-950 mt-1">
                  Sanction Approved for {app.schemeName}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs text-emerald-900 font-medium">
                  <div>
                    <span className="text-emerald-700 block text-[11px]">Application ID:</span>
                    <strong className="font-mono">{app.id}</strong>
                  </div>
                  <div>
                    <span className="text-emerald-700 block text-[11px]">Current Stage:</span>
                    <strong>Approved</strong>
                  </div>
                  <div>
                    <span className="text-emerald-700 block text-[11px]">Approved Date:</span>
                    <strong>{app.lastUpdated}</strong>
                  </div>
                </div>
                <p className="text-xs text-emerald-800 mt-2">
                  Official Sanction Order has been signed by Joint Secretary (Scholarships & DBT Mission). Direct Benefit Transfer (DBT) disbursement has been registered to your Aadhaar-seeded bank account.
                </p>
              </div>
            </div>

            <button
              onClick={() => alert(`Downloading Official Award Letter and Sanction Order for ${app.id}`)}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded shadow-md flex items-center justify-center gap-2 self-start sm:self-center transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download Award Letter</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 12: REJECTION BANNER */}
      {app.status === 'REJECTED' && (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-5 shadow-sm space-y-2">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-600 text-white rounded-full flex-shrink-0">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-widest text-red-800 bg-red-200 px-2 py-0.5 rounded">
                APPLICATION REJECTED
              </span>
              <h3 className="text-base font-extrabold text-red-950 mt-1">
                Application Decision: Rejected
              </h3>
              <p className="text-xs text-red-900 mt-1 leading-relaxed">
                <strong>Reason:</strong> {app.rejectionReason || app.officerRemarks || 'Application does not satisfy statutory scheme eligibility criteria.'}
              </p>
              <p className="text-[11px] text-red-800 mt-1">
                If you believe this decision was made in error or have additional statutory documentation, you may lodge a citizen grievance through the Grievance Cell.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 13: DEFICIENCY NOTIFIED BANNER */}
      {app.hasDeficiency && (
        <div className="bg-rose-50 border-2 border-rose-500 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-600 text-white rounded-full flex-shrink-0 animate-bounce">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-rose-800 bg-rose-200 px-2 py-0.5 rounded block w-fit">
                  ⚠ CORRECTION REQUIRED
                </span>
                <h3 className="text-base font-extrabold text-rose-950 mt-1">
                  Correction Required on Application {app.id}
                </h3>
                <p className="text-xs text-rose-900 leading-relaxed mt-1">
                  <strong>Reason:</strong> {app.deficiencyReason || app.deficiencyNotes || 'Discrepancy noted in certificate validity.'}
                </p>
                {app.deficiencyRequiredCorrection && (
                  <p className="text-xs text-rose-950 font-bold mt-1">
                    <strong>Required Action:</strong> {app.deficiencyRequiredCorrection}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setTargetDocToFix(null);
                setIsResolveModalOpen(true);
              }}
              className="px-4 py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded shadow-md flex items-center justify-center gap-1.5 flex-shrink-0 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Correct Document</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 15: APPLICATION METRICS SNAPSHOT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Application ID
          </span>
          <div className="text-sm font-black text-blue-950 font-mono">
            {app.id}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Submitted: {app.submissionDate}
          </span>
        </div>

        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Scheme
          </span>
          <div className="text-sm font-bold text-[#0b2853] line-clamp-1">
            {app.schemeName}
          </div>
          <span className="text-[11px] text-blue-800 font-semibold mt-1 block">
            Code: {app.schemeCode}
          </span>
        </div>

        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Current Stage
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-black uppercase tracking-wider ${
                app.status === 'APPROVED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : app.status === 'DEFICIENT'
                  ? 'bg-rose-100 text-rose-800 animate-pulse'
                  : app.status === 'REJECTED'
                  ? 'bg-red-100 text-red-800'
                  : app.status === 'SELECTION'
                  ? 'bg-indigo-100 text-indigo-900'
                  : app.status === 'SCRUTINY'
                  ? 'bg-purple-100 text-purple-900'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {getStageFriendlyLabel(app.status)}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block truncate" title={getStageFriendlyMessage(app.status)}>
            {getStageFriendlyMessage(app.status)}
          </span>
        </div>

        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Last Updated
          </span>
          <div className="text-xs font-bold text-slate-800">
            {app.lastUpdated}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            MoTA Registry Status: Verified
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 6 & 7: APPLICANT ENCLOSED DOCUMENTS & VERIFICATION STATUS           */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-sm text-[#0b2853] uppercase tracking-wide flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-blue-900" />
              <span>Enclosed Documents & Verification Status</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Statutory verification status of your uploaded certificates as reviewed by MoTA Scrutiny Officers.
            </p>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            Total Enclosed: {app.documents?.length || 0}
          </span>
        </div>

        <div className="p-4">
          {(!app.documents || app.documents.length === 0) ? (
            <div className="p-6 text-center text-slate-400 italic">No documents currently uploaded.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {app.documents.map((doc, idx) => {
                const isDocVerified = doc.verificationStatus === 'VERIFIED' || doc.status === 'VERIFIED';
                const isDocRejected = doc.verificationStatus === 'REJECTED' || doc.status === 'REJECTED';
                const isDocPending = !isDocVerified && !isDocRejected;

                return (
                  <div
                    key={doc.id || idx}
                    className={`p-3.5 rounded border transition-all ${
                      isDocVerified
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : isDocRejected
                        ? 'bg-rose-50/60 border-rose-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5">
                          {isDocVerified ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          ) : isDocRejected ? (
                            <AlertTriangle className="w-5 h-5 text-rose-600" />
                          ) : (
                            <Clock className="w-5 h-5 text-amber-500" />
                          )}
                        </div>
                        <div>
                          <div className="font-extrabold text-xs text-slate-900">
                            {doc.documentName || doc.fileName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            File: {doc.fileName}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide flex-shrink-0 ${
                        isDocVerified
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : isDocRejected
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        {isDocVerified ? '✓ Verified' : isDocRejected ? '⚠ Correction Required' : '⏳ Pending Verification'}
                      </span>
                    </div>

                    {/* Rejection / Deficiency Notice for this Document */}
                    {isDocRejected && (
                      <div className="mt-2.5 p-2.5 bg-rose-100/70 border border-rose-200 rounded text-xs space-y-1.5">
                        <div className="text-rose-950">
                          <strong className="text-rose-900">Reason: </strong>
                          {doc.rejectionReason || doc.deficiencyReason || 'The uploaded document is not the required certificate or is unclear.'}
                        </div>
                        <button
                          onClick={() => {
                            setTargetDocToFix({
                              id: doc.id,
                              name: doc.documentName || doc.fileName,
                              reason: doc.rejectionReason || doc.deficiencyReason
                            });
                            setIsResolveModalOpen(true);
                          }}
                          className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Correct Document</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 14: 6-STAGE STATUTORY TRACKING TIMELINE */}
      <StatusTimeline
        application={app}
        onRectifyDeficiency={() => {
          setTargetDocToFix(null);
          setIsResolveModalOpen(true);
        }}
      />

      {/* Statutory Eligibility Card */}
      <ExplainableEvidenceCard
        decision={app.hasDeficiency ? 'DEFICIENCY_FLAGGED' : app.status === 'REJECTED' ? 'NOT_ELIGIBLE' : 'ELIGIBLE'}
        schemeName={app.schemeName}
        evidenceList={[
          {
            ruleLabel: 'ST Community Statutory Criterion',
            ruleFormula: 'category == ST',
            documentSource: 'ST Caste Certificate → Category',
            extractedValue: `Scheduled Tribe (${app.applicant.tribeCommunity || 'ST'})`,
            declaredValue: 'ST',
            status: 'SATISFIED',
            statutoryReference: 'The Constitution (Scheduled Tribes) Order, 1950'
          },
          {
            ruleLabel: 'Income Limit Statutory Criterion',
            ruleFormula: 'annualIncome <= schemeCeiling',
            documentSource: 'Income Certificate → Certified Family Income',
            extractedValue: `₹${Number(app.annualFamilyIncome || 0).toLocaleString('en-IN')}`,
            declaredValue: `₹${Number(app.annualFamilyIncome || 0).toLocaleString('en-IN')}`,
            status: app.hasDeficiency ? 'WARNING' : 'SATISFIED',
            statutoryReference: 'MoTA Operational Guidelines Section 4.2'
          },
          {
            ruleLabel: 'Academic Score Threshold',
            ruleFormula: 'percentage >= minThreshold',
            documentSource: 'Qualifying Marksheet → Aggregate %',
            extractedValue: `${app.academic.previousExamPercentage || 0}%`,
            declaredValue: `${app.academic.previousExamPercentage || 0}%`,
            status: 'SATISFIED',
            statutoryReference: 'Academic Eligibility Matrix Table 1'
          }
        ]}
      />

      {/* Deficiency / Document Rectification Modal */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-sm">Replace Document & Resubmit Application</h3>
              </div>
              <button
                onClick={() => {
                  setIsResolveModalOpen(false);
                  setTargetDocToFix(null);
                }}
                className="text-slate-200 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResolveDeficiencySubmit} className="p-5 space-y-4 text-xs">
              <div className="bg-rose-50 border-l-4 border-rose-600 p-3 text-rose-950">
                <strong className="text-rose-900 block mb-0.5">Discrepancy / Deficiency Stated by Officer:</strong>
                {targetDocToFix?.reason || app.deficiencyReason || app.deficiencyNotes || 'The uploaded certificate requires renewal or is invalid.'}
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Document to Correct:
                </label>
                <input
                  type="text"
                  disabled
                  value={targetDocToFix?.name || 'Income Certificate (Renewed FY 2024-25)'}
                  className="w-full p-2 bg-slate-100 border border-slate-300 rounded font-semibold text-slate-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Upload Replacement Certificate (PDF / JPG up to 2MB):
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setNewCertFileObj(f);
                      setNewCertFileName(f.name);
                    }
                  }}
                  className="w-full p-2 bg-white border border-slate-300 rounded text-slate-900 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#0b2853] file:text-white hover:file:bg-[#134685]"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  File selected: <span className="font-mono font-semibold">{newCertFileName}</span>
                </span>
              </div>

              <div className="bg-emerald-50 p-3 rounded border border-emerald-200 text-emerald-900 text-[11px]">
                ✓ On resubmission, your application status will automatically transition to <strong>RESUBMITTED</strong> and queue for officer re-verification.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsResolveModalOpen(false);
                    setTargetDocToFix(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFix}
                  className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded font-bold shadow flex items-center gap-1.5"
                >
                  {isSubmittingFix ? 'Uploading & Resubmitting...' : 'Upload & Resubmit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
