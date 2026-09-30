import React from 'react';
import { ApplicationRecord } from '../../types/application';
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Building,
  FileCheck2,
  XCircle,
  Award
} from 'lucide-react';

interface StatusTimelineProps {
  application: ApplicationRecord;
  onRectifyDeficiency?: () => void;
}

export const StatusTimeline: React.FC<StatusTimelineProps> = ({
  application,
  onRectifyDeficiency
}) => {
  const isApproved = application.status === 'APPROVED';
  const isRejected = application.status === 'REJECTED';
  const isDeficient = application.status === 'DEFICIENT';

  // 6 canonical statutory lifecycle stages per MoTA guidelines
  const stages = [
    {
      index: 1,
      title: 'Application Submitted',
      description: 'Online application lodged with verified Aadhaar e-KYC.',
      responsibleAuthority: 'Citizen Gateway',
      isCompleted: true,
      isCurrent: application.status === 'SUBMITTED',
      isDeficient: false,
      date: application.submissionDate,
      remarks: 'Application received and registered successfully on MoTA portal.'
    },
    {
      index: 2,
      title: 'Document Verification',
      description: 'Verification of mandatory caste, income, and academic certificates.',
      responsibleAuthority: 'MoTA Scrutiny Officer',
      isCompleted: ['ELIGIBILITY_VERIFICATION', 'SCRUTINY', 'SELECTION', 'APPROVED'].includes(application.status),
      isCurrent: ['DOCUMENT_VERIFICATION', 'RESUBMITTED'].includes(application.status),
      isDeficient: isDeficient,
      date: application.lastUpdated,
      remarks: isDeficient
        ? (application.deficiencyReason || application.deficiencyNotes || 'Deficiency detected in certificate validity.')
        : application.status === 'RESUBMITTED'
        ? 'Corrected documents submitted by applicant. Under re-verification.'
        : ['ELIGIBILITY_VERIFICATION', 'SCRUTINY', 'SELECTION', 'APPROVED'].includes(application.status)
        ? 'All mandatory certificates verified as genuine and valid.'
        : 'Documents currently undergoing scrutiny by designated verification officer.'
    },
    {
      index: 3,
      title: 'Eligibility Verification',
      description: 'Statutory verification against scheme income caps and academic criteria.',
      responsibleAuthority: 'Eligibility Verification Officer',
      isCompleted: ['SCRUTINY', 'SELECTION', 'APPROVED'].includes(application.status),
      isCurrent: application.status === 'ELIGIBILITY_VERIFICATION',
      isDeficient: false,
      date: ['SCRUTINY', 'SELECTION', 'APPROVED'].includes(application.status) ? application.lastUpdated : 'Pending',
      remarks: ['SCRUTINY', 'SELECTION', 'APPROVED'].includes(application.status)
        ? 'Applicant satisfies all statutory scheme guidelines and eligibility criteria.'
        : application.status === 'ELIGIBILITY_VERIFICATION'
        ? 'Eligibility checks in progress by statutory verification cell.'
        : 'Awaiting completion of document verification.'
    },
    {
      index: 4,
      title: 'Scrutiny',
      description: 'Administrative examination by Official Scrutiny Cell.',
      responsibleAuthority: 'MoTA Scrutiny Cell (Shastri Bhawan)',
      isCompleted: ['SELECTION', 'APPROVED'].includes(application.status),
      isCurrent: application.status === 'SCRUTINY',
      isDeficient: false,
      date: ['SELECTION', 'APPROVED'].includes(application.status) ? application.lastUpdated : 'Pending',
      remarks: ['SELECTION', 'APPROVED'].includes(application.status)
        ? (application.officerRemarks || 'Statutory scrutiny passed successfully.')
        : application.status === 'SCRUTINY'
        ? 'Application currently under scrutiny committee review.'
        : 'Awaiting eligibility verification clearance.'
    },
    {
      index: 5,
      title: 'Selection',
      description: 'National Selection Board roster review and quota determination.',
      responsibleAuthority: 'Selection Committee',
      isCompleted: isApproved,
      isCurrent: application.status === 'SELECTION',
      isDeficient: false,
      date: isApproved ? application.lastUpdated : 'Pending',
      remarks: isApproved
        ? 'Selected on national merit roster. Approved for scholarship sanction.'
        : application.status === 'SELECTION'
        ? 'Under active evaluation by the National Selection Committee.'
        : 'Awaiting scrutiny clearance.'
    },
    {
      index: 6,
      title: isRejected ? 'Application Rejected' : 'Approval',
      description: isRejected
        ? 'Application declined by Competent Authority.'
        : 'Final sanction by Joint Secretary (Scholarships & DBT Mission).',
      responsibleAuthority: 'Sanctioning Authority (MoTA)',
      isCompleted: isApproved || isRejected,
      isCurrent: isApproved || isRejected,
      isDeficient: false,
      isRejected: isRejected,
      date: (isApproved || isRejected) ? application.lastUpdated : 'Pending',
      remarks: isApproved
        ? 'Sanction Order generated. Direct DBT disbursement initiated to Aadhaar-seeded bank account.'
        : isRejected
        ? (application.rejectionReason || application.officerRemarks || 'Application did not satisfy mandatory scheme criteria.')
        : 'Pending final sanction and award release.'
    }
  ];

  return (
    <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#0b2853] text-white p-4 border-b-2 border-amber-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 block">
            End-to-End Tracking Lifecycle
          </span>
          <h3 className="text-sm sm:text-base font-bold text-white">
            Application Status: <span className="font-mono">{application.id}</span>
          </h3>
        </div>

        {/* Current status badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 font-medium hidden sm:inline">Current Stage:</span>
          <span className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider ${
            isApproved
              ? 'bg-emerald-600 text-white'
              : isDeficient
              ? 'bg-rose-600 text-white animate-pulse'
              : isRejected
              ? 'bg-red-600 text-white'
              : application.status === 'SELECTION'
              ? 'bg-indigo-600 text-white'
              : application.status === 'SCRUTINY'
              ? 'bg-purple-600 text-white'
              : 'bg-amber-400 text-slate-950'
          }`}>
            {application.status === 'DOCUMENT_VERIFICATION' ? 'Document Verification'
              : application.status === 'ELIGIBILITY_VERIFICATION' ? 'Eligibility Verification'
              : application.status === 'RESUBMITTED' ? 'Resubmitted'
              : application.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Deficiency Action Callout (if active) */}
      {isDeficient && (
        <div className="bg-rose-50 border-b border-rose-300 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-900 text-xs sm:text-sm">
                CORRECTION REQUIRED • ACTION NEEDED FROM APPLICANT
              </h4>
              <p className="text-xs text-rose-800 leading-relaxed mt-0.5">
                <strong>Reason:</strong> {application.deficiencyReason || application.deficiencyNotes || 'Document correction requested by scrutiny officer.'}
              </p>
              {application.deficiencyRequiredCorrection && (
                <p className="text-xs text-rose-950 font-semibold mt-0.5">
                  <strong>Required Action:</strong> {application.deficiencyRequiredCorrection}
                </p>
              )}
            </div>
          </div>

          {onRectifyDeficiency && (
            <button
              onClick={onRectifyDeficiency}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded shadow flex-shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <span>Upload Correct Document</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Rejection Callout (if active) */}
      {isRejected && (
        <div className="bg-red-50 border-b border-red-300 p-4 flex items-start gap-2.5">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-red-900 text-xs sm:text-sm">
              APPLICATION REJECTED
            </h4>
            <p className="text-xs text-red-800 leading-relaxed mt-0.5">
              <strong>Reason:</strong> {application.rejectionReason || application.officerRemarks || 'Application does not satisfy statutory scheme criteria.'}
            </p>
          </div>
        </div>
      )}

      {/* 6-Stage Timeline Steps */}
      <div className="p-6">
        <div className="relative border-l-2 border-slate-300 ml-4 sm:ml-6 space-y-6">
          {stages.map((stage) => {
            return (
              <div key={stage.index} className="relative pl-6 sm:pl-8 group">
                {/* Node icon / circle */}
                <div
                  className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs shadow-sm transition-all ${
                    stage.isRejected
                      ? 'bg-red-600 border-red-700 text-white'
                      : stage.isDeficient
                      ? 'bg-rose-600 border-rose-700 text-white animate-pulse'
                      : stage.isCompleted
                      ? 'bg-emerald-700 border-emerald-800 text-white'
                      : stage.isCurrent
                      ? 'bg-amber-500 border-amber-600 text-slate-950 ring-4 ring-amber-100'
                      : 'bg-white border-slate-400 text-slate-400'
                  }`}
                >
                  {stage.isRejected ? (
                    <XCircle className="w-4 h-4 text-white" />
                  ) : stage.isDeficient ? (
                    <AlertTriangle className="w-4 h-4 text-white" />
                  ) : stage.isCompleted ? (
                    <CheckCircle className="w-4 h-4 text-white" />
                  ) : stage.isCurrent ? (
                    <span className="text-slate-950 font-black">●</span>
                  ) : (
                    <span>○</span>
                  )}
                </div>

                {/* Card details */}
                <div className={`p-4 rounded border text-xs transition-colors ${
                  stage.isRejected
                    ? 'bg-red-50/80 border-red-300'
                    : stage.isDeficient
                    ? 'bg-rose-50/80 border-rose-300'
                    : stage.isCompleted
                    ? 'bg-white border-slate-300 shadow-xs'
                    : stage.isCurrent
                    ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                    : 'bg-slate-50/60 border-slate-200 text-slate-500'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">
                        {stage.index}. {stage.title}
                      </span>
                      {stage.isCompleted && !stage.isRejected && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 uppercase">
                          ✓ Completed
                        </span>
                      )}
                      {stage.isCurrent && !stage.isCompleted && !stage.isDeficient && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 uppercase">
                          ● Current Stage
                        </span>
                      )}
                      {stage.isDeficient && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-200 text-rose-900 uppercase">
                          ⚠ Correction Required
                        </span>
                      )}
                      {stage.isRejected && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-200 text-red-900 uppercase">
                          ✕ Rejected
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      Date: <strong className="text-slate-700">{stage.date}</strong>
                    </span>
                  </div>

                  <p className="text-slate-600 text-[11px] mb-2">
                    {stage.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-[11px]">
                    <span className="text-slate-500">
                      Responsible Authority: <strong className="text-slate-800">{stage.responsibleAuthority}</strong>
                    </span>
                    <span className="text-slate-700 italic">
                      Remarks: "{stage.remarks}"
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
