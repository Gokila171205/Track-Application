import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  UserPlus,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getSchemeWindowStatus } from '../../utils/schemeWindow';
import { api } from '../../services/api';

export const AdminDashboardPage: React.FC = () => {
  const { applications, schemes, auditLogs } = useApp();
  const navigate = useNavigate();

  const [dbStats, setDbStats] = React.useState<{
    totalApplications: number;
    submitted: number;
    pendingDocumentVerification: number;
    pendingEligibilityVerification: number;
    underScrutiny: number;
    deficient: number;
    resubmitted: number;
    approved: number;
    rejected: number;
  } | null>(null);

  React.useEffect(() => {
    api.getAdminDashboardStats()
      .then((data) => setDbStats(data))
      .catch((err) => console.warn('Could not fetch real-time stats:', err));
  }, []);

  // Compute fallback counts from loaded real MongoDB applications if API is still loading
  const stats = {
    totalApplications: dbStats?.totalApplications ?? applications.length,
    submitted: dbStats?.submitted ?? applications.filter(a => a.status === 'SUBMITTED').length,
    pendingDocumentVerification: dbStats?.pendingDocumentVerification ?? applications.filter(a => a.status === 'DOCUMENT_VERIFICATION').length,
    pendingEligibilityVerification: dbStats?.pendingEligibilityVerification ?? applications.filter(a => a.status === 'ELIGIBILITY_VERIFICATION').length,
    underScrutiny: dbStats?.underScrutiny ?? applications.filter(a => a.status === 'SCRUTINY').length,
    deficient: dbStats?.deficient ?? applications.filter(a => a.hasDeficiency || a.status === 'DEFICIENT' || a.status === 'DEFICIENCY_NOTIFIED').length,
    resubmitted: dbStats?.resubmitted ?? applications.filter(a => a.status === 'RESUBMITTED').length,
    approved: dbStats?.approved ?? applications.filter(a => ['APPROVED', 'SELECTION'].includes(a.status)).length,
    rejected: dbStats?.rejected ?? applications.filter(a => a.status === 'REJECTED').length,
  };

  // Recent Activity
  const recentActivity = auditLogs
    .filter(log => ['Application Started', 'New Application Submitted', 'Application Submitted', 'Application Resubmitted', 'Application Approved', 'Application Rejected', 'DOCUMENT_VERIFIED', 'DOCUMENT_REJECTED', 'DEFICIENCY_ISSUED'].includes(log.action))
    .slice(0, 8);

  // Scheme Stats
  const schemeStats = schemes.map(s => {
    const schemeApps = applications.filter(a => a.schemeCode === s.code || a.schemeId === s.id);
    const windowStatus = getSchemeWindowStatus(s);
    return {
      scheme: s,
      windowStatus,
      total: schemeApps.length,
      submitted: schemeApps.filter(a => a.status === 'SUBMITTED' || a.status === 'RESUBMITTED').length,
      pending: schemeApps.filter(a => ['DOCUMENT_VERIFICATION', 'ELIGIBILITY_VERIFICATION', 'SCRUTINY', 'SELECTION'].includes(a.status)).length,
      eligible: schemeApps.filter(a => ['ELIGIBILITY_VERIFICATION', 'SCRUTINY', 'SELECTION', 'APPROVED'].includes(a.status)).length,
      deficient: schemeApps.filter(a => a.hasDeficiency || a.status === 'DEFICIENT' || a.status === 'DEFICIENCY_NOTIFIED').length,
      approved: schemeApps.filter(a => a.status === 'APPROVED').length,
    };
  });

  const countCards = [
    { label: 'Total Applications', count: stats.totalApplications, status: 'ALL', color: 'border-slate-300 text-slate-800 bg-slate-50' },
    { label: 'Submitted', count: stats.submitted, status: 'SUBMITTED', color: 'border-blue-200 text-blue-900 bg-blue-50' },
    { label: 'Pending Doc Verification', count: stats.pendingDocumentVerification, status: 'DOCUMENT_VERIFICATION', color: 'border-amber-200 text-amber-900 bg-amber-50' },
    { label: 'Pending Eligibility', count: stats.pendingEligibilityVerification, status: 'ELIGIBILITY_VERIFICATION', color: 'border-indigo-200 text-indigo-900 bg-indigo-50' },
    { label: 'Under Scrutiny', count: stats.underScrutiny, status: 'SCRUTINY', color: 'border-purple-200 text-purple-900 bg-purple-50' },
    { label: 'Deficient', count: stats.deficient, status: 'DEFICIENT', color: 'border-rose-200 text-rose-900 bg-rose-50' },
    { label: 'Resubmitted', count: stats.resubmitted, status: 'RESUBMITTED', color: 'border-cyan-200 text-cyan-900 bg-cyan-50' },
    { label: 'Approved', count: stats.approved, status: 'APPROVED', color: 'border-emerald-200 text-emerald-900 bg-emerald-50' },
    { label: 'Rejected', count: stats.rejected, status: 'REJECTED', color: 'border-red-200 text-red-900 bg-red-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded border border-slate-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Executive Analytics & Scrutiny
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0b2853] tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-amber-500" />
            Scholarship & Fellowship Governance
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Real-time scrutiny status directly from MongoDB Atlas (tsfms). Click any counter to inspect filtered queue.
          </p>
        </div>
      </div>

      {/* Real MongoDB Status Counts Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2.5">
        {countCards.map((card, idx) => (
          <div
            key={idx}
            onClick={() => navigate(card.status === 'ALL' ? '/admin/applications' : `/admin/applications?status=${card.status}`)}
            className={`p-3 rounded border ${card.color} shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between`}
            title={`Click to filter applications by ${card.label}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider line-clamp-1">{card.label}</span>
            <div className="text-xl font-black mt-1">{card.count}</div>
            <span className="text-[9px] text-slate-500 mt-1 flex items-center gap-0.5 font-medium">
              View queue →
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Scheme Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {schemeStats.map(stat => (
              <div key={stat.scheme.id} className="bg-white border border-slate-300 rounded p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{stat.scheme.code}</div>
                    <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      stat.windowStatus.state === 'OPEN' ? 'bg-emerald-100 text-emerald-800' :
                      stat.windowStatus.state === 'CLOSING_SOON' ? 'bg-amber-100 text-amber-800' :
                      stat.windowStatus.state === 'NOT_STARTED' ? 'bg-slate-200 text-slate-700' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {stat.windowStatus.state.replace('_', ' ')}
                    </div>
                  </div>
                  <h3 className="font-bold text-[#0b2853] mb-1 line-clamp-2">{stat.scheme.name}</h3>
                  <div className="text-[10px] text-slate-500 mb-3 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {stat.scheme.applicationDeadline ? `Deadline: ${stat.scheme.applicationDeadline}` : 'No Deadline'}
                  </div>
                </div>

                <div className="mt-2 mb-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-50 p-2 rounded border border-slate-200 flex flex-col items-center">
                    <span className="text-slate-500 text-[9px] uppercase font-bold text-center">Total</span>
                    <span className="font-black text-slate-800">{stat.total}</span>
                  </div>
                  <div className="bg-amber-50 p-2 rounded border border-amber-100 flex flex-col items-center">
                    <span className="text-amber-700 text-[9px] uppercase font-bold text-center">Pending</span>
                    <span className="font-black text-amber-900">{stat.pending}</span>
                  </div>
                  <div className="bg-emerald-50 p-2 rounded border border-emerald-100 flex flex-col items-center">
                    <span className="text-emerald-700 text-[9px] uppercase font-bold text-center">Eligible</span>
                    <span className="font-black text-emerald-900">{stat.eligible}</span>
                  </div>
                  <div className="bg-blue-50 p-2 rounded border border-blue-100 flex flex-col items-center">
                    <span className="text-blue-700 text-[9px] uppercase font-bold text-center">Submitted</span>
                    <span className="font-black text-blue-900">{stat.submitted}</span>
                  </div>
                  <div className="bg-rose-50 p-2 rounded border border-rose-100 flex flex-col items-center">
                    <span className="text-rose-700 text-[9px] uppercase font-bold text-center">Deficient</span>
                    <span className="font-black text-rose-900">{stat.deficient}</span>
                  </div>
                  <div className="bg-emerald-50 p-2 rounded border border-emerald-100 flex flex-col items-center">
                    <span className="text-emerald-700 text-[9px] uppercase font-bold text-center">Approved</span>
                    <span className="font-black text-emerald-900">{stat.approved}</span>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/admin/schemes/${stat.scheme.id}`)}
                  className="w-full py-2 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>View Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Statutory Notice */}
          <div className="bg-amber-50 p-4 rounded border border-amber-200 shadow-sm text-amber-900 text-xs">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              Statutory Notice
            </div>
            <p>
              All application approvals, rejections, and scrutiny actions are cryptographically logged with IP and Aadhaar digital token. Access is restricted to authorized Nodal Officers.
            </p>
          </div>

          {/* Recent Activity */}
          <div className="bg-white p-4 rounded border border-slate-300 shadow-sm">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                System Activity Log
              </h3>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Real-time</span>
            </div>
            <div className="h-96 overflow-y-auto pr-2">
              {recentActivity.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                  No recent activity recorded.
                </div>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map(log => (
                    <div key={log.id} className="flex gap-3 text-sm">
                      <div className="mt-0.5">
                        {log.action.includes('Started') ? <UserPlus className="w-4 h-4 text-blue-500" /> :
                         log.action.includes('Resubmitted') ? <RotateCcw className="w-4 h-4 text-amber-500" /> :
                         log.action.includes('Submitted') ? <FileText className="w-4 h-4 text-slate-500" /> :
                         log.action.includes('Approved') ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                         <XCircle className="w-4 h-4 text-rose-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{log.action}</p>
                        <p className="text-[11px] text-slate-500">
                          {log.actor} • <span className="font-mono text-blue-800">{log.applicationId}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {log.schemeCode}
                        </p>
                      </div>
                      <div className="text-[9px] text-slate-400 whitespace-nowrap">
                        {log.timestamp.substring(11, 16)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
