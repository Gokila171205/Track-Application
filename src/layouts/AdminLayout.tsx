import React from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { handleSkipToMainContent } from '../utils/skipLink';

import {
  LayoutDashboard,
  FileCheck2,
  Cpu,
  AlertTriangle,
  Award,
  Settings2,
  Layers,
  HelpCircle,
  History,
  BarChart3,
  Sliders,
  ShieldAlert,
  ArrowLeft,
  UserCheck,
  Building2
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { currentUser } = useApp();
  const location = useLocation();

  const sidebarLinks = [
    { to: '/admin', label: 'Overview Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { to: '/admin/applications', label: 'Applications & Scrutiny', icon: <FileCheck2 className="w-4 h-4" /> },
    { to: '/admin/verification', label: 'Document Intelligence (OCR)', icon: <Cpu className="w-4 h-4" /> },
    { to: '/admin/selection', label: 'Merit & Selection Board', icon: <Award className="w-4 h-4" /> },
    { to: '/admin/scheme-configurator', label: 'Scheme Configurator', icon: <Sliders className="w-4 h-4 text-amber-400" /> },
    { to: '/admin/grievances', label: 'Grievance Desk', icon: <HelpCircle className="w-4 h-4" /> },
    { to: '/admin/audit-logs', label: 'Audit Trail Logs', icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#f1f5f9]">

      {/* Skip to Main Content Link for Keyboard Users */}
      <a
        href="#main-content"
        onClick={handleSkipToMainContent}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            handleSkipToMainContent(e);
          }
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:bg-amber-400 focus:text-blue-950 focus:font-bold focus:text-xs focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
      >
        Skip to Main Content
      </a>

      {/* Officer Top Bar */}
      <header className="bg-[#0b2853] text-white border-b-2 border-amber-500 sticky top-0 z-40 shadow">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="hover:opacity-90 flex items-center gap-2 text-slate-200 hover:text-white">
              <ArrowLeft className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold hidden sm:inline">Public Portal</span>
            </Link>
            <div className="h-4 w-px bg-blue-800"></div>
            <div>
              <h1 className="text-xs sm:text-sm font-black tracking-wider uppercase flex items-center gap-1.5 text-white">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>MoTA Officer Scrutiny & Administration Suite</span>
              </h1>
              <span className="text-[10px] text-slate-300 hidden sm:inline">
                Ministry of Tribal Affairs • Government of India
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{currentUser.name}</span>
              </div>
              <div className="text-[10px] text-slate-300">
                {currentUser.designation || 'Authorized Scrutiny Officer'}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase">
              {currentUser.role}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container: Sidebar + Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-[#071a36] text-slate-300 border-r border-slate-800 p-3 flex-shrink-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-2">
            Governance Desk
          </div>
          <nav className="space-y-1">
            {sidebarLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded transition-colors ${
                    isActive
                      ? 'bg-blue-800 text-white font-bold border-l-4 border-amber-400 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Quick Notice Card */}
          <div className="mt-8 p-3 bg-slate-900/70 border border-slate-800 rounded text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-amber-300 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Statutory Compliance</span>
            </div>
            <p className="leading-snug">
              Every officer approval, override or rejection is cryptographically logged with IP and Aadhaar digital token.
            </p>
          </div>
        </aside>

        {/* Content View */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 overflow-y-auto scroll-mt-20 focus:outline-none"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};
