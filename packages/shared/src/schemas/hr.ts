import { z } from "zod";
import {
  attendanceKinds,
  appStates,
  commissionTypes,
  currencies,
  employeeStatuses,
  employmentTypes,
  faceChallengeStatuses,
  facePurposes,
  gpsTriggers,
  payrollSchemes,
  roles,
  siteVisitStatuses,
  statutoryTypes,
  taskPriorities,
  taskStatuses
} from "../enums";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const optionalUuid = uuidField.optional();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthString = z.string().regex(/^\d{4}-\d{2}$/);
const moneyValue = z.union([z.string().trim().min(1), z.number()]).nullable().optional();

const employeeBaseSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  email: z.string().email(),
  phone: optionalText,
  role: z.enum(roles),
  company_id: optionalUuid,
  position_id: optionalUuid,
  shift_id: optionalUuid,
  employment_type: z.enum(employmentTypes).default("full_time"),
  status: z.enum(employeeStatuses).default("active"),
  join_date: dateString.optional(),
  payroll_scheme: z.enum(payrollSchemes).nullable().optional(),
  salary_currency: z.enum(currencies).default("SGD"),
  gps_tracking_enabled: z.boolean().optional()
});

export const employeeCreateSchema = employeeBaseSchema.extend({
  password: z.string().min(1)
});

export const employeeUpdateSchema = employeeBaseSchema
  .extend({
    password: z.string().min(1).optional()
  })
  .partial();

const companyBaseSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  uen: optionalText,
  status: optionalText,
  note: nullableOptionalText
});

export const companyCreateSchema = companyBaseSchema;
export const companyUpdateSchema = companyBaseSchema.partial();

const positionBaseSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  note: nullableOptionalText
});

export const positionCreateSchema = positionBaseSchema;
export const positionUpdateSchema = positionBaseSchema.partial();

const workShiftBaseSchema = z.object({
  name: z.string().trim().min(1),
  start_min: z.number().int().min(0).max(1439),
  end_min: z.number().int().min(0).max(1439),
  allowed_late_count: z.number().int().min(0).default(0),
  is_default: z.boolean().default(false)
});

export const workShiftCreateSchema = workShiftBaseSchema;
export const workShiftUpdateSchema = workShiftBaseSchema.partial();

export const clockPointCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number().int().min(1).default(200),
  company_id: optionalUuid,
  active: z.boolean().default(true)
});

export const clockPointUpdateSchema = clockPointCreateSchema.partial();

export const employeeClockPointsAssignSchema = z.object({
  clock_point_ids: z.array(uuidField)
});

export const compensationTemplateSchema = z.object({
  company_id: uuidField,
  position_id: uuidField,
  base_salary: moneyValue,
  salary_currency: z.enum(currencies).nullable().optional(),
  attendance_bonus: moneyValue,
  task_completion_bonus: moneyValue,
  task_satisfaction_bonus: moneyValue,
  kpi_bonus: moneyValue,
  default_commission_type: z.enum(commissionTypes).nullable().optional(),
  default_commission_value: moneyValue,
  payday: z.number().int().min(1).max(28).nullable().optional()
});

export const employeeCompensationSchema = compensationTemplateSchema.omit({
  company_id: true,
  position_id: true
});

const taskBaseSchema = z.object({
  title: z.string().trim().min(1),
  description: nullableOptionalText,
  assignee_id: optionalUuid,
  due_date: dateString.optional(),
  status: z.enum(taskStatuses).optional(),
  priority: z.enum(taskPriorities).optional(),
  ref_type: optionalText,
  ref_id: optionalUuid
});

export const taskCreateSchema = taskBaseSchema;
export const taskUpdateSchema = taskBaseSchema.partial();

export const taskRateSchema = z.object({
  satisfaction_rating: z.number().int().min(1).max(5)
});

export const attendanceClockSchema = z.object({
  kind: z.enum(attendanceKinds),
  work_date: dateString.optional(),
  clocked_at: z.string().datetime().optional(),
  reason: optionalText,
  lat: z.number().optional(),
  lng: z.number().optional(),
  employee_id: optionalUuid
});

