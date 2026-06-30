import { pgEnum } from "drizzle-orm/pg-core";
import {
  attendanceDayStatuses,
  attendanceKinds,
  appStates,
  businessStatuses,
  businessTypes,
  billingRefTypes,
  billingStatuses,
  caseStatuses,
  caseSubmissionResults,
  caseStepDocStatuses,
  caseStepStatuses,
  chargeKinds,
  chargeStatuses,
  commissionEntryStatuses,
  commissionRecurrences,
  stepReviewActions,
  stepReviewStatuses,
  commissionTypes,
  companyExpenseTypes,
  contractStatuses,
  contractSubjectTypes,
  contractVersionStatuses,
  bankAccountTypes,
  currencies,
  dataScopes,
  diplomaAssignmentActions,
  diplomaAssignmentStatuses,
  employeeStatuses,
  employmentTypes,
  faceChallengeStatuses,
  facePurposes,
  franchiseContractExpiries,
  franchiseDecisionMakers,
  franchiseFootfalls,
  franchiseInterestLevels,
  franchiseOrgTypes,
  franchisePriorities,
  franchisePropertyTypes,
  franchiseServices,
  franchiseSiteStatuses,
  franchiseVisitStatuses,
  franchiseTriStates,
  genders,
  gpsTriggers,
  ledgerDirections,
  ledgerSources,
  milestoneBases,
  paymentTypes,
  payrollSchemes,
  payslipStatuses,
  permissionEffects,
  reconcileStatuses,
  recruitmentCampaignStatuses,
  recruitmentCampaignTypes,
  recruitmentCandidateStatuses,
  recruitmentFollowupTypes,
  recruitmentInterviewResults,
  recruitmentInterviewStatuses,
  recruitmentJobPriorities,
  recruitmentJobStatuses,
  recruitmentMaterialTypes,
  recruitmentPostingStatuses,
  recruitmentSourceTypes,
  reportSections,
  schemeLineBases,
  schemeLineKinds,
  schemeLineRecurrences,
  schemeVersionStatuses,
  siteVisitFaceStatuses,
  siteVisitStatuses,
  roles,
  statutoryTypes,
  taskPriorities,
  taskStatuses
} from "@bh/shared";

