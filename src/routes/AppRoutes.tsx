import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import { PublicLayout } from '../layouts/PublicLayout';
import { ApplicantLayout } from '../layouts/ApplicantLayout';
import { AdminLayout } from '../layouts/AdminLayout';

// Public Pages
import { HomePage } from '../pages/public/HomePage';
import { SchemesPage } from '../pages/public/SchemesPage';
import { SchemeDetailPage } from '../pages/public/SchemeDetailPage';
import { ResourcesPage } from '../pages/public/ResourcesPage';
import { AboutPage } from '../pages/public/AboutPage';
import { ContactPage, HelpPage } from '../pages/public/ContactPage';

// Authentication Pages
import { LoginPage } from '../pages/auth/LoginPage';
import { SignupPage } from '../pages/auth/SignupPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { UnauthorizedPage } from '../pages/auth/UnauthorizedPage';

// Route Guards
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { RoleRoute } from '../components/auth/RoleRoute';

// Applicant Pages
import { ApplicantDashboardPage } from '../pages/applicant/ApplicantDashboardPage';
import { ApplicationWizardPage } from '../pages/applicant/ApplicationWizardPage';
import { StatusTrackerPage } from '../pages/applicant/StatusTrackerPage';
import { MyDocumentsPage } from '../pages/applicant/MyDocumentsPage';
import { ApplicantGrievancesPage } from '../pages/applicant/ApplicantGrievancesPage';

// Admin Pages
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminSchemeDashboardPage } from '../pages/admin/AdminSchemeDashboardPage';
import { ApplicationQueuePage } from '../pages/admin/ApplicationQueuePage';
import { DocVerificationPage } from '../pages/admin/DocVerificationPage';
import { SelectionBoardPage } from '../pages/admin/SelectionBoardPage';
import { SchemeConfiguratorPage } from '../pages/admin/SchemeConfiguratorPage';
import { AuditLogsPage } from '../pages/admin/AuditLogsPage';
import { GrievanceQueuePage } from '../pages/admin/GrievanceQueuePage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* 1. Public MoTA Portal Routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/schemes" element={<SchemesPage />} />
        <Route path="/schemes/:id" element={<SchemeDetailPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/grievances" element={<ApplicantGrievancesPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/help" element={<HelpPage />} />

        {/* Dedicated Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Top-level /dashboard safe access redirect */}
        <Route path="/dashboard" element={<Navigate to="/applicant/dashboard" replace />} />

        {/* Redirect Legacy Auth Paths */}
        <Route path="/applicant/login" element={<Navigate to="/login" replace />} />
        <Route path="/applicant/register" element={<Navigate to="/signup" replace />} />
      </Route>

      {/* 2. Protected Applicant Citizen Portal Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRoles={['APPLICANT']} />}>
          <Route path="/applicant" element={<ApplicantLayout />}>
            <Route index element={<Navigate to="/schemes" replace />} />
            <Route path="dashboard" element={<ApplicantDashboardPage />} />
            <Route path="apply" element={<ApplicationWizardPage />} />
            <Route path="status" element={<StatusTrackerPage />} />
            <Route path="documents" element={<MyDocumentsPage />} />
            <Route path="grievances" element={<ApplicantGrievancesPage />} />
          </Route>
        </Route>
      </Route>

      {/* 3. Protected Admin Governance Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRoles={['ADMIN']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="schemes/:schemeId" element={<AdminSchemeDashboardPage />} />
            <Route path="applications" element={<ApplicationQueuePage />} />
            <Route path="verification" element={<DocVerificationPage />} />
            <Route path="selection" element={<SelectionBoardPage />} />
            <Route path="scheme-configurator" element={<SchemeConfiguratorPage />} />
            <Route path="audit-logs" element={<AuditLogsPage />} />
            <Route path="grievances" element={<GrievanceQueuePage />} />
          </Route>
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
