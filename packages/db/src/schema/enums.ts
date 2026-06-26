import { pgEnum } from "drizzle-orm/pg-core";
import {
  attendanceDayStatuses,
  attendanceKinds,
  appStates,
  businessTypes,
  billingRefTypes,
  billingStatuses,
  caseStatuses,
  caseSubmissionResults,
  caseStepDocStatuses,
  caseStepStatuses,
  commissionTypes,
  companyExpenseTypes,
  contractStatuses,
  contractSubjectTypes,
  contractVersionStatuses,
  currencies,
  employeeStatuses,
  employmentTypes,
  faceChallengeStatuses,
  facePurposes,
  genders,
  gpsTriggers,
  paymentTypes,
  payrollSchemes,
  payslipStatuses,
  siteVisitFaceStatuses,
  siteVisitStatuses,
  roles,
  statutoryTypes,
  taskPriorities,
  taskStatuses
} from "@bh/shared";

export const roleEnum = pgEnum("role", roles);
export const employmentTypeEnum = pgEnum("employment_type", employmentTypes);
export const employeeStatusEnum = pgEnum("employee_status", employeeStatuses);
export const payrollSchemeEnum = pgEnum("payroll_scheme", payrollSchemes);
export const currencyEnum = pgEnum("currency", currencies);
export const billingRefTypeEnum = pgEnum("billing_ref_type", billingRefTypes);
export const billingStatusEnum = pgEnum("billing_status", billingStatuses);
export const commissionTypeEnum = pgEnum("commission_type", commissionTypes);
export const paymentTypeEnum = pgEnum("payment_type", paymentTypes);
export const taskStatusEnum = pgEnum("task_status", taskStatuses);
export const taskPriorityEnum = pgEnum("task_priority", taskPriorities);
export const payslipStatusEnum = pgEnum("payslip_status", payslipStatuses);
export const statutoryTypeEnum = pgEnum("statutory_type", statutoryTypes);
export const attendanceKindEnum = pgEnum("attendance_kind", attendanceKinds);
export const attendanceDayStatusEnum = pgEnum("attendance_day_status", attendanceDayStatuses);
export const facePurposeEnum = pgEnum("face_purpose", facePurposes);
export const faceChallengeStatusEnum = pgEnum("face_challenge_status", faceChallengeStatuses);
export const siteVisitFaceStatusEnum = pgEnum("site_visit_face_status", siteVisitFaceStatuses);
export const siteVisitStatusEnum = pgEnum("site_visit_status", siteVisitStatuses);
export const gpsTriggerEnum = pgEnum("gps_trigger", gpsTriggers);
export const appStateEnum = pgEnum("app_state", appStates);
export const businessTypeEnum = pgEnum("business_type", businessTypes);
export const caseStatusEnum = pgEnum("case_status", caseStatuses);
export const caseStepStatusEnum = pgEnum("case_step_status", caseStepStatuses);
export const caseStepDocStatusEnum = pgEnum("case_step_doc_status", caseStepDocStatuses);
export const genderEnum = pgEnum("gender", genders);
export const caseSubmissionResultEnum = pgEnum("case_submission_result", caseSubmissionResults);
export const companyExpenseTypeEnum = pgEnum("company_expense_type", companyExpenseTypes);
export const contractStatusEnum = pgEnum("contract_status", contractStatuses);
export const contractVersionStatusEnum = pgEnum("contract_version_status", contractVersionStatuses);
export const contractSubjectTypeEnum = pgEnum("contract_subject_type", contractSubjectTypes);
