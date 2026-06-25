export const roles = [
  "owner",
  "admin",
  "accountant",
  "clerk",
  "sales",
  "teacher",
  "principal",
  "photographer"
] as const;
export type Role = (typeof roles)[number];

export const employmentTypes = ["full_time", "part_time"] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const employeeStatuses = ["active", "left"] as const;
export type EmployeeStatus = (typeof employeeStatuses)[number];

export const companyStatuses = ["normal", "suspended", "closed"] as const;
export type CompanyStatus = (typeof companyStatuses)[number];

export const payrollSchemes = ["cpf", "levy", "china_fund", "none"] as const;
export type PayrollScheme = (typeof payrollSchemes)[number];

export const currencies = ["SGD", "RMB"] as const;
export type Currency = (typeof currencies)[number];

export const billingRefTypes = ["ep", "ica", "diploma", "english", "wsq"] as const;
export type BillingRefType = (typeof billingRefTypes)[number];

export const billingStatuses = ["unpaid", "partial", "paid"] as const;
export type BillingStatus = (typeof billingStatuses)[number];

export const commissionTypes = ["percent", "fixed"] as const;
export type CommissionType = (typeof commissionTypes)[number];

export const paymentTypes = ["deposit", "final", "installment"] as const;
export type PaymentType = (typeof paymentTypes)[number];

export const taskStatuses = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const payslipStatuses = ["draft", "paid"] as const;
export type PayslipStatus = (typeof payslipStatuses)[number];

export const statutoryTypes = ["cpf", "levy", "china_fund"] as const;
export type StatutoryType = (typeof statutoryTypes)[number];

export const attendanceKinds = ["clock_in", "clock_out"] as const;
export type AttendanceKind = (typeof attendanceKinds)[number];

export const attendanceDayStatuses = [
  "present",
  "late",
  "early_leave",
  "late_and_early",
  "incomplete",
  "absent"
] as const;
export type AttendanceDayStatus = (typeof attendanceDayStatuses)[number];

export const compScopes = ["role", "position", "employee"] as const;
export type CompScope = (typeof compScopes)[number];

export const facePurposes = ["baseline_enroll", "random_check", "attendance", "visit_checkin"] as const;
export type FacePurpose = (typeof facePurposes)[number];

export const faceChallengeStatuses = ["pending_push", "pushed", "passed", "failed", "timeout", "aborted"] as const;
export type FaceChallengeStatus = (typeof faceChallengeStatuses)[number];

export const siteVisitFaceStatuses = ["pending", "passed", "failed", "skipped"] as const;
export type SiteVisitFaceStatus = (typeof siteVisitFaceStatuses)[number];

export const siteVisitStatuses = [
  "pending",
  "verified",
  "rejected_distance",
  "rejected_face",
  "manual_override"
] as const;
export type SiteVisitStatus = (typeof siteVisitStatuses)[number];

export const gpsTriggers = ["time", "motion", "manual"] as const;
export type GpsTrigger = (typeof gpsTriggers)[number];

export const appStates = ["foreground", "background", "terminated"] as const;
export type AppState = (typeof appStates)[number];

export const businessTypes = ["ep", "ica"] as const;
export type BusinessType = (typeof businessTypes)[number];

export const caseStatuses = ["open", "in_progress", "completed", "cancelled"] as const;
export type CaseStatus = (typeof caseStatuses)[number];

export const caseStepStatuses = ["pending", "in_progress", "done"] as const;
export type CaseStepStatus = (typeof caseStepStatuses)[number];

export const caseStepDocStatuses = ["missing", "uploaded"] as const;
export type CaseStepDocStatus = (typeof caseStepDocStatuses)[number];

export const companyExpenseTypes = ["rent", "utility", "other"] as const;
export type CompanyExpenseType = (typeof companyExpenseTypes)[number];

export const contractStatuses = ["draft", "active", "expired", "terminated"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

export const contractVersionStatuses = ["draft", "signed", "superseded"] as const;
export type ContractVersionStatus = (typeof contractVersionStatuses)[number];

export const contractSubjectTypes = ["case", "enrollment", "company", "client"] as const;
export type ContractSubjectType = (typeof contractSubjectTypes)[number];
