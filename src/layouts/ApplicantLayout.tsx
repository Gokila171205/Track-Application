import React from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

import { GovHeader } from '../components/common/GovHeader';
import { GovFooter } from '../components/common/GovFooter';
import {
  LayoutDashboard,
  FilePlus,
  FileCheck2,
  Clock,
  HelpCircle,
  AlertTriangle,
  User,
  ShieldCheck,
  ArrowLeft,
  Layers
} from 'lucide-react';

export const ApplicantLayout: React.FC = () => {
  const { currentUser, applications } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const deficientApp = applications.find(a => a.hasDeficiency);

  const navItems = [
    { to: '/schemes', label: 'Scheme Discovery', icon: <Layers className="w-4 h-4 text-amber-600" /> },
    { to: '/applicant/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { to: '/applicant/apply', label: 'Apply for Scheme', icon: <FilePlus className="w-4 h-4" /> },
    { to: '/applicant/status', label: 'Application Status', icon: <Clock className="w-4 h-4" /> },
    { to: '/applicant/documents', label: 'My Documents & OCR', icon: <FileCheck2 className="w-4 h-4" /> },
    { to: '/applicant/grievances', label: 'Grievance Desk', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#f1f5f9]">

      {/* Main Gov Header */}
      <GovHeader />

      {/* Applicant Portal Sub-Header Ribbon */}
      <div className="bg-[#0b2853] text-white border-b border-blue-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Applicant Profile Info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-blue-800 border border-blue-600 flex items-center justify-center font-bold text-amber-300">
                <User className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-bold text-white">
                    {currentUser.name}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase">
                    ST Beneficiary (Aadhaar Verified)
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 flex flex-wrap items-center gap-3 mt-0.5">
                  {applications.length > 0 ? (
                    <>
                      <span>Active Applications: <strong>{applications.length}</strong></span>
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <ShieldCheck className="w-3 h-3" /> DBT Aadhaar Seeded
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">No application submitted yet. Click Apply to start.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Deficiency Alert Indicator if applicable */}
            {deficientApp && (
              <Link
                to={`/applicant/status?applicationId=${deficientApp.id}`}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-2 shadow animate-bounce"
              >
                <AlertTriangle className="w-4 h-4 text-amber-300" />
                <span>DEFICIENCY DETECTED ON {deficientApp.id} • ACTION REQUIRED</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Citizen Portal Navigation */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto py-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mr-2 flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
            title="Go back to the previous page"
            aria-label="Go back to the previous page"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/applicant/dashboard'}
              className={({ isActive }) =>
                `px-3 py-2 text-xs font-semibold rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#134685] text-white font-bold shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-blue-900'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* Main Applicant Content */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full scroll-mt-20 focus:outline-none"
      >
        <Outlet />
      </main>

      {/* Footer */}
      <GovFooter />
    </div>
  );
};
