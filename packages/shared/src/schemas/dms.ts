import { z } from "zod";

const optionalText = z.string().trim().min(1).optional();
const uuidField = z.string().uuid();

export const documentCategoryCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  parent_id: uuidField.nullable().optional(),
  active: z.boolean().optional()
});

export const documentCategoryUpdateSchema = documentCategoryCreateSchema.partial();

export type DocumentCategoryCreateInput = z.infer<typeof documentCategoryCreateSchema>;
export type DocumentCategoryUpdateInput = z.infer<typeof documentCategoryUpdateSchema>;
