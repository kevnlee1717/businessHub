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
