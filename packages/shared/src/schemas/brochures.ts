import { z } from "zod";

const uuidField = z.string().uuid();
const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const nullableOptionalUuid = uuidField.nullable().optional();
const sortOrder = z.coerce.number().int().optional();
const booleanInput = z.union([z.boolean(), z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1")]);

const brochureDictionaryBaseSchema = z.object({
  name: z.string().trim().min(1),
  sort_order: sortOrder
});

export const brochureIndustryCreateSchema = brochureDictionaryBaseSchema;
export const brochureIndustryUpdateSchema = brochureDictionaryBaseSchema.partial();
export const brochureCategoryCreateSchema = brochureDictionaryBaseSchema;
export const brochureCategoryUpdateSchema = brochureDictionaryBaseSchema.partial();

const brochureBaseSchema = z.object({
  name: z.string().trim().min(1),
  industry_id: nullableOptionalUuid,
  category_id: nullableOptionalUuid,
  notes: nullableOptionalText,
  sort_order: sortOrder
});

export const brochureCreateSchema = brochureBaseSchema;
export const brochureUpdateSchema = brochureBaseSchema.partial();

export const brochureSetCurrentSchema = z.object({
  version_id: uuidField
});

export const brochureVersionUploadSchema = z.object({
  note: nullableOptionalText,
  set_current: booleanInput.optional()
});

export const brochureListQuerySchema = z.object({
  industry_id: uuidField.optional(),
  category_id: uuidField.optional(),
  q: optionalText,
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional()
});

export type BrochureIndustryCreateInput = z.infer<typeof brochureIndustryCreateSchema>;
export type BrochureIndustryUpdateInput = z.infer<typeof brochureIndustryUpdateSchema>;
export type BrochureCategoryCreateInput = z.infer<typeof brochureCategoryCreateSchema>;
export type BrochureCategoryUpdateInput = z.infer<typeof brochureCategoryUpdateSchema>;
export type BrochureCreateInput = z.infer<typeof brochureCreateSchema>;
export type BrochureUpdateInput = z.infer<typeof brochureUpdateSchema>;
export type BrochureVersionUploadInput = z.infer<typeof brochureVersionUploadSchema>;
