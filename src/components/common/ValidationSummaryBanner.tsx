import React from 'react';
import { AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { ExplainableIssue } from '../../types/explainableValidation';

interface ValidationSummaryBannerProps {
  issues: ExplainableIssue[];
  onSelectIssue?: (issue: ExplainableIssue) => void;
  className?: string;
}

export const ValidationSummaryBanner: React.FC<ValidationSummaryBannerProps> = ({
  issues,
  onSelectIssue,
  className = ''
}) => {
  if (!issues || issues.length === 0) return null;

  const count = issues.length;
  const countText = `${count} issue${count > 1 ? 's' : ''} need${count === 1 ? 's' : ''} your attention`;

  return (
    <div
      className={`rounded-lg border-2 border-red-400 bg-red-50 p-4 sm:p-5 shadow-sm text-xs space-y-3 transition-all animate-fadeIn ${className}`}
      role="region"
      aria-label="Application validation issues summary"
    >
      <div className="flex items-center gap-2.5 text-red-950 border-b border-red-200 pb-2.5">
        <div className="p-1.5 rounded-full bg-red-100 text-red-700">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-black text-sm sm:text-base tracking-tight">
            ⚠️ {countText}
          </h3>
          <p className="text-[11px] text-red-800 font-medium">
            Please resolve the items listed below. Click on any item to jump directly to that section.
          </p>
        </div>
      </div>

      <ol className="space-y-2 list-decimal list-inside text-slate-800">
        {issues.map((iss, idx) => (
          <li
            key={idx}
            onClick={() => onSelectIssue && onSelectIssue(iss)}
            className="p-2.5 rounded bg-white border border-red-200 hover:border-red-400 hover:bg-red-50/50 cursor-pointer flex items-center justify-between gap-3 group transition-colors shadow-xs"
          >
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-red-800 text-xs w-4">
                {idx + 1}.
              </span>
              <span className="font-semibold text-slate-900 group-hover:text-red-900 transition-colors">
                {iss.summary || iss.what_is_wrong || iss.why_is_wrong}
              </span>
              {iss.step && (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">
                  Step {iss.step}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-blue-800 font-bold group-hover:underline flex-shrink-0">
              <span>Fix this</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