export const faceChallengeCreateSchema = z.object({
  purpose: z.enum(facePurposes),
  related_attendance_id: optionalUuid,
  related_site_visit_id: optionalUuid
});

export const faceRandomCheckSchema = z.object({
  employee_id: uuidField
});

export const faceChallengeResultSchema = z.object({
  nonce: z.string().min(1),
  status: z.enum(faceChallengeStatuses),
  similarity: z.number().optional(),
  liveness_action_passed: z.boolean().optional(),
  liveness_color_score: z.number().optional(),
  failure_reason: optionalText,
  baseline_id: optionalUuid
});

export const siteVisitOverrideSchema = z.object({
  status: z.enum(siteVisitStatuses),
  reject_reason: optionalText
});

export const gpsPointSchema = z.object({
  recorded_at: z.string().datetime(),
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  altitude: z.number().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  battery_level: z.number().int().optional(),
  is_moving: z.boolean().optional(),
  trigger: z.enum(gpsTriggers).optional(),
  device_id: optionalText,
  app_state: z.enum(appStates).optional()
});

export const gpsPointsBatchSchema = z.object({
  points: z.array(gpsPointSchema).min(1).max(50)
});

export const siteVisitQuerySchema = z.object({
  employee_id: optionalUuid,
  status: z.enum(siteVisitStatuses).optional()
});

export const kpiTargetSchema = z.object({
  period: monthString,
  metric: z.string().trim().min(1),
  target: z.number(),
  actual: z.number().optional()
});

export const performanceOverrideSchema = z.object({
  period: monthString,
  attendance_qualified: z.boolean().nullable().optional(),
  task_completion_pct: z.number().nullable().optional(),
  task_satisfaction_pct: z.number().nullable().optional(),
  kpi_pct: z.number().nullable().optional()
});

export const statutoryPaymentSchema = z.object({
  type: z.enum(statutoryTypes),
  period: monthString,
  employee_id: uuidField.nullable().optional(),
  amount: z.number(),
  paid_at: z.string().datetime().optional(),
  reference: optionalText
});

export const payslipGenerateSchema = z.object({
  period: monthString,
  employee_ids: z.array(uuidField).nullable().optional()
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;
export type PositionCreateInput = z.infer<typeof positionCreateSchema>;
export type PositionUpdateInput = z.infer<typeof positionUpdateSchema>;
export type WorkShiftCreateInput = z.infer<typeof workShiftCreateSchema>;
export type WorkShiftUpdateInput = z.infer<typeof workShiftUpdateSchema>;
export type ClockPointCreateInput = z.infer<typeof clockPointCreateSchema>;
export type ClockPointUpdateInput = z.infer<typeof clockPointUpdateSchema>;
export type EmployeeClockPointsAssignInput = z.infer<typeof employeeClockPointsAssignSchema>;
export type CompensationTemplateInput = z.infer<typeof compensationTemplateSchema>;
export type EmployeeCompensationInput = z.infer<typeof employeeCompensationSchema>;
export type AttendanceClockInput = z.infer<typeof attendanceClockSchema>;
export type FaceChallengeCreateInput = z.infer<typeof faceChallengeCreateSchema>;
export type FaceRandomCheckInput = z.infer<typeof faceRandomCheckSchema>;
export type FaceChallengeResultInput = z.infer<typeof faceChallengeResultSchema>;
export type SiteVisitOverrideInput = z.infer<typeof siteVisitOverrideSchema>;
export type GpsPointInput = z.infer<typeof gpsPointSchema>;
export type GpsPointsBatchInput = z.infer<typeof gpsPointsBatchSchema>;
export type SiteVisitQueryInput = z.infer<typeof siteVisitQuerySchema>;
export type KpiTargetInput = z.infer<typeof kpiTargetSchema>;
export type PerformanceOverrideInput = z.infer<typeof performanceOverrideSchema>;
export type StatutoryPaymentInput = z.infer<typeof statutoryPaymentSchema>;
export type PayslipGenerateInput = z.infer<typeof payslipGenerateSchema>;
