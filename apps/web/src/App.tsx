import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { AttendancePage } from "./pages/hr/AttendancePage";
import { ClockPointsPage } from "./pages/hr/ClockPointsPage";
import { EmployeesPage } from "./pages/hr/EmployeesPage";
import { HrLayout } from "./pages/hr/HrLayout";
import { PayrollPage } from "./pages/hr/PayrollPage";
import { SiteVisitsPage } from "./pages/hr/SiteVisitsPage";
import { LoginPage } from "./pages/LoginPage";

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
          </Route>
          <Route path="business" element={<DashboardPage />} />
          <Route path="documents" element={<DashboardPage />} />
          <Route path="settings" element={<DashboardPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
