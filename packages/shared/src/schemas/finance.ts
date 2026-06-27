import { z } from "zod";
import {
  businessStatuses,
  billingRefTypes,
  billingStatuses,
  commissionTypes,
  currencies,
  paymentTypes,
  schemeLineBases,
  schemeLineKinds,
  schemeLineRecurrences,
  schemeVersionStatuses
} from "../enums";

const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const numericField = z.union([z.string(), z.number()]);
const dealInputsRecordSchema = z.record(z.string(), z.number());
const assumedInputsRecordSchema = z.record(z.string(), z.unknown());
const dealPresetKeys = [
  "custom",
  "one_time",
  "monthly_margin",
  "per_night_share",
  "per_head_multi"
] as const;

export const businessCreateSchema = z.object({
  company_id: uuidField,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  name_en: nullableOptionalText,
  category: nullableOptionalText,
  status: z.enum(businessStatuses).optional(),
  sort_order: z.number().int().optional()
});

export const businessUpdateSchema = z.object({
  company_id: uuidField.optional(),
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  name_en: nullableOptionalText,
  category: nullableOptionalText,
  status: z.enum(businessStatuses).optional(),
  sort_order: z.number().int().optional(),
  default_version_id: uuidField.nullable().optional()
});

export const schemeLineSchema = z.object({
  kind: z.enum(schemeLineKinds),
  basis: z.enum(schemeLineBases),
  recurrence: z.enum(schemeLineRecurrences),
  party_id: uuidField.nullable().optional(),
  party_code: z.string().trim().min(1).nullable().optional(),
  rate: numericField.nullable().optional(),
  unit_label: nullableOptionalText,
  input_key: nullableOptionalText,
  label: z.string().trim().min(1),
  note: nullableOptionalText,
  sort_order: z.number().int().optional()
});

export const schemeVersionCreateSchema = z.object({
  label: z.string().trim().min(1),
  status: z.enum(schemeVersionStatuses).optional(),
  effective_from: z.string().date().nullable().optional(),
  effective_to: z.string().date().nullable().optional(),
  assumed_inputs: assumedInputsRecordSchema.nullable().optional(),
  note: nullableOptionalText,
  preset: z.enum(dealPresetKeys).optional(),
  lines: z.array(schemeLineSchema).optional()
});

export const schemeVersionUpdateSchema = z.object({
  label: z.string().trim().min(1).optional(),
  status: z.enum(schemeVersionStatuses).optional(),
  effective_from: z.string().date().nullable().optional(),
  effective_to: z.string().date().nullable().optional(),
  assumed_inputs: assumedInputsRecordSchema.nullable().optional(),
  note: nullableOptionalText
});

export const dealInputsSchema = dealInputsRecordSchema;

export const dealPartyCreateSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  name_en: nullableOptionalText,
  active: z.boolean().optional()
});

export const dealPartyUpdateSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  name_en: nullableOptionalText,
  active: z.boolean().optional()
});

export const billingCreateSchema = z.object({
  ref_type: z.enum(billingRefTypes),
  ref_id: uuidField,
  total_price_sgd: numericField,
  deposit_sgd: numericField.optional(),
  sales_id: uuidField.nullable().optional(),
  commission_type: z.enum(commissionTypes).nullable().optional(),
  commission_value: numericField.nullable().optional(),
  business_id: uuidField.nullable().optional(),
  scheme_version_id: uuidField.nullable().optional(),
  inputs: dealInputsRecordSchema.nullable().optional()
});

export const billingUpdateSchema = z.object({
  total_price_sgd: numericField.optional(),
  deposit_sgd: numericField.optional(),
  sales_id: uuidField.nullable().optional(),
  commission_type: z.enum(commissionTypes).nullable().optional(),
  commission_value: numericField.nullable().optional(),
  status: z.enum(billingStatuses).optional(),
  business_id: uuidField.nullable().optional(),
  scheme_version_id: uuidField.nullable().optional(),
  inputs: dealInputsRecordSchema.nullable().optional()
});

export const paymentCreateSchema = z.object({
  paid_currency: z.enum(currencies),
  paid_amount: numericField,
  fx_rate: numericField.nullable().optional(),
  type: z.enum(paymentTypes),
  paid_at: z.string().datetime().optional(),
  note: nullableOptionalText
});

export type BillingCreateInput = z.infer<typeof billingCreateSchema>;
export type BillingUpdateInput = z.infer<typeof billingUpdateSchema>;
export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
export type SchemeLineInputSchema = z.infer<typeof schemeLineSchema>;
export type SchemeVersionCreateInput = z.infer<typeof schemeVersionCreateSchema>;
export type SchemeVersionUpdateInput = z.infer<typeof schemeVersionUpdateSchema>;
export type DealInputsInput = z.infer<typeof dealInputsSchema>;
export type DealPartyCreateInput = z.infer<typeof dealPartyCreateSchema>;
export type DealPartyUpdateInput = z.infer<typeof dealPartyUpdateSchema>;
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
