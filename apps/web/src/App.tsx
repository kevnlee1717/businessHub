import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountPasswordPage } from "./pages/account/AccountPasswordPage";
import { FranchisePage } from "./pages/FranchisePage";
import { BusinessLayout } from "./pages/business/BusinessLayout";
import { CaseDetailPage } from "./pages/business/CaseDetailPage";
import { EpSection } from "./pages/business/EpSection";
import { IcaSection } from "./pages/business/IcaSection";
import { CategoriesPage } from "./pages/documents/CategoriesPage";
import { ClientLibraryPage } from "./pages/documents/ClientLibraryPage";
import { CompanyFilesPage } from "./pages/documents/CompanyFilesPage";
import { ContractsPage } from "./pages/documents/ContractsPage";
import { DocumentSearchPage } from "./pages/documents/DocumentSearchPage";
import { DocumentsLayout } from "./pages/documents/DocumentsLayout";
import { AcademyCollectionPage } from "./pages/education/AcademyCollectionPage";
import { DiplomaSection } from "./pages/education/DiplomaSection";
import { EducationLayout } from "./pages/education/EducationLayout";
import { EnglishSection } from "./pages/education/EnglishSection";
import { WsqSection } from "./pages/education/WsqSection";
import { BusinessDetailPage } from "./pages/businessFinance/BusinessDetailPage";
import { BusinessListPage } from "./pages/businessFinance/BusinessListPage";
import { DealPartiesPage } from "./pages/businessFinance/DealPartiesPage";
import { ExternalPartiesPage } from "./pages/businessFinance/ExternalPartiesPage";
import { BankAccountsPage } from "./pages/finance/BankAccountsPage";
import { BillingPage } from "./pages/finance/BillingPage";
import { ExternalCommissionPage } from "./pages/finance/ExternalCommissionPage";
import { FinanceLayout } from "./pages/finance/FinanceLayout";
import { LedgerPage } from "./pages/finance/LedgerPage";
import { ReceivablesLedgerPage } from "./pages/finance/ReceivablesLedgerPage";
import { ReconcilePage } from "./pages/finance/ReconcilePage";
import { ReportsPage } from "./pages/finance/ReportsPage";
import { SalesCommissionPage } from "./pages/finance/SalesCommissionPage";
import { MyCommissionPage } from "./pages/finance/MyCommissionPage";
import { AttendancePage } from "./pages/hr/AttendancePage";
import { ClockPointsPage } from "./pages/hr/ClockPointsPage";
import { CompensationPage } from "./pages/hr/CompensationPage";
import { EmployeesPage } from "./pages/hr/EmployeesPage";
import { HrLayout } from "./pages/hr/HrLayout";
import { PayrollPage } from "./pages/hr/PayrollPage";
import { PerformancePage } from "./pages/hr/PerformancePage";
import { SiteVisitsPage } from "./pages/hr/SiteVisitsPage";
import { LoginPage } from "./pages/LoginPage";
import { StatementPage } from "./pages/StatementPage";
import { CollectionItemsPage } from "./pages/settings/CollectionItemsPage";
import { CompaniesPage } from "./pages/settings/CompaniesPage";
import { IndustriesPage } from "./pages/settings/IndustriesPage";
import { PermissionsPage } from "./pages/settings/PermissionsPage";
import { PositionsPage } from "./pages/settings/PositionsPage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { WorkShiftsPage } from "./pages/settings/WorkShiftsPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/statement/:token" element={<StatementPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="franchise" element={<FranchisePage />} />
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
            <Route index element={<Navigate to="ep" replace />} />
            <Route path="ep" element={<EpSection />} />
            <Route path="ica" element={<IcaSection />} />
            <Route path="cases/:id" element={<CaseDetailPage />} />
          </Route>
          <Route path="education" element={<EducationLayout />}>
            <Route index element={<Navigate to="diploma" replace />} />
            <Route path="diploma" element={<DiplomaSection />} />
            <Route path="english" element={<EnglishSection />} />
            <Route path="wsq" element={<WsqSection />} />
            <Route path="academy-collection" element={<AcademyCollectionPage />} />
          </Route>
          <Route path="documents" element={<DocumentsLayout />}>
            <Route index element={<Navigate to="search" replace />} />
            <Route path="search" element={<DocumentSearchPage />} />
            <Route path="client-library" element={<ClientLibraryPage />} />
            <Route path="company" element={<CompanyFilesPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
          </Route>
          <Route path="finance" element={<FinanceLayout />}>
            <Route index element={<Navigate to="billing" replace />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="receivables-ledger" element={<ReceivablesLedgerPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="bank-accounts" element={<BankAccountsPage />} />
            <Route path="reconcile" element={<ReconcilePage />} />
            <Route path="commission" element={<SalesCommissionPage />} />
            <Route path="my-commission" element={<MyCommissionPage />} />
            <Route path="external-commission" element={<ExternalCommissionPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          <Route path="business-finance" element={<BusinessListPage />} />
          <Route path="business-finance/parties" element={<DealPartiesPage />} />
          <Route path="business-finance/external-parties" element={<ExternalPartiesPage />} />
          <Route path="business-finance/:id" element={<BusinessDetailPage />} />
          <Route path="account/password" element={<AccountPasswordPage />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="companies" replace />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="work-shifts" element={<WorkShiftsPage />} />
            <Route path="industries" element={<IndustriesPage />} />
            <Route path="collection-items" element={<CollectionItemsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
