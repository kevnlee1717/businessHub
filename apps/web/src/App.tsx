import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountPasswordPage } from "./pages/account/AccountPasswordPage";
import { AccountProfilePage } from "./pages/account/AccountProfilePage";
import { BrochurePage } from "./pages/brochure/BrochurePage";
import { ContactDetailPage } from "./pages/franchise/ContactDetailPage";
import { ContactsPage } from "./pages/franchise/ContactsPage";
import { FnbSiteDetailPage } from "./pages/franchise/FnbSiteDetailPage";
import { FnbSitesPage } from "./pages/franchise/FnbSitesPage";
import { FoodCourtDetailPage } from "./pages/franchise/FoodCourtDetailPage";
import { FoodCourtListPage } from "./pages/franchise/FoodCourtListPage";
import { FranchiseFnbPlaceholder } from "./pages/franchise/FranchiseFnbPlaceholder";
import { FranchisePropertyPlaceholder } from "./pages/franchise/FranchisePropertyPlaceholder";
import { PropertiesPage } from "./pages/franchise/PropertiesPage";
import { PropertyDetailPage } from "./pages/franchise/PropertyDetailPage";
import { TrackingDashboardPage } from "./pages/franchise/TrackingDashboardPage";
import { TrackingLayout } from "./pages/franchise/TrackingLayout";
import { VisitsPage } from "./pages/franchise/VisitsPage";
import { BusinessLayout } from "./pages/business/BusinessLayout";
import { CaseDetailPage } from "./pages/business/CaseDetailPage";
import { EpSection } from "./pages/business/EpSection";
import { IcaSection } from "./pages/business/IcaSection";
import { CategoriesPage } from "./pages/documents/CategoriesPage";
import { companyFileSections } from "./pages/documents/companyFileSections";
import { DocumentSearchPage } from "./pages/documents/DocumentSearchPage";
import { DocumentsLayout } from "./pages/documents/DocumentsLayout";
import { DrivePage } from "./pages/documents/drive/DrivePage";
import { FolderLibraryPage } from "./pages/documents/FolderLibraryPage";
import { RentPage } from "./pages/documents/RentPage";
import { AcademyCollectionPage } from "./pages/education/AcademyCollectionPage";
import { DiplomaSection } from "./pages/education/DiplomaSection";
import { EducationLayout } from "./pages/education/EducationLayout";
import { EnglishSection } from "./pages/education/EnglishSection";
import { TeachersPage } from "./pages/education/TeachersPage";
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
import { IpadSlidesAdminPage } from "./pages/ipad/IpadSlidesAdminPage";
import { IpadSurveyPage } from "./pages/ipad/IpadSurveyPage";
import { LoginPage } from "./pages/LoginPage";
import { CampaignDetailPage } from "./pages/recruitment/CampaignDetailPage";
import { CampaignsPage } from "./pages/recruitment/CampaignsPage";
import { CandidateDetailPage } from "./pages/recruitment/CandidateDetailPage";
import { CandidatesPage } from "./pages/recruitment/CandidatesPage";
import { JobDetailPage } from "./pages/recruitment/JobDetailPage";
import { JobsPage } from "./pages/recruitment/JobsPage";
import { PostingsPage } from "./pages/recruitment/PostingsPage";
import { QuickCapturePage } from "./pages/recruitment/QuickCapturePage";
import { RecruitmentAnalyticsPage } from "./pages/recruitment/RecruitmentAnalyticsPage";
import { RecruitmentDashboardPage } from "./pages/recruitment/RecruitmentDashboardPage";
import { RecruitmentLayout } from "./pages/recruitment/RecruitmentLayout";
import { RecruitmentSettingsPage } from "./pages/recruitment/RecruitmentSettingsPage";
import { TalentPoolPage } from "./pages/recruitment/TalentPoolPage";
import { UpcomingInterviewsPage } from "./pages/recruitment/UpcomingInterviewsPage";
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
      <Route path="/ipad" element={<IpadSurveyPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="franchise" element={<Navigate to="/franchise/tracking" replace />} />
          <Route path="franchise/tracking" element={<TrackingLayout />}>
            <Route index element={<TrackingDashboardPage />} />
            <Route path="properties" element={<PropertiesPage />} />
            <Route path="properties/:id" element={<PropertyDetailPage />} />
            <Route path="fnb-sites" element={<FnbSitesPage />} />
            <Route path="fnb-sites/:id" element={<FnbSiteDetailPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="contacts/:id" element={<ContactDetailPage />} />
            <Route path="visits" element={<VisitsPage />} />
          </Route>
          <Route path="franchise/property" element={<FranchisePropertyPlaceholder />} />
          <Route path="franchise/fnb" element={<FoodCourtListPage />} />
          <Route path="franchise/fnb/:id" element={<FoodCourtDetailPage />} />
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
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="academy-collection" element={<AcademyCollectionPage />} />
          </Route>
          <Route path="documents" element={<DocumentsLayout />}>
            <Route index element={<Navigate to="search" replace />} />
            <Route path="search" element={<DocumentSearchPage />} />
            <Route path="rent" element={<RentPage />} />
            {companyFileSections
              .filter((section) => section.value !== "rent")
              .map((section) => (
                <Route
                  key={section.value}
                  path={section.value}
                  element={<FolderLibraryPage section={section} />}
                />
              ))}
            <Route path="brochure" element={<DrivePage />} />
            <Route path="ipad-slides" element={<IpadSlidesAdminPage />} />
            <Route path="categories" element={<CategoriesPage />} />
          </Route>
          {/* 宣传册已并入文档 tab;旧链接重定向 */}
          <Route path="brochure" element={<Navigate to="/documents/brochure" replace />} />
          <Route path="finance" element={<FinanceLayout />}>
            <Route index element={<Navigate to="billing" replace />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="receivables-ledger" element={<ReceivablesLedgerPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="bank-accounts" element={<BankAccountsPage />} />
            <Route path="reconcile" element={<ReconcilePage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          {/* 提成页已归入「业务分成」;URL 仍是 /finance/*,但独立渲染不再套财务 tab 排 */}
          <Route path="finance/commission" element={<SalesCommissionPage />} />
          <Route path="finance/my-commission" element={<MyCommissionPage />} />
          <Route path="finance/external-commission" element={<ExternalCommissionPage />} />
          <Route path="recruitment" element={<RecruitmentLayout />}>
            <Route index element={<RecruitmentDashboardPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="postings" element={<PostingsPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route path="candidates/:id" element={<CandidateDetailPage />} />
            <Route path="upcoming" element={<UpcomingInterviewsPage />} />
            <Route path="analytics" element={<RecruitmentAnalyticsPage />} />
            <Route path="talent-pool" element={<TalentPoolPage />} />
            <Route path="capture" element={<QuickCapturePage />} />
            <Route path="settings" element={<RecruitmentSettingsPage />} />
          </Route>
          <Route path="business-finance" element={<BusinessListPage />} />
          <Route path="business-finance/parties" element={<DealPartiesPage />} />
          <Route path="business-finance/external-parties" element={<ExternalPartiesPage />} />
          <Route path="business-finance/:id" element={<BusinessDetailPage />} />
          <Route path="account/password" element={<AccountPasswordPage />} />
          <Route path="account/profile" element={<AccountProfilePage />} />
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
