import { z } from "zod";
import {
  commissionEntryStatuses,
  commissionRecurrences,
  commissionTypes
} from "../enums";

const uuidField = z.string().uuid();
const numericField = z.union([z.string(), z.number()]);
const nullableOptionalText = z.string().trim().min(1).nullable().optional();

export const salesAssignmentCreateSchema = z.object({
  sales_id: uuidField,
  business_id: uuidField,
  commission_type: z.enum(commissionTypes).nullable().optional(),
  commission_value: numericField.nullable().optional(),
  active: z.boolean().optional(),
  note: nullableOptionalText
});

export const salesAssignmentUpdateSchema = z.object({
  sales_id: uuidField.optional(),
  business_id: uuidField.optional(),
  commission_type: z.enum(commissionTypes).nullable().optional(),
  commission_value: numericField.nullable().optional(),
  active: z.boolean().optional(),
  note: nullableOptionalText
});

export const commissionEntryCreateSchema = z.object({
  sales_id: uuidField,
  billing_id: uuidField,
  business_id: uuidField.nullable().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  recurrence: z.enum(commissionRecurrences),
  amount_sgd: numericField,
  note: nullableOptionalText
});

export const commissionEntryUpdateSchema = z.object({
  amount_sgd: numericField.optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  status: z.literal("void").optional()
});

export const commissionEntryStatusSchema = z.enum(commissionEntryStatuses);

export type SalesAssignmentCreateInput = z.infer<typeof salesAssignmentCreateSchema>;
export type SalesAssignmentUpdateInput = z.infer<typeof salesAssignmentUpdateSchema>;
export type CommissionEntryCreateInput = z.infer<typeof commissionEntryCreateSchema>;
export type CommissionEntryUpdateInput = z.infer<typeof commissionEntryUpdateSchema>;
