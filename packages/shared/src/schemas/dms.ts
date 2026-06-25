import { z } from "zod";
import {
  companyExpenseTypes,
  contractStatuses,
  contractSubjectTypes,
  contractVersionStatuses,
  currencies
} from "../enums";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();

export const documentCategoryCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  parent_id: uuidField.nullable().optional(),
  active: z.boolean().optional()
});

export const documentCategoryUpdateSchema = documentCategoryCreateSchema.partial();

export const companyExpenseCreateSchema = z.object({
  company_id: uuidField,
  type: z.enum(companyExpenseTypes),
  amount: z.union([z.string(), z.number()]),
  currency: z.enum(currencies).optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  paid_at: z.string().datetime().optional(),
  note: nullableOptionalText,
  document_id: uuidField.nullable().optional()
});

export const companyExpenseUpdateSchema = companyExpenseCreateSchema.partial();

export const contractCreateSchema = z.object({
  subject_type: z.enum(contractSubjectTypes),
  subject_id: uuidField.nullable().optional(),
  title: z.string().trim().min(1),
  party_info: nullableOptionalText,
  status: z.enum(contractStatuses).optional()
});

export const contractUpdateSchema = contractCreateSchema.partial();

export const contractVersionUpdateSchema = z.object({
  status: z.enum(contractVersionStatuses).optional(),
  note: nullableOptionalText
});

export type DocumentCategoryCreateInput = z.infer<typeof documentCategoryCreateSchema>;
export type DocumentCategoryUpdateInput = z.infer<typeof documentCategoryUpdateSchema>;
export type CompanyExpenseCreateInput = z.infer<typeof companyExpenseCreateSchema>;
export type CompanyExpenseUpdateInput = z.infer<typeof companyExpenseUpdateSchema>;
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;
export type ContractVersionUpdateInput = z.infer<typeof contractVersionUpdateSchema>;
