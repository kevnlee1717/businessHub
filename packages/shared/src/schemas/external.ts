import { z } from "zod";

const uuidField = z.string().uuid();
const numericField = z.union([z.string(), z.number()]);
const nullableOptionalText = z.string().trim().min(1).nullable().optional();

export const externalPartyCreateSchema = z.object({
  party_id: uuidField.nullable().optional(),
  name: z.string().trim().min(1),
  name_en: nullableOptionalText,
  contact: nullableOptionalText,
  note: nullableOptionalText,
  active: z.boolean().optional()
});

export const externalPartyUpdateSchema = z.object({
  party_id: uuidField.nullable().optional(),
  name: z.string().trim().min(1).optional(),
  name_en: nullableOptionalText,
  contact: nullableOptionalText,
  note: nullableOptionalText,
  active: z.boolean().optional()
});

export const externalCommissionSettleSchema = z.object({
  bank_account_id: uuidField.nullable().optional(),
  occurred_at: z.string().datetime().nullable().optional(),
  amount: numericField.optional(),
  proof_document_ids: z.array(uuidField),
  note: nullableOptionalText
});

export const externalCommissionUpdateSchema = z.object({
  amount_sgd: numericField.optional(),
  note: nullableOptionalText
});

export type ExternalPartyCreateInput = z.infer<typeof externalPartyCreateSchema>;
export type ExternalPartyUpdateInput = z.infer<typeof externalPartyUpdateSchema>;
export type ExternalCommissionSettleInput = z.infer<typeof externalCommissionSettleSchema>;
export type ExternalCommissionUpdateInput = z.infer<typeof externalCommissionUpdateSchema>;
