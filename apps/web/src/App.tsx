import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { BusinessLayout } from "./pages/business/BusinessLayout";
import { CaseDetailPage } from "./pages/business/CaseDetailPage";
import { CasesPage } from "./pages/business/CasesPage";
import { ClientsPage } from "./pages/business/ClientsPage";
import { TemplatesPage } from "./pages/business/TemplatesPage";
import { AttendancePage } from "./pages/hr/AttendancePage";
import { ClockPointsPage } from "./pages/hr/ClockPointsPage";
import { CompensationPage } from "./pages/hr/CompensationPage";
import { EmployeesPage } from "./pages/hr/EmployeesPage";
import { HrLayout } from "./pages/hr/HrLayout";
import { PayrollPage } from "./pages/hr/PayrollPage";
import { PerformancePage } from "./pages/hr/PerformancePage";
import { SiteVisitsPage } from "./pages/hr/SiteVisitsPage";
import { LoginPage } from "./pages/LoginPage";
import { CompaniesPage } from "./pages/settings/CompaniesPage";
import { PositionsPage } from "./pages/settings/PositionsPage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { WorkShiftsPage } from "./pages/settings/WorkShiftsPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="hr" element={<HrLayout />}>
            <Route index element={<Navigate to="employees" replace />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="clock-points" element={<ClockPointsPage />} />
            <Route path="site-visits" element={<SiteVisitsPage />} />
            <Route path="compensation" element={<CompensationPage />} />
            <Route path="performance" element={<PerformancePage />} />
          </Route>
          <Route path="business" element={<BusinessLayout />}>
            <Route index element={<Navigate to="cases" replace />} />
            <Route path="cases" element={<CasesPage />} />
            <Route path="cases/:id" element={<CaseDetailPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
          </Route>
          <Route path="documents" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="companies" replace />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="work-shifts" element={<WorkShiftsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
