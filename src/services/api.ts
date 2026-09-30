/**
 * TSFMS Frontend API Service Layer
 * Communicates with FastAPI backend at VITE_API_BASE_URL (defaults to http://localhost:8000/api)
 * Note: MongoDB credentials must NEVER be stored or exposed in this frontend layer.
 */

import { ExplainableIssue, ValidationSummaryResult } from '../types/explainableValidation';

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

class ApiClient {
  private token: string | null = null;
  private activeBaseUrl: string = DEFAULT_API_BASE_URL;

  constructor() {
    this.token = localStorage.getItem('tsfms_auth_token');
  }

  public getBaseUrl(): string {
    return this.activeBaseUrl;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('tsfms_auth_token', token);
    } else {
      localStorage.removeItem('tsfms_auth_token');
    }
  }

  public getToken(): string | null {
    return this.token || localStorage.getItem('tsfms_auth_token');
  }

  /**
   * Internal fetch wrapper with automatic loopback failover (127.0.0.1 <-> localhost)
   * and clean error categorization to prevent unhandled "Failed to fetch" crashes.
   */
  public async fetchWithFallback(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.activeBaseUrl}${endpoint}`;
    try {
      return await fetch(url, options);
    } catch (primaryErr: any) {
      // Determine failover candidate if localhost or 127.0.0.1 failed due to socket / IPv6 refusal
      let fallbackCandidate = '';
      if (this.activeBaseUrl.includes('localhost:8000')) {
        fallbackCandidate = this.activeBaseUrl.replace('localhost:8000', '127.0.0.1:8000');
      } else if (this.activeBaseUrl.includes('127.0.0.1:8000')) {
        fallbackCandidate = this.activeBaseUrl.replace('127.0.0.1:8000', 'localhost:8000');
      }

      if (fallbackCandidate) {
        try {
          const fallbackResp = await fetch(`${fallbackCandidate}${endpoint}`, options);
          this.activeBaseUrl = fallbackCandidate;
          return fallbackResp;
        } catch (_) {
          // If fallback candidate also fails, fall through to structured network error
        }
      }

      // Friendly and informative network error instead of generic 'Failed to fetch'
      const netError: any = new Error(
        'Unable to connect to the backend server. Please verify the FastAPI service is running at ' + this.activeBaseUrl
      );
      netError.status = 0;
      netError.isNetworkError = true;
      throw netError;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await this.fetchWithFallback(endpoint, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      let parsedDetail: any = null;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          parsedDetail = errorData.detail;
          if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (errorData.detail.message) {
            errorMessage = errorData.detail.message;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        }
      } catch (_) {
        if (response.status === 401) {
          errorMessage = 'Invalid email or password. Please verify your credentials.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Your account is deactivated or unauthorized.';
        } else if (response.status === 404) {
          errorMessage = 'The requested resource was not found.';
        } else if (response.status === 422) {
          errorMessage = 'Validation error: invalid request payload.';
        } else if (response.status >= 500) {
          errorMessage = 'Server error: login service is temporarily unavailable.';
        }
      }
      const error: any = new Error(errorMessage);
      error.status = response.status;
      error.detail = parsedDetail;
      throw error;
    }

    return response.json() as Promise<T>;
  }

  // System Health
  public async checkHealth(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  public async checkDbHealth(): Promise<{ status: string; database?: string; message?: string }> {
    return this.request<{ status: string; database?: string; message?: string }>('/health/db');
  }

  // Authentication
  public async register(data: { name: string; email: string; phone: string; password: string }) {
    const res = await this.request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.access_token) {
      this.setToken(res.access_token);
    }
    return res;
  }

  public async login(credentials: { email: string; password: string }) {
    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (res.access_token) {
      this.setToken(res.access_token);
    }
    return res;
  }

  public async getProfile() {
    return this.request<any>('/auth/me');
  }

  // Applicant Profile & Identity
  public async getApplicantProfile() {
    try {
      return await this.request<any>('/applicant/profile');
    } catch (err: any) {
      // 404 means the authenticated citizen has not created their applicant profile yet
      if (err?.status === 404 || err?.message?.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  public async createApplicantProfile(profile: any) {
    return this.request<any>('/applicant/profile', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  }

  public async updateApplicantProfile(profile: any) {
    return this.request<any>('/applicant/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }

  public async getReusableDocuments(schemeId?: string) {
    try {
      const url = schemeId ? `/applicant/reusable-documents?scheme_id=${encodeURIComponent(schemeId)}` : '/applicant/reusable-documents';
      const res = await this.request<any[]>(url);
      return Array.isArray(res) ? res : [];
    } catch (err: any) {
      if (err?.status === 404 || err?.message?.includes('404')) {
        return [];
      }
      console.warn('Reusable documents query returned error:', err);
      return [];
    }
  }

  public logout() {
    this.setToken(null);
  }

  // Schemes
  public async getSchemes() {
    return this.request<any[]>('/schemes');
  }

  public async getSchemeById(id: string) {
    return this.request<any>(`/schemes/${id}`);
  }

  public async createScheme(payload: any) {
    return this.request<any>('/schemes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateScheme(id: string, payload: any) {
    return this.request<any>(`/schemes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // Applications
  public async createApplication(payload: any) {
    return this.request<any>('/applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async saveApplicationDraft(payload: any) {
    return this.request<any>('/applications/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async getMyApplications() {
    return this.request<any[]>('/applications/my');
  }

  public async getApplicantTracking() {
    return this.request<{ applicant_id: string; applications: any[] }>('/applications/tracking');
  }

  public async getApplicantNotifications() {
    return this.request<any[]>('/applications/notifications');
  }

  public async markNotificationRead(id: string) {
    return this.request<any>(`/applications/notifications/${id}/read`, {
      method: 'PATCH'
    });
  }

  public async getApplicationById(id: string) {
    return this.request<any>(`/applications/${id}`);
  }

  public async updateApplication(id: string, updates: any) {
    return this.request<any>(`/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Real-time explainable availability and duplicate check
  public async checkAvailability(email?: string, phone?: string): Promise<{
    available: boolean;
    issue?: ExplainableIssue | null;
  }> {
    return this.request<{ available: boolean; issue?: ExplainableIssue | null }>('/auth/check-availability', {
      method: 'POST',
      body: JSON.stringify({ email, phone }),
    });
  }

  // Complete application dossier explainable validation
  public async validateApplicationDossier(payload: {
    scheme_id: string;
    personal_details?: any;
    academic_details?: any;
    financial_details?: any;
    bank_details?: any;
    documents?: any[];
  }): Promise<ValidationSummaryResult> {
    return this.request<ValidationSummaryResult>('/applications/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Documents
  public async verifyDocumentType(
    file: File,
    requiredType: string,
    options?: {
      applicationId?: string;
      applicantName?: string;
      applicantDob?: string;
      applicantAadhaar?: string;
    } | string
  ): Promise<{
    success: boolean;
    required_document_type: string;
    detected_document_type?: string;
    match_status: 'TYPE_MATCH' | 'TYPE_MISMATCH' | 'MANUAL_REVIEW' | 'LOW_QUALITY' | string;
    confidence: number;
    message: string;
    is_acceptable: boolean;
    character_count: number;
    detected_keywords: string[];
    extracted_fields: Record<string, string | null>;
    explainable_issue?: ExplainableIssue;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('required_document_type', requiredType);

    const opts = typeof options === 'string' ? { applicationId: options } : options || {};
    if (opts.applicationId) {
      formData.append('application_id', opts.applicationId);
    }
    if (opts.applicantName) {
      formData.append('applicant_name', opts.applicantName);
    }
    if (opts.applicantDob) {
      formData.append('applicant_dob', opts.applicantDob);
    }
    if (opts.applicantAadhaar) {
      formData.append('applicant_aadhaar', opts.applicantAadhaar);
    }

    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await this.fetchWithFallback('/documents/verify-type', {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorMsg = `Verification failed: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.detail) {
          errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch (_) {}
      throw new Error(errorMsg);
    }

    return response.json();
  }

  public async uploadDocument(applicationId: string, documentType: string, file: File) {
    const formData = new FormData();
    formData.append('application_id', applicationId);
    formData.append('document_type', documentType);
    formData.append('file', file);

    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await this.fetchWithFallback('/documents/upload', {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorMsg = `Document upload failed: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.detail) errorMsg = errJson.detail;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    return response.json();
  }

  public async replaceDocument(documentId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await this.fetchWithFallback(`/documents/${encodeURIComponent(documentId)}/replace`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorMsg = `Document replacement failed: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.detail) errorMsg = errJson.detail;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    return response.json();
  }

  public async getDocumentsByApplication(applicationId: string) {
    return this.request<any[]>(`/documents/application/${encodeURIComponent(applicationId)}`);
  }

  public async getDocumentMetadata(documentId: string) {
    return this.request<any>(`/documents/${encodeURIComponent(documentId)}`);
  }

  public async downloadDocumentFile(documentId: string, asDownload: boolean = true): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const endpoint = asDownload
      ? `/documents/${encodeURIComponent(documentId)}/download`
      : `/documents/${encodeURIComponent(documentId)}/file`;

    const response = await this.fetchWithFallback(endpoint, {
      headers,
    });

    if (!response.ok) {
      let errorMsg = `Unable to download the document. Please try again.`;
      if (response.status === 401) {
        errorMsg = 'Session expired. Please log in again.';
      } else if (response.status === 403) {
        errorMsg = 'You are not authorized to access this document.';
      } else if (response.status === 404) {
        errorMsg = 'Document file is unavailable.';
      } else {
        try {
          const errJson = await response.json();
          if (errJson.detail) {
            errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch (_) {}
      }
      throw new Error(errorMsg);
    }

    return response.blob();
  }

  public async verifyDocument(documentId: string, status: 'VERIFIED' | 'REJECTED', reason?: string) {
    return this.request<any>(`/documents/${encodeURIComponent(documentId)}/verify-status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason }),
    });
  }

  // Grievances
  public async lodgeGrievance(data: { applicationId?: string; category: string; subject: string; description: string }) {
    return this.request<any>('/grievances', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getMyGrievances() {
    return this.request<any[]>('/grievances/my');
  }

  // Admin & Officer APIs
  public async getAdminDashboardStats() {
    return this.request<any>('/admin/dashboard/stats');
  }

  public async getSchemeStatistics() {
    return this.request<any[]>('/admin/dashboard/scheme-statistics');
  }

  public async getAllApplications(statusFilter?: string, schemeFilter?: string) {
    const params = new URLSearchParams();
    if (statusFilter) params.append('status_filter', statusFilter);
    if (schemeFilter) params.append('scheme_filter', schemeFilter);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any[]>(`/admin/applications${query}`);
  }

  public async updateApplicationStatusOfficer(applicationId: string, payload: { status: string; remarks?: string; officer_name?: string; category?: string; required_correction?: string }) {
    return this.request<any>(`/admin/applications/${applicationId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async getAllGrievances() {
    return this.request<any[]>('/admin/grievances');
  }

  public async resolveGrievanceOfficer(grievanceId: string, update: { status?: string; resolution_remarks?: string; assigned_officer?: string }) {
    return this.request<any>(`/admin/grievances/${grievanceId}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    });
  }

  public async getSystemAuditLogs(limit: number = 50) {
    return this.request<any[]>(`/admin/audit-logs?limit=${limit}`);
  }
}

export const api = new ApiClient();

