import React from 'react';
import {
  AlertTriangle,
  FileX,
  Clock,
  UserX,
  FileCheck2,
  CalendarX,
  ShieldAlert,
  ArrowRight,
  UploadCloud,
  Trash2,
  CheckCircle2,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { ExplainableIssue } from '../../types/explainableValidation';

interface ExplainableErrorCardProps {
  issue: ExplainableIssue;
  onRemove?: () => void;
  onReplace?: () => void;
  onActionClick?: () => void;
  isOfficerMode?: boolean;
  className?: string;
}

export const ExplainableErrorCard: React.FC<ExplainableErrorCardProps> = ({
  issue,
  onRemove,
  onReplace,
  onActionClick,
  isOfficerMode = false,
  className = ''
}) => {
  const isError = issue.status === 'ERROR';
  const isWarning = issue.status === 'WARNING';

  // Select appropriate icon
  const renderIcon = () => {
    switch (issue.category) {
      case 'DOCUMENT_TYPE_MISMATCH':
        return <FileX className="w-5 h-5 text-red-600 flex-shrink-0" />;
      case 'DOCUMENT_EXPIRED':
        return <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />;
      case 'NAME_MISMATCH':
      case 'DOB_MISMATCH':
      case 'ID_MISMATCH':
        return <UserX className="w-5 h-5 text-amber-600 flex-shrink-0" />;
      case 'DOCUMENT_QUALITY':
      case 'UNABLE_TO_VERIFY_VALIDITY':
        return <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />;
      case 'FILE_SIZE':
      case 'FILE_FORMAT':
      case 'CORRUPTED_FILE':
        return <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />;
      case 'MISSING_DOCUMENT':
        return <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />;
    }
  };

  const borderClass = isError
    ? 'border-red-300 bg-red-50/70'
    : 'border-amber-300 bg-amber-50/70';

  const titleClass = isError ? 'text-red-950 font-black' : 'text-amber-950 font-black';
  const badgeClass = isError
    ? 'bg-red-100 text-red-800 border-red-200'
    : 'bg-amber-100 text-amber-900 border-amber-200';

  // Dynamic contextual labels matching user prompt requirements
  const getExpectedLabel = () => {
    switch (issue.category) {
      case 'DOCUMENT_TYPE_MISMATCH':
        return 'Required document:';
      case 'FILE_SIZE':
        return 'Maximum allowed size:';
      case 'FILE_FORMAT':
        return 'Allowed formats:';
      case 'PHONE_FORMAT':
        return 'Expected:';
      case 'NAME_MISMATCH':
        return 'Application name:';
      case 'DOB_MISMATCH':
        return 'Application DOB:';
      case 'ID_MISMATCH':
        return 'Application ID:';
      case 'MISSING_DOCUMENT':
        return 'Please upload:';
      default:
        return 'What was expected?';
    }
  };

  const getProvidedLabel = () => {
    switch (issue.category) {
      case 'DOCUMENT_TYPE_MISMATCH':
        return 'Uploaded document:';
      case 'FILE_SIZE':
        return 'Your file is:';
      case 'FILE_FORMAT':
        return 'You uploaded:';
      case 'PHONE_FORMAT':
        return 'You entered:';
      case 'NAME_MISMATCH':
        return 'Document name:';
      case 'DOB_MISMATCH':
        return 'Document DOB:';
      case 'ID_MISMATCH':
        return 'Document ID:';
      case 'DOCUMENT_EXPIRED':
        return 'Validity:';
      default:
        return 'What did you provide?';
    }
  };

  const getActionLabel = () => {
    switch (issue.category) {
      case 'DOCUMENT_TYPE_MISMATCH':
        return 'What should you upload?';
      default:
        return 'What should you do?';
    }
  };

  const getReplaceButtonLabel = () => {
    switch (issue.category) {
      case 'DOCUMENT_TYPE_MISMATCH':
        return 'Upload Correct Document';
      case 'DOCUMENT_QUALITY':
        return 'Replace Document';
      case 'FILE_SIZE':
      case 'FILE_FORMAT':
      case 'CORRUPTED_FILE':
        return 'Choose Another File';
      default:
        return 'Upload Correct Document';
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm space-y-3 transition-all ${borderClass} ${className}`}
      role="alert"
    >
      {/* 1. WHAT IS WRONG? */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-1 rounded bg-white shadow-xs mt-0.5">
            {renderIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs sm:text-sm tracking-wide ${titleClass}`}>
                ⚠️ {issue.what_is_wrong}
              </span>
              {issue.field_id && isOfficerMode && (
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-bold ${badgeClass}`}>
                  {issue.field_id}
                </span>
              )}
            </div>
            {/* 2. WHY IS IT WRONG? */}
            {issue.why_is_wrong && (
              <p className="text-xs text-slate-800 mt-1 font-medium leading-relaxed">
                <span className="font-bold text-slate-900">Why is this wrong? </span>
                {issue.why_is_wrong}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3. WHAT WAS EXPECTED? & WHAT DID YOU PROVIDE? */}
      {(issue.expected || issue.provided) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
          {issue.expected && (
            <div className="p-2.5 bg-white/95 rounded border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                {getExpectedLabel()}
              </span>
              <span className="font-bold text-emerald-800">
                {issue.expected}
              </span>
            </div>
          )}

          {issue.provided && (
            <div className="p-2.5 bg-white/95 rounded border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                {getProvidedLabel()}
              </span>
              <span className="font-bold text-red-800">
                {issue.provided}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4. WHAT SHOULD THE APPLICANT DO TO FIX IT? */}
      {issue.action && (
        <div className="p-2.5 bg-white rounded border border-slate-200 flex items-start gap-2 text-xs">
          <Sparkles className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-blue-950 block">{getActionLabel()}</span>
            <span className="text-slate-700 text-[11px] leading-relaxed">
              {issue.action}
            </span>
          </div>
        </div>
      )}

      {/* OFFICER ONLY AUDIT META (Part 19: Hidden from Applicant) */}
      {isOfficerMode && (
        <div className="mt-2 p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono space-y-1">
          <div className="flex items-center justify-between text-[10px] text-amber-400 font-bold uppercase tracking-wider">
            <span>Official Scrutiny Forensics</span>
            {issue.confidence !== undefined && (
              <span>Confidence: {(issue.confidence * 100).toFixed(1)}%</span>
            )}
          </div>
          {issue.detected_type && (
            <div>Classified Type: <strong>{issue.detected_type}</strong></div>
          )}
          {issue.details && Object.keys(issue.details).length > 0 && (
            <div className="text-[10px] text-slate-300 pt-1">
              Extracted Fields: {JSON.stringify(issue.details)}
            </div>
          )}
        </div>
      )}

      {/* CONTEXTUAL ACTION BUTTONS (Parts 1, 7, 8, 15) */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-bold rounded flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Document</span>
          </button>
        )}

        {onReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="px-3 py-1.5 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{getReplaceButtonLabel()}</span>
          </button>
        )}

        {onActionClick && !onReplace && (
          <button
            type="button"
            onClick={onActionClick}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span>Correct This Field</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
