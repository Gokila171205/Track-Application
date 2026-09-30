import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DocumentOcrViewer } from '../../components/document-ai/DocumentOcrViewer';
import { ExplainableEvidenceCard } from '../../components/document-ai/ExplainableEvidenceCard';
import { Cpu, Search, CheckCircle, AlertTriangle, FileText, Layers } from 'lucide-react';

export const DocVerificationPage: React.FC = () => {
  const { applications } = useApp();
  const [selectedDocType, setSelectedDocType] = useState<'ST_CERTIFICATE' | 'INCOME_CERTIFICATE' | 'MARKSHEET'>('INCOME_CERTIFICATE');
  const [selectedScenario, setSelectedScenario] = useState<'VALID' | 'DEFICIENT'>('DEFICIENT');

  return (
    <div className="space-y-6 text-xs">
      <div className="bg-white p-5 rounded border border-slate-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              AI Document Intelligence
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" />
              OCR Field Extraction & Rule Cross-Check
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0b2853] tracking-tight">
            Document Intelligence & Deficiency Diagnostics
          </h1>
          <p className="text-slate-600 mt-0.5">
            Test and inspect the live OCR pipeline that compares uploaded citizen certificates against statutory scheme rules.
          </p>
        </div>

        {/* Scenario Toggle */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600">Simulate Scenario:</span>
          <button
            onClick={() => setSelectedScenario('DEFICIENT')}
            className={`px-3 py-1.5 rounded font-bold transition-colors ${
              selectedScenario === 'DEFICIENT'
                ? 'bg-rose-700 text-white shadow'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            ⚠ Deficiency Detected (Expired FY)
          </button>
          <button
            onClick={() => setSelectedScenario('VALID')}
            className={`px-3 py-1.5 rounded font-bold transition-colors ${
              selectedScenario === 'VALID'
                ? 'bg-emerald-700 text-white shadow'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            ✓ Fully Valid (Clean Pass)
          </button>
        </div>
      </div>

      {/* Document Type Selector */}
      <div className="flex items-center gap-2 border-b border-slate-300 bg-white px-4 pt-2 rounded-t">
        <button
          onClick={() => setSelectedDocType('INCOME_CERTIFICATE')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            selectedDocType === 'INCOME_CERTIFICATE'
              ? 'border-blue-900 text-blue-900 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          1. Income Certificate (FY Validity & Ceiling Check)
        </button>

        <button
          onClick={() => setSelectedDocType('ST_CERTIFICATE')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            selectedDocType === 'ST_CERTIFICATE'
              ? 'border-blue-900 text-blue-900 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          2. ST Community Certificate (Presidential Gazette Check)
        </button>

        <button
          onClick={() => setSelectedDocType('MARKSHEET')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            selectedDocType === 'MARKSHEET'
              ? 'border-blue-900 text-blue-900 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          3. Qualifying Marksheet (Percentage Threshold Check)
        </button>
      </div>

      {/* OCR Viewer */}
      <DocumentOcrViewer
        documentType={selectedDocType}
        applicantName="Rahul Kumar Gond"
        declaredIncome={180000}
        isDeficientScenario={selectedScenario === 'DEFICIENT' && selectedDocType === 'INCOME_CERTIFICATE'}
        isOfficerMode={true}
      />

      {/* Explainable Decision */}
      <ExplainableEvidenceCard
        decision={selectedScenario === 'DEFICIENT' ? 'DEFICIENCY_FLAGGED' : 'ELIGIBLE'}
        schemeName="Top Class Scholarship for ST Students"
        evidenceList={[
          {
            ruleLabel: 'Income Certificate Financial Year Rule',
            ruleFormula: 'certIssueDate >= FY_START_DATE',
            documentSource: 'Tehsildar Income Certificate → Date of Issue',
            extractedValue: selectedScenario === 'DEFICIENT' ? '12-05-2022 (Expired FY 2022-23)' : '15-05-2024 (FY 2024-25)',
            declaredValue: 'FY 2024-25',
            status: selectedScenario === 'DEFICIENT' ? 'BREACHED' : 'SATISFIED',
            statutoryReference: 'MoTA Operational Guidelines Clause 4.2'
          },
          {
            ruleLabel: 'Annual Family Income Ceiling Rule',
            ruleFormula: 'income <= 600000',
            documentSource: 'Income Certificate → Certified Total Income',
            extractedValue: '₹1,80,000',
            declaredValue: '₹1,80,000',
            status: 'SATISFIED',
            statutoryReference: 'Central Sector Scheme Criteria'
          }
        ]}
      />
    </div>
  );
};
