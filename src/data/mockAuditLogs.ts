export interface SystemAuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: 'APPLICANT' | 'OFFICER' | 'ADMIN' | 'SYSTEM_AI';
  action: string;
  applicationId: string;
  schemeCode: string;
  previousStatus?: string;
  newStatus?: string;
  reason: string;
  remarks?: string;
  ipAddress: string;
}

export const INITIAL_AUDIT_LOGS: SystemAuditLog[] = [
  {
    id: 'LOG-9921',
    timestamp: '2025-09-20 11:42:15',
    actor: 'Shri Manoj Kumar',
    role: 'OFFICER',
    action: 'Document Verified & Scrutiny Passed',
    applicationId: 'MOTA/2025-26/NF/10492',
    schemeCode: 'MOTA-NF-04',
    previousStatus: 'INSTITUTE_VERIFIED',
    newStatus: 'PROPOSED_FOR_SELECTION',
    reason: 'Verified M.Sc marksheets and DRC research synopsis. Placed on Selection roster.',
    ipAddress: '10.14.88.22 (NIC RailTel GovNet)'
  },
  {
    id: 'LOG-9920',
    timestamp: '2025-09-20 09:15:30',
    actor: 'Smt. Vandana Das',
    role: 'OFFICER',
    action: 'Deficiency Notice Dispatched',
    applicationId: 'MOTA/2025-26/NSTE/07314',
    schemeCode: 'MOTA-NSTE-03',
    previousStatus: 'SUBMITTED',
    newStatus: 'DEFICIENCY_NOTIFIED',
    reason: 'Income certificate is from FY 2022-23 instead of FY 2024-25. 15-day rectification given.',
    ipAddress: '10.14.88.35 (NIC Shastri Bhawan)'
  },
  {
    id: 'LOG-9919',
    timestamp: '2025-09-18 16:30:00',
    actor: 'PFMS DBT Gateway',
    role: 'SYSTEM_AI',
    action: 'Batch Disbursement Executed',
    applicationId: 'MOTA/2025-26/POST/38190',
    schemeCode: 'MOTA-POST-02',
    previousStatus: 'APPROVED',
    newStatus: 'DISBURSED_DBT',
    reason: 'Automated NPCI settlement file ACK: BATCH-ST-2025-09-15. Amount ₹14,500.',
    ipAddress: '164.100.12.8 (PFMS Central Gateway)'
  },
  {
    id: 'LOG-9918',
    timestamp: '2025-09-16 14:02:18',
    actor: 'Admin (Director IT)',
    role: 'ADMIN',
    action: 'Scheme Rule Threshold Updated',
    applicationId: 'SYSTEM-CONFIG',
    schemeCode: 'MOTA-PMS-01',
    previousStatus: 'INCOME_CAP: 200000',
    newStatus: 'INCOME_CAP: 250000',
    reason: 'MoTA Cabinet Memorandum notification enhancement of income ceiling for Pre-Matric.',
    ipAddress: '10.14.88.10 (NIC HQ)'
  },
  {
    id: 'LOG-9917',
    timestamp: '2025-09-15 10:11:00',
    actor: 'MoTA AI Document Intelligence',
    role: 'SYSTEM_AI',
    action: 'OCR & Cross-Check Completed',
    applicationId: 'MOTA/2025-26/NOS/00142',
    schemeCode: 'MOTA-NOS-05',
    previousStatus: 'SUBMITTED',
    newStatus: 'DOC_VERIFIED',
    reason: 'QS World Ranking verified (Edinburgh #27). ST certificate matching confidence 96%.',
    ipAddress: '10.18.2.14 (MoTA AI Microservice)'
  }
];
