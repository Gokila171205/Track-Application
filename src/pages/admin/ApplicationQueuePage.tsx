import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ApplicationRecord, ApplicationDocument, ApplicationStatus } from '../../types/application';
import { DocumentOcrViewer } from '../../components/document-ai/DocumentOcrViewer';
import { ExplainableEvidenceCard } from '../../components/document-ai/ExplainableEvidenceCard';
import {
  FileCheck2,
  Search,
  Filter,
  Eye,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  UserCheck,
  Building,
  RotateCcw,
  Download,
  ExternalLink,
  FileText,
  Check,
  X,
  AlertCircle,
  Calendar,
  CreditCard,
  GraduationCap,
  User,
  Info,
  ChevronRight
} from 'lucide-react';
import { api } from '../../services/api';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSchemeWindowStatus } from '../../utils/schemeWindow';

export const ApplicationQueuePage: React.FC = () => {
  const {
    applications,
    schemes,
    updateApplicationStatus,
    verifyDocumentStatus,
    addAuditLog,
    currentUser,
    fetchApplications
  } = useApp();
  
  const location = useLocation();
  const navigate = useNavigate();

  // Filters
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Inspection / Dossier
  const [inspectingApp, setInspectingApp] = useState<ApplicationRecord | null>(null);

  // Modals & Action States
  const [confirmActionType, setConfirmActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [actionRemarks, setActionRemarks] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Deficiency Modal State
  const [showDeficiencyModal, setShowDeficiencyModal] = useState<boolean>(false);
  const [deficiencyCategory, setDeficiencyCategory] = useState<string>('Incorrect Document');
  const [deficiencyReason, setDeficiencyReason] = useState<string>('');
  const [deficiencyCorrection, setDeficiencyCorrection] = useState<string>('');

  // Document Reject Modal State
  const [rejectingDoc, setRejectingDoc] = useState<ApplicationDocument | null>(null);
  const [docRejectReason, setDocRejectReason] = useState<string>('');

  // Document Preview State
  const [viewingDoc, setViewingDoc] = useState<{ doc: ApplicationDocument; blobUrl: string; mimeType: string } | null>(null);
  const [docLoadingId, setDocLoadingId] = useState<string | null>(null);

  // Load query params if passed
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const schemeParam = params.get('scheme');
    const appId = params.get('app');
    const statusParam = params.get('status');

    if (statusParam) {
      setSelectedStatusFilter(statusParam);
    }
    if (schemeParam) {
      setSelectedSchemeId(schemeParam);
    }
    if (appId && applications.length > 0) {
      const match = applications.find(a => a.id === appId);
      if (match) {
        setInspectingApp(match);
      }
    }
  }, [location.search, applications]);

  // Keep inspectingApp synced with latest state
  useEffect(() => {
    if (inspectingApp) {
      const updated = applications.find(a => a.id === inspectingApp.id);
      if (updated) {
        setInspectingApp(updated);
      }
    }
  }, [applications]);

  // Clean up blob URL on modal close
  useEffect(() => {
    return () => {
      if (viewingDoc?.blobUrl) {
        window.URL.revokeObjectURL(viewingDoc.blobUrl);
      }
    };
  }, [viewingDoc]);

  // Filtered applications
  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      // 1. Scheme filter
      if (selectedSchemeId !== 'ALL') {
        const matchesScheme = app.schemeCode === selectedSchemeId || app.schemeId === selectedSchemeId;
        if (!matchesScheme) return false;
      }

      // 2. Status filter
      if (selectedStatusFilter !== 'ALL') {
        if (selectedStatusFilter === 'DEFICIENT') {
          if (!app.hasDeficiency && app.status !== 'DEFICIENT' && app.status !== 'DEFICIENCY_NOTIFIED') {
            return false;
          }
        } else if (app.status !== selectedStatusFilter) {
          return false;
        }
      }

      // 3. Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          app.id.toLowerCase().includes(q) ||
          app.applicant.fullName.toLowerCase().includes(q) ||
          app.applicant.email.toLowerCase().includes(q) ||
          app.schemeName.toLowerCase().includes(q) ||
          (app.academic.institutionName || '').toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [applications, selectedSchemeId, selectedStatusFilter, searchTerm]);

  // Friendly status labels
  const getStatusBadge = (status: ApplicationStatus) => {
    switch (status) {
      case 'SUBMITTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">Submitted</span>;
      case 'DOCUMENT_VERIFICATION':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">Document Verification</span>;
      case 'ELIGIBILITY_VERIFICATION':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">Eligibility Verification</span>;
      case 'SCRUTINY':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">Under Scrutiny</span>;
      case 'SELECTION':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-200">Under Selection</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">Approved</span>;
      case 'DEFICIENT':
      case 'DEFICIENCY_NOTIFIED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200 animate-pulse">Correction Required</span>;
      case 'RESUBMITTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-900 border border-cyan-200">Resubmitted</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-900 border border-red-200">Rejected</span>;
      case 'DRAFT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">Draft</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  // Helper for document verification status badge
  const getDocSummaryBadge = (app: ApplicationRecord) => {
    const docs = app.documents || [];
    if (docs.length === 0) {
      return <span className="text-[11px] text-slate-400 italic">No docs uploaded</span>;
    }
    const verified = docs.filter(d => d.verificationStatus === 'VERIFIED' || d.status === 'VERIFIED').length;
    const rejected = docs.filter(d => d.verificationStatus === 'REJECTED' || d.status === 'REJECTED').length;

    if (rejected > 0) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200"><XCircle className="w-3 h-3" /> {rejected} Rejected</span>;
    }
    if (verified === docs.length) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"><CheckCircle className="w-3 h-3" /> All Verified ({verified}/{docs.length})</span>;
    }
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200"><Clock className="w-3 h-3" /> {verified}/{docs.length} Verified</span>;
  };

  // Document download handler
  const handleDownloadDoc = async (doc: ApplicationDocument) => {
    setDocLoadingId(doc.id);
    try {
      const blob = await api.downloadDocumentFile(doc.id, true);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || `${doc.documentCode || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Unable to download the document. Please try again.');
    } finally {
      setDocLoadingId(null);
    }
  };

  // Document view handler
  const handleViewDoc = async (doc: ApplicationDocument) => {
    setDocLoadingId(doc.id);
    try {
      const blob = await api.downloadDocumentFile(doc.id, false);
      const url = window.URL.createObjectURL(blob);
      const mime = blob.type || 'application/pdf';
      setViewingDoc({ doc, blobUrl: url, mimeType: mime });
    } catch (err: any) {
      alert(err.message || 'Unable to view the document. Please try again.');
    } finally {
      setDocLoadingId(null);
    }
  };

  // Document verify handler
  const handleVerifyDocument = async (doc: ApplicationDocument) => {
    try {
      await verifyDocumentStatus(doc.id, 'VERIFIED');
      addAuditLog({
        actor: currentUser.name,
        role: currentUser.role,
        action: 'DOCUMENT_VERIFIED',
        applicationId: inspectingApp?.id || '',
        schemeCode: inspectingApp?.schemeCode || '',
        previousStatus: inspectingApp?.status || 'DOCUMENT_VERIFICATION',
        newStatus: inspectingApp?.status || 'DOCUMENT_VERIFICATION',
        remarks: `Document '${doc.documentName || doc.fileName}' marked VERIFIED by official scrutiny officer.`,
        reason: 'Statutory cross-check satisfied',
        ipAddress: '10.14.88.22'
      });
    } catch (err: any) {
      alert(`Failed to verify document: ${err.message}`);
    }
  };

  // Document reject confirmation
  const handleConfirmDocReject = async () => {
    if (!rejectingDoc) return;
    if (!docRejectReason.trim()) {
      alert('A rejection reason is required to reject this document.');
      return;
    }

    try {
      await verifyDocumentStatus(rejectingDoc.id, 'REJECTED', docRejectReason.trim());
      addAuditLog({
        actor: currentUser.name,
        role: currentUser.role,
        action: 'DOCUMENT_REJECTED',
        applicationId: inspectingApp?.id || '',
        schemeCode: inspectingApp?.schemeCode || '',
        previousStatus: inspectingApp?.status || 'DOCUMENT_VERIFICATION',
        newStatus: inspectingApp?.status || 'DOCUMENT_VERIFICATION',
        remarks: `Document '${rejectingDoc.documentName || rejectingDoc.fileName}' REJECTED. Reason: ${docRejectReason.trim()}`,
        reason: docRejectReason.trim(),
        ipAddress: '10.14.88.22'
      });
      setRejectingDoc(null);
      setDocRejectReason('');
    } catch (err: any) {
      alert(`Failed to reject document: ${err.message}`);
    }
  };

  // Application transition handler
  const handleStatusTransition = async (
    targetStatus: ApplicationStatus,
    remarks: string,
    category?: string,
    correction?: string
  ) => {
    if (!inspectingApp) return;

    try {
      await updateApplicationStatus(
        inspectingApp.id,
        targetStatus,
        remarks,
        currentUser.name,
        category,
        correction
      );

      let actionName = `Application Status Transition to ${targetStatus}`;
      if (targetStatus === 'APPROVED') actionName = 'APPLICATION_APPROVED';
      else if (targetStatus === 'REJECTED') actionName = 'APPLICATION_REJECTED';
      else if (targetStatus === 'DEFICIENT') actionName = 'DEFICIENCY_ISSUED';
      else if (targetStatus === 'DOCUMENT_VERIFICATION') actionName = 'DOCUMENT_VERIFICATION_COMMENCED';
      else if (targetStatus === 'ELIGIBILITY_VERIFICATION') actionName = 'ELIGIBILITY_VERIFICATION_PASSED';

      addAuditLog({
        actor: currentUser.name,
        role: currentUser.role,
        action: actionName,
        applicationId: inspectingApp.id,
        schemeCode: inspectingApp.schemeCode,
        previousStatus: inspectingApp.status,
        newStatus: targetStatus,
        remarks: remarks || actionName,
        reason: remarks || actionName,
        ipAddress: '10.14.88.22'
      });

      // Clear action dialogs
      setConfirmActionType(null);
      setActionRemarks('');
      setRejectionReason('');
      setShowDeficiencyModal(false);
      setDeficiencyReason('');
      setDeficiencyCorrection('');
    } catch (err: any) {
      alert(`Failed to update application status: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded border border-slate-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
            Tribal Affairs Governance Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0b2853] tracking-tight">
            Official Application Scrutiny & Document Verification
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Directly connected to MongoDB Atlas (database: <span className="font-mono font-bold text-blue-900">tsfms</span>, collection: <span className="font-mono font-bold text-blue-900">applications</span>). Real-time scrutiny & statutory audit logging.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1.5 rounded border border-blue-200">
            Total In Queue: {filteredApps.length} Applications
          </span>
          <button
            onClick={() => fetchApplications()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded border border-slate-300 flex items-center gap-1.5 transition-colors"
            title="Refresh applications queue from MongoDB Atlas"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded border border-slate-300 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 sm:flex-none">
            <input
              type="text"
              placeholder="Search by ID, Candidate, Email, Scheme..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded focus:ring-2 focus:ring-blue-800"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>

          {/* Scheme Dropdown Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold text-[11px]">Scheme:</span>
            <select
              value={selectedSchemeId}
              onChange={(e) => setSelectedSchemeId(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800 max-w-[240px]"
            >
              <option value="ALL">All Schemes ({schemes.length})</option>
              {schemes.map((s) => (
                <option key={s.id} value={s.code || s.id}>
                  {s.code}: {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold text-[11px]">Status:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="DOCUMENT_VERIFICATION">Document Verification</option>
              <option value="ELIGIBILITY_VERIFICATION">Eligibility Verification</option>
              <option value="SCRUTINY">Under Scrutiny</option>
              <option value="SELECTION">Under Selection</option>
              <option value="DEFICIENT">Deficient / Correction Required</option>
              <option value="RESUBMITTED">Resubmitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => {
            setSelectedSchemeId('ALL');
            setSelectedStatusFilter('ALL');
            setSearchTerm('');
          }}
          className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-medium text-xs px-2 py-1 rounded hover:bg-slate-100"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Filters</span>
        </button>
      </div>

      {/* Main Applications Table (Visible for ALL applications) */}
      {filteredApps.length === 0 ? (
        <div className="bg-white border border-slate-300 rounded shadow-sm p-12 text-center flex flex-col items-center">
          <FileCheck2 className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-slate-800 font-bold text-sm">No applications found</h3>
          <p className="text-slate-500 text-xs mt-1 max-w-md">
            No application records match your current search or filter criteria. Try resetting filters or submitting an application from the portal.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden text-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-[#0b2853] text-white">
                <tr>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Application ID</th>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Applicant & Email</th>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Target Scheme</th>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Submitted Date</th>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Current Status</th>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Doc Verification</th>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Eligibility</th>
                  <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider">Last Updated</th>
                  <th className="px-3.5 py-3 text-center font-bold uppercase tracking-wider">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* 1. Application ID */}
                    <td className="px-3.5 py-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                      {app.id}
                    </td>

                    {/* 2. Applicant Name & Email */}
                    <td className="px-3.5 py-3">
                      <div className="font-bold text-slate-900">{app.applicant.fullName || 'Citizen Applicant'}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                        {app.applicant.email || 'applicant@portal.gov.in'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        ST ({app.applicant.tribeCommunity || 'ST'}) • {app.applicant.state || 'India'}
                      </div>
                    </td>

                    {/* 3. Scheme Name */}
                    <td className="px-3.5 py-3 max-w-[200px]">
                      <div className="font-medium text-slate-800 line-clamp-1">{app.schemeName}</div>
                      <span className="text-[10px] text-slate-500 font-mono">{app.schemeCode}</span>
                    </td>

                    {/* 4. Submitted Date */}
                    <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap font-mono">
                      {app.submissionDate || '2026-09-29'}
                    </td>

                    {/* 5. Current Status */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {getStatusBadge(app.status)}
                    </td>

                    {/* 6. Document Verification Status */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {getDocSummaryBadge(app)}
                    </td>

                    {/* 7. Eligibility Status */}
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {app.hasDeficiency ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          <AlertTriangle className="w-3 h-3" /> Deficiency Flagged
                        </span>
                      ) : ['APPROVED', 'SELECTION', 'SCRUTINY', 'ELIGIBILITY_VERIFICATION'].includes(app.status) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          <CheckCircle className="w-3 h-3" /> Eligible
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          Under Verification
                        </span>
                      )}
                    </td>

                    {/* 8. Last Updated */}
                    <td className="px-3.5 py-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                      {app.lastUpdated || app.submissionDate || '2026-09-29'}
                    </td>

                    {/* 9. ACTION Column (Consistent for every accessible application) */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setInspectingApp(app)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded border border-slate-300 flex items-center gap-1 transition-colors"
                          title="View Application Dossier"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => setInspectingApp(app)}
                          className="px-2.5 py-1 bg-[#0b2853] hover:bg-[#134685] text-white font-bold rounded flex items-center gap-1 transition-colors shadow-sm"
                          title="Review Dossier & Certificates"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Review</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PART 3: APPLICATION DETAIL / REVIEW PAGE (COMPREHENSIVE DOSSIER MODAL)    */}
      {/* ========================================================================= */}
      {inspectingApp && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#0b2853] text-white px-6 py-4 flex items-center justify-between border-b-2 border-amber-500">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-400 font-mono tracking-wider">
                    {inspectingApp.id}
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-xs text-slate-200">
                    {inspectingApp.schemeName}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-white mt-0.5 flex items-center gap-2">
                  <span>Applicant Dossier: {inspectingApp.applicant.fullName || 'Citizen Applicant'}</span>
                  {getStatusBadge(inspectingApp.status)}
                </h2>
              </div>
              <button
                onClick={() => setInspectingApp(null)}
                className="text-slate-300 hover:text-white text-xl font-bold p-1 rounded hover:bg-white/10"
                title="Close dossier"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Organized into All 12 Sections */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs bg-slate-50/50">
              {/* SECTION 1 & 2: Applicant Information & Scheme Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded p-4 shadow-sm space-y-2">
                  <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider flex items-center gap-1.5 border-b pb-2">
                    <User className="w-3.5 h-3.5 text-blue-800" />
                    1. Applicant Information
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-500 font-medium block">Full Name:</span>
                      <strong className="text-slate-900">{inspectingApp.applicant.fullName || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Applicant ID / Email:</span>
                      <span className="font-mono text-slate-900 break-all">{inspectingApp.applicant.email || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Mobile Number:</span>
                      <span className="font-mono text-slate-900">{inspectingApp.applicant.mobile || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Aadhaar (Masked):</span>
                      <span className="font-mono text-slate-900">{inspectingApp.applicant.aadhaarNumberMasked || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded p-4 shadow-sm space-y-2">
                  <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider flex items-center gap-1.5 border-b pb-2">
                    <Building className="w-3.5 h-3.5 text-blue-800" />
                    2. Scheme Information
                  </h3>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-slate-500 font-medium block">Scheme Title:</span>
                      <strong className="text-blue-950">{inspectingApp.schemeName}</strong>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 font-medium block">Scheme Code:</span>
                        <span className="font-mono text-slate-800 font-bold">{inspectingApp.schemeCode}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block">Submission Date:</span>
                        <span className="font-mono text-slate-800">{inspectingApp.submissionDate}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3, 4, 5, 6: Demographic, Academic, Income, Bank Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 3. Personal / Demographic */}
                <div className="bg-white border border-slate-200 rounded p-3.5 shadow-sm space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block border-b pb-1">
                    3. Demographic Details
                  </span>
                  <div>
                    <span className="text-slate-500 block">Father / Guardian:</span>
                    <span className="font-bold text-slate-800">{inspectingApp.applicant.fatherOrHusbandName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Gender & DOB:</span>
                    <span className="text-slate-800">{inspectingApp.applicant.gender} • {inspectingApp.applicant.dob}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Category & Tribe:</span>
                    <span className="font-bold text-blue-900">ST ({inspectingApp.applicant.tribeCommunity || 'ST'})</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Domicile State & District:</span>
                    <span className="text-slate-800">{inspectingApp.applicant.district}, {inspectingApp.applicant.state}</span>
                  </div>
                </div>

                {/* 4. Academic Details */}
                <div className="bg-white border border-slate-200 rounded p-3.5 shadow-sm space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block border-b pb-1">
                    4. Academic Record
                  </span>
                  <div>
                    <span className="text-slate-500 block">Course of Study:</span>
                    <span className="font-bold text-slate-800">{inspectingApp.academic.currentCourse || 'Post Graduate'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Institution:</span>
                    <span className="text-slate-800 truncate block">{inspectingApp.academic.institutionName || 'University'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Qualifying Score:</span>
                    <strong className="text-emerald-800 font-mono text-sm">{inspectingApp.academic.previousExamPercentage}%</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Roll / Registration No:</span>
                    <span className="font-mono text-slate-700">{inspectingApp.academic.rollNumber || 'N/A'}</span>
                  </div>
                </div>

                {/* 5. Income Details */}
                <div className="bg-white border border-slate-200 rounded p-3.5 shadow-sm space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block border-b pb-1">
                    5. Income Details
                  </span>
                  <div>
                    <span className="text-slate-500 block">Annual Family Income:</span>
                    <strong className="text-slate-900 font-mono text-sm">
                      ₹{Number(inspectingApp.annualFamilyIncome || 0).toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Income Certificate:</span>
                    <span className="text-slate-800">Revenue Authority Issued</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Statutory Ceiling:</span>
                    <span className="text-emerald-700 font-bold">Within Ceiling Limit</span>
                  </div>
                </div>

                {/* 6. Bank / DBT Details */}
                <div className="bg-white border border-slate-200 rounded p-3.5 shadow-sm space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block border-b pb-1">
                    6. Bank & DBT Details
                  </span>
                  <div>
                    <span className="text-slate-500 block">Bank Name:</span>
                    <span className="font-bold text-slate-800">{inspectingApp.bank.bankName || 'State Bank of India'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Account (Masked):</span>
                    <span className="font-mono text-slate-800">{inspectingApp.bank.accountNumberMasked || 'XXXX-XXXX-0194'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">IFSC Code:</span>
                    <span className="font-mono text-slate-800">{inspectingApp.bank.ifscCode || 'SBIN0000341'}</span>
                  </div>
                  <div className="text-emerald-700 font-bold flex items-center gap-1 pt-0.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Aadhaar Seeded (NPCI Active)</span>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* SECTION 7: UPLOADED DOCUMENTS (PART 4, 5, 6, 7, 12, 13)                    */}
              {/* ========================================================================= */}
              <div className="bg-white border border-slate-300 rounded p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#0b2853]" />
                      7. Enclosed Application Documents ({inspectingApp.documents?.length || 0})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Inspect uploaded citizen binaries, perform human verification decisions, and verify/reject each certificate.
                    </p>
                  </div>
                </div>

                {(!inspectingApp.documents || inspectingApp.documents.length === 0) ? (
                  <div className="p-4 text-center text-slate-400 italic">No documents enclosed for this application.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {inspectingApp.documents.map((doc, idx) => {
                      const isVerified = doc.verificationStatus === 'VERIFIED' || doc.status === 'VERIFIED';
                      const isRejected = doc.verificationStatus === 'REJECTED' || doc.status === 'REJECTED';
                      const fileExists = doc.fileExists !== false;
                      const isLoading = docLoadingId === doc.id;

                      return (
                        <div
                          key={doc.id || idx}
                          className={`border rounded p-3 flex flex-col justify-between gap-2 transition-all ${
                            isRejected
                              ? 'bg-rose-50/50 border-rose-300'
                              : isVerified
                              ? 'bg-emerald-50/40 border-emerald-300'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-900 text-xs block">
                                  {doc.documentName || doc.documentCode}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Type: {doc.documentCode}
                                </span>
                              </div>
                              {/* Document Verification Status Badge */}
                              <div>
                                {isVerified ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> VERIFIED
                                  </span>
                                ) : isRejected ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                    <X className="w-3 h-3" /> REJECTED
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> PENDING
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-[10px] text-slate-500 mt-2 space-y-0.5">
                              <div>File Name: <span className="font-mono text-slate-700">{doc.fileName}</span></div>
                              <div>File Size: <span className="font-mono text-slate-700">{doc.fileSizeKB || 0} KB</span> • Uploaded: <span className="font-mono text-slate-700">{doc.uploadedAt ? doc.uploadedAt.substring(0, 10) : 'N/A'}</span></div>
                              {doc.verifiedBy && (
                                <div className="text-[10px] text-slate-600">
                                  Verified By: <span className="font-medium text-slate-900">{doc.verifiedBy}</span>
                                </div>
                              )}
                              {isRejected && doc.rejectionReason && (
                                <div className="p-1.5 bg-rose-100 text-rose-900 rounded font-medium mt-1">
                                  Rejection Reason: {doc.rejectionReason}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons for Document: [View] [Download] [Verify Document] [Reject Document] */}
                          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-1.5 mt-2">
                            {/* File View / Download buttons */}
                            <div className="flex items-center gap-1.5">
                              {fileExists ? (
                                <>
                                  <button
                                    onClick={() => handleViewDoc(doc)}
                                    disabled={isLoading}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded border border-slate-300 text-[10px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                                    title="View document in preview viewer"
                                  >
                                    <Eye className="w-3 h-3 text-blue-800" />
                                    <span>View</span>
                                  </button>
                                  <button
                                    onClick={() => handleDownloadDoc(doc)}
                                    disabled={isLoading}
                                    className="px-2.5 py-1 bg-[#0b2853] hover:bg-[#134685] text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                                    title="Download original file uploaded by citizen"
                                  >
                                    <Download className="w-3 h-3 text-amber-400" />
                                    <span>Download</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 text-amber-600" />
                                  <span>File unavailable</span>
                                </span>
                              )}
                            </div>

                            {/* Human Verification Buttons */}
                            <div className="flex items-center gap-1">
                              {!isVerified && (
                                <button
                                  onClick={() => handleVerifyDocument(doc)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                                  title="Approve / verify this certificate"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Verify</span>
                                </button>
                              )}

                              {!isRejected && (
                                <button
                                  onClick={() => {
                                    setRejectingDoc(doc);
                                    setDocRejectReason('');
                                  }}
                                  className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                                  title="Reject document with mandatory stated reason"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION 8: AI Document Verification Results (Inspection Component) */}
              <div className="bg-white border border-slate-300 rounded p-4 shadow-sm space-y-2">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                  8. AI Document Verification & OCR Parameter Extraction
                </h3>
                {(() => {
                  const targetDoc = inspectingApp.documents?.find(d => d.documentCode === 'INCOME_CERTIFICATE') || inspectingApp.documents?.[0];
                  const isLive = Boolean(targetDoc && targetDoc.id && !targetDoc.id.startsWith('DOC-AI'));
                  return (
                    <DocumentOcrViewer
                      documentType="INCOME_CERTIFICATE"
                      applicantName={inspectingApp.applicant.fullName}
                      declaredIncome={inspectingApp.annualFamilyIncome}
                      isDeficientScenario={inspectingApp.hasDeficiency}
                      documentId={targetDoc?.id}
                      fileName={targetDoc?.fileName}
                      isLiveUpload={isLive}
                      isOfficerMode={true}
                    />
                  );
                })()}
              </div>

              {/* SECTION 9: Eligibility Verification */}
              <div className="bg-white border border-slate-300 rounded p-4 shadow-sm space-y-2">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                  9. Statutory Eligibility Cross-Check
                </h3>
                <ExplainableEvidenceCard
                  decision={inspectingApp.hasDeficiency ? 'DEFICIENCY_FLAGGED' : 'ELIGIBLE'}
                  schemeName={inspectingApp.schemeName}
                  evidenceList={[
                    {
                      ruleLabel: 'ST Community Category Match',
                      ruleFormula: 'category == ST',
                      documentSource: 'ST Certificate → Category',
                      extractedValue: `Scheduled Tribe (${inspectingApp.applicant.tribeCommunity || 'Gond'})`,
                      declaredValue: 'ST',
                      status: 'SATISFIED',
                      statutoryReference: 'The Constitution (Scheduled Tribes) Order, 1950'
                    },
                    {
                      ruleLabel: 'Annual Family Income Verification',
                      ruleFormula: 'annualIncome <= schemeCeiling',
                      documentSource: 'Tehsildar Income Certificate',
                      extractedValue: `₹${Number(inspectingApp.annualFamilyIncome || 0).toLocaleString('en-IN')}`,
                      declaredValue: `₹${Number(inspectingApp.annualFamilyIncome || 0).toLocaleString('en-IN')}`,
                      status: inspectingApp.hasDeficiency ? 'WARNING' : 'SATISFIED',
                      statutoryReference: 'MoTA Operational Scheme Guidelines'
                    }
                  ]}
                />
              </div>

              {/* SECTION 10: Scrutiny Notes & Deficiency Information */}
              {inspectingApp.hasDeficiency && (
                <div className="bg-rose-50 border border-rose-300 rounded p-4 shadow-sm space-y-1.5">
                  <h3 className="font-bold text-rose-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-700" />
                    10. Flagged Deficiency / Correction Notice
                  </h3>
                  {inspectingApp.deficiencyCategory && (
                    <div>
                      <span className="font-bold text-rose-800">Issue Category: </span>
                      <span className="text-rose-950 font-medium">{inspectingApp.deficiencyCategory}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-rose-800">Reason: </span>
                    <span className="text-rose-950">{inspectingApp.deficiencyReason || inspectingApp.deficiencyNotes}</span>
                  </div>
                  {inspectingApp.deficiencyRequiredCorrection && (
                    <div>
                      <span className="font-bold text-rose-800">Required Correction: </span>
                      <span className="text-rose-950">{inspectingApp.deficiencyRequiredCorrection}</span>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 11: Application Timeline / Audit Trail */}
              <div className="bg-white border border-slate-300 rounded p-4 shadow-sm space-y-2">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                  <Clock className="w-4 h-4 text-blue-800" />
                  11. Application Audit Trail
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(inspectingApp.auditTrail && inspectingApp.auditTrail.length > 0) ? (
                    inspectingApp.auditTrail.map((log, lIdx) => (
                      <div key={lIdx} className="bg-slate-50 border border-slate-200 rounded p-2 text-[11px] flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-800">{log.action}</div>
                          <div className="text-slate-600">{log.remarks || log.actor}</div>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 whitespace-nowrap">
                          {log.timestamp}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 italic">Lodged on {inspectingApp.submissionDate} via MoTA Portal.</div>
                  )}
                </div>
              </div>

              {/* SECTION 12: Admin Actions Section (Part 8, 9, 10) */}
              <div className="bg-amber-50/60 border border-amber-300 rounded p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-[#0b2853] text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-amber-200 pb-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  12. Statutory Admin / Officer Actions
                </h3>

                {/* State-dependent Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Status: SUBMITTED */}
                  {inspectingApp.status === 'SUBMITTED' && (
                    <>
                      <button
                        onClick={() => handleStatusTransition('DOCUMENT_VERIFICATION', 'Commenced statutory document verification.')}
                        className="px-4 py-2 bg-[#0b2853] hover:bg-[#134685] text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <FileCheck2 className="w-4 h-4 text-amber-400" />
                        <span>Start Document Verification</span>
                      </button>
                      <button
                        onClick={() => setShowDeficiencyModal(true)}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Mark Deficient</span>
                      </button>
                      <button
                        onClick={() => {
                          setConfirmActionType('REJECT');
                          setRejectionReason('');
                          setActionRemarks('');
                        }}
                        className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject Application</span>
                      </button>
                    </>
                  )}

                  {/* Status: DOCUMENT_VERIFICATION */}
                  {inspectingApp.status === 'DOCUMENT_VERIFICATION' && (
                    <>
                      <button
                        onClick={() => handleStatusTransition('ELIGIBILITY_VERIFICATION', 'All required documents verified. Moving to eligibility verification.')}
                        className="px-4 py-2 bg-[#0b2853] hover:bg-[#134685] text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>Mark Documents Verified</span>
                      </button>
                      <button
                        onClick={() => setShowDeficiencyModal(true)}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Mark Deficient</span>
                      </button>
                      <button
                        onClick={() => {
                          setConfirmActionType('REJECT');
                          setRejectionReason('');
                          setActionRemarks('');
                        }}
                        className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject Application</span>
                      </button>
                    </>
                  )}

                  {/* Status: DEFICIENT */}
                  {inspectingApp.status === 'DEFICIENT' && (
                    <>
                      <button
                        onClick={() => alert(`Applicant notified at ${inspectingApp.applicant.email}: "Your application has been flagged for correction. Please log in and re-upload the required document."`)}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <Info className="w-4 h-4" />
                        <span>Notify Applicant</span>
                      </button>
                      <button
                        onClick={() => handleStatusTransition('DOCUMENT_VERIFICATION', 'Moved back to verification queue.')}
                        className="px-4 py-2 bg-[#0b2853] hover:bg-[#134685] text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-4 h-4 text-amber-400" />
                        <span>Move Back for Verification</span>
                      </button>
                    </>
                  )}

                  {/* Status: RESUBMITTED */}
                  {inspectingApp.status === 'RESUBMITTED' && (
                    <>
                      <button
                        onClick={() => handleStatusTransition('DOCUMENT_VERIFICATION', 'Citizen uploaded replacement documents. Commencing re-verification.')}
                        className="px-4 py-2 bg-[#0b2853] hover:bg-[#134685] text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <FileCheck2 className="w-4 h-4 text-amber-400" />
                        <span>Review Resubmission</span>
                      </button>
                      <button
                        onClick={() => setShowDeficiencyModal(true)}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Mark Deficient</span>
                      </button>
                    </>
                  )}

                  {/* Status: ELIGIBILITY_VERIFICATION */}
                  {inspectingApp.status === 'ELIGIBILITY_VERIFICATION' && (
                    <>
                      <button
                        onClick={() => handleStatusTransition('SCRUTINY', 'Eligibility criteria fulfilled. Recommended for Scrutiny Committee.')}
                        className="px-4 py-2 bg-[#0b2853] hover:bg-[#134685] text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>Mark Eligible (Send to Scrutiny)</span>
                      </button>
                      <button
                        onClick={() => {
                          setConfirmActionType('REJECT');
                          setRejectionReason('Applicant does not meet mandatory statutory scheme criteria.');
                          setActionRemarks('');
                        }}
                        className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Mark Ineligible (Reject)</span>
                      </button>
                    </>
                  )}

                  {/* Status: SCRUTINY */}
                  {inspectingApp.status === 'SCRUTINY' && (
                    <>
                      <button
                        onClick={() => handleStatusTransition('SELECTION', 'Scrutiny passed. Forwarded to National Selection Board.')}
                        className="px-4 py-2 bg-[#0b2853] hover:bg-[#134685] text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>Pass Scrutiny (Send to Selection)</span>
                      </button>
                      <button
                        onClick={() => setShowDeficiencyModal(true)}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Mark Deficient</span>
                      </button>
                      <button
                        onClick={() => {
                          setConfirmActionType('REJECT');
                          setRejectionReason('');
                          setActionRemarks('');
                        }}
                        className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject Application</span>
                      </button>
                    </>
                  )}

                  {/* Status: SELECTION */}
                  {inspectingApp.status === 'SELECTION' && (
                    <>
                      <button
                        onClick={() => {
                          setConfirmActionType('APPROVE');
                          setActionRemarks('Official scholarship sanction approved by Competent Authority.');
                        }}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Approve Application</span>
                      </button>
                      <button
                        onClick={() => {
                          setConfirmActionType('REJECT');
                          setRejectionReason('Not selected based on merit list quota.');
                          setActionRemarks('');
                        }}
                        className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded shadow-sm flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </>
                  )}

                  {/* Terminal Statuses */}
                  {inspectingApp.status === 'APPROVED' && (
                    <div className="p-3 bg-emerald-100 border border-emerald-300 rounded text-emerald-950 font-bold flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <span>Application Approved. Sanction letter issued and queued for Direct Benefit Transfer (DBT).</span>
                    </div>
                  )}

                  {inspectingApp.status === 'REJECTED' && (
                    <div className="p-3 bg-rose-100 border border-rose-300 rounded text-rose-950 font-bold flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-rose-600" />
                      <span>Application Rejected. Final administrative order recorded.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-slate-500 font-mono text-[11px]">
                Dossier: {inspectingApp.id} • User ID: {inspectingApp.applicant.id}
              </span>
              <button
                onClick={() => setInspectingApp(null)}
                className="px-4 py-2 border border-slate-300 rounded font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PART 9: DEFICIENCY WORKFLOW FORM MODAL                                    */}
      {/* ========================================================================= */}
      {showDeficiencyModal && inspectingApp && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-black text-[#0b2853] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Issue Deficiency Notice to Applicant
              </h3>
              <button
                onClick={() => setShowDeficiencyModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Issue Category:</label>
                <select
                  value={deficiencyCategory}
                  onChange={(e) => setDeficiencyCategory(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded font-medium focus:ring-2 focus:ring-blue-800"
                >
                  <option value="Incorrect Document">Incorrect Document</option>
                  <option value="Missing Document">Missing Document</option>
                  <option value="Expired Document">Expired Document</option>
                  <option value="Unclear / Unreadable Document">Unclear / Unreadable Document</option>
                  <option value="Incorrect Applicant Information">Incorrect Applicant Information</option>
                  <option value="Eligibility Issue">Eligibility Issue</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason (Exact explanation for applicant):</label>
                <textarea
                  rows={3}
                  value={deficiencyReason}
                  onChange={(e) => setDeficiencyReason(e.target.value)}
                  placeholder="e.g. Your Income Certificate could not be verified because the uploaded document does not match the required document type."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded font-medium focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Required Correction:</label>
                <textarea
                  rows={2}
                  value={deficiencyCorrection}
                  onChange={(e) => setDeficiencyCorrection(e.target.value)}
                  placeholder="e.g. Please re-upload a valid Income Certificate issued by Revenue Authority."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded font-medium focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t">
              <button
                onClick={() => setShowDeficiencyModal(false)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-700 font-bold hover:bg-slate-50 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!deficiencyReason.trim()) {
                    alert('Please provide a reason for the deficiency.');
                    return;
                  }
                  handleStatusTransition('DEFICIENT', deficiencyReason.trim(), deficiencyCategory, deficiencyCorrection.trim());
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded shadow-sm text-xs flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Send Deficiency Notice</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PART 10: APPROVE / REJECT CONFIRMATION MODALS                             */}
      {/* ========================================================================= */}
      {confirmActionType && inspectingApp && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-black text-[#0b2853]">
              {confirmActionType === 'APPROVE' ? 'Approve Application?' : 'Reject Application'}
            </h3>

            <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-3.5 rounded border border-slate-200">
              <p><strong>Application ID:</strong> <span className="font-mono text-blue-900 font-bold">{inspectingApp.id}</span></p>
              <p><strong>Applicant:</strong> {inspectingApp.applicant.fullName}</p>
              <p><strong>Current Status:</strong> {inspectingApp.status}</p>
              <p><strong>New Status:</strong> <strong className={confirmActionType === 'APPROVE' ? 'text-emerald-700' : 'text-rose-700'}>{confirmActionType === 'APPROVE' ? 'APPROVED' : 'REJECTED'}</strong></p>
            </div>

            {confirmActionType === 'REJECT' && (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-rose-800">
                  Rejection Reason (Required):
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="State the statutory reason for rejection..."
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded font-medium text-xs focus:ring-2 focus:ring-rose-800"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                Official Remarks (Optional):
              </label>
              <textarea
                rows={2}
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                placeholder="Enter statutory officer remarks..."
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded font-medium text-xs focus:ring-2 focus:ring-blue-800"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmActionType(null)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-700 font-bold hover:bg-slate-50 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmActionType === 'REJECT') {
                    if (!rejectionReason.trim()) {
                      alert('Rejection reason is required.');
                      return;
                    }
                    handleStatusTransition('REJECTED', rejectionReason.trim());
                  } else {
                    handleStatusTransition('APPROVED', actionRemarks || 'Approved by Competent Authority');
                  }
                }}
                className={`px-4 py-2 text-white font-bold rounded shadow-sm text-xs ${
                  confirmActionType === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {confirmActionType === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PART 7: REJECT DOCUMENT REASON MODAL                                      */}
      {/* ========================================================================= */}
      {rejectingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-black text-[#0b2853] flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600" />
              Reject Document Certificate
            </h3>

            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1">
              <div><strong>Document:</strong> {rejectingDoc.documentName || rejectingDoc.documentCode}</div>
              <div><strong>File:</strong> <span className="font-mono text-slate-600">{rejectingDoc.fileName}</span></div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Document Rejection Reason (Required):
              </label>
              <textarea
                rows={3}
                value={docRejectReason}
                onChange={(e) => setDocRejectReason(e.target.value)}
                placeholder="e.g. Uploaded document is not the required Income Certificate, or unreadable scan."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded font-medium text-xs focus:ring-2 focus:ring-rose-800"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setRejectingDoc(null)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-700 font-bold hover:bg-slate-50 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDocReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded shadow-sm text-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PART 6: DOCUMENT VIEW PREVIEW MODAL                                       */}
      {/* ========================================================================= */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-[#0b2853] text-white px-5 py-3 flex items-center justify-between border-b border-amber-500">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="font-bold text-xs truncate">{viewingDoc.doc.fileName}</span>
                <span className="text-[10px] text-slate-300 font-mono">({viewingDoc.doc.documentCode})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadDoc(viewingDoc.doc)}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-blue-950 font-bold text-xs rounded flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setViewingDoc(null)}
                  className="text-slate-300 hover:text-white text-lg font-bold p-1 rounded"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100 flex items-center justify-center p-2 overflow-hidden">
              {viewingDoc.mimeType.startsWith('image/') ? (
                <img
                  src={viewingDoc.blobUrl}
                  alt={viewingDoc.doc.fileName}
                  className="max-h-full max-w-full object-contain rounded shadow-md"
                />
              ) : (
                <iframe
                  src={viewingDoc.blobUrl}
                  title={viewingDoc.doc.fileName}
                  className="w-full h-full border-0 rounded bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
