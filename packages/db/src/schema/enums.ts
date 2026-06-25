import { pgEnum } from "drizzle-orm/pg-core";
import {
  attendanceDayStatuses,
  attendanceKinds,
  billingRefTypes,
  billingStatuses,
  commissionTypes,
  currencies,
  employeeStatuses,
  employmentTypes,
  paymentTypes,
  payrollSchemes,
  payslipStatuses,
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