export const roleEnum = pgEnum("role", roles);
export const dataScopeEnum = pgEnum("data_scope", dataScopes);
export const permissionEffectEnum = pgEnum("permission_effect", permissionEffects);
export const employmentTypeEnum = pgEnum("employment_type", employmentTypes);
export const employeeStatusEnum = pgEnum("employee_status", employeeStatuses);
export const payrollSchemeEnum = pgEnum("payroll_scheme", payrollSchemes);
export const currencyEnum = pgEnum("currency", currencies);
export const bankAccountTypeEnum = pgEnum("bank_account_type", bankAccountTypes);
export const billingRefTypeEnum = pgEnum("billing_ref_type", billingRefTypes);
export const billingStatusEnum = pgEnum("billing_status", billingStatuses);
export const commissionTypeEnum = pgEnum("commission_type", commissionTypes);
export const commissionRecurrenceEnum = pgEnum("commission_recurrence", commissionRecurrences);
export const commissionEntryStatusEnum = pgEnum("commission_entry_status", commissionEntryStatuses);
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
export const stepReviewStatusEnum = pgEnum("step_review_status", stepReviewStatuses);
export const stepReviewActionEnum = pgEnum("step_review_action", stepReviewActions);
export const diplomaAssignmentStatusEnum = pgEnum("diploma_assignment_status", diplomaAssignmentStatuses);
export const diplomaAssignmentActionEnum = pgEnum("diploma_assignment_action", diplomaAssignmentActions);
export const genderEnum = pgEnum("gender", genders);
export const caseSubmissionResultEnum = pgEnum("case_submission_result", caseSubmissionResults);
export const companyExpenseTypeEnum = pgEnum("company_expense_type", companyExpenseTypes);
export const ledgerDirectionEnum = pgEnum("ledger_direction", ledgerDirections);
export const ledgerSourceEnum = pgEnum("ledger_source", ledgerSources);
export const reconcileStatusEnum = pgEnum("reconcile_status", reconcileStatuses);
export const reportSectionEnum = pgEnum("report_section", reportSections);
export const contractStatusEnum = pgEnum("contract_status", contractStatuses);
export const contractVersionStatusEnum = pgEnum("contract_version_status", contractVersionStatuses);
export const contractSubjectTypeEnum = pgEnum("contract_subject_type", contractSubjectTypes);
export const businessStatusEnum = pgEnum("business_status", businessStatuses);
export const schemeVersionStatusEnum = pgEnum("scheme_version_status", schemeVersionStatuses);
export const schemeLineKindEnum = pgEnum("scheme_line_kind", schemeLineKinds);
export const schemeLineBasisEnum = pgEnum("scheme_line_basis", schemeLineBases);
export const schemeLineRecurrenceEnum = pgEnum("scheme_line_recurrence", schemeLineRecurrences);
export const milestoneBasisEnum = pgEnum("milestone_basis", milestoneBases);
export const chargeKindEnum = pgEnum("charge_kind", chargeKinds);
export const chargeStatusEnum = pgEnum("charge_status", chargeStatuses);
export const recruitmentJobStatusEnum = pgEnum("recruitment_job_status", recruitmentJobStatuses);
export const recruitmentJobPriorityEnum = pgEnum("recruitment_job_priority", recruitmentJobPriorities);
export const recruitmentMaterialTypeEnum = pgEnum("recruitment_material_type", recruitmentMaterialTypes);
export const recruitmentPostingStatusEnum = pgEnum("recruitment_posting_status", recruitmentPostingStatuses);
export const recruitmentCampaignTypeEnum = pgEnum("recruitment_campaign_type", recruitmentCampaignTypes);
export const recruitmentCampaignStatusEnum = pgEnum("recruitment_campaign_status", recruitmentCampaignStatuses);
export const recruitmentSourceTypeEnum = pgEnum("recruitment_source_type", recruitmentSourceTypes);
export const recruitmentCandidateStatusEnum = pgEnum("recruitment_candidate_status", recruitmentCandidateStatuses);
export const recruitmentInterviewResultEnum = pgEnum("recruitment_interview_result", recruitmentInterviewResults);
export const recruitmentInterviewStatusEnum = pgEnum("recruitment_interview_status", recruitmentInterviewStatuses);
export const recruitmentFollowupTypeEnum = pgEnum("recruitment_followup_type", recruitmentFollowupTypes);
export const franchiseOrgTypeEnum = pgEnum("franchise_org_type", franchiseOrgTypes);
export const franchisePropertyTypeEnum = pgEnum("franchise_property_type", franchisePropertyTypes);
export const franchisePriorityEnum = pgEnum("franchise_priority", franchisePriorities);
export const franchiseFootfallEnum = pgEnum("franchise_footfall", franchiseFootfalls);
export const franchiseDecisionMakerEnum = pgEnum("franchise_decision_maker", franchiseDecisionMakers);
export const franchiseTriStateEnum = pgEnum("franchise_tri_state", franchiseTriStates);
export const franchiseSiteStatusEnum = pgEnum("franchise_site_status", franchiseSiteStatuses);
export const franchiseInterestLevelEnum = pgEnum("franchise_interest_level", franchiseInterestLevels);
export const franchiseVisitStatusEnum = pgEnum("franchise_visit_status", franchiseVisitStatuses);
export const franchiseServiceEnum = pgEnum("franchise_service", franchiseServices);
export const franchiseContractExpiryEnum = pgEnum("franchise_contract_expiry", franchiseContractExpiries);
export const epPriceFileSlots = ["price_list", "unit_price", "faq"] as const;
export const epPriceFileSlotEnum = pgEnum("ep_price_file_slot", epPriceFileSlots);
