import React, { useState } from 'react';
import { DocumentVerificationResult } from '../../types/verification';
import { simulateDocumentOcr } from '../../services/documentAiMock';
import { FileText, CheckCircle2, AlertTriangle, Eye, ShieldCheck, Cpu, Download } from 'lucide-react';
import { api } from '../../services/api';

interface DocumentOcrViewerProps {
  documentType: 'ST_CERTIFICATE' | 'INCOME_CERTIFICATE' | 'MARKSHEET' | 'BANK_PASSBOOK' | 'ADMISSION_LETTER';
  applicantName: string;
  declaredIncome?: number;
  isDeficientScenario?: boolean;
  documentId?: string;
  fileName?: string;
  isLiveUpload?: boolean;
  ocrVerification?: {
    status: string;
    message?: string;
    detectedType?: string;
    extractedFields?: Record<string, string | null>;
  };
  isOfficerMode?: boolean;
}

export const DocumentOcrViewer: React.FC<DocumentOcrViewerProps> = ({
  documentType,
  applicantName,
  declaredIncome,
  isDeficientScenario = false,
  documentId,
  fileName,
  isLiveUpload = false,
  ocrVerification,
  isOfficerMode = false
}) => {
  const result: DocumentVerificationResult = simulateDocumentOcr(
    documentType,
    applicantName,
    declaredIncome,
    isDeficientScenario
  );

  const displayCertNumber = ocrVerification?.extractedFields?.certificate_number || result.certificateNumber || 'N/A';
  const displayIssuingAuthority = ocrVerification?.extractedFields?.issuing_authority || result.issuingAuthority || 'Competent Authority';
  const isTypeMismatch = ocrVerification?.status === 'TYPE_MISMATCH';
  const isTypeMatch = ocrVerification?.status === 'TYPE_MATCH';

  const [activeView, setActiveView] = useState<'FIELDS' | 'OCR_TEXT'>('FIELDS');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleDownloadOriginal = async () => {
    if (!documentId) return;
    setIsDownloading(true);
    try {
      const blob = await api.downloadDocumentFile(documentId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `${documentType}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Could not download original document binary: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden text-xs">
      {/* Header */}
      <div className="bg-slate-100 p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 text-blue-900 rounded">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-800 text-xs block">
              {result.documentTitle}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Cert No: {displayCertNumber} • {displayIssuingAuthority}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Download Original Binary Button */}
          {documentId && (
            <button
              onClick={handleDownloadOriginal}
              disabled={isDownloading}
              className="px-2.5 py-1 bg-[#0b2853] hover:bg-[#134685] text-white rounded font-bold text-[10px] flex items-center gap-1 shadow-sm"
              title="Download original file uploaded by citizen"
            >
              <Download className="w-3 h-3" />
              <span>{isDownloading ? 'Downloading...' : 'Original Scan'}</span>
            </button>
          )}

          {/* Status Badge */}
          {isTypeMismatch ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px] animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              TYPE MISMATCH
            </span>
          ) : isTypeMatch ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              AI OCR VERIFIED (PASS)
            </span>
          ) : isLiveUpload ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              PENDING AI VERIFICATION
            </span>
          ) : result.overallDocStatus === 'VERIFIED' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              AI VERIFIED (PASS)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px] animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              DEFICIENCY DETECTED
            </span>
          )}

          {/* Toggle between fields and raw OCR (Officer Scrutiny Only - Part 19) */}
          {isOfficerMode && (
            <div className="flex border border-slate-300 rounded overflow-hidden">
              <button
                onClick={() => setActiveView('FIELDS')}
                className={`px-2 py-0.5 text-[10px] font-bold ${
                  activeView === 'FIELDS' ? 'bg-blue-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                Extracted Data
              </button>
              <button
                onClick={() => setActiveView('OCR_TEXT')}
                className={`px-2 py-0.5 text-[10px] font-bold ${
                  activeView === 'OCR_TEXT' ? 'bg-blue-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                Raw OCR
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Deficiency Banner if present */}
      {result.overallDocStatus === 'DEFICIENCY_DETECTED' && (
        <div className="bg-rose-50 border-b border-rose-200 p-3 text-rose-950 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Reason for Deficiency:</strong> {result.deficiencyMessage}
            <div className="text-[11px] text-rose-800 mt-0.5 font-medium">
              💡 Action Required: {result.suggestedCorrection}
            </div>
          </div>
        </div>
      )}

      {/* View Content */}
      <div className="p-3">
        {activeView === 'FIELDS' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase">Attribute</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase">OCR Extracted Value</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase">Declared in Form</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase">Validation Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {result.fields.map((field, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {field.fieldLabel}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900 font-bold">
                      {field.extractedValue}
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono">
                      {field.applicationValue || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {field.matchedWithApplication ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>MATCH</span>
                          </span>
                        ) : (
                          <span className="text-rose-700 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>MISMATCH</span>
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          ({field.explanation})
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-slate-900 text-slate-100 p-3 rounded font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {result.rawOcrSnippet || 'No raw OCR stream available.'}
          </div>
        )}
      </div>
    </div>
  );
};
