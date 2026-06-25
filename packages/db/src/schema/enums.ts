import { pgEnum } from "drizzle-orm/pg-core";
import {
  billingRefTypes,
  billingStatuses,
  commissionTypes,
  currencies,
  employeeStatuses,
  employmentTypes,
  paymentTypes,
  payrollSchemes,
  roles
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
