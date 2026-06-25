import { z } from "zod";
import {
  billingRefTypes,
  billingStatuses,
  commissionTypes,
  currencies,
  paymentTypes
} from "../enums";

const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const numericField = z.union([z.string(), z.number()]);

export const billingCreateSchema = z.object({
  ref_type: z.enum(billingRefTypes),
  ref_id: uuidField,
  total_price_sgd: numericField,
  deposit_sgd: numericField.optional(),
  sales_id: uuidField.nullable().optional(),
  commission_type: z.enum(commissionTypes).nullable().optional(),
  commission_value: numericField.nullable().optional()
});

export const billingUpdateSchema = z.object({
  total_price_sgd: numericField.optional(),
  deposit_sgd: numericField.optional(),
  sales_id: uuidField.nullable().optional(),
  commission_type: z.enum(commissionTypes).nullable().optional(),
  commission_value: numericField.nullable().optional(),
  status: z.enum(billingStatuses).optional()
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
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
