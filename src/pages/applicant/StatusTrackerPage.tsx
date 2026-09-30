import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusTimeline } from '../../components/applicant/StatusTimeline';
import { ApplicationCard } from '../../components/applicant/ApplicationCard';
import { History, Upload, FileText, AlertCircle, Building, CheckCircle2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

export const StatusTrackerPage: React.FC = () => {
  const { applications, resolveApplicationDeficiency, isLoadingApplications, fetchApplications } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlAppId = searchParams.get('applicationId') || searchParams.get('appId');

  const [searchId, setSearchId] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState(
    (urlAppId ? applications.find(a => a.id.toLowerCase() === urlAppId.toLowerCase()) : null) || applications[0] || null
  );
  const [isResolveModalOpen, setIsResolveModalOpen] = useState<boolean>(false);
  const [replacementFile, setReplacementFile] = useState<string>('Income_Certificate_Tehsildar_FY2024-25_Renewed.pdf');
  const [replacementFileObj, setReplacementFileObj] = useState<File | null>(null);

  useEffect(() => {
    fetchApplications();
    const timer = setInterval(() => {
      fetchApplications();
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (urlAppId && applications.length > 0) {
      const match = applications.find(a => a.id.toLowerCase() === urlAppId.toLowerCase());
      if (match) {
        setSelectedApp(match);
        return;
      }
    }
    if (selectedApp) {
      const updated = applications.find(a => a.id === selectedApp.id);
      if (updated) {
        setSelectedApp(updated);
        return;
      }
    }
    if (applications.length > 0) {
      setSelectedApp(applications[0]);
    }
  }, [applications, urlAppId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      const match = applications.find(
        (a) => a.id.toLowerCase().includes(searchId.trim().toLowerCase())
      );
      if (match) {
        setSelectedApp(match);
        setSearchParams({ applicationId: match.id });
      } else {
        alert(`No application matching "${searchId}" found in your registered dossiers.`);
      }
    }
  };

  const handleDeficiencyResolved = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    resolveApplicationDeficiency(selectedApp.id, replacementFile, replacementFileObj || undefined);
    setIsResolveModalOpen(false);
  };

  if (isLoadingApplications) {
    return (
      <div role="status" aria-live="polite" className="bg-white p-12 rounded-lg border border-slate-300 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-blue-900 border-t-amber-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm font-bold text-[#0b2853]">Retrieving tracking status from official registry...</p>
      </div>
    );
  }

  if (!selectedApp) {
    return (
      <div className="bg-white p-8 rounded-lg border border-slate-300 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 bg-blue-50 border border-blue-200 text-[#0b2853] rounded-full flex items-center justify-center mx-auto">
          <FileText className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[#0b2853]">No Submitted Applications to Track</h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          You currently have no active applications registered in your citizen account. Submit a new application to initiate status tracking.
        </p>
        <div>
          <Link
            to="/applicant/apply"
            className="inline-flex items-center px-4 py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold rounded shadow uppercase tracking-wider"
          >
            Apply for Scholarship
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white p-5 rounded border border-slate-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
            Official Application Tracking System
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0b2853] tracking-tight">
            Track Application Status & Audit History
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Real-time status transparency across Institute Verification, Scrutiny, Selection Board, and PFMS DBT.
          </p>
        </div>

        {/* Search within own applications */}
        {applications.length > 1 && (
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search your Application ID..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="p-2 text-xs bg-slate-50 border border-slate-300 rounded font-mono w-48 sm:w-60 focus:outline-none focus:ring-2 focus:ring-blue-800"
            />
            <button
              type="submit"
              className="px-3.5 py-2 bg-[#0b2853] text-white font-bold text-xs rounded hover:bg-[#134685]"
            >
              Search
            </button>
          </form>
        )}
      </div>

      {/* MULTI-APPLICATION INDEPENDENT TRACKING OVERVIEW */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-sm font-black text-[#0b2853] uppercase tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-800" />
              <span>Registered Applications ({applications.length})</span>
            </h2>
            <p className="text-xs text-slate-500">
              Each scholarship application maintains its own independent status and verification lifecycle.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-600">
            Selected: <strong className="text-blue-900">{selectedApp.id}</strong> ({selectedApp.status})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              status={application.status}
              isSelected={selectedApp.id === application.id}
              onSelect={(app) => {
                setSelectedApp(app);
                setSearchParams({ applicationId: app.id });
              }}
              onRectifyDeficiency={(app) => {
                setSelectedApp(app);
                setIsResolveModalOpen(true);
              }}
            />
          ))}
        </div>
      </div>


      {/* 8-Stage Timeline */}
      <StatusTimeline
        application={selectedApp}
        onRectifyDeficiency={() => setIsResolveModalOpen(true)}
      />

      {/* Audit History Log */}
      <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden text-xs">
        <div className="bg-slate-100 p-3.5 border-b border-slate-200 flex items-center gap-2">
          <History className="w-4 h-4 text-blue-900" />
          <h3 className="font-bold text-slate-800 uppercase tracking-wider">
            Official Timestamped Audit Log for {selectedApp.id}
          </h3>
        </div>

        <div className="divide-y divide-slate-200">
          {(selectedApp.auditTrail || []).map((record) => (
            <div key={record.id} className="p-3.5 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-slate-900">{record.action}</span>
                  <span className="text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded font-mono">
                    {record.actorRole}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  {record.remarks}
                </p>
                <div className="text-[10px] text-slate-400 mt-1">
                  Actor: <strong className="text-slate-600">{record.actor}</strong>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-mono flex-shrink-0">
                {record.timestamp}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deficiency Resolution Modal */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden">
            <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-sm">Deficiency Rectification Portal</h3>
              </div>
              <button
                onClick={() => setIsResolveModalOpen(false)}
                className="text-slate-200 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDeficiencyResolved} className="p-5 space-y-4 text-xs">
              <div className="bg-rose-50 border-l-4 border-rose-600 p-3 text-rose-950">
                <strong>Current Deficiency:</strong> {selectedApp.deficiencyNotes || 'Income certificate needs valid FY 2024-25 scan.'}
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Replacement Document Scan (PDF / JPG / PNG, Max 5MB):
                </label>
                <div className="border border-slate-300 rounded p-2 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-[11px] text-slate-700">
                    {replacementFile}
                  </div>
                  <label className="cursor-pointer px-3 py-1.5 bg-[#0b2853] text-white rounded font-bold text-xs flex items-center gap-1 hover:bg-[#134685] flex-shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose File</span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 5 * 1024 * 1024) {
                            alert(`File size exceeds 5MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
                            return;
                          }
                          setReplacementFile(file.name);
                          setReplacementFileObj(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsResolveModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded font-bold shadow"
                >
                  Upload & Resubmit to Officer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
