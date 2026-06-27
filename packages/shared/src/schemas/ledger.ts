import { z } from "zod";
import {
  chargeKinds,
  chargeStatuses,
  currencies,
  ledgerDirections,
  milestoneBases,
  reportSections,
  reconcileStatuses
} from "../enums";

const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const numericField = z.union([z.string(), z.number()]);

export const bankAccountCreateSchema = z.object({
  company_id: uuidField,
  name: z.string().trim().min(1),
  bank_name: nullableOptionalText,
  account_no: nullableOptionalText,
  currency: z.enum(currencies).optional(),
  is_primary: z.boolean().optional(),
  active: z.boolean().optional(),
  note: nullableOptionalText
});

export const bankAccountUpdateSchema = z.object({
  company_id: uuidField.optional(),
  name: z.string().trim().min(1).optional(),
  bank_name: nullableOptionalText,
  account_no: nullableOptionalText,
  currency: z.enum(currencies).optional(),
  is_primary: z.boolean().optional(),
  opening_balance: numericField.optional(),
  opening_date: z.string().date().nullable().optional(),
  active: z.boolean().optional(),
  note: nullableOptionalText
});

export const recurringCostCreateSchema = z.object({
  company_id: uuidField,
  expense_category_id: uuidField.nullable().optional(),
  label: z.string().trim().min(1),
  amount: numericField,
  currency: z.enum(currencies).optional(),
  due_day: z.number().int().min(1).max(28),
  active: z.boolean().optional(),
  note: nullableOptionalText
});

export const recurringCostUpdateSchema = recurringCostCreateSchema.partial();

export const expenseCategoryCreateSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  name_en: nullableOptionalText,
  active: z.boolean().optional(),
  is_system: z.boolean().optional()
});

export const expenseCategoryUpdateSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  name_en: nullableOptionalText,
  report_section: z.enum(reportSections).optional(),
  active: z.boolean().optional(),
  is_system: z.boolean().optional()
});

export const ledgerCreateSchema = z.object({
  company_id: uuidField,
  bank_account_id: uuidField.nullable().optional(),
  direction: z.enum(ledgerDirections),
  amount: numericField,
  currency: z.enum(currencies),
  fx_rate: numericField.nullable().optional(),
  occurred_at: z.string().datetime(),
  business_id: uuidField.nullable().optional(),
  billing_id: uuidField.nullable().optional(),
  expense_category_id: uuidField.nullable().optional(),
  counterparty: nullableOptionalText,
  proof_document_ids: z.array(uuidField).min(1),
  note: nullableOptionalText
});

export const ledgerUpdateSchema = ledgerCreateSchema.partial();

export const statementLinesImportSchema = z.object({
  lines: z.array(
    z.object({
      occurred_at: z.string().datetime(),
      direction: z.enum(ledgerDirections),
      amount: numericField,
      currency: z.enum(currencies).optional(),
      description: nullableOptionalText,
      balance_after: numericField.nullable().optional()
    })
  ).min(1),
  import_batch: z.string().trim().min(1).optional()
});

export const matchSchema = z.object({
  ledger_entry_id: uuidField,
  statement_line_id: uuidField
});

export const milestoneCreateSchema = z.object({
  seq: z.number().int().min(1),
  label: z.string().trim().min(1),
  basis: z.enum(milestoneBases),
  value: numericField,
  bind_step_order: z.number().int().min(1).nullable().optional(),
  due_offset_days: z.number().int().nullable().optional(),
  note: nullableOptionalText
});

export const milestoneUpdateSchema = milestoneCreateSchema.partial();

export const chargeCreateSchema = z.object({
  billing_id: uuidField,
  label: z.string().trim().min(1),
  amount_expected: numericField,
  charge_kind: z.enum(chargeKinds).optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  due_date: z.string().date().nullable().optional(),
  case_step_id: uuidField.nullable().optional(),
  currency: z.enum(currencies).optional()
});

export const chargeUpdateSchema = z.object({
  label: z.string().trim().min(1).optional(),
  due_date: z.string().date().nullable().optional(),
  amount_expected: numericField.optional(),
  case_step_id: uuidField.nullable().optional(),
  status: z.enum(chargeStatuses).optional(),
  note: nullableOptionalText
});

export const chargeCollectSchema = z.object({
  paid_amount: numericField,
  currency: z.enum(currencies),
  fx_rate: numericField.nullable().optional(),
  paid_at: z.string().datetime(),
  proof_document_ids: z.array(uuidField).min(1),
  bank_account_id: uuidField.nullable().optional(),
  note: nullableOptionalText
});

export const ledgerQuerySchema = z.object({
  company_id: uuidField.optional(),
  bank_account_id: uuidField.optional(),
  direction: z.enum(ledgerDirections).optional(),
  business_id: uuidField.optional(),
  expense_category_id: uuidField.optional(),
  reconcile_status: z.enum(reconcileStatuses).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional()
});

export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>;
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>;
export type RecurringCostCreateInput = z.infer<typeof recurringCostCreateSchema>;
export type RecurringCostUpdateInput = z.infer<typeof recurringCostUpdateSchema>;
export type ExpenseCategoryCreateInput = z.infer<typeof expenseCategoryCreateSchema>;
export type ExpenseCategoryUpdateInput = z.infer<typeof expenseCategoryUpdateSchema>;
export type LedgerCreateInput = z.infer<typeof ledgerCreateSchema>;
export type LedgerUpdateInput = z.infer<typeof ledgerUpdateSchema>;
export type StatementLinesImportInput = z.infer<typeof statementLinesImportSchema>;
export type MatchInput = z.infer<typeof matchSchema>;
export type MilestoneCreateInput = z.infer<typeof milestoneCreateSchema>;
export type MilestoneUpdateInput = z.infer<typeof milestoneUpdateSchema>;
export type ChargeCreateInput = z.infer<typeof chargeCreateSchema>;
export type ChargeUpdateInput = z.infer<typeof chargeUpdateSchema>;
export type ChargeCollectInput = z.infer<typeof chargeCollectSchema>;
