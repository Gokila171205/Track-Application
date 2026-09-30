import React from 'react';
import { SchemeConfig } from '../../types/scheme';
import { getSchemeWindowStatus } from '../../utils/schemeWindow';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getHindiScheme } from '../../data/translations/hi';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  BookOpen,
  Award,
  Globe,
  Wallet,
  Clock,
  CheckCircle,
  ArrowRight,
  Sparkles,
  FileCheck2,
  FileText
} from 'lucide-react';

interface SchemeCardProps {
  scheme: SchemeConfig;
  onOpenPreCheck: (scheme: SchemeConfig) => void;
}

export const SchemeCard: React.FC<SchemeCardProps> = ({ scheme, onOpenPreCheck }) => {
  const { language, applications = [], draftApplications = [] } = useApp();
  const { isAuthenticated, user } = useAuth();
  const displayedScheme = language === 'HI' ? getHindiScheme(scheme) : scheme;
  const windowStatus = getSchemeWindowStatus(scheme);

  const isApplicant = Boolean(isAuthenticated && user?.role === 'APPLICANT');
  const userDraft = isApplicant
    ? draftApplications.find((a) => a.schemeId === scheme.id || a.schemeCode === scheme.code) ||
      applications.find((a) => (a.schemeId === scheme.id || a.schemeCode === scheme.code) && a.status === 'DRAFT')
    : undefined;

  const userSubmittedApp = isApplicant
    ? applications.find((a) => (a.schemeId === scheme.id || a.schemeCode === scheme.code) && a.status !== 'DRAFT')
    : undefined;

  // Category-specific icons and colors
  const getCategoryIcon = () => {
    switch (scheme.category) {
      case 'PRE_MATRIC':
        return <BookOpen className="w-6 h-6 text-blue-800" />;
      case 'POST_MATRIC':
        return <GraduationCap className="w-6 h-6 text-indigo-800" />;
      case 'NATIONAL_SCHOLARSHIP':
        return <Award className="w-6 h-6 text-amber-700" />;
      case 'NATIONAL_FELLOWSHIP':
        return <FileCheck2 className="w-6 h-6 text-emerald-800" />;
      case 'NATIONAL_OVERSEAS':
        return <Globe className="w-6 h-6 text-sky-800" />;
      case 'DBT':
        return <Wallet className="w-6 h-6 text-cyan-800" />;
      default:
        return <Award className="w-6 h-6 text-blue-800" />;
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden group">
      {/* Top Banner / Category header */}
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider bg-white px-2 py-0.5 rounded border border-slate-200">
          {displayedScheme.portalCategory}
        </span>
        
        {userSubmittedApp ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-900 bg-blue-100/90 px-2 py-0.5 rounded border border-blue-300 shadow-xs" title={`Application ID: ${userSubmittedApp.id}`}>
            <CheckCircle className="w-3.5 h-3.5 text-blue-700" />
            <span>Applied • {userSubmittedApp.status.replace(/_/g, ' ')}</span>
          </span>
        ) : userDraft ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-300 shadow-xs" title="You have an active draft application">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>Draft in Progress</span>
          </span>
        ) : windowStatus.state === 'OPEN' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" title={windowStatus.message}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            OPEN
          </span>
        ) : windowStatus.state === 'CLOSING_SOON' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title={windowStatus.message}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            CLOSING SOON
          </span>
        ) : windowStatus.state === 'NOT_STARTED' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200" title={windowStatus.message}>
            NOT YET OPEN
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200" title={windowStatus.message}>
            CLOSED
          </span>
        )}
      </div>

      <div className="px-4 pt-2 text-[10px] font-bold text-center text-slate-500 bg-slate-50 border-b border-slate-100">
        {windowStatus.message}
      </div>

      {/* Main Content */}
      <div className="p-4 flex-1">
        <div className="flex items-start gap-3 mb-2.5">
          <div className="p-2.5 bg-blue-50 border border-blue-100 rounded flex-shrink-0 mt-0.5 group-hover:bg-blue-100 transition-colors">
            {getCategoryIcon()}
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 tracking-wider">
              {scheme.code}
            </span>
            <h3 className="text-sm sm:text-base font-bold text-[#0b2853] leading-snug group-hover:text-blue-900">
              <Link to={`/schemes/${scheme.id}`}>
                {displayedScheme.name}
              </Link>
            </h3>
          </div>
        </div>

        <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
          {displayedScheme.tagline}
        </p>

        {/* Eligibility Snapshot Highlights */}
        <div className="bg-slate-50/80 rounded p-2.5 border border-slate-200 mb-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-medium">Income Ceiling:</span>
            <span className="font-semibold text-slate-800">
              {scheme.annualIncomeCap === 0
                ? 'No Upper Limit (Universal)'
                : `₹${(scheme.annualIncomeCap / 100000).toFixed(1)} Lakh / year`}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-medium">Target Group:</span>
            <span className="font-semibold text-blue-900">Scheduled Tribes (ST)</span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-medium">Key Support:</span>
            <span className="font-semibold text-emerald-800 truncate max-w-[160px] text-right">
              {scheme.benefits[0]?.amount || 'Full Financial Support'}
            </span>
          </div>
        </div>

        {/* Eligibility checklist preview */}
        <div className="space-y-1 mb-2">
          {displayedScheme.eligibilitySummary.slice(0, 2).map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
              <CheckCircle className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-1">{item}</span>
            </div>
          ))}
        </div>
        {/* Required Documents Checklist Preview */}
        {scheme.requiredDocuments && scheme.requiredDocuments.length > 0 && (
          <div className="bg-slate-50/70 rounded p-2.5 border border-slate-200 mb-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Required Documents:</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                {scheme.requiredDocuments.length} mandatory
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {scheme.requiredDocuments.slice(0, 3).map((doc, idx) => (
                <span
                  key={doc.id || doc.code || idx}
                  className="text-[10px] bg-white text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[145px]"
                  title={doc.description || doc.name}
                >
                  {doc.name}
                </span>
              ))}
              {scheme.requiredDocuments.length > 3 && (
                <span className="text-[10px] text-blue-800 font-bold px-1 py-0.5">
                  +{scheme.requiredDocuments.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        {/* Pre-check trigger */}
        <button
          onClick={() => onOpenPreCheck(scheme)}
          className="text-xs font-semibold text-blue-800 hover:text-blue-950 flex items-center justify-center gap-1 py-1 px-2 rounded hover:bg-blue-50 border border-blue-200 transition-colors"
          title="Instant AI rule-based eligibility evaluation"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Check Eligibility</span>
        </button>

        {/* View Details & Action CTA */}
        <div className="flex items-center gap-1.5">
          <Link
            to={`/schemes/${scheme.id}`}
            className="flex-1 sm:flex-none text-center text-xs font-medium text-slate-700 hover:text-slate-900 px-2.5 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 transition-colors"
            title="View comprehensive scheme details, eligibility, benefits, and guidelines"
          >
            View Details
          </Link>

          {userDraft ? (
            <Link
              to={`/applicant/apply?scheme=${scheme.id}&draftId=${userDraft.id}`}
              className="flex-1 sm:flex-none text-center text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 px-3 py-1.5 rounded shadow-sm flex items-center justify-center gap-1 transition-colors"
              title="Continue your saved draft application for this scheme"
            >
              <span>Continue Application</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : userSubmittedApp ? (
            <Link
              to="/applicant/status"
              className="flex-1 sm:flex-none text-center text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 px-3 py-1.5 rounded shadow-sm flex items-center justify-center gap-1 transition-colors"
              title="View tracking and verification timeline for this application"
            >
              <span>Track Application</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : windowStatus.isOpen ? (
            <Link
              to={`/applicant/apply?scheme=${scheme.id}`}
              className="flex-1 sm:flex-none text-center text-xs font-bold text-white bg-[#0b2853] hover:bg-[#134685] px-3 py-1.5 rounded shadow-sm flex items-center justify-center gap-1 transition-colors"
            >
              <span>Apply Now</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : (
            <button
              disabled
              className="flex-1 sm:flex-none text-center text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded cursor-not-allowed"
              title={windowStatus.message}
            >
              Closed
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
