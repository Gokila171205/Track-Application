import React from 'react';
import { ApplicationRecord, ApplicationStatus } from '../../types/application';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Award,
  ArrowRight,
  FileText,
  Calendar,
  Layers,
  ChevronRight,
  Upload
} from 'lucide-react';
import { Link } from 'react-router-dom';

export interface ApplicationCardProps {
  application: ApplicationRecord;
  status: ApplicationStatus;
  isSelected?: boolean;
  onSelect?: (application: ApplicationRecord) => void;
  onRectifyDeficiency?: (application: ApplicationRecord) => void;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({
  application,
  status,
  isSelected = false,
  onSelect,
  onRectifyDeficiency
}) => {
  // STRICT REQUIREMENT: Status must come strictly from application.status (or explicitly passed status prop)
  const appStatus = status || application.status;
  const isApproved = appStatus === 'APPROVED';
  const isRejected = appStatus === 'REJECTED';
  const isDeficient = appStatus === 'DEFICIENT' || application.hasDeficiency;
  const isResubmitted = appStatus === 'RESUBMITTED';

  const getStatusBadge = () => {
    switch (appStatus) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Approved</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-300">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Rejected</span>
          </span>
        );
      case 'DEFICIENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Correction Required</span>
          </span>
        );
      case 'RESUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-700" />
            <span>Resubmitted Under Review</span>
          </span>
        );
      case 'SELECTION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-indigo-100 text-indigo-900 border border-indigo-300">
            <Award className="w-3.5 h-3.5 text-indigo-700" />
            <span>Selection Board</span>
          </span>
        );
      case 'SCRUTINY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300">
            <Layers className="w-3.5 h-3.5 text-purple-700" />
            <span>Under Scrutiny</span>
          </span>
        );
      case 'ELIGIBILITY_VERIFICATION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>Eligibility Check</span>
          </span>
        );
      case 'DOCUMENT_VERIFICATION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-sky-100 text-sky-900 border border-sky-300">
            <Clock className="w-3.5 h-3.5 text-sky-700" />
            <span>Document Verification</span>
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-300">
            <FileText className="w-3.5 h-3.5 text-slate-600" />
            <span>Draft</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>{appStatus.replace(/_/g, ' ')}</span>
          </span>
        );
    }
  };

  const getStatusSummaryMessage = () => {
    if (isApproved) {
      return 'Official sanction approved by Competent Authority. Direct DBT disbursement scheduled to Aadhaar-seeded bank account.';
    }
    if (isRejected) {
      return application.rejectionReason || application.officerRemarks || 'Application did not satisfy mandatory scheme criteria.';
    }
    if (isDeficient) {
      return application.deficiencyReason || application.deficiencyNotes || 'Discrepancy or illegible certificate scan detected. Please upload valid replacement.';
    }
    if (isResubmitted) {
      return 'Rectified documents submitted by applicant. Under active re-verification by scrutiny officer.';
    }
    if (appStatus === 'SELECTION') {
      return 'Scrutiny cleared. Dossier presented before National Selection Board for scholarship quota slotting.';
    }
    if (appStatus === 'SCRUTINY') {
      return 'Eligibility cleared. Application undergoing detailed review by Official Scrutiny Cell.';
    }
    if (appStatus === 'ELIGIBILITY_VERIFICATION') {
      return 'Certificates verified. Statutory income and academic criterion verification in progress.';
    }
    return 'Application successfully lodged on MoTA citizen gateway. Scrutiny officer assignment underway.';
  };

  const applicantIdDisplay = application.applicantId || application.applicant?.applicantId || 'ST-2026-000123';

  return (
    <div
      className={`rounded-lg border transition-all duration-200 overflow-hidden ${
        isSelected
          ? 'bg-blue-50/70 border-blue-600 shadow-md ring-2 ring-blue-500/30'
          : 'bg-white border-slate-300 hover:border-slate-400 hover:shadow-sm'
      }`}
    >
      {/* Header bar */}
      <div className="p-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">
              {application.schemeCode}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-mono font-bold text-blue-900">
              {application.id}
            </span>
          </div>
          <h3 className="text-sm font-black text-[#0b2853] line-clamp-1">
            {application.schemeName || 'MoTA Scholarship Scheme'}
          </h3>
        </div>
        <div className="flex-shrink-0">
          {getStatusBadge()}
        </div>
      </div>

      {/* Body content */}
      <div className="p-4 space-y-3 text-xs">
        {/* Key IDs */}
        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200/80 font-mono text-[11px]">
          <div>
            <span className="text-slate-500 font-sans block text-[10px] uppercase font-bold">Application ID</span>
            <strong className="text-slate-900">{application.id}</strong>
          </div>
          <div>
            <span className="text-slate-500 font-sans block text-[10px] uppercase font-bold">Applicant ID</span>
            <strong className="text-blue-950">{applicantIdDisplay}</strong>
          </div>
        </div>

        {/* Status Callout Message */}
        <div
          className={`p-3 rounded border text-xs leading-relaxed ${
            isApproved
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : isRejected
              ? 'bg-red-50/80 border-red-200 text-red-950 font-medium'
              : isDeficient
              ? 'bg-rose-50/80 border-rose-300 text-rose-950 font-medium'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <div className="flex items-start gap-2">
            {isApproved && <Award className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
            {isRejected && <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
            {isDeficient && <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
            {!isApproved && !isRejected && !isDeficient && <Clock className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />}
            <div>
              <strong className="block text-[11px] uppercase tracking-wider mb-0.5">
                {isApproved ? 'Approval Status' : isRejected ? 'Rejection Reason' : isDeficient ? 'Action Required' : 'Lifecycle Stage'}
              </strong>
              <span>{getStatusSummaryMessage()}</span>
            </div>
          </div>
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Submitted: <strong>{application.submissionDate}</strong></span>
          </span>
          <span>Updated: <strong>{application.lastUpdated}</strong></span>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
        {isDeficient && onRectifyDeficiency ? (
          <button
            onClick={() => onRectifyDeficiency(application)}
            className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded flex items-center gap-1 shadow-sm transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Resolve Deficiency</span>
          </button>
        ) : (
          <span className="text-[11px] text-slate-500 font-mono">
            {application.documents?.length || 0} documents verified
          </span>
        )}

        <div className="flex items-center gap-2">
          {onSelect && (
            <button
              onClick={() => onSelect(application)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors flex items-center gap-1 ${
                isSelected
                  ? 'bg-blue-900 text-white shadow'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{isSelected ? 'Viewing Timeline' : 'View Timeline'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          <Link
            to={`/applicant/status?applicationId=${application.id}`}
            className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs rounded transition-colors inline-flex items-center gap-1"
            title="Open tracking page for this application"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
