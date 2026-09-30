import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { SchemeCard } from '../../components/scheme/SchemeCard';
import { SmartSchemeSearch } from '../../components/scheme/SmartSchemeSearch';
import { EligibilityPreCheckModal } from '../../components/scheme/EligibilityPreCheckModal';
import { SchemeConfig } from '../../types/scheme';
import { Layers, LayoutDashboard, Clock, User } from 'lucide-react';

export const SchemesPage: React.FC = () => {
  const { schemes } = useApp();
  const { isAuthenticated, user } = useAuth();
  const [filteredSchemes, setFilteredSchemes] = useState<SchemeConfig[] | null>(null);
  const [selectedScheme, setSelectedScheme] = useState<SchemeConfig | null>(null);
  const [isPreCheckOpen, setIsPreCheckOpen] = useState<boolean>(false);

  const displayedSchemes = filteredSchemes ?? schemes;

  const handleOpenPreCheck = (scheme: SchemeConfig) => {
    setSelectedScheme(scheme);
    setIsPreCheckOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Authenticated Applicant Banner */}
      {isAuthenticated && user?.role === 'APPLICANT' && (
        <div className="bg-gradient-to-r from-blue-900 to-[#0b2853] text-white rounded-lg p-4 sm:p-5 shadow-sm border border-blue-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-800/90 border border-blue-600 flex items-center justify-center font-bold text-amber-300 flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-white">
                  Welcome, {user.name}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold uppercase">
                  Verified ST Applicant
                </span>
              </div>
              <p className="text-xs text-slate-200 mt-1 max-w-2xl leading-relaxed">
                Explore available MoTA schemes below. Select any scheme to review statutory guidelines, check eligibility, continue saved drafts, or initiate a new application.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to="/applicant/dashboard"
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-[#0b2853] font-bold text-xs rounded shadow flex items-center gap-1.5 transition-colors"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-blue-800" />
              <span>My Dashboard</span>
            </Link>
            <Link
              to="/applicant/status"
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded shadow flex items-center gap-1.5 transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-slate-900" />
              <span>Track Applications</span>
            </Link>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="border-b border-slate-300 pb-4">
        <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-widest mb-1">
          <Layers className="w-4 h-4 text-amber-500" />
          <span>Ministry of Tribal Affairs Schemes</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#0b2853] tracking-tight">
          Scheme Discovery & Selection
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Explore all centrally sponsored and central sector financial assistance schemes for Scheduled Tribe students.
        </p>
      </div>

      {/* Smart Search */}
      <SmartSchemeSearch
        onFilteredResultsChange={(results) => setFilteredSchemes(results)}
        onOpenPreCheck={handleOpenPreCheck}
      />

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedSchemes.map((scheme) => (
          <SchemeCard
            key={scheme.id}
            scheme={scheme}
            onOpenPreCheck={handleOpenPreCheck}
          />
        ))}
      </div>

      {/* Pre-Check Modal */}
      <EligibilityPreCheckModal
        scheme={selectedScheme}
        isOpen={isPreCheckOpen}
        onClose={() => setIsPreCheckOpen(false)}
      />
    </div>
  );
};
