import { z } from "zod";

const uuidField = z.string().uuid();
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
  proof_document_ids: z.array(uuidField),
  note: nullableOptionalText
});

export type ExternalPartyCreateInput = z.infer<typeof externalPartyCreateSchema>;
export type ExternalPartyUpdateInput = z.infer<typeof externalPartyUpdateSchema>;
export type ExternalCommissionSettleInput = z.infer<typeof externalCommissionSettleSchema>;
